import React, { useState } from 'react';
import { ArrowRight, Search, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '../lib/api.ts';
import type { CatalogTemplate } from '../types.ts';

interface CatalogHubProps {
  specializedSolutions: CatalogTemplate[];
  generalTemplates: CatalogTemplate[];
  onConfigureTemplate: (template: CatalogTemplate) => void;
  onCreateProposalFromTemplate: (template: CatalogTemplate) => void;
}

export function CatalogHub({
  specializedSolutions,
  generalTemplates,
  onConfigureTemplate,
  onCreateProposalFromTemplate,
}: CatalogHubProps) {
  const [tab, setTab] = useState<'especializadas' | 'plantillas'>('especializadas');
  const [search, setSearch] = useState('');

  const activeList = tab === 'especializadas' ? specializedSolutions : generalTemplates;
  const filtered = activeList.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.sector.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Catálogo y Soluciones JairRestaura
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            6 líneas especializadas de la marca y 16 plantillas sectoriales listas para configurar o cotizar.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('especializadas')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'especializadas'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Soluciones JairRestaura ({specializedSolutions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('plantillas')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'plantillas'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Plantillas Listas ({generalTemplates.length})
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, sector o función..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-500">
          No hay soluciones que coincidan con tu búsqueda.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-5"
            >
              <div className="space-y-3">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {item.sector} · {item.steps.length} pasos · {item.estimatedDays} días est.
                </p>
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {item.name}
                  </h2>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                    {item.tagline}
                  </p>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.description}
                </p>

                {item.guardrailNote && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>{item.guardrailNote}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Referencia comercial</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(item.suggestedInstallCop)} + {formatCurrency(item.suggestedMonthlyCop)}/mes
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onConfigureTemplate(item)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white transition-colors"
                >
                  <span>Configurar plantilla</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCreateProposalFromTemplate(item)}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cotizar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
