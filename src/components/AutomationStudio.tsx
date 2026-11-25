import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  CheckCircle2,
  Copy,
  Pause,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wrench,
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

  const [draftName, setDraftName] = useState('');
  const [draftSector, setDraftSector] = useState('Servicios Generales');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftClientId, setDraftClientId] = useState(clients[0]?.id || '');
  const [draftClientCanToggle, setDraftClientCanToggle] = useState(true);
  const [draftSteps, setDraftSteps] = useState<WorkflowStep[]>([]);
  const [draftExplanation, setDraftExplanation] = useState<AIExplanation | null>(null);
  const [draftTemplateId, setDraftTemplateId] = useState<string | undefined>(undefined);

  const [automations, setAutomations] = useState<AutomationWithValidation[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [lastTestExec, setLastTestExec] = useState<ExecutionLog | null>(null);
  const [testPayloadText, setTestPayloadText] = useState(
    '{\n  "nombre": "Laura Castillo",\n  "telefono": "+57 310 555 0101",\n  "servicio": "Asesoría inicial"\n}',
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
      setDraftName(initialTemplate.name);
      setDraftSector(initialTemplate.sector);
      setDraftDescription(initialTemplate.description);
      setDraftSteps(initialTemplate.steps.map((s) => ({ ...s })));
      setDraftExplanation(initialTemplate.explanation);
      setDraftTemplateId(initialTemplate.id);
      setModelBadge(`Plantilla: ${initialTemplate.name}`);
      setDesignError(null);
      setCanFallbackLocal(false);
      onClearInitialTemplate();
    }
  }, [initialTemplate, onClearInitialTemplate]);

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
          steps: WorkflowStep[];
          explanation: AIExplanation;
        };
      }>('/api/ai/design-workflow', {
        method: 'POST',
        body: JSON.stringify({ instruction, mode }),
      });
      const wf = res.workflow;
      setDraftName(wf.name);
      setDraftSector(wf.sector);
      setDraftDescription(wf.description);
      setDraftSteps(wf.steps);
      setDraftExplanation(wf.explanation);
      setDraftTemplateId(undefined);
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
    setDraftSteps((prev) => [
      ...prev,
      {
        id: `step-${Date.now()}`,
        order: prev.length + 1,
        type: prev.length === 0 ? 'trigger' : 'action',
        title: prev.length === 0 ? 'Disparador de inicio' : `Nuevo paso ${prev.length + 1}`,
        description: 'Describe qué ejecuta este paso dentro del flujo.',
        connectorKey: prev.length === 0 ? 'web_form' : 'internal_crm',
        configSummary: 'Configuración editable',
      },
    ]);
  }

  function removeStep(index: number) {
    setDraftSteps((prev) =>
      prev.filter((_, i) => i !== index).map((s, idx) => ({ ...s, order: idx + 1 })),
    );
  }

  function getConnectorInfo(key: ConnectorKey) {
    return connectors.find((c) => c.key === key);
  }

  const missingInDraft = Array.from(new Set(draftSteps.map((s) => s.connectorKey)))
    .map((k) => getConnectorInfo(k))
    .filter((c): c is ConnectorConfig => Boolean(c && c.status !== 'verified'));

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
    setSaving(true);
    try {
      const res = await apiFetch<{ automation: AutomationWithValidation }>('/api/admin/automations', {
        method: 'POST',
        body: JSON.stringify({
          clientId: draftClientId,
          name: draftName,
          description: draftDescription,
          sector: draftSector,
          templateId: draftTemplateId,
          clientCanToggle: draftClientCanToggle,
          steps: draftSteps,
          explanation: draftExplanation,
        }),
      });
      setActionMsg(
        `Automatización "${res.automation.name}" guardada en estado Borrador. Pruébala y verifica sus conexiones para activarla.`,
      );
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

  async function handleToggleAutomation(auto: AutomationWithValidation) {
    setActionMsg(null);
    setActionErr(null);
    const nextStatus = auto.status === 'active' ? 'paused' : 'active';
    try {
      await apiFetch(`/api/admin/automations/${auto.id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      setActionMsg(
        nextStatus === 'active'
          ? `Automatización "${auto.name}" activada tras verificar integraciones.`
          : `Automatización "${auto.name}" pausada.`,
      );
      await loadAutomations();
      onDataChanged();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
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
            Describe en español lo que necesita tu cliente, valida requisitos y prueba el flujo antes de activarlo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('catalogo')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap self-start"
        >
          <span>Explorar catálogo y soluciones</span>
        </button>
      </div>

      {/* Prompt Composer */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            1. Instrucción en lenguaje natural
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            IA servidor: {aiConfigured ? 'Gemini configurado' : 'Sin clave Gemini · Analizador local disponible'}
          </span>
        </div>

        <textarea
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Ej: Quiero que cuando alguien escriba a mi WhatsApp, reciba una bienvenida, conozca mis servicios..."
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
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>{designLoading ? 'Diseñando flujo...' : 'Diseñar con JAIR IA AUTOMATIZA'}</span>
          </button>

          <button
            type="button"
            disabled={designLoading}
            onClick={() => runAiDesign('local')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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

      {/* Workflow Designer & Visual Graph */}
      {draftSteps.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                2. Diseño visual, validación de requisitos y guardado
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
                    solution: draftDescription,
                    howItWorks: draftSteps.map((s) => `${s.order}. ${s.title}: ${s.description}`).join(' '),
                    clientId: draftClientId,
                  })
                }
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Convertir en propuesta comercial
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Guardando...' : 'Guardar automatización'}</span>
              </button>
            </div>
          </div>

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
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
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

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Visual Flowchart Steps */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Diagrama secuencial de pasos ({draftSteps.length})
                </h3>
                <button
                  type="button"
                  onClick={addStep}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar paso</span>
                </button>
              </div>

              <div className="space-y-2">
                {draftSteps.map((step, idx) => {
                  const conn = getConnectorInfo(step.connectorKey);
                  const verified = conn?.status === 'verified';
                  return (
                    <React.Fragment key={step.id}>
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-1">
                            <span className="font-mono text-xs font-bold w-6 h-6 rounded-md bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center shrink-0">
                              {step.order}
                            </span>
                            <input
                              type="text"
                              value={step.title}
                              onChange={(e) => updateStep(idx, { title: e.target.value })}
                              className="w-full text-sm font-semibold bg-transparent border-b border-transparent focus:border-emerald-600 focus:outline-none text-slate-900 dark:text-white"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeStep(idx)}
                            aria-label="Eliminar paso"
                            className="text-slate-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <input
                          type="text"
                          value={step.description}
                          onChange={(e) => updateStep(idx, { description: e.target.value })}
                          className="w-full text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <select
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

                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              verified
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {verified ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5" />
                            )}
                            <span>{verified ? 'Conector verificado' : 'Pendiente de conexión'}</span>
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

            {/* AI 6-point Explanation & Requirements Validator */}
            <div className="lg:col-span-5 space-y-4">
              {draftExplanation && (
                <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-3 text-xs">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Explicación ejecutiva del flujo
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
                      {draftExplanation.dataUsed.join(' · ')}
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
                  Validación previa a activación
                </h3>
                {missingInDraft.length === 0 ? (
                  <p className="text-emerald-700 dark:text-emerald-400">
                    Todas las integraciones requeridas por este borrador están conectadas y verificadas.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-amber-700 dark:text-amber-400">
                      Este flujo se guardará en Borrador. Para activarlo luego deberás configurar y verificar:
                    </p>
                    <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                      {missingInDraft.map((m) => (
                        <li key={m.key}>· {m.name}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => onNavigate('motor')}
                      className="font-semibold text-emerald-700 dark:text-emerald-400 underline"
                    >
                      Ir a configurar conectores
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

      {/* Existing Automations + Dry-Run Testing */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Automatizaciones registradas ({automations.length})
          </h2>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {automations.map((auto) => {
              const client = clients.find((c) => c.id === auto.clientId);
              const isActive = auto.status === 'active';
              return (
                <div key={auto.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                          {auto.name}
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
                        onClick={() => handleTestAutomation(auto.id)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        Probar flujo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleAutomation(auto)}
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
                    </div>
                  </div>

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

        {/* Sandbox Test Payload & Result Trace */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Laboratorio de pruebas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Edita la carga útil JSON y haz clic en «Probar flujo» sobre cualquier automatización para validar campos y conectores sin simular envíos externos.
          </p>
          <textarea
            rows={5}
            value={testPayloadText}
            onChange={(e) => setTestPayloadText(e.target.value)}
            className="w-full p-3 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />

          {lastTestExec && (
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Resultado de prueba
                </span>
                <span
                  className={`font-semibold ${
                    lastTestExec.status === 'success'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {lastTestExec.status === 'success' ? 'Validación superada' : 'Error detectado'}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">{lastTestExec.outputSummary}</p>
              <div className="space-y-1.5 pt-1">
                {lastTestExec.stepTraces.map((tr) => (
                  <div key={tr.stepId} className="flex items-start justify-between gap-2 text-[11px]">
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{tr.title}</p>
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
