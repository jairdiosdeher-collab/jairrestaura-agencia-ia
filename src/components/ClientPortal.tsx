import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Pause,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime, formatShortDate } from '../lib/api.ts';
import type {
  Automation,
  ClientRecord,
  ConnectorKey,
  ExecutionLog,
  PaymentTransaction,
} from '../types.ts';

interface PortalDashboardPayload {
  client: ClientRecord;
  automations: Array<
    Automation & {
      validation: {
        readyToActivate: boolean;
        missingConnectors: Array<{ key: ConnectorKey; name: string; status: string; reason: string }>;
      };
    }
  >;
  executions: ExecutionLog[];
  payments: PaymentTransaction[];
  proposals: Array<{
    id: string;
    title: string;
    status: string;
    shareToken: string;
    installationPriceCop: number;
    monthlyMaintenanceCop: number;
    currency: 'COP' | 'USD';
    validUntil: string;
  }>;
}

interface ClientPortalProps {
  clientId?: string;
  isAdminPreview: boolean;
  onReturnToAdmin?: () => void;
  onOpenPublicProposal: (shareToken: string) => void;
}

export function ClientPortal({
  clientId,
  isAdminPreview,
  onReturnToAdmin,
  onOpenPublicProposal,
}: ClientPortalProps) {
  const [data, setData] = useState<PortalDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [supportType, setSupportType] = useState<'error_reportado' | 'solicitud_cambio'>(
    'solicitud_cambio',
  );
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  async function loadPortal() {
    setLoading(true);
    try {
      const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
      const res = await apiFetch<PortalDashboardPayload>(`/api/portal/dashboard${qs}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar tu panel.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPortal();
  }, [clientId]);

  async function handleToggle(autoId: string, nextStatus: 'active' | 'paused') {
    setMsg(null);
    setError(null);
    try {
      await apiFetch(`/api/portal/automations/${autoId}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus, clientId }),
      });
      setMsg(
        nextStatus === 'active'
          ? 'Automatización activada correctamente.'
          : 'Automatización pausada.',
      );
      await loadPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function handleSubmitSupport(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      await apiFetch('/api/portal/support', {
        method: 'POST',
        body: JSON.stringify({ type: supportType, subject, message, clientId }),
      });
      setSubject('');
      setMessage('');
      setMsg('Solicitud enviada al equipo de JairRestaura Automatiza IA.');
      await loadPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud.');
    }
  }

  if (loading && !data) {
    return (
      <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-500">
        Cargando tu espacio independiente de cliente...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 text-sm text-red-600">
        {error || 'No fue posible acceder al panel.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isAdminPreview && onReturnToAdmin && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-emerald-900 dark:text-emerald-200 font-medium">
            Vista previa aislada del Panel del Cliente para: <strong>{data.client.businessName}</strong>
          </span>
          <button
            type="button"
            onClick={onReturnToAdmin}
            className="inline-flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-200 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver a Consola Administrador</span>
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Espacio independiente del cliente · {data.client.sector}
            {data.client.isDemo ? ' · Demo' : ''}
          </p>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
            {data.client.businessName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Titular: {data.client.name} · Estado comercial: {data.client.commercialStatus}
          </p>
        </div>

        <div className="text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Datos aislados bajo Ley 1581 de 2012</span>
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200">
          {msg}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Client Automations */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
          Mis automatizaciones ({data.automations.length})
        </h2>

        {data.automations.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no tienes automatizaciones asignadas.</p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.automations.map((auto) => {
              const isActive = auto.status === 'active';
              return (
                <div
                  key={auto.id}
                  className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
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
                        {isActive ? 'Activa' : auto.status === 'draft' ? 'En configuración' : 'Pausada'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{auto.description}</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {auto.executionCount} ejecuciones · {auto.errorCount} errores
                      {auto.lastRunAt ? ` · Última: ${formatDateTime(auto.lastRunAt)}` : ''}
                    </p>
                    {!auto.validation.readyToActivate && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Conexión pendiente:{' '}
                        {auto.validation.missingConnectors.map((m) => m.name).join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {auto.clientCanToggle ? (
                      <button
                        type="button"
                        disabled={!isActive && !auto.validation.readyToActivate}
                        onClick={() => handleToggle(auto.id, isActive ? 'paused' : 'active')}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                          isActive
                            ? 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                            : 'bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-40'
                        }`}
                      >
                        {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isActive ? 'Pausar proceso' : 'Activar proceso'}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Gestionado por JairRestaura</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Executions */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Historial de ejecuciones ({data.executions.length})
          </h2>
          {data.executions.length === 0 ? (
            <p className="text-xs text-slate-500">Sin ejecuciones registradas aún.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {data.executions.map((ex) => (
                <div key={ex.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {ex.automationName}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        ex.status === 'success'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600'
                      }`}
                    >
                      {ex.status === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5" />
                      )}
                      <span>{ex.status === 'success' ? 'Exitosa' : 'Error'}</span>
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{ex.outputSummary}</p>
                  <p className="font-mono text-[11px] text-slate-400">
                    {formatDateTime(ex.createdAt)} · {ex.durationMs} ms
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Report Error or Request Modification */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-xs">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Informar error o solicitar modificación
          </h2>

          <form onSubmit={handleSubmitSupport} className="space-y-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setSupportType('solicitud_cambio')}
                className={`flex-1 py-1.5 font-semibold rounded-md ${
                  supportType === 'solicitud_cambio'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Solicitar modificación
              </button>
              <button
                type="button"
                onClick={() => setSupportType('error_reportado')}
                className={`flex-1 py-1.5 font-semibold rounded-md ${
                  supportType === 'error_reportado'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Informar un error
              </button>
            </div>

            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto breve..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <textarea
              rows={3}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe el ajuste o el inconveniente observado..."
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <button
              type="submit"
              className="px-4 py-2 font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              Enviar al equipo JairRestaura
            </button>
          </form>

          {data.client.supportHistory.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <p className="font-semibold text-slate-700 dark:text-slate-300">Mis tickets recientes</p>
              {data.client.supportHistory.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{s.subject}</p>
                    <p className="text-slate-500">{s.message}</p>
                  </div>
                  <span className="capitalize text-slate-500 shrink-0">{s.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Contracted Services, Proposals & Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-xs">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Servicios contratados y propuestas
          </h2>
          <div>
            <p className="text-slate-500 mb-1">Servicios activos</p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {data.client.contractedServices.join(' · ') || 'En configuración'}
            </p>
          </div>
          {data.proposals.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <p className="font-semibold text-slate-700 dark:text-slate-300">Propuestas recibidas</p>
              {data.proposals.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span>
                    {p.title} ({p.status})
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenPublicProposal(p.shareToken)}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Ver PDF</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-xs">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Pagos y mantenimiento ({data.payments.length})
          </h2>
          {data.payments.length === 0 ? (
            <p className="text-slate-500">No hay pagos registrados todavía.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.payments.map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{tx.concept}</p>
                    <p className="text-slate-500">
                      {formatShortDate(tx.createdAt)} · {tx.status === 'verificado' ? 'Verificado' : 'Pendiente de confirmación'}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {formatCurrency(tx.amount, tx.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
