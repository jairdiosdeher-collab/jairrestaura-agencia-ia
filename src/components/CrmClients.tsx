import React, { useState } from 'react';
import { ExternalLink, KeyRound, Plus, Search, ShieldCheck } from 'lucide-react';
import { apiFetch, formatCurrency, formatShortDate } from '../lib/api.ts';
import type { Automation, ClientRecord, CommercialStatus, Proposal } from '../types.ts';

interface CrmClientsProps {
  clients: ClientRecord[];
  automations: Automation[];
  proposals: Proposal[];
  onRefresh: () => Promise<void>;
  onOpenClientPortalPreview: (clientId: string) => void;
}

const STATUSES: CommercialStatus[] = [
  'Prospecto',
  'Propuesta enviada',
  'Activo',
  'Mantenimiento',
  'Pausado',
];

export function CrmClients({
  clients,
  automations,
  proposals,
  onRefresh,
  onOpenClientPortalPreview,
}: CrmClientsProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | CommercialStatus>('Todos');
  const [selectedId, setSelectedId] = useState<string>(clients[0]?.id || '');
  const [showNewForm, setShowNewForm] = useState(false);

  // New Client form
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sector, setSector] = useState('Comercio y Pymes');
  const [city, setCity] = useState('Bogotá, Colombia');
  const [monthlyMaintenanceCop, setMonthlyMaintenanceCop] = useState(190000);
  const [habeasDataConsent, setHabeasDataConsent] = useState(false);

  // Support note & portal credential states
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMsg, setSupportMsg] = useState('');
  const [portalPass, setPortalPass] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = clients.filter((c) => {
    const matchStatus = statusFilter === 'Todos' || c.commercialStatus === statusFilter;
    const q = search.trim().toLowerCase();
    const matchText =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.businessName.toLowerCase().includes(q) ||
      c.sector.toLowerCase().includes(q);
    return matchStatus && matchText;
  });

  const selected = clients.find((c) => c.id === selectedId) || filtered[0] || null;
  const clientAutos = selected ? automations.filter((a) => a.clientId === selected.id) : [];
  const clientProps = selected ? proposals.filter((p) => p.clientId === selected.id) : [];

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      const res = await apiFetch<{ client: ClientRecord }>('/api/admin/clients', {
        method: 'POST',
        body: JSON.stringify({
          name,
          businessName,
          email,
          phone,
          sector,
          city,
          monthlyMaintenanceCop: Number(monthlyMaintenanceCop) || 0,
          habeasDataConsent,
        }),
      });
      setShowNewForm(false);
      setName('');
      setBusinessName('');
      setEmail('');
      setPhone('');
      setHabeasDataConsent(false);
      setSelectedId(res.client.id);
      setFeedback(`Cliente "${res.client.businessName}" registrado con consentimiento Ley 1581.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el cliente.');
    }
  }

  async function handleStatusChange(clientId: string, commercialStatus: CommercialStatus) {
    setError(null);
    try {
      await apiFetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        body: JSON.stringify({ commercialStatus }),
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando estado.');
    }
  }

  async function handleAddSupport(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/clients/${selected.id}/support`, {
        method: 'POST',
        body: JSON.stringify({ subject: supportSubject, message: supportMsg }),
      });
      setSupportSubject('');
      setSupportMsg('');
      setFeedback('Registro añadido al historial de soporte.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la nota de soporte.');
    }
  }

  async function handleResolveSupport(supportId: string) {
    if (!selected) return;
    await apiFetch(`/api/admin/clients/${selected.id}/support/${supportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resuelto' }),
    });
    await onRefresh();
  }

  async function handleAssignPortalPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/clients/${selected.id}/portal-credentials`, {
        method: 'POST',
        body: JSON.stringify({ password: portalPass }),
      });
      setPortalPass('');
      setFeedback(`Acceso independiente actualizado para ${selected.email}.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar la clave del portal.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            CRM de Clientes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Directorio comercial, servicios contratados, historial de propuestas, soporte y acceso independiente.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewForm(!showNewForm)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{showNewForm ? 'Cerrar formulario' : 'Registrar cliente'}</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200">
          {feedback}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {showNewForm && (
        <form
          onSubmit={handleCreateClient}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Nuevo registro de cliente
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Nombre de contacto *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Negocio o institución *
              </label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Correo electrónico *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Teléfono / WhatsApp
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Sector
              </label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option>Salud y Bienestar</option>
                <option>Educación y Neurodesarrollo</option>
                <option>Iglesias y Ministerios</option>
                <option>Evangelismo y Alcance</option>
                <option>Comercio y Pymes</option>
                <option>Joyería y Minería Responsable</option>
                <option>Servicios Generales</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Mantenimiento mensual (COP)
              </label>
              <input
                type="number"
                min={0}
                value={monthlyMaintenanceCop}
                onChange={(e) => setMonthlyMaintenanceCop(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={habeasDataConsent}
              onChange={(e) => setHabeasDataConsent(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-emerald-700"
            />
            <span>
              Confirmo que el titular autorizó el tratamiento de sus datos personales conforme a la Ley 1581 de 2012 (Colombia) para gestión comercial y automatizaciones.
            </span>
          </label>

          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            Guardar cliente en CRM
          </button>
        </form>
      )}

      {/* Search & Status Segmented Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, negocio o sector..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {(['Todos', ...STATUSES] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Master-Detail CRM Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No hay clientes para este filtro.</p>
          ) : (
            filtered.map((c) => {
              const isSelected = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-4 transition-colors ${
                    isSelected
                      ? 'bg-slate-50 dark:bg-slate-800/70'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                        {c.businessName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c.name} · {c.sector}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                      {c.commercialStatus}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {c.city}
                    {c.isDemo ? ' · Datos demo' : ''}
                  </p>
                </button>
              );
            })
          )}
        </div>

        {selected && (
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {selected.businessName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selected.name} · {selected.email} · {selected.phone}
                </p>
                <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 mt-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    Ley 1581 consentimiento vigente ({formatShortDate(selected.consentDate)})
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  value={selected.commercialStatus}
                  onChange={(e) => handleStatusChange(selected.id, e.target.value as CommercialStatus)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => onOpenClientPortalPreview(selected.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Panel del Cliente</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Automatizaciones</p>
                <p className="font-mono text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {clientAutos.length} ({clientAutos.filter((a) => a.status === 'active').length} activas)
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Propuestas vinculadas</p>
                <p className="font-mono text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {clientProps.length}
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Mantenimiento mensual</p>
                <p className="font-mono text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {formatCurrency(selected.monthlyMaintenanceCop)}
                </p>
              </div>
            </div>

            {/* Contracted Services */}
            <div className="space-y-1.5 text-xs">
              <p className="font-semibold text-slate-700 dark:text-slate-300">Servicios contratados</p>
              <p className="text-slate-600 dark:text-slate-400">
                {selected.contractedServices.length > 0
                  ? selected.contractedServices.join(' · ')
                  : 'Sin servicios contratados aún.'}
              </p>
            </div>

            {/* Independent Portal Credentials */}
            <form
              onSubmit={handleAssignPortalPassword}
              className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-2.5 text-xs"
            >
              <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                <KeyRound className="w-4 h-4 text-emerald-600" />
                <span>Credenciales de acceso al Panel del Cliente</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  required
                  minLength={8}
                  value={portalPass}
                  onChange={(e) => setPortalPass(e.target.value)}
                  placeholder="Nueva clave de acceso (mín. 8 caracteres)"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white whitespace-nowrap"
                >
                  Guardar clave del cliente
                </button>
              </div>
            </form>

            {/* Support History */}
            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Historial de soporte y solicitudes ({selected.supportHistory.length})
              </h3>
              <form onSubmit={handleAddSupport} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                <input
                  type="text"
                  required
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  placeholder="Asunto de soporte..."
                  className="sm:col-span-4 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="text"
                  required
                  value={supportMsg}
                  onChange={(e) => setSupportMsg(e.target.value)}
                  placeholder="Detalle o acción realizada..."
                  className="sm:col-span-6 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="sm:col-span-2 px-3 py-1.5 font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Agregar
                </button>
              </form>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {selected.supportHistory.map((sup) => (
                  <div key={sup.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {sup.subject} ·{' '}
                        <span className="font-normal text-slate-500">
                          {sup.type === 'error_reportado'
                            ? 'Error reportado'
                            : sup.type === 'solicitud_cambio'
                              ? 'Solicitud de cambio'
                              : 'Soporte'}
                        </span>
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">{sup.message}</p>
                    </div>
                    {sup.status !== 'resuelto' ? (
                      <button
                        type="button"
                        onClick={() => handleResolveSupport(sup.id)}
                        className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline shrink-0"
                      >
                        Marcar resuelto
                      </button>
                    ) : (
                      <span className="text-slate-400 shrink-0">Resuelto</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
