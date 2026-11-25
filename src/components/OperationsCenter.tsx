import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  Users,
  Wallet,
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '../lib/api.ts';
import type { AuditLogEntry, ExecutionLog, OperationsSummary } from '../types.ts';

interface OperationsCenterProps {
  summary: OperationsSummary | null;
  recentExecutions: ExecutionLog[];
  recentAudit: AuditLogEntry[];
  aiConfigured: boolean;
  loading: boolean;
  onNavigate: (view: string) => void;
}

export function OperationsCenter({
  summary,
  recentExecutions,
  recentAudit,
  aiConfigured,
  loading,
  onNavigate,
}: OperationsCenterProps) {
  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const kpis = [
    {
      label: 'Clientes reales',
      value: String(summary.realClients),
      sub: `${summary.demoClients} en demostración`,
      icon: Users,
    },
    {
      label: 'Flujos creados',
      value: String(summary.realAutomations),
      sub: `${summary.totalAutomations} total (incl. demo)`,
      icon: Cpu,
    },
    {
      label: 'Automatizaciones activas',
      value: String(summary.activeAutomations),
      sub: 'Listas para ejecutar',
      icon: CheckCircle2,
    },
    {
      label: 'Ejecuciones reales',
      value: String(summary.realExecutions),
      sub: `${summary.totalExecutions} total · ${summary.capturedLeadsCount} leads`,
      icon: Clock,
    },
    {
      label: 'Errores detectados',
      value: String(summary.detectedErrors),
      sub: 'En bitácora del motor',
      icon: AlertTriangle,
      tone: summary.detectedErrors > 0 ? 'error' : 'normal',
    },
    {
      label: 'Propuestas enviadas',
      value: String(summary.proposalsSent),
      sub: 'Incluye demo',
      icon: FileText,
    },
    {
      label: 'Propuestas aceptadas',
      value: String(summary.proposalsAccepted),
      sub: 'Confirmadas en enlace',
      icon: CheckCircle2,
    },
    {
      label: 'Ingresos reales verificados',
      value: formatCurrency(summary.realRevenueCop, 'COP'),
      sub: `${formatCurrency(summary.demoRevenueCop, 'COP')} demo`,
      icon: Wallet,
    },
    {
      label: 'Servicios pendientes',
      value: String(summary.pendingServicesCount),
      sub: 'Prospectos y tickets',
      icon: Clock,
    },
    {
      label: 'Alertas de mantenimiento',
      value: String(summary.maintenanceAlerts.length),
      sub: 'Revisión recomendada',
      icon: AlertTriangle,
      tone: summary.maintenanceAlerts.length > 0 ? 'warning' : 'normal',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Centro de Operaciones
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Panorama ejecutivo de clientes, flujos verificables, propuestas e ingresos de JairRestaura Automatiza IA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('creador')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white transition-colors whitespace-nowrap"
          >
            <span>Diseñar con JAIR IA</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('propuestas')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <span>Nueva propuesta</span>
          </button>
        </div>
      </div>

      {!aiConfigured && (
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <span className="font-semibold">Asistente JAIR IA AUTOMATIZA en modo local:</span> Configura{' '}
            <span className="font-mono">GEMINI_API_KEY</span> en Settings &gt; Secrets para activar el diseño generativo con Gemini en servidor. El analizador estructural local sigue disponible sin costo.
          </div>
          <button
            type="button"
            onClick={() => onNavigate('creador')}
            className="text-xs font-semibold text-amber-900 dark:text-amber-200 underline whitespace-nowrap self-start sm:self-auto"
          >
            Ir al Creador
          </button>
        </div>
      )}

      {/* 10 KPI Grid with tabular numerals */}
      <section aria-label="Indicadores operativos" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const valueColor =
            kpi.tone === 'error'
              ? 'text-red-600 dark:text-red-400'
              : kpi.tone === 'warning'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-white';
          return (
            <div
              key={kpi.label}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</span>
                <Icon className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
              <p className={`font-mono tabular-nums text-2xl font-bold ${valueColor}`}>{kpi.value}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">{kpi.sub}</p>
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Maintenance Alerts */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Alertas de mantenimiento
            </h2>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {summary.maintenanceAlerts.length} activas
            </span>
          </div>

          {summary.maintenanceAlerts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              Sin alertas pendientes. Todos los conectores y flujos operan normalmente.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {summary.maintenanceAlerts.map((alert) => (
                <div key={alert.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p
                      className={`text-xs font-semibold ${
                        alert.severity === 'error'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {alert.severity === 'error' ? 'Error crítico' : 'Revisión sugerida'} · {alert.title}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{alert.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate(alert.targetView)}
                    className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
                  >
                    Revisar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Executions */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Ejecuciones recientes verificables
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('motor')}
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
            >
              Ver bitácora completa
            </button>
          </div>

          {recentExecutions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              Aún no se han ejecutado flujos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3 font-medium">Automatización</th>
                    <th className="py-2 px-3 font-medium">Tipo</th>
                    <th className="py-2 px-3 font-medium">Resultado</th>
                    <th className="py-2 pl-3 font-medium text-right">Duración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {recentExecutions.map((ex) => (
                    <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[230px]">
                          {ex.automationName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatDateTime(ex.createdAt)}
                          {ex.isDemo ? ' · Demo' : ''}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {ex.mode === 'test' ? 'Prueba' : 'Real'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            ex.status === 'success'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {ex.status === 'success' ? 'Completada' : 'Con error'}
                        </span>
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {ex.durationMs} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Audit Preview */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Registro de auditoría reciente
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('seguridad')}
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
          >
            Centro de Seguridad y Ley 1581
          </button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {recentAudit.map((aud) => (
            <div key={aud.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <p className="font-medium text-slate-800 dark:text-slate-200">
                  {aud.actorLabel} · <span className="font-mono text-[11px]">{aud.action}</span>
                </p>
                <p className="text-slate-500 dark:text-slate-400">{aud.detail}</p>
              </div>
              <span className="font-mono text-[11px] text-slate-400 shrink-0">
                {formatDateTime(aud.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
