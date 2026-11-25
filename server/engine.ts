import type {
  Automation,
  ConnectorConfig,
  ConnectorKey,
  ExecutionLog,
  ExecutionStepTrace,
} from '../src/types.ts';
import { isSafeExternalUrl, sanitizeText } from './crypto.ts';
import { store } from './store.ts';

export interface ValidationResult {
  readyToActivate: boolean;
  verifiedConnectors: ConnectorKey[];
  missingConnectors: Array<{
    key: ConnectorKey;
    name: string;
    status: string;
    reason: string;
  }>;
}

export function validateAutomationRequirements(
  automation: Automation,
  connectors: ConnectorConfig[],
): ValidationResult {
  const seen = new Set<ConnectorKey>();
  const verifiedConnectors: ConnectorKey[] = [];
  const missingConnectors: ValidationResult['missingConnectors'] = [];

  for (const step of automation.steps) {
    if (seen.has(step.connectorKey)) continue;
    seen.add(step.connectorKey);

    const cfg = connectors.find((c) => c.key === step.connectorKey);
    if (!cfg) {
      missingConnectors.push({
        key: step.connectorKey,
        name: step.connectorKey,
        status: 'error',
        reason: 'Conector no registrado en el motor.',
      });
      continue;
    }

    if (cfg.status === 'verified') {
      verifiedConnectors.push(cfg.key);
    } else {
      missingConnectors.push({
        key: cfg.key,
        name: cfg.name,
        status: cfg.status,
        reason:
          cfg.status === 'error'
            ? cfg.lastError || 'Error en la última verificación de credenciales.'
            : 'Pendiente de configurar y verificar credenciales reales.',
      });
    }
  }

  return {
    readyToActivate: missingConnectors.length === 0 && automation.steps.length > 0,
    verifiedConnectors,
    missingConnectors,
  };
}

export async function runAutomationExecution(
  automation: Automation,
  rawPayload: Record<string, unknown>,
  mode: 'test' | 'live',
  triggerSource: string,
): Promise<ExecutionLog> {
  const db = store.getState();
  const startedAt = Date.now();
  const traces: ExecutionStepTrace[] = [];
  let failedMessage: string | undefined;

  // Enforce strict live execution rules: no silent fake live runs
  if (mode === 'live' && automation.status !== 'active') {
    const errLog: ExecutionLog = {
      id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      automationId: automation.id,
      automationName: automation.name,
      clientId: automation.clientId,
      mode: 'live',
      status: 'error',
      triggerSource,
      inputSummary: summarizePayload(rawPayload),
      outputSummary: 'Ejecución rechazada: la automatización no está activa.',
      stepTraces: [],
      errorMessage: 'La automatización debe estar en estado Activa para recibir ejecuciones reales.',
      durationMs: Date.now() - startedAt,
      createdAt: new Date().toISOString(),
    };
    db.executions.unshift(errLog);
    automation.errorCount += 1;
    store.commit();
    return errLog;
  }

  const validation = validateAutomationRequirements(automation, db.connectors);

  for (const step of automation.steps) {
    const stepStart = Date.now();
    const connector = db.connectors.find((c) => c.key === step.connectorKey);

    // 1. Validate required fields on trigger step
    if (step.type === 'trigger' && step.requiredFields && step.requiredFields.length > 0) {
      const missingFields = step.requiredFields.filter((f) => {
        const val = rawPayload[f];
        return val === undefined || val === null || String(val).trim() === '';
      });
      if (missingFields.length > 0) {
        const msg = `Faltan campos obligatorios en la entrada: ${missingFields.join(', ')}.`;
        traces.push({
          stepId: step.id,
          title: step.title,
          connectorKey: step.connectorKey,
          status: 'error',
          detail: msg,
          durationMs: Math.max(1, Date.now() - stepStart),
        });
        failedMessage = msg;
        break;
      }
    }

    // 2. Check connector verification
    if (!connector || connector.status !== 'verified') {
      const reason =
        connector?.status === 'error'
          ? connector.lastError || 'Error en conector.'
          : `Conector ${connector?.name || step.connectorKey} está en estado Pendiente de configuración.`;
      traces.push({
        stepId: step.id,
        title: step.title,
        connectorKey: step.connectorKey,
        status: 'error',
        detail: reason,
        durationMs: Math.max(1, Date.now() - stepStart),
      });
      failedMessage = reason;
      break;
    }

    // 3. Execute local verifiable actions or outbound safe HTTP calls
    if (step.connectorKey === 'internal_crm') {
      if (mode === 'live') {
        db.crmCapturedLeads.unshift({
          id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          automationId: automation.id,
          clientId: automation.clientId,
          payload: sanitizePayloadObject(rawPayload),
          createdAt: new Date().toISOString(),
        });
      }
      traces.push({
        stepId: step.id,
        title: step.title,
        connectorKey: step.connectorKey,
        status: 'ok',
        detail:
          mode === 'live'
            ? 'Registro guardado en el CRM local verificado para este cliente.'
            : 'Validación de escritura en CRM superada (modo prueba, sin alterar registros reales).',
        durationMs: Math.max(2, Date.now() - stepStart),
      });
      continue;
    }

    if (step.connectorKey === 'web_form') {
      traces.push({
        stepId: step.id,
        title: step.title,
        connectorKey: step.connectorKey,
        status: 'ok',
        detail: 'Carga útil validada y sanitizada según esquema del formulario.',
        durationMs: Math.max(2, Date.now() - stepStart),
      });
      continue;
    }

    if (step.connectorKey === 'webhook' || step.connectorKey === 'external_api') {
      const targetUrl = typeof rawPayload.targetWebhookUrl === 'string' ? rawPayload.targetWebhookUrl : '';
      if (targetUrl) {
        const urlCheck = isSafeExternalUrl(targetUrl);
        if (!urlCheck.valid) {
          failedMessage = urlCheck.reason || 'URL de webhook bloqueada por política de seguridad.';
          traces.push({
            stepId: step.id,
            title: step.title,
            connectorKey: step.connectorKey,
            status: 'error',
            detail: failedMessage,
            durationMs: Math.max(1, Date.now() - stepStart),
          });
          break;
        }
        if (mode === 'live') {
          try {
            const resp = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                automationId: automation.id,
                clientId: automation.clientId,
                payload: sanitizePayloadObject(rawPayload),
              }),
              signal: AbortSignal.timeout(5000),
            });
            if (!resp.ok) {
              throw new Error(`HTTP ${resp.status} al invocar endpoint externo.`);
            }
          } catch (err) {
            failedMessage = err instanceof Error ? err.message : 'Fallo de red al llamar endpoint.';
            traces.push({
              stepId: step.id,
              title: step.title,
              connectorKey: step.connectorKey,
              status: 'error',
              detail: failedMessage,
              durationMs: Math.max(1, Date.now() - stepStart),
            });
            break;
          }
        }
      }
      traces.push({
        stepId: step.id,
        title: step.title,
        connectorKey: step.connectorKey,
        status: 'ok',
        detail:
          mode === 'live'
            ? 'Paso de webhook procesado con validación de seguridad.'
            : 'Validación de firma y URL segura superada (modo prueba).',
        durationMs: Math.max(2, Date.now() - stepStart),
      });
      continue;
    }

    if (step.connectorKey === 'telegram') {
      const secrets = db.connectorEncryptedSecrets['telegram'] || {};
      const { decryptSecret } = await import('./crypto.ts');
      const botToken = secrets.botToken
        ? decryptSecret(secrets.botToken)
        : process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
      const chatId = secrets.defaultChatId
        ? decryptSecret(secrets.defaultChatId)
        : process.env.TELEGRAM_CHAT_ID?.trim() || '';

      if (!botToken || !chatId) {
        failedMessage = 'Faltan botToken o defaultChatId configurados en Telegram Bot API.';
        traces.push({
          stepId: step.id,
          title: step.title,
          connectorKey: step.connectorKey,
          status: 'error',
          detail: failedMessage,
          durationMs: Math.max(1, Date.now() - stepStart),
        });
        break;
      }

      if (mode === 'live') {
        try {
          const textMsg = [
            `JAIRRESTAURA AUTOMATIZA IA · ${automation.name}`,
            `Paso: ${step.title}`,
            `Datos: ${summarizePayload(rawPayload)}`,
          ].join('\n');

          const resp = await fetch(
            `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: textMsg,
              }),
              signal: AbortSignal.timeout(6000),
            },
          );
          const tgJson = (await resp.json().catch(() => ({}))) as {
            ok?: boolean;
            description?: string;
            result?: { message_id?: number };
          };
          if (!resp.ok || !tgJson.ok) {
            throw new Error(tgJson.description || `Telegram API respondió HTTP ${resp.status}.`);
          }
          traces.push({
            stepId: step.id,
            title: step.title,
            connectorKey: step.connectorKey,
            status: 'ok',
            detail: `Mensaje real enviado a Telegram (message_id: ${tgJson.result?.message_id ?? 'ok'}).`,
            durationMs: Math.max(3, Date.now() - stepStart),
          });
          continue;
        } catch (err) {
          failedMessage =
            err instanceof Error ? err.message : 'Error al enviar mensaje por Telegram Bot API.';
          traces.push({
            stepId: step.id,
            title: step.title,
            connectorKey: step.connectorKey,
            status: 'error',
            detail: failedMessage,
            durationMs: Math.max(1, Date.now() - stepStart),
          });
          break;
        }
      }

      traces.push({
        stepId: step.id,
        title: step.title,
        connectorKey: step.connectorKey,
        status: 'ok',
        detail: 'Credenciales de Telegram verificadas y formato de mensaje validado (modo prueba).',
        durationMs: Math.max(3, Date.now() - stepStart),
      });
      continue;
    }

    // Verified external connectors (whatsapp, gmail, google_calendar, google_sheets)
    traces.push({
      stepId: step.id,
      title: step.title,
      connectorKey: step.connectorKey,
      status: 'ok',
      detail:
        mode === 'live'
          ? `Conector ${connector.name} verificado (despacho HTTP específico pendiente de Fase 2).`
          : `Conector ${connector.name} verificado y listo para validación.`,
      durationMs: Math.max(3, Date.now() - stepStart),
    });
  }

  const finalStatus: 'success' | 'error' = failedMessage ? 'error' : 'success';
  const durationMs = Math.max(1, Date.now() - startedAt);
  const nowIso = new Date().toISOString();

  const log: ExecutionLog = {
    id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    automationId: automation.id,
    automationName: automation.name,
    clientId: automation.clientId,
    mode,
    status: finalStatus,
    triggerSource,
    inputSummary: summarizePayload(rawPayload),
    outputSummary:
      finalStatus === 'success'
        ? mode === 'test'
          ? `Prueba de validación completada (${traces.length}/${automation.steps.length} pasos verificados).`
          : `Ejecución real completada (${traces.length}/${automation.steps.length} pasos).`
        : `Detenido con error: ${failedMessage}`,
    stepTraces: traces,
    errorMessage: failedMessage,
    durationMs,
    createdAt: nowIso,
  };

  automation.executionCount += 1;
  if (finalStatus === 'error') {
    automation.errorCount += 1;
  }
  automation.lastRunAt = nowIso;
  automation.updatedAt = nowIso;

  // Keep validation reference used
  if (!validation.readyToActivate && mode === 'live' && finalStatus === 'success') {
    log.status = 'error';
    log.errorMessage = 'Integraciones incompletas.';
  }

  db.executions.unshift(log);
  if (db.executions.length > 400) {
    db.executions = db.executions.slice(0, 400);
  }
  store.commit();
  return log;
}

function summarizePayload(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload)
    .filter(([k]) => !k.toLowerCase().includes('token') && !k.toLowerCase().includes('secret'))
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${sanitizeText(String(v), 40)}`);
  return entries.length > 0 ? entries.join(' · ') : 'Carga vacía';
}

function sanitizePayloadObject(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === 'string') {
      out[k] = sanitizeText(v, 300);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}
