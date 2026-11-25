import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, CreditCard, ShieldCheck } from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime } from '../lib/api.ts';
import type { ClientRecord, PaymentGatewaySettings, PaymentTransaction } from '../types.ts';

interface PaymentsModuleProps {
  clients: ClientRecord[];
  payments: PaymentTransaction[];
  settings: PaymentGatewaySettings;
  onRefresh: () => Promise<void>;
}

export function PaymentsModule({
  clients,
  payments,
  settings,
  onRefresh,
}: PaymentsModuleProps) {
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [concept, setConcept] = useState('Mantenimiento mensual automatizaciones');
  const [kind, setKind] = useState<PaymentTransaction['kind']>('mantenimiento');
  const [provider, setProvider] = useState<PaymentTransaction['provider']>('wompi');
  const [amount, setAmount] = useState(380000);
  const [currency, setCurrency] = useState<'COP' | 'USD'>('COP');
  const [providerReference, setProviderReference] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggleAdminAuth() {
    setMsg(null);
    setErr(null);
    try {
      await apiFetch('/api/admin/payments/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          realPaymentsAuthorizedByAdmin: !settings.realPaymentsAuthorizedByAdmin,
        }),
      });
      await onRefresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'No se pudo actualizar autorización.');
    }
  }

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      await apiFetch('/api/admin/payments', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          concept,
          kind,
          provider,
          amount: Number(amount),
          currency,
          providerReference,
        }),
      });
      setMsg(
        'Orden de cobro registrada en estado Pendiente de confirmación. Solo cambiará a Verificado tras recibir confirmación firmada del proveedor.',
      );
      await onRefresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'No se pudo crear la orden de cobro.');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Cobros y Suscripciones
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Preparado para Wompi (Colombia) y Stripe (Internacional). Ningún pago se registra como exitoso sin confirmación verificable del proveedor ni autorización expresa de Jair.
        </p>
      </div>

      {/* Explicit Admin Authorization Gate */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Control de autorización de cobros reales</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Estado actual:{' '}
              <span className="font-semibold">
                {settings.realPaymentsAuthorizedByAdmin
                  ? 'Cobros en línea autorizados por el administrador'
                  : 'Cobros reales bloqueados (modo seguro sin cargos automáticos)'}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={toggleAdminAuth}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap self-start md:self-auto ${
              settings.realPaymentsAuthorizedByAdmin
                ? 'border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30'
                : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
            }`}
          >
            {settings.realPaymentsAuthorizedByAdmin
              ? 'Desactivar autorización de cobros'
              : 'Autorizar pasarelas de cobro'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white">
              Wompi Colombia · Entorno {settings.wompiEnvironment}
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              Llaves en servidor:{' '}
              {settings.wompiConfigured
                ? 'Configuradas (WOMPI_PUBLIC_KEY / WOMPI_INTEGRITY_SECRET)'
                : 'Pendiente configurar en Settings > Secrets'}
            </p>
            <p className="font-mono text-[11px] text-slate-500">
              Webhook de verificación: POST /api/webhooks/payments/wompi
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white">
              Stripe Internacional · Modo {settings.stripeMode}
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              Llaves en servidor:{' '}
              {settings.stripeConfigured
                ? 'Configuradas (STRIPE_SECRET_KEY)'
                : 'Pendiente configurar en Settings > Secrets'}
            </p>
            <p className="font-mono text-[11px] text-slate-500">
              Webhook de verificación: POST /api/webhooks/payments/stripe
            </p>
          </div>
        </div>
      </section>

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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleCreateOrder}
          className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-xs"
        >
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Crear orden de cobro o suscripción</span>
          </h2>

          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Cliente</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Concepto</label>
            <input
              type="text"
              required
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Tipo</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as PaymentTransaction['kind'])}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="unico">Cobro único</option>
                <option value="instalacion">Instalación</option>
                <option value="mantenimiento">Mantenimiento mensual</option>
                <option value="suscripcion">Plan recurrente</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Pasarela</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as PaymentTransaction['provider'])}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="wompi">Wompi (Colombia)</option>
                <option value="stripe">Stripe (Internacional)</option>
                <option value="manual_autorizado">Transferencia por verificar</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Valor</label>
              <input
                type="number"
                min={1}
                required
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'COP' | 'USD')}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {provider === 'manual_autorizado' && (
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Referencia bancaria
              </label>
              <input
                type="text"
                value={providerReference}
                onChange={(e) => setProviderReference(e.target.value)}
                placeholder="Número de comprobante"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 px-4 font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            Registrar orden de cobro
          </button>
        </form>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Historial de transacciones ({payments.length})
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Cliente y concepto</th>
                  <th className="py-2 px-3 font-medium">Pasarela</th>
                  <th className="py-2 px-3 font-medium">Estado</th>
                  <th className="py-2 pl-3 font-medium text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{tx.clientName}</p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {tx.concept} · {formatDateTime(tx.createdAt)}
                        {tx.isDemo ? ' · Demo' : ''}
                      </p>
                    </td>
                    <td className="py-3 px-3 uppercase font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {tx.provider}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          tx.status === 'verificado'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : tx.status === 'fallido'
                              ? 'text-red-600'
                              : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {tx.status === 'verificado' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : tx.status === 'fallido' ? (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {tx.status === 'verificado'
                            ? 'Verificado por proveedor'
                            : tx.status === 'fallido'
                              ? 'Fallido'
                              : 'Pendiente de confirmación'}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 pl-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {formatCurrency(tx.amount, tx.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
