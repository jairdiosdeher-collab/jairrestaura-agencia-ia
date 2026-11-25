import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, FileText, Save } from 'lucide-react';
import { apiFetch, formatCurrency, formatShortDate } from '../lib/api.ts';
import type { ClientRecord, CommercialPlan, Proposal } from '../types.ts';

interface ProposalsAndPlansProps {
  clients: ClientRecord[];
  proposals: Proposal[];
  plans: CommercialPlan[];
  prefillDraft: {
    title: string;
    solution: string;
    howItWorks: string;
    clientId?: string;
    installCop?: number;
    monthlyCop?: number;
    estimatedDays?: number;
    planName?: string;
  } | null;
  onClearPrefill: () => void;
  onOpenPublicProposal: (shareToken: string) => void;
  onRefresh: () => Promise<void>;
}

export function ProposalsAndPlans({
  clients,
  proposals,
  plans,
  prefillDraft,
  onClearPrefill,
  onOpenPublicProposal,
  onRefresh,
}: ProposalsAndPlansProps) {
  const [tab, setTab] = useState<'propuestas' | 'planes'>('propuestas');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [title, setTitle] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [proposedSolution, setProposedSolution] = useState('');
  const [howItWorks, setHowItWorks] = useState('');
  const [benefitsText, setBenefitsText] = useState(
    'Atención oportuna sin procesos manuales\nTrazabilidad completa en CRM y reportes\nPanel independiente con control de ejecuciones',
  );
  const [installationPriceCop, setInstallationPriceCop] = useState(1300000);
  const [monthlyMaintenanceCop, setMonthlyMaintenanceCop] = useState(380000);
  const [currency, setCurrency] = useState<'COP' | 'USD'>('COP');
  const [estimatedDays, setEstimatedDays] = useState(5);
  const [terms, setTerms] = useState(
    '50% al aprobar la propuesta y 50% al verificar conexiones y pruebas. Mantenimiento mensual renovable. Cumplimiento Ley 1581 de 2012.',
  );
  const [validUntil, setValidUntil] = useState('2026-12-31');
  const [planName, setPlanName] = useState('PROFESIONAL');
  const [status, setStatus] = useState<'borrador' | 'enviada'>('enviada');

  const [editablePlans, setEditablePlans] = useState<CommercialPlan[]>(plans);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setEditablePlans(plans);
  }, [plans]);

  useEffect(() => {
    if (!clientId && clients[0]?.id) setClientId(clients[0].id);
  }, [clients, clientId]);

  useEffect(() => {
    if (prefillDraft) {
      setTab('propuestas');
      setEditingId(null);
      if (prefillDraft.clientId) setClientId(prefillDraft.clientId);
      setTitle(prefillDraft.title);
      setProposedSolution(prefillDraft.solution);
      setHowItWorks(prefillDraft.howItWorks);
      if (prefillDraft.installCop !== undefined) setInstallationPriceCop(prefillDraft.installCop);
      if (prefillDraft.monthlyCop !== undefined) setMonthlyMaintenanceCop(prefillDraft.monthlyCop);
      if (prefillDraft.estimatedDays !== undefined) setEstimatedDays(prefillDraft.estimatedDays);
      if (prefillDraft.planName) setPlanName(prefillDraft.planName);
      if (!problemStatement) {
        setProblemStatement(
          'Procesos manuales en atención, seguimiento de prospectos y coordinación operativa que consumen tiempo del equipo.',
        );
      }
      onClearPrefill();
    }
  }, [prefillDraft, onClearPrefill, problemStatement]);

  function loadForEdit(p: Proposal) {
    setEditingId(p.id);
    setClientId(p.clientId);
    setTitle(p.title);
    setProblemStatement(p.problemStatement);
    setProposedSolution(p.proposedSolution);
    setHowItWorks(p.howItWorks);
    setBenefitsText(p.benefits.join('\n'));
    setInstallationPriceCop(p.installationPriceCop);
    setMonthlyMaintenanceCop(p.monthlyMaintenanceCop);
    setCurrency(p.currency);
    setEstimatedDays(p.estimatedDays);
    setTerms(p.terms);
    setValidUntil(p.validUntil);
    setPlanName(p.planName || 'Personalizado');
    setStatus(p.status === 'borrador' ? 'borrador' : 'enviada');
    setMsg(null);
  }

  async function handleSaveProposal(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const benefits = benefitsText
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);

    try {
      if (editingId) {
        await apiFetch(`/api/admin/proposals/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title,
            problemStatement,
            proposedSolution,
            howItWorks,
            benefits,
            installationPriceCop: Number(installationPriceCop),
            monthlyMaintenanceCop: Number(monthlyMaintenanceCop),
            currency,
            estimatedDays: Number(estimatedDays),
            terms,
            validUntil,
            status,
          }),
        });
        setMsg('Propuesta comercial actualizada.');
      } else {
        await apiFetch('/api/admin/proposals', {
          method: 'POST',
          body: JSON.stringify({
            clientId,
            title,
            problemStatement,
            proposedSolution,
            howItWorks,
            benefits,
            installationPriceCop: Number(installationPriceCop),
            monthlyMaintenanceCop: Number(monthlyMaintenanceCop),
            currency,
            estimatedDays: Number(estimatedDays),
            terms,
            validUntil,
            planName,
            status,
          }),
        });
        setMsg('Propuesta comercial generada con enlace compartible listo para enviar.');
      }
      setEditingId(null);
      await onRefresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'No se pudo guardar la propuesta.');
    }
  }

  function copyShareLink(token: string) {
    const url = `${window.location.origin}/?propuesta=${token}`;
    navigator.clipboard?.writeText(url);
    setMsg(`Enlace compartible copiado: ${url}`);
  }

  async function handleSavePlan(plan: CommercialPlan) {
    setMsg(null);
    setErr(null);
    try {
      await apiFetch(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        body: JSON.stringify(plan),
      });
      setMsg(`Plan ${plan.name} actualizado correctamente.`);
      await onRefresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'No se pudo actualizar el plan.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Propuestas Comerciales y Planes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Edita precios y condiciones antes de enviar, genera enlaces compartibles y exporta a PDF.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('propuestas')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'propuestas'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Generador de propuestas ({proposals.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('planes')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'planes'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Planes comerciales (3)
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

      {tab === 'propuestas' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveProposal}
            className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {editingId ? 'Editar propuesta comercial' : 'Crear propuesta comercial'}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="text-slate-500 hover:underline"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Cliente
                </label>
                <select
                  disabled={Boolean(editingId)}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} ({c.name})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Título de la propuesta *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: Automatización WhatsApp + Agenda"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Problema que necesita resolver *
              </label>
              <textarea
                rows={2}
                required
                value={problemStatement}
                onChange={(e) => setProblemStatement(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Solución propuesta *
              </label>
              <textarea
                rows={2}
                required
                value={proposedSolution}
                onChange={(e) => setProposedSolution(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Funcionamiento de la automatización
              </label>
              <textarea
                rows={2}
                value={howItWorks}
                onChange={(e) => setHowItWorks(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Beneficios (uno por línea)
              </label>
              <textarea
                rows={3}
                value={benefitsText}
                onChange={(e) => setBenefitsText(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Instalación
                </label>
                <input
                  type="number"
                  min={0}
                  value={installationPriceCop}
                  onChange={(e) => setInstallationPriceCop(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Mensualidad
                </label>
                <input
                  type="number"
                  min={0}
                  value={monthlyMaintenanceCop}
                  onChange={(e) => setMonthlyMaintenanceCop(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'COP' | 'USD')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="COP">COP</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Días impl.
                </label>
                <input
                  type="number"
                  min={1}
                  value={estimatedDays}
                  onChange={(e) => setEstimatedDays(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Vigencia de la propuesta
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Estado al guardar
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'borrador' | 'enviada')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="enviada">Lista para enviar</option>
                  <option value="borrador">Borrador interno</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Condiciones del servicio
              </label>
              <textarea
                rows={2}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <FileText className="w-4 h-4" />
              <span>{editingId ? 'Guardar cambios de propuesta' : 'Generar propuesta profesional'}</span>
            </button>
          </form>

          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Historial de propuestas ({proposals.length})
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {proposals.map((p) => (
                <div key={p.id} className="py-4 first:pt-0 last:pb-0 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                        {p.title}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {p.businessName} · Vence {formatShortDate(p.validUntil)}
                        {p.isDemo ? ' · Demo' : ''}
                      </p>
                    </div>
                    <span
                      className={`font-semibold capitalize shrink-0 ${
                        p.status === 'aceptada'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : p.status === 'rechazada'
                            ? 'text-red-600'
                            : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <p className="font-mono text-slate-700 dark:text-slate-300">
                    Instalación {formatCurrency(p.installationPriceCop, p.currency)} · Mes{' '}
                    {formatCurrency(p.monthlyMaintenanceCop, p.currency)}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenPublicProposal(p.shareToken)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Ver / PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copyShareLink(p.shareToken)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copiar enlace</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => loadForEdit(p)}
                      className="px-2.5 py-1.5 font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Editar precios
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ajusta libremente tarifas, límites y alcance de los 3 planes comerciales. No se activan suscripciones ni cobros reales desde aquí.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {editablePlans.map((plan, idx) => (
              <div
                key={plan.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-xs"
              >
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {plan.name}
                  </h2>
                  <input
                    type="text"
                    value={plan.audience}
                    onChange={(e) =>
                      setEditablePlans((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, audience: e.target.value } : p)),
                      )
                    }
                    className="w-full mt-1 text-xs text-slate-500 dark:text-slate-400 bg-transparent border-b border-slate-200 dark:border-slate-800 pb-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">Instalación (COP)</label>
                    <input
                      type="number"
                      min={0}
                      value={plan.installationPriceCop}
                      onChange={(e) =>
                        setEditablePlans((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, installationPriceCop: Number(e.target.value) } : p,
                          ),
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Mensualidad (COP)</label>
                    <input
                      type="number"
                      min={0}
                      value={plan.monthlyPriceCop}
                      onChange={(e) =>
                        setEditablePlans((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, monthlyPriceCop: Number(e.target.value) } : p,
                          ),
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">Máx. flujos</label>
                    <input
                      type="number"
                      min={1}
                      value={plan.maxAutomations}
                      onChange={(e) =>
                        setEditablePlans((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, maxAutomations: Number(e.target.value) } : p,
                          ),
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Ejecuciones/mes</label>
                    <input
                      type="number"
                      min={100}
                      value={plan.maxMonthlyExecutions}
                      onChange={(e) =>
                        setEditablePlans((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, maxMonthlyExecutions: Number(e.target.value) } : p,
                          ),
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                    />
                  </div>
                </div>

                <ul className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handleSavePlan(plan)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar tarifas del plan</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
