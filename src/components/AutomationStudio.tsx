import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  Pause,
  Play,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { ApiError, apiFetch, formatDateTime } from '../lib/api.ts';
import type {
  AIExplanation,
  Automation,
  CatalogTemplate,
  ClientRecord,
  ConnectorConfig,
  ConnectorKey,
  ExecutionLog,
  WorkflowStep,
} from '../types.ts';

interface AutomationWithValidation extends Automation {
  validation: {
    readyToActivate: boolean;
    verifiedConnectors: ConnectorKey[];
    missingConnectors: Array<{ key: ConnectorKey; name: string; status: string; reason: string }>;
  };
}

interface AutomationStudioProps {
  clients: ClientRecord[];
  connectors: ConnectorConfig[];
  initialTemplate: CatalogTemplate | null;
  aiConfigured: boolean;
  onClearInitialTemplate: () => void;
  onNavigate: (view: string) => void;
  onCreateProposalFromDraft: (draft: {
    title: string;
    solution: string;
    howItWorks: string;
    clientId?: string;
  }) => void;
  onDataChanged: () => void;
}

const EXAMPLE_PROMPTS = [
  'Quiero recibir las solicitudes de citas, organizarlas y enviar una confirmación al cliente.',
  'Quiero que cuando alguien escriba a mi WhatsApp, reciba una bienvenida, conozca mis servicios, pueda solicitar una cita y quede registrado como cliente.',
  'Cuando un visitante llene el formulario de la iglesia, registrarlo en el CRM, notificar al equipo por Telegram y enviarle bienvenida.',
  'Al registrar un pedido en la tienda web, verificar inventario en Google Sheets, guardarlo en CRM y enviar confirmación por correo.',
];

const CONNECTOR_OPTIONS: Array<{ key: ConnectorKey; label: string }> = [
  { key: 'web_form', label: 'Formularios Web JairRestaura' },
  { key: 'internal_crm', label: 'CRM Interno JairRestaura' },
  { key: 'webhook', label: 'Webhooks Firmados (HMAC)' },
  { key: 'whatsapp', label: 'WhatsApp Business API' },
  { key: 'gmail', label: 'Gmail / Correo' },
  { key: 'google_calendar', label: 'Google Calendar' },
  { key: 'google_sheets', label: 'Google Sheets' },
  { key: 'telegram', label: 'Telegram Bot API' },
  { key: 'external_api', label: 'APIs Externas' },
];

const STEP_ROLE_OPTIONS: Array<{ type: WorkflowStep['type']; label: string }> = [
  { type: 'trigger', label: 'Disparador inicial' },
  { type: 'condition', label: 'Condición' },
  { type: 'ai_interpret', label: 'Validación / IA' },
  { type: 'action', label: 'Acción' },
  { type: 'notification', label: 'Notificación' },
  { type: 'crm_record', label: 'Resultado final / CRM' },
];

const TEST_PRESETS: Array<{ id: string; label: string; payload: Record<string, unknown> }> = [
  {
    id: 'valid',
    label: 'Datos válidos',
    payload: {
      nombre: 'Laura Castillo',
      correo: 'laura.castillo@empresa.co',
      telefono: '+57 310 555 0101',
      servicio: 'Asesoría de citas',
    },
  },
  {
    id: 'missing',
    label: 'Faltan campos',
    payload: {
      servicio: 'Asesoría de citas',
    },
  },
  {
    id: 'bad_email',
    label: 'Correo inválido',
    payload: {
      nombre: 'Laura Castillo',
      correo: 'correo-invalido',
      telefono: '+57 310 555 0101',
      servicio: 'Asesoría de citas',
    },
  },
  {
    id: 'bad_phone',
    label: 'Teléfono corto',
    payload: {
      nombre: 'Laura Castillo',
      correo: 'laura.castillo@empresa.co',
      telefono: '123',
      servicio: 'Asesoría de citas',
    },
  },
];

function normalizeStepOrder(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.map((s, idx) => ({
    ...s,
    order: idx + 1,
    dependsOnOrder:
      idx === 0
        ? undefined
        : s.dependsOnOrder && s.dependsOnOrder >= 1 && s.dependsOnOrder <= idx
          ? s.dependsOnOrder
          : idx,
  }));
}

function getConnectorStateDisplay(conn?: ConnectorConfig): {
  label: 'VERIFICADA' | 'ERROR' | 'CONFIGURADA' | 'NO CONFIGURADA';
  toneClass: string;
} {
  if (!conn) {
    return { label: 'NO CONFIGURADA', toneClass: 'text-slate-500 dark:text-slate-400' };
  }
  if (conn.status === 'verified') {
    return { label: 'VERIFICADA', toneClass: 'text-emerald-700 dark:text-emerald-400' };
  }
  if (conn.status === 'error') {
    return { label: 'ERROR', toneClass: 'text-red-600 dark:text-red-400' };
  }
  if (Object.keys(conn.maskedValues).length > 0) {
    return { label: 'CONFIGURADA', toneClass: 'text-amber-700 dark:text-amber-400' };
  }
  return { label: 'NO CONFIGURADA', toneClass: 'text-slate-500 dark:text-slate-400' };
}

export function AutomationStudio({
  clients,
  connectors,
  initialTemplate,
  aiConfigured,
  onClearInitialTemplate,
  onNavigate,
  onCreateProposalFromDraft,
  onDataChanged,
}: AutomationStudioProps) {
  const [instruction, setInstruction] = useState(EXAMPLE_PROMPTS[0]!);
  const [designLoading, setDesignLoading] = useState(false);
  const [designError, setDesignError] = useState<string | null>(null);
  const [canFallbackLocal, setCanFallbackLocal] = useState(false);
  const [modelBadge, setModelBadge] = useState<string | null>(null);

  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number>(1);
  const [draftName, setDraftName] = useState('');
  const [draftSector, setDraftSector] = useState('Servicios Generales');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftGoal, setDraftGoal] = useState('');
  const [draftInputsText, setDraftInputsText] = useState('');
  const [draftOutputsText, setDraftOutputsText] = useState('');
  const [draftMissingInfo, setDraftMissingInfo] = useState<string[]>([]);
  const [draftClientId, setDraftClientId] = useState(clients[0]?.id || '');
  const [draftClientCanToggle, setDraftClientCanToggle] = useState(true);
  const [draftSteps, setDraftSteps] = useState<WorkflowStep[]>([]);
  const [draftExplanation, setDraftExplanation] = useState<AIExplanation | null>(null);
  const [draftTemplateId, setDraftTemplateId] = useState<string | undefined>(undefined);
  const [confirmDeleteStepIdx, setConfirmDeleteStepIdx] = useState<number | null>(null);

  const [automations, setAutomations] = useState<AutomationWithValidation[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Module 5: Safe activation preview + emergency stop confirmation
  const [pendingActivationAuto, setPendingActivationAuto] = useState<AutomationWithValidation | null>(null);
  const [activationConfirmed, setActivationConfirmed] = useState(false);
  const [confirmEmergencyStopId, setConfirmEmergencyStopId] = useState<string | null>(null);

  // Module 3: Simulation lab
  const [lastTestExec, setLastTestExec] = useState<ExecutionLog | null>(null);
  const [testPayloadText, setTestPayloadText] = useState(
    JSON.stringify(TEST_PRESETS[0]!.payload, null, 2),
  );

  async function loadAutomations() {
    try {
      const res = await apiFetch<{ automations: AutomationWithValidation[] }>('/api/admin/automations');
      setAutomations(res.automations);
    } catch {
      // handled silently on init
    }
  }

  useEffect(() => {
    loadAutomations();
  }, []);

  useEffect(() => {
    if (!draftClientId && clients[0]?.id) {
      setDraftClientId(clients[0].id);
    }
  }, [clients, draftClientId]);

  useEffect(() => {
    if (initialTemplate) {
      setEditingAutomationId(null);
      setEditingVersion(1);
      setDraftName(initialTemplate.name);
      setDraftSector(initialTemplate.sector);
      setDraftDescription(initialTemplate.description);
      setDraftGoal(initialTemplate.description);
      setDraftInputsText(initialTemplate.explanation.dataUsed.join(', '));
      setDraftOutputsText(initialTemplate.explanation.whatItDoes);
      setDraftMissingInfo([]);
      setDraftSteps(normalizeStepOrder(initialTemplate.steps.map((s) => ({ ...s }))));
      setDraftExplanation(initialTemplate.explanation);
      setDraftTemplateId(initialTemplate.id);
      setModelBadge(`Plantilla: ${initialTemplate.name}`);
      setDesignError(null);
      setCanFallbackLocal(false);
      setConfirmDeleteStepIdx(null);
      onClearInitialTemplate();
    }
  }, [initialTemplate, onClearInitialTemplate]);

  function resetDraftEditor() {
    setEditingAutomationId(null);
    setEditingVersion(1);
    setDraftName('');
    setDraftDescription('');
    setDraftGoal('');
    setDraftInputsText('');
    setDraftOutputsText('');
    setDraftMissingInfo([]);
    setDraftSteps([]);
    setDraftExplanation(null);
    setDraftTemplateId(undefined);
    setModelBadge(null);
    setConfirmDeleteStepIdx(null);
  }

  function loadAutomationIntoEditor(auto: AutomationWithValidation) {
    setEditingAutomationId(auto.id);
    setEditingVersion(auto.version || 1);
    setDraftName(auto.name);
    setDraftSector(auto.sector);
    setDraftDescription(auto.description);
    setDraftGoal(auto.goal || auto.description);
    setDraftInputsText((auto.inputs || auto.explanation.dataUsed || []).join(', '));
    setDraftOutputsText((auto.outputs || [auto.explanation.whatItDoes]).join(', '));
    setDraftMissingInfo(auto.missingInfo || []);
    setDraftClientId(auto.clientId);
    setDraftClientCanToggle(auto.clientCanToggle);
    setDraftSteps(normalizeStepOrder(auto.steps.map((s) => ({ ...s }))));
    setDraftExplanation(auto.explanation);
    setDraftTemplateId(auto.templateId);
    setModelBadge(`Editando flujo guardado · Versión v${auto.version || 1}`);
    setConfirmDeleteStepIdx(null);
    setActionMsg(
      `Flujo "${auto.name}" (v${auto.version || 1}) cargado en el editor. Al guardar cambios de pasos se creará la versión v${(auto.version || 1) + 1}.`,
    );
    setActionErr(null);
  }

  async function runAiDesign(mode: 'gemini' | 'local') {
    setDesignError(null);
    setCanFallbackLocal(false);
    setActionMsg(null);
    setActionErr(null);
    setDesignLoading(true);
    try {
      const res = await apiFetch<{
        workflow: {
          source: string;
          modelUsed: string;
          name: string;
          sector: string;
          description: string;
          goal?: string;
          inputs?: string[];
          outputs?: string[];
          missingInfo?: string[];
          steps: WorkflowStep[];
          explanation: AIExplanation;
        };
      }>('/api/ai/design-workflow', {
        method: 'POST',
        body: JSON.stringify({ instruction, mode }),
      });
      const wf = res.workflow;
      setEditingAutomationId(null);
      setEditingVersion(1);
      setDraftName(wf.name);
      setDraftSector(wf.sector);
      setDraftDescription(wf.description);
      setDraftGoal(wf.goal || wf.description);
      setDraftInputsText((wf.inputs || wf.explanation.dataUsed || []).join(', '));
      setDraftOutputsText((wf.outputs || [wf.explanation.whatItDoes]).join(', '));
      setDraftMissingInfo(wf.missingInfo || []);
      setDraftSteps(normalizeStepOrder(wf.steps));
      setDraftExplanation(wf.explanation);
      setDraftTemplateId(undefined);
      setConfirmDeleteStepIdx(null);
      setModelBadge(
        wf.source === 'gemini'
          ? `Diseñado por JAIR IA AUTOMATIZA (${wf.modelUsed})`
          : wf.modelUsed,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setDesignError(err.message);
        if (err.data?.canUseLocalMode) {
          setCanFallbackLocal(true);
        }
      } else {
        setDesignError('No fue posible procesar la instrucción.');
      }
    } finally {
      setDesignLoading(false);
    }
  }

  function updateStep(index: number, patch: Partial<WorkflowStep>) {
    setDraftSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setDraftSteps((prev) =>
      normalizeStepOrder([
        ...prev,
        {
          id: `step-${Date.now()}-${prev.length + 1}`,
          order: prev.length + 1,
          type: prev.length === 0 ? 'trigger' : 'action',
          title: prev.length === 0 ? 'Disparador inicial' : `Nuevo paso ${prev.length + 1}`,
          description: 'Describe qué ejecuta este paso dentro del flujo.',
          connectorKey: prev.length === 0 ? 'web_form' : 'internal_crm',
          configSummary: 'Configuración editable',
          dependsOnOrder: prev.length === 0 ? undefined : prev.length,
        },
      ]),
    );
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draftSteps.length) return;
    setConfirmDeleteStepIdx(null);
    setDraftSteps((prev) => {
      const next = [...prev];
      const current = next[index]!;
      next[index] = next[target]!;
      next[target] = current;
      return normalizeStepOrder(next);
    });
  }

  function duplicateStep(index: number) {
    const source = draftSteps[index];
    if (!source) return;
    setConfirmDeleteStepIdx(null);
    setDraftSteps((prev) => {
      const copy: WorkflowStep = {
        ...source,
        id: `step-${Date.now()}-dup`,
        title: `${source.title} (copia)`,
        type: source.type === 'trigger' ? 'action' : source.type,
        dependsOnOrder: index + 1,
      };
      const next = [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
      return normalizeStepOrder(next);
    });
  }

  function removeStepConfirmed(index: number) {
    setConfirmDeleteStepIdx(null);
    setDraftSteps((prev) => normalizeStepOrder(prev.filter((_, i) => i !== index)));
  }

  function getConnectorInfo(key: ConnectorKey) {
    return connectors.find((c) => c.key === key);
  }

  const missingInDraft = Array.from(new Set(draftSteps.map((s) => s.connectorKey)))
    .map((k) => getConnectorInfo(k))
    .filter((c): c is ConnectorConfig => Boolean(c && c.status !== 'verified'));

  const parsedInputs = draftInputsText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const parsedOutputs = draftOutputsText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  async function handleSaveDraft() {
    setActionMsg(null);
    setActionErr(null);
    if (!draftClientId) {
      setActionErr('Selecciona un cliente del CRM para guardar la automatización.');
      return;
    }
    if (!draftName.trim() || draftSteps.length === 0) {
      setActionErr('Diseña o agrega al menos un paso y un nombre antes de guardar.');
      return;
    }
    if (draftSteps[0]?.type !== 'trigger') {
      setActionErr('El paso 1 debe tener rol «Disparador inicial» para mantener un flujo válido.');
      return;
    }

    setSaving(true);
    try {
      if (editingAutomationId) {
        const res = await apiFetch<{ automation: AutomationWithValidation }>(
          `/api/admin/automations/${editingAutomationId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              name: draftName,
              description: draftDescription || draftGoal,
              sector: draftSector,
              goal: draftGoal,
              inputs: parsedInputs,
              outputs: parsedOutputs,
              missingInfo: draftMissingInfo,
              clientCanToggle: draftClientCanToggle,
              steps: draftSteps,
              explanation: draftExplanation,
            }),
          },
        );
        setEditingVersion(res.automation.version || editingVersion + 1);
        setModelBadge(`Editando flujo guardado · Versión v${res.automation.version || 1}`);
        setActionMsg(
          `Flujo "${res.automation.name}" actualizado a versión v${res.automation.version || 1}. Si estaba activo, quedó en Pausa hasta confirmar su activación.`,
        );
      } else {
        const res = await apiFetch<{ automation: AutomationWithValidation }>('/api/admin/automations', {
          method: 'POST',
          body: JSON.stringify({
            clientId: draftClientId,
            name: draftName,
            description: draftDescription || draftGoal,
            sector: draftSector,
            goal: draftGoal,
            inputs: parsedInputs,
            outputs: parsedOutputs,
            missingInfo: draftMissingInfo,
            templateId: draftTemplateId,
            clientCanToggle: draftClientCanToggle,
            steps: draftSteps,
            explanation: draftExplanation,
          }),
        });
        setEditingAutomationId(res.automation.id);
        setEditingVersion(res.automation.version || 1);
        setActionMsg(
          `Automatización "${res.automation.name}" (v${res.automation.version || 1}) guardada en estado Borrador. Pruébala en el laboratorio antes de activarla.`,
        );
      }
      await loadAutomations();
      onDataChanged();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'No se pudo guardar la automatización.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestAutomation(autoId: string) {
    setActionMsg(null);
    setActionErr(null);
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(testPayloadText) as Record<string, unknown>;
    } catch {
      setActionErr('El JSON de prueba no tiene un formato válido.');
      return;
    }
    try {
      const res = await apiFetch<{ execution: ExecutionLog }>(`/api/admin/automations/${autoId}/test`, {
        method: 'POST',
        body: JSON.stringify({ payload: parsedPayload }),
      });
      setLastTestExec(res.execution);
      await loadAutomations();
      onDataChanged();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Error al probar el flujo.');
    }
  }

  function requestToggleAutomation(auto: AutomationWithValidation) {
    setActionMsg(null);
    setActionErr(null);
    if (auto.status === 'active') {
      void executeToggleAutomation(auto, 'paused', true);
      return;
    }
    setPendingActivationAuto(auto);
    setActivationConfirmed(false);
  }

  async function executeToggleAutomation(
    auto: AutomationWithValidation,
    nextStatus: 'active' | 'paused',
    confirmed: boolean,
  ) {
    try {
      await apiFetch(`/api/admin/automations/${auto.id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus, adminConfirmed: confirmed }),
      });
      setPendingActivationAuto(null);
      setActivationConfirmed(false);
      setActionMsg(
        nextStatus === 'active'
          ? `Automatización "${auto.name}" (v${auto.version || 1}) activada tras verificación previa y confirmación.`
          : `Automatización "${auto.name}" pausada.`,
      );
      await loadAutomations();
      onDataChanged();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function handleEmergencyStop(auto: AutomationWithValidation) {
    setActionMsg(null);
    setActionErr(null);
    try {
      await apiFetch(`/api/admin/automations/${auto.id}/emergency-stop`, {
        method: 'POST',
      });
      setConfirmEmergencyStopId(null);
      setActionMsg(
        `Desactivación de emergencia aplicada a "${auto.name}". El flujo quedó pausado y se bloqueó la reactivación automática del cliente.`,
      );
      await loadAutomations();
      onDataChanged();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'No se pudo aplicar la desactivación de emergencia.');
    }
  }

  async function handleToggleClientPermission(auto: AutomationWithValidation) {
    try {
      await apiFetch(`/api/admin/automations/${auto.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ clientCanToggle: !auto.clientCanToggle }),
      });
      await loadAutomations();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Error actualizando permiso.');
    }
  }

  function copyWebhookUrl(slug: string) {
    const url = `${window.location.origin}/api/hooks/${slug}`;
    navigator.clipboard?.writeText(url);
    setActionMsg(`Endpoint copiado: ${url}`);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Creador de Automatizaciones · JAIR IA AUTOMATIZA
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Describe en español la necesidad del negocio, edita cada paso visualmente, simula pruebas seguras y activa solo tras verificar conectores.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          {draftSteps.length > 0 && (
            <button
              type="button"
              onClick={resetDraftEditor}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo flujo</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('catalogo')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <span>Explorar catálogo y soluciones</span>
          </button>
        </div>
      </div>

      {/* Module 1: Smart Natural Language Creator */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            1. Creador inteligente en español
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            IA servidor: {aiConfigured ? 'Gemini configurado (opcional)' : 'Sin clave Gemini · Analizador local activo'}
          </span>
        </div>

        <textarea
          rows={3}
          aria-label="Descripción de la automatización en español"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Ej: Quiero recibir las solicitudes de citas, organizarlas y enviar una confirmación al cliente."
          className="w-full p-3.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Ejemplos rápidos:</span>
          {EXAMPLE_PROMPTS.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInstruction(ex)}
              className="text-left px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
            >
              Caso {i + 1}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={designLoading}
            onClick={() => runAiDesign('gemini')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            <span>{designLoading ? 'Analizando solicitud...' : 'Diseñar con JAIR IA AUTOMATIZA'}</span>
          </button>

          <button
            type="button"
            disabled={designLoading}
            onClick={() => runAiDesign('local')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Wrench className="w-4 h-4" />
            <span>Analizador Estructural Local (Sin IA externa)</span>
          </button>
        </div>

        {designError && (
          <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 space-y-2">
            <p>{designError}</p>
            {canFallbackLocal && (
              <button
                type="button"
                onClick={() => runAiDesign('local')}
                className="font-semibold underline text-amber-900 dark:text-amber-100"
              >
                Generar estructura ahora con el Analizador Estructural Local
              </button>
            )}
          </div>
        )}
      </section>

      {/* Module 2: Visual Flow Editor */}
      {draftSteps.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                2. Editor visual de flujo, dependencias y guardado en borrador
              </h2>
              {modelBadge && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">{modelBadge}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onCreateProposalFromDraft({
                    title: draftName,
                    solution: draftDescription || draftGoal,
                    howItWorks: draftSteps.map((s) => `${s.order}. ${s.title}: ${s.description}`).join(' '),
                    clientId: draftClientId,
                  })
                }
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Convertir en propuesta comercial
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {saving
                    ? 'Guardando...'
                    : editingAutomationId
                      ? `Guardar nueva versión (v${editingVersion + 1})`
                      : 'Guardar como borrador'}
                </span>
              </button>
            </div>
          </div>

          {/* General Metadata + Extracted Structure */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Nombre del flujo
              </label>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Cliente asignado (CRM)
              </label>
              <select
                value={draftClientId}
                onChange={(e) => setDraftClientId(e.target.value)}
                disabled={Boolean(editingAutomationId)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-70"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.businessName} ({c.name})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftClientCanToggle}
                  onChange={(e) => setDraftClientCanToggle(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span>Permitir al cliente pausar/activar desde su panel</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Objetivo detectado
              </label>
              <input
                type="text"
                value={draftGoal}
                onChange={(e) => setDraftGoal(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Entradas detectadas (separadas por coma)
              </label>
              <input
                type="text"
                value={draftInputsText}
                onChange={(e) => setDraftInputsText(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Salidas esperadas (separadas por coma)
              </label>
              <input
                type="text"
                value={draftOutputsText}
                onChange={(e) => setDraftOutputsText(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          {draftMissingInfo.length > 0 && (
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Información faltante detectada antes de activar ({draftMissingInfo.length})</span>
                </p>
                <button
                  type="button"
                  onClick={() => setDraftMissingInfo([])}
                  className="text-amber-800 dark:text-amber-300 underline whitespace-nowrap"
                >
                  Marcar como revisada
                </button>
              </div>
              <ul className="space-y-1 text-amber-900 dark:text-amber-200">
                {draftMissingInfo.map((info, i) => (
                  <li key={i}>· {info}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Visual Flowchart Steps */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Secuencia editable de pasos ({draftSteps.length})
                </h3>
                <button
                  type="button"
                  onClick={addStep}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar paso</span>
                </button>
              </div>

              <div className="space-y-2">
                {draftSteps.map((step, idx) => {
                  const conn = getConnectorInfo(step.connectorKey);
                  const stateDisplay = getConnectorStateDisplay(conn);
                  const isDeleting = confirmDeleteStepIdx === idx;
                  return (
                    <React.Fragment key={step.id}>
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                            <span className="font-mono tabular-nums text-xs font-bold w-6 h-6 rounded-md bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center shrink-0">
                              {step.order}
                            </span>
                            <input
                              type="text"
                              aria-label={`Título del paso ${step.order}`}
                              value={step.title}
                              onChange={(e) => updateStep(idx, { title: e.target.value })}
                              className="w-full text-sm font-semibold bg-transparent border-b border-transparent focus:border-emerald-600 focus:outline-none text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveStep(idx, -1)}
                              aria-label={`Subir paso ${step.order}`}
                              title="Subir paso"
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === draftSteps.length - 1}
                              onClick={() => moveStep(idx, 1)}
                              aria-label={`Bajar paso ${step.order}`}
                              title="Bajar paso"
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => duplicateStep(idx)}
                              aria-label={`Duplicar paso ${step.order}`}
                              title="Duplicar paso"
                              className="p-1.5 rounded-md text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteStepIdx(isDeleting ? null : idx)}
                              aria-label={`Eliminar paso ${step.order}`}
                              title="Eliminar paso"
                              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {isDeleting && (
                          <div className="p-2.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 flex items-center justify-between gap-2 text-xs">
                            <span className="text-red-700 dark:text-red-300">
                              ¿Confirmas eliminar el paso {step.order}?
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => removeStepConfirmed(idx)}
                                className="px-2.5 py-1 font-semibold rounded bg-red-600 text-white hover:bg-red-700"
                              >
                                Confirmar eliminación
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteStepIdx(null)}
                                className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:underline"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                              Rol dentro del flujo
                            </label>
                            <select
                              value={step.type}
                              onChange={(e) =>
                                updateStep(idx, { type: e.target.value as WorkflowStep['type'] })
                              }
                              className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            >
                              {STEP_ROLE_OPTIONS.map((role) => (
                                <option key={role.type} value={role.type}>
                                  {role.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                              Dependencia de ejecución
                            </label>
                            <div className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                              {idx === 0
                                ? 'Inicio del flujo (sin dependencia previa)'
                                : `Depende del paso ${step.dependsOnOrder || idx}`}
                            </div>
                          </div>
                        </div>

                        <input
                          type="text"
                          aria-label={`Descripción del paso ${step.order}`}
                          value={step.description}
                          onChange={(e) => updateStep(idx, { description: e.target.value })}
                          className="w-full text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800"
                        />

                        {step.type === 'condition' && (
                          <div className="text-xs">
                            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                              Regla condicional evaluada
                            </label>
                            <input
                              type="text"
                              value={step.conditionRule || ''}
                              onChange={(e) => updateStep(idx, { conditionRule: e.target.value })}
                              placeholder="Ej: Si correo y teléfono válidos -> continuar con confirmación"
                              className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            />
                          </div>
                        )}

                        {step.type === 'trigger' && (
                          <div className="text-xs">
                            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                              Campos obligatorios al recibir datos (separados por coma)
                            </label>
                            <input
                              type="text"
                              value={(step.requiredFields || []).join(', ')}
                              onChange={(e) =>
                                updateStep(idx, {
                                  requiredFields: e.target.value
                                    .split(',')
                                    .map((f) => f.trim())
                                    .filter(Boolean),
                                })
                              }
                              placeholder="nombre, telefono, correo"
                              className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <select
                            aria-label={`Conector del paso ${step.order}`}
                            value={step.connectorKey}
                            onChange={(e) =>
                              updateStep(idx, { connectorKey: e.target.value as ConnectorKey })
                            }
                            className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                          >
                            {CONNECTOR_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                {opt.label}
                              </option>
                            ))}
                          </select>

                          <span className={`inline-flex items-center gap-1 font-semibold ${stateDisplay.toneClass}`}>
                            {stateDisplay.label === 'VERIFICADA' ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : stateDisplay.label === 'ERROR' ? (
                              <AlertCircle className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                            <span>{stateDisplay.label}</span>
                          </span>
                        </div>
                      </div>
                      {idx < draftSteps.length - 1 && (
                        <div className="flex justify-center text-slate-400">
                          <ArrowDown className="w-4 h-4" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* AI 6-point Explanation & Pre-activation Requirements Validator */}
            <div className="lg:col-span-5 space-y-4">
              {draftExplanation && (
                <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-3 text-xs">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Resumen operativo comprensible
                  </h3>
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Qué hará el flujo</p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">{draftExplanation.whatItDoes}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Cuándo se ejecutará</p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">{draftExplanation.whenItRuns}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Información que utilizará</p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      {(parsedInputs.length > 0 ? parsedInputs : draftExplanation.dataUsed).join(' · ')}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Aplicaciones necesarias</p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      {draftExplanation.requiredApps.join(' · ')}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Permisos requeridos</p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      {draftExplanation.requiredPermissions.join(' · ')}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Posibles costos externos</p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      {draftExplanation.externalCosts}
                    </p>
                  </div>
                </div>
              )}

              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Checklist previa a activación
                </h3>
                {missingInDraft.length === 0 ? (
                  <p className="text-emerald-700 dark:text-emerald-400">
                    Todos los conectores usados por este flujo están en estado VERIFICADA.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-amber-700 dark:text-amber-400">
                      Este flujo se guardará en Borrador. Para activarlo luego deberás verificar:
                    </p>
                    <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                      {missingInDraft.map((m) => (
                        <li key={m.key}>
                          · {m.name} ({getConnectorStateDisplay(m).label})
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => onNavigate('motor')}
                      className="font-semibold text-emerald-700 dark:text-emerald-400 underline"
                    >
                      Ir a configurar y verificar conectores
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {actionMsg && (
        <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200">
          {actionMsg}
        </div>
      )}
      {actionErr && (
        <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
          {actionErr}
        </div>
      )}

      {/* Module 5: Pre-Activation Safe Checklist & Confirmation Preview */}
      {pendingActivationAuto && (
        <section
          aria-label="Confirmación previa a activación"
          className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 p-6 space-y-4 text-xs"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Vista previa y confirmación segura de activación
              </h2>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                Flujo: <span className="font-semibold">{pendingActivationAuto.name}</span> · Versión v
                {pendingActivationAuto.version || 1}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPendingActivationAuto(null)}
              aria-label="Cerrar vista previa"
              className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
              <p className="font-semibold text-slate-900 dark:text-white">
                Secuencia que entrará en producción ({pendingActivationAuto.steps.length} pasos)
              </p>
              {pendingActivationAuto.steps.map((s) => (
                <p key={s.id} className="text-slate-600 dark:text-slate-300">
                  {s.order}. {s.title} ({s.connectorKey})
                </p>
              ))}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
              <p className="font-semibold text-slate-900 dark:text-white">
                Verificaciones y permisos (Ley 1581)
              </p>
              <p className="text-emerald-700 dark:text-emerald-400">
                Conectores verificados: {pendingActivationAuto.validation.verifiedConnectors.join(', ')}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Permisos: {pendingActivationAuto.explanation.requiredPermissions.join(' · ')}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Podrás pausar o usar Desactivación de emergencia en cualquier momento.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-slate-800 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={activationConfirmed}
              onChange={(e) => setActivationConfirmed(e.target.checked)}
              className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span>
              Confirmo que revisé los pasos, conectores verificados y permisos antes de activar este flujo.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!activationConfirmed}
              onClick={() => executeToggleAutomation(pendingActivationAuto, 'active', true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Confirmar y activar automatización</span>
            </button>
            <button
              type="button"
              onClick={() => setPendingActivationAuto(null)}
              className="px-3 py-2 text-slate-600 dark:text-slate-300 hover:underline"
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      {/* Existing Automations + Module 3 Simulation Lab */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Automatizaciones registradas ({automations.length})
          </h2>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {automations.map((auto) => {
              const client = clients.find((c) => c.id === auto.clientId);
              const isActive = auto.status === 'active';
              const isConfirmingEmergency = confirmEmergencyStopId === auto.id;
              return (
                <div key={auto.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                          {auto.name}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px] text-slate-500">
                          v{auto.version || 1}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            isActive
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {isActive ? 'Activa' : auto.status === 'draft' ? 'Borrador' : 'Pausada'}
                        </span>
                        {auto.isDemo && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-500">Demo</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Cliente: {client?.businessName || auto.clientId} · {auto.steps.length} pasos ·{' '}
                        <span className="font-mono tabular-nums">{auto.executionCount}</span> ejecuciones ·{' '}
                        <span className="font-mono tabular-nums">{auto.errorCount}</span> errores
                      </p>
                      {!auto.validation.readyToActivate && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Requiere verificar:{' '}
                          {auto.validation.missingConnectors.map((m) => m.name).join(', ')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => loadAutomationIntoEditor(auto)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar flujo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTestAutomation(auto.id)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        Probar flujo
                      </button>
                      <button
                        type="button"
                        onClick={() => requestToggleAutomation(auto)}
                        disabled={!isActive && !auto.validation.readyToActivate}
                        title={
                          !isActive && !auto.validation.readyToActivate
                            ? 'Configura y verifica las integraciones antes de activar'
                            : undefined
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                          isActive
                            ? 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            : 'bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isActive ? 'Pausar' : 'Activar'}</span>
                      </button>
                      {isActive && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmEmergencyStopId(isConfirmingEmergency ? null : auto.id)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Emergencia</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {isConfirmingEmergency && (
                    <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-red-800 dark:text-red-300">
                        ¿Confirmas la desactivación de emergencia? Pausará el flujo y bloqueará su reactivación por el cliente.
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEmergencyStop(auto)}
                          className="px-3 py-1 font-semibold rounded bg-red-600 text-white hover:bg-red-700"
                        >
                          Confirmar detención de emergencia
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmEmergencyStopId(null)}
                          className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => copyWebhookUrl(auto.webhookSlug)}
                        className="inline-flex items-center gap-1 font-mono hover:text-emerald-700 dark:hover:text-emerald-400"
                      >
                        <Copy className="w-3 h-3" />
                        <span>/api/hooks/{auto.webhookSlug}</span>
                      </button>
                      {auto.lastRunAt && <span>Última ejecución: {formatDateTime(auto.lastRunAt)}</span>}
                    </div>

                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={auto.clientCanToggle}
                        onChange={() => handleToggleClientPermission(auto)}
                        className="rounded border-slate-300 text-emerald-700"
                      />
                      <span>Cliente puede pausar/activar</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Module 3: Simulation Lab */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            3. Laboratorio de pruebas
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Simulación controlada: valida campos obligatorios, formato de correo/teléfono y preparación de conectores{' '}
            <span className="font-semibold">sin enviar mensajes externos ni alterar registros reales del CRM</span>.
          </p>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {TEST_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setTestPayloadText(JSON.stringify(preset.payload, null, 2))}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <textarea
            rows={6}
            aria-label="Datos JSON para simulación de flujo"
            value={testPayloadText}
            onChange={(e) => setTestPayloadText(e.target.value)}
            className="w-full p-3 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />

          {lastTestExec && (
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Simulación · v{lastTestExec.automationVersion || 1}
                </span>
                <span
                  className={`font-semibold ${
                    lastTestExec.status === 'success'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {lastTestExec.status === 'success' ? 'Validación superada' : 'Error detectado'} ·{' '}
                  <span className="font-mono tabular-nums">{lastTestExec.durationMs} ms</span>
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">{lastTestExec.outputSummary}</p>
              <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                {lastTestExec.stepTraces.map((tr) => (
                  <div key={tr.stepId} className="flex items-start justify-between gap-2 text-[11px]">
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {tr.title}{' '}
                        <span className="font-normal text-slate-500">
                          ({tr.connectorMode === 'simulado' ? 'Simulado' : tr.connectorKey})
                        </span>
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">{tr.detail}</p>
                    </div>
                    <span
                      className={`font-mono shrink-0 ${
                        tr.status === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'
                      }`}
                    >
                      {tr.status === 'ok' ? 'OK' : 'ERR'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
