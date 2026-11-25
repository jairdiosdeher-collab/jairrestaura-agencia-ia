import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Printer, XCircle } from 'lucide-react';
import { apiFetch, formatCurrency, formatShortDate } from '../lib/api.ts';
import type { Proposal } from '../types.ts';

interface PublicProposalViewProps {
  shareToken: string;
  onExit: () => void;
}

export function PublicProposalView({ shareToken, onExit }: PublicProposalViewProps) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<{ proposal: Proposal }>(`/api/public/proposals/${encodeURIComponent(shareToken)}`)
      .then((res) => {
        if (active) {
          setProposal(res.proposal);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la propuesta.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shareToken]);

  async function handleRespond(decision: 'aceptada' | 'rechazada') {
    if (!proposal) return;
    setResponding(true);
    try {
      const res = await apiFetch<{ status: Proposal['status'] }>(
        `/api/public/proposals/${encodeURIComponent(shareToken)}/respond`,
        {
          method: 'POST',
          body: JSON.stringify({ decision }),
        },
      );
      setProposal({ ...proposal, status: res.status });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar tu respuesta.');
    } finally {
      setResponding(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a la plataforma</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir / Guardar PDF</span>
          </button>
        </div>

        {loading && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
            Cargando propuesta comercial...
          </div>
        )}

        {error && !loading && (
          <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-xl p-8 text-center space-y-3">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {proposal && !loading && (
          <article className="print-container bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-10 space-y-8">
            <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  JAIRRESTAURA AUTOMATIZA IA · Propuesta Comercial
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                  {proposal.title}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tu negocio trabaja inteligentemente mientras tú avanzas
                  {proposal.isDemo ? ' · Documento de demostración' : ''}
                </p>
              </div>

              <div className="text-left sm:text-right text-xs space-y-1 shrink-0">
                <p className="text-slate-500 dark:text-slate-400">Estado actual</p>
                <p className="font-semibold text-slate-900 dark:text-white capitalize">
                  {proposal.status}
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  Válida hasta: <span className="font-mono">{formatShortDate(proposal.validUntil)}</span>
                </p>
              </div>
            </header>

            <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm pb-6 border-b border-slate-200 dark:border-slate-800">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Preparada para</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{proposal.clientName}</p>
                <p className="text-slate-600 dark:text-slate-300">{proposal.businessName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Plan de referencia</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {proposal.planName || 'Solución a medida'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Tiempo de implementación</p>
                <p className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                  {proposal.estimatedDays} días hábiles
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  01. Diagnóstico y necesidad actual
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {proposal.problemStatement}
                </p>
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  02. Solución propuesta
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {proposal.proposedSolution}
                </p>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                03. Funcionamiento de la automatización
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {proposal.howItWorks}
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                04. Beneficios clave para su operación
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                {proposal.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Inversión única de instalación</p>
                <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {formatCurrency(proposal.installationPriceCop, proposal.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Mantenimiento mensual y soporte</p>
                <p className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                  {formatCurrency(proposal.monthlyMaintenanceCop, proposal.currency)} / mes
                </p>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                05. Condiciones del servicio
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{proposal.terms}</p>
            </section>

            <footer className="no-print pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ningún cobro en línea se realiza automáticamente al aprobar esta propuesta.
              </p>
              {proposal.status !== 'aceptada' && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => handleRespond('rechazada')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Declinar</span>
                  </button>
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => handleRespond('aceptada')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprobar propuesta</span>
                  </button>
                </div>
              )}
            </footer>
          </article>
        )}
      </div>
    </div>
  );
}
