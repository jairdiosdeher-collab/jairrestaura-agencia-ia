import React, { useEffect, useState } from 'react';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import type { Automation, ClientRecord } from '../types.ts';

interface CapturedLeadItem {
  id: string;
  automationId: string;
  automationName: string;
  clientId: string;
  businessName: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface ContactFormsModuleProps {
  automations: Automation[];
  clients: ClientRecord[];
  onOpenPublicForm: (slug: string) => void;
}

export function ContactFormsModule({
  automations,
  clients,
  onOpenPublicForm,
}: ContactFormsModuleProps) {
  const [leads, setLeads] = useState<CapturedLeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);

  async function loadLeads() {
    setLoading(true);
    try {
      const res = await apiFetch<{ leads: CapturedLeadItem[] }>('/api/admin/leads');
      setLeads(res.leads);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeads();
  }, []);

  const formAutomations = automations.filter((a) =>
    a.steps.some((s) => s.connectorKey === 'web_form'),
  );

  function copyFormUrl(slug: string) {
    const url = `${window.location.origin}/?formulario=${slug}`;
    navigator.clipboard?.writeText(url);
    setCopiedMsg(`Enlace de formulario copiado: ${url}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Formularios de Contacto y Prospectos Capturados
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cada formulario público ejecuta en tiempo real su automatización asociada y registra consentimiento Ley 1581.
          </p>
        </div>

        <button
          type="button"
          onClick={loadLeads}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualizar registros</span>
        </button>
      </div>

      {copiedMsg && (
        <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200">
          {copiedMsg}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
          Formularios conectados ({formAutomations.length})
        </h2>

        {formAutomations.length === 0 ? (
          <p className="text-sm text-slate-500">
            Crea una automatización cuyo paso inicial use «Formularios Web JairRestaura» para publicarla aquí.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {formAutomations.map((auto) => {
              const client = clients.find((c) => c.id === auto.clientId);
              return (
                <div
                  key={auto.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                        {auto.name}
                      </span>
                      <span
                        className={`font-semibold shrink-0 ${
                          auto.status === 'active'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {auto.status === 'active' ? 'Activo' : 'Pausado'}
                      </span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                      {client?.businessName || auto.clientId} · Ruta: <span className="font-mono">?formulario={auto.webhookSlug}</span>
                      {auto.isDemo ? ' · Demo' : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenPublicForm(auto.webhookSlug)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold rounded-md bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir formulario</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copyFormUrl(auto.webhookSlug)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar enlace</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
          Contactos reales capturados por formularios y webhooks ({leads.length})
        </h2>

        {loading ? (
          <p className="text-xs text-slate-500">Cargando registros...</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aún no hay envíos reales recibidos desde formularios públicos. Abre cualquier formulario activo arriba para enviar una prueba real.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {leads.map((lead) => (
              <div key={lead.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {String(lead.payload.nombre || 'Contacto sin nombre')} ·{' '}
                    <span className="font-normal text-slate-500">{lead.businessName}</span>
                  </p>
                  <p className="text-slate-600 dark:text-slate-300">
                    {[
                      lead.payload.telefono ? `Tel: ${lead.payload.telefono}` : null,
                      lead.payload.correo ? `Correo: ${lead.payload.correo}` : null,
                      lead.payload.mensaje ? `Mensaje: ${lead.payload.mensaje}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">
                  {formatDateTime(lead.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
