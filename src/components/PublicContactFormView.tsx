import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Send, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';

interface PublicFormInfo {
  slug: string;
  title: string;
  description: string;
  businessName: string;
  sector: string;
  active: boolean;
  requiredFields: string[];
  isDemo?: boolean;
}

interface PublicContactFormViewProps {
  slug: string;
  onExit: () => void;
}

export function PublicContactFormView({ slug, onExit }: PublicContactFormViewProps) {
  const [formInfo, setFormInfo] = useState<PublicFormInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [habeasDataConsent, setHabeasDataConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<{ form: PublicFormInfo }>(`/api/public/forms/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (active) {
          setFormInfo(res.form);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el formulario.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmittedMsg(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        nombre,
        correo,
        telefono,
        mensaje,
        peticion: mensaje,
        habeasDataConsent,
      };
      const res = await apiFetch<{ message: string; executionId: string }>(
        `/api/public/forms/${encodeURIComponent(slug)}`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      setSubmittedMsg(`${res.message} (Registro: ${res.executionId})`);
      setNombre('');
      setCorreo('');
      setTelefono('');
      setMensaje('');
      setHabeasDataConsent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar tu solicitud.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-6">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>

        {loading && (
          <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-500">
            Cargando formulario...
          </div>
        )}

        {!loading && formInfo && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-6">
            <header className="space-y-1.5 pb-4 border-b border-slate-200 dark:border-slate-800">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {formInfo.businessName} · {formInfo.sector}
                {formInfo.isDemo ? ' · Flujo demo' : ''}
              </p>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {formInfo.title}
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {formInfo.description}
              </p>
            </header>

            {!formInfo.active && (
              <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
                Este flujo está actualmente pausado o en borrador. Actívalo desde el estudio para recibir envíos en vivo.
              </div>
            )}

            {submittedMsg && (
              <div className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{submittedMsg}</span>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre completo {formInfo.requiredFields.includes('nombre') ? '*' : ''}
                </label>
                <input
                  type="text"
                  required={formInfo.requiredFields.includes('nombre')}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Teléfono / WhatsApp {formInfo.requiredFields.includes('telefono') ? '*' : ''}
                  </label>
                  <input
                    type="text"
                    required={formInfo.requiredFields.includes('telefono')}
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="+57 300 000 0000"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Correo electrónico {formInfo.requiredFields.includes('correo') ? '*' : ''}
                  </label>
                  <input
                    type="email"
                    required={formInfo.requiredFields.includes('correo')}
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="tu@correo.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mensaje o solicitud {formInfo.requiredFields.includes('peticion') ? '*' : ''}
                </label>
                <textarea
                  rows={3}
                  required={formInfo.requiredFields.includes('peticion')}
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Cuéntanos brevemente en qué podemos ayudarte..."
                  className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <label className="flex items-start gap-2.5 text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={habeasDataConsent}
                  onChange={(e) => setHabeasDataConsent(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-700"
                />
                <span>
                  Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 (Colombia) para atender esta solicitud.
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting || !formInfo.active}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'Enviando...' : 'Enviar solicitud'}</span>
              </button>
            </form>

            <footer className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Procesado por JAIRRESTAURA AUTOMATIZA IA</span>
            </footer>
          </div>
        )}

        {!loading && error && !formInfo && (
          <div className="p-6 rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
