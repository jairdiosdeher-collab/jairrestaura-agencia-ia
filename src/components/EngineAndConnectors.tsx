import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, Send, Shield } from 'lucide-react';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import type { ConnectorConfig, ConnectorKey, ExecutionLog } from '../types.ts';

interface EngineAndConnectorsProps {
  connectors: ConnectorConfig[];
  executions: ExecutionLog[];
  onRefresh: () => Promise<void>;
}

export function EngineAndConnectors({
  connectors,
  executions,
  onRefresh,
}: EngineAndConnectorsProps) {
  const [tab, setTab] = useState<'conectores' | 'ejecuciones'>('conectores');
  const [editingKey, setEditingKey] = useState<ConnectorKey | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [execFilter, setExecFilter] = useState<'all' | 'success' | 'error' | 'test'>('all');
  const [expandedExecId, setExpandedExecId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function startEdit(conn: ConnectorConfig) {
    setEditingKey(conn.key);
    setFormValues({});
    setMsg(null);
    setErr(null);
  }

  async function handleSaveConnector(e: React.FormEvent, key: ConnectorKey) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setBusyKey(key);
    try {
      await apiFetch(`/api/admin/connectors/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ values: formValues }),
      });
      setMsg('Credenciales cifradas guardadas en servidor. Ejecuta «Verificar conexión» para validar con el proveedor.');
      setEditingKey(null);
      await onRefresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Error guardando credenciales.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleVerifyConnector(key: ConnectorKey) {
    setMsg(null);
    setErr(null);
    setBusyKey(key);
    try {
      const res = await apiFetch<{ connector: ConnectorConfig }>(`/api/admin/connectors/${key}/verify`, {
        method: 'POST',
      });
      setMsg(`Conector ${res.connector.name} verificado correctamente.`);
      await onRefresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'La verificación de conexión falló.');
      await onRefresh();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSendTelegramTest() {
    setMsg(null);
    setErr(null);
    setBusyKey('telegram-test');
    try {
      const res = await apiFetch<{ ok: boolean; messageId?: number }>(
        '/api/admin/connectors/telegram/test-message',
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
      setMsg(
        `Mensaje real enviado por Telegram Bot API (message_id: ${res.messageId ?? 'confirmado'}). Revisa tu chat configurado.`,
      );
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Error enviando mensaje de prueba por Telegram.');
    } finally {
      setBusyKey(null);
    }
  }

  const filteredExecs = executions.filter((ex) => {
    if (execFilter === 'success') return ex.status === 'success' && ex.mode === 'live';
    if (execFilter === 'error') return ex.status === 'error';
    if (execFilter === 'test') return ex.mode === 'test';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Motor de Automatizaciones y Conectores
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Arquitectura modular sin dependencias externas de pago. Ninguna integración se marca conectada hasta ser verificada.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('conectores')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'conectores'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Conectores ({connectors.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('ejecuciones')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'ejecuciones'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Ejecuciones y errores ({executions.length})
          </button>
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200">
          {msg}
        </div>
      )}
      {err && (
        <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      {tab === 'conectores' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {connectors.map((conn) => {
            const isVerified = conn.status === 'verified';
            const isError = conn.status === 'error';
            const hasSavedFields = Object.keys(conn.maskedValues).length > 0;
            const isEditing = editingKey === conn.key;

            const statusLabel = isVerified
              ? 'VERIFICADA'
              : isError
                ? 'ERROR'
                : hasSavedFields
                  ? 'CONFIGURADA'
                  : 'NO CONFIGURADA';

            return (
              <div
                key={conn.key}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4 text-xs"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      {conn.name}
                    </h2>
                    <span
                      className={`inline-flex items-center gap-1 font-semibold shrink-0 whitespace-nowrap ${
                        isVerified
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : isError
                            ? 'text-red-600 dark:text-red-400'
                            : hasSavedFields
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {isVerified ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : isError ? (
                        <AlertCircle className="w-3.5 h-3.5" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      <span>{statusLabel}</span>
                    </span>
                  </div>

                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {conn.description}
                  </p>

                  {Object.keys(conn.maskedValues).length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {Object.entries(conn.maskedValues).map(([k, v]) => (
                        <p key={k} className="truncate">
                          <span className="font-medium">{k}:</span>{' '}
                          <span className="font-mono">{v}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {conn.lastError && (
                    <p className="text-[11px] text-red-600 dark:text-red-400">{conn.lastError}</p>
                  )}

                  {isEditing && conn.requiredFields.length > 0 && (
                    <form
                      onSubmit={(e) => handleSaveConnector(e, conn.key)}
                      className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5"
                    >
                      {conn.requiredFields.map((field) => (
                        <div key={field.key}>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {field.label}
                          </label>
                          <input
                            type={field.secret ? 'password' : 'text'}
                            value={formValues[field.key] || ''}
                            onChange={(e) =>
                              setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            placeholder={field.placeholder}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                          />
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={busyKey === conn.key}
                          className="px-3 py-1.5 font-semibold rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                        >
                          Guardar cifrado
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingKey(null)}
                          className="px-2.5 py-1.5 text-slate-500 hover:underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <Shield className="w-3 h-3" />
                    <span>{conn.isLocalCapable ? 'Motor local' : 'Cifrado AES-256'}</span>
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    {conn.key === 'telegram' && isVerified && (
                      <button
                        type="button"
                        disabled={busyKey === 'telegram-test'}
                        onClick={handleSendTelegramTest}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-md border border-emerald-700/30 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-60 whitespace-nowrap"
                      >
                        <Send className="w-3 h-3" />
                        <span>{busyKey === 'telegram-test' ? 'Enviando...' : 'Enviar mensaje de prueba'}</span>
                      </button>
                    )}
                    {conn.requiredFields.length > 0 && !isEditing && (
                      <button
                        type="button"
                        onClick={() => startEdit(conn)}
                        className="px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        Configurar
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyKey === conn.key}
                      onClick={() => handleVerifyConnector(conn.key)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-md bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 whitespace-nowrap"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>{busyKey === conn.key ? 'Verificando...' : 'Verificar'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Historial de ejecuciones y diagnóstico de errores
            </h2>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'success', label: 'Reales exitosas' },
                  { id: 'error', label: 'Errores' },
                  { id: 'test', label: 'Pruebas' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setExecFilter(f.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                    execFilter === f.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {filteredExecs.length === 0 ? (
              <p className="py-6 text-slate-500">No hay registros para el filtro seleccionado.</p>
            ) : (
              filteredExecs.map((ex) => {
                const expanded = expandedExecId === ex.id;
                return (
                  <div key={ex.id} className="py-3.5 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {ex.automationName}{' '}
                          <span className="font-mono text-[11px] text-slate-500">
                            v{ex.automationVersion || 1}
                          </span>{' '}
                          ·{' '}
                          <span className="font-normal text-slate-500">
                            {ex.mode === 'test' || ex.isSimulated
                              ? 'Simulación controlada (sin envíos externos)'
                              : 'Ejecución real'}
                            {ex.clientName ? ` · ${ex.clientName}` : ''}
                            {ex.isDemo ? ' · Demo' : ''}
                          </span>
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {ex.triggerSource}
                          {ex.actorLabel ? ` · Responsable: ${ex.actorLabel}` : ''} ·{' '}
                          {formatDateTime(ex.createdAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <span
                          className={`font-semibold ${
                            ex.status === 'success'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {ex.status === 'success' ? 'Exitosa' : 'Error'}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {ex.durationMs} ms
                        </span>
                        <button
                          type="button"
                          onClick={() => setExpandedExecId(expanded ? null : ex.id)}
                          className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          {expanded ? 'Ocultar traza' : 'Ver detalle'}
                        </button>
                      </div>
                    </div>

                    {ex.errorMessage && (
                      <p className="text-red-600 dark:text-red-400">{ex.errorMessage}</p>
                    )}

                    {expanded && (
                      <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
                        <p>
                          <span className="font-semibold">Entrada (protegida Ley 1581):</span> {ex.inputSummary}
                        </p>
                        <p>
                          <span className="font-semibold">Salida:</span> {ex.outputSummary}
                        </p>
                        {ex.stepTraces.length > 0 && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                            {ex.stepTraces.map((tr) => {
                              const modeLabel =
                                tr.connectorMode === 'simulado'
                                  ? 'Simulado'
                                  : tr.connectorMode === 'real_externo'
                                    ? 'Real externo'
                                    : tr.connectorMode === 'real_local'
                                      ? 'Motor local'
                                      : ex.mode === 'test'
                                        ? 'Simulado'
                                        : 'Motor';
                              return (
                                <div key={tr.stepId} className="flex justify-between gap-2 text-[11px]">
                                  <span>
                                    <span
                                      className={`font-semibold mr-1.5 ${
                                        tr.status === 'ok'
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : 'text-red-600 dark:text-red-400'
                                      }`}
                                    >
                                      [{tr.status === 'ok' ? 'OK' : 'ERROR'}]
                                    </span>
                                    {tr.title} ({tr.connectorKey} · {modeLabel}): {tr.detail}
                                  </span>
                                  <span className="font-mono tabular-nums shrink-0">{tr.durationMs} ms</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
