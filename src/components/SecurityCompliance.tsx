import React, { useEffect, useState } from 'react';
import { Download, RotateCcw, ShieldCheck } from 'lucide-react';
import { apiFetch, formatDateTime, getMemorySession } from '../lib/api.ts';
import type { ArcoRequest, AuditLogEntry, ClientRecord } from '../types.ts';

interface SecurityComplianceProps {
  clients: ClientRecord[];
  onRefresh: () => Promise<void>;
}

export function SecurityCompliance({ clients, onRefresh }: SecurityComplianceProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [arcoRequests, setArcoRequests] = useState<ArcoRequest[]>([]);
  const [consentsCount, setConsentsCount] = useState(0);
  const [envPasscodeActive, setEnvPasscodeActive] = useState(false);

  const [arcoClientId, setArcoClientId] = useState(clients[0]?.id || '');
  const [rightType, setRightType] = useState<ArcoRequest['rightType']>('Acceso');
  const [arcoDesc, setArcoDesc] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function loadSecurity() {
    try {
      const res = await apiFetch<{
        auditLogs: AuditLogEntry[];
        arcoRequests: ArcoRequest[];
        consentsCount: number;
        envPasscodeActive: boolean;
      }>('/api/admin/security');
      setAuditLogs(res.auditLogs);
      setArcoRequests(res.arcoRequests);
      setConsentsCount(res.consentsCount);
      setEnvPasscodeActive(res.envPasscodeActive);
    } catch {
      // handled silently
    }
  }

  useEffect(() => {
    loadSecurity();
  }, []);

  async function handleDownloadBackup() {
    const session = getMemorySession();
    const res = await fetch('/api/admin/backup', {
      headers: session ? { Authorization: `Bearer ${session.token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jairrestaura-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Copia de seguridad sanitizada descargada correctamente.');
    await loadSecurity();
  }

  async function handleResetDemo() {
    await apiFetch('/api/admin/reset-demo', { method: 'POST' });
    setMsg('Datos de demostración restablecidos.');
    await onRefresh();
    await loadSecurity();
  }

  async function handleCreateArco(e: React.FormEvent) {
    e.preventDefault();
    if (!arcoClientId || !arcoDesc.trim()) return;
    await apiFetch('/api/admin/arco', {
      method: 'POST',
      body: JSON.stringify({
        clientId: arcoClientId,
        rightType,
        description: arcoDesc,
      }),
    });
    setArcoDesc('');
    setMsg('Solicitud ARCO registrada conforme a la Ley 1581 de 2012.');
    await loadSecurity();
  }

  async function handleUpdateArcoStatus(id: string, status: ArcoRequest['status']) {
    await apiFetch(`/api/admin/arco/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadSecurity();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Seguridad, Auditoría y Ley 1581 de 2012
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Control de acceso por roles, cifrado de secretos en servidor, registro de auditoría, copias de seguridad y protección de datos personales (Colombia).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Exportar copia de seguridad</span>
          </button>
          <button
            type="button"
            onClick={handleResetDemo}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer demo</span>
          </button>
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200">
          {msg}
        </div>
      )}

      {/* Security Safeguards Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2">
          <p className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Aislamiento y Autenticación</span>
          </p>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Sesiones firmadas con HMAC-SHA256 en memoria. Cada cliente únicamente accede a sus propias automatizaciones, ejecuciones, soporte y pagos.
          </p>
          <p className="text-[11px] text-slate-500">
            Clave Admin: {envPasscodeActive ? 'Gestionada vía ADMIN_PASSCODE' : 'Hash scrypt en servidor'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2">
          <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Cifrado y Webhooks Seguros
          </p>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Las credenciales de conectores se cifran en servidor con AES-256-GCM y nunca se exponen en el navegador. Los webhooks validan firma HMAC y bloquean direcciones privadas (SSRF).
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2">
          <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Ley 1581 de 2012 (Habeas Data)
          </p>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Autorización explícita de tratamiento registrada para{' '}
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {consentsCount}/{clients.length}
            </span>{' '}
            titulares en el CRM. Canal activo para derechos ARCO.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ARCO Rights Tracker */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-xs">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Gestión de derechos ARCO (Ley 1581)
          </h2>

          <form onSubmit={handleCreateArco} className="space-y-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={arcoClientId}
                onChange={(e) => setArcoClientId(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.businessName}
                  </option>
                ))}
              </select>
              <select
                value={rightType}
                onChange={(e) => setRightType(e.target.value as ArcoRequest['rightType'])}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="Acceso">Acceso</option>
                <option value="Rectificación">Rectificación</option>
                <option value="Cancelación">Cancelación</option>
                <option value="Oposición">Oposición</option>
              </select>
            </div>
            <input
              type="text"
              required
              value={arcoDesc}
              onChange={(e) => setArcoDesc(e.target.value)}
              placeholder="Detalle de solicitud del titular..."
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              className="px-3 py-1.5 font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              Registrar solicitud ARCO
            </button>
          </form>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {arcoRequests.map((ar) => (
              <div key={ar.id} className="py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {ar.rightType} · {ar.clientName}
                  </span>
                  <select
                    value={ar.status}
                    onChange={(e) => handleUpdateArcoStatus(ar.id, e.target.value as ArcoRequest['status'])}
                    className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
                  >
                    <option value="recibida">Recibida</option>
                    <option value="en_proceso">En proceso</option>
                    <option value="completada">Completada</option>
                  </select>
                </div>
                <p className="text-slate-600 dark:text-slate-400">{ar.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Audit Log */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Bitácora de auditoría ({auditLogs.length})
          </h2>

          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {log.actorLabel} · <span className="font-mono text-[11px]">{log.action}</span>
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">{log.detail}</p>
                </div>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">
                  {formatDateTime(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
