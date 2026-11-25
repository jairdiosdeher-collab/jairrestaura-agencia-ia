import React, { useState } from 'react';
import { Lock, Moon, ShieldCheck, Sun, UserCheck } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type { AuthSession } from '../types.ts';

interface AuthGateProps {
  needsFirstRunClaim: boolean;
  envPasscodeActive: boolean;
  demoClients: Array<{ id: string; name: string; businessName: string; email: string }>;
  darkMode: boolean;
  onToggleDark: () => void;
  onAuthenticated: (session: AuthSession) => void;
}

export function AuthGate({
  needsFirstRunClaim,
  envPasscodeActive,
  demoClients,
  darkMode,
  onToggleDark,
  onAuthenticated,
}: AuthGateProps) {
  const [roleTab, setRoleTab] = useState<'admin' | 'client'>('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirm, setAdminConfirm] = useState('');
  const [clientEmail, setClientEmail] = useState(demoClients[0]?.email || '');
  const [clientPassword, setClientPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [coverError, setCoverError] = useState(false);

  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (needsFirstRunClaim && adminPassword !== adminConfirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = needsFirstRunClaim ? '/api/auth/claim-admin' : '/api/auth/login-admin';
      const session = await apiFetch<AuthSession>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ password: adminPassword }),
      });
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleClientSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await apiFetch<AuthSession>('/api/auth/login-client', {
        method: 'POST',
        body: JSON.stringify({ email: clientEmail, password: clientPassword }),
      });
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciales de cliente inválidas.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          {!imgError ? (
            <img
              src="/src/assets/images/jairrestaura_emblem_1795615927397.jpg"
              alt="Emblema JairRestaura"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-8 h-8 rounded-md object-cover border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <div className="w-8 h-8 rounded-md bg-emerald-700 text-white flex items-center justify-center font-display font-bold text-sm">
              JR
            </div>
          )}
          <span className="font-display font-bold tracking-tight text-base text-slate-900 dark:text-white">
            JAIRRESTAURA AUTOMATIZA IA
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleDark}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          aria-label="Cambiar tema claro u oscuro"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{darkMode ? 'Modo claro' : 'Modo oscuro'}</span>
        </button>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <section className="lg:col-span-6 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Agencia de automatizaciones empresariales · Ecosistema JairRestaura
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Tu negocio trabaja inteligentemente mientras tú avanzas
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Diseña flujos en lenguaje natural, administra clientes y propuestas comerciales, verifica integraciones reales y ofrece un panel independiente a cada organización.
            </p>
          </div>

          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            {!coverError ? (
              <img
                src="/src/assets/images/automation_studio_cover_1795615928613.jpg"
                alt="Arquitectura visual de flujos JairRestaura Automatiza IA"
                referrerPolicy="no-referrer"
                onError={() => setCoverError(true)}
                className="w-full h-56 sm:h-64 object-cover"
              />
            ) : (
              <div className="w-full h-56 bg-gradient-to-br from-slate-900 to-emerald-950 flex items-center justify-center text-emerald-200 text-sm">
                Motor Modular JairRestaura Automatiza IA
              </div>
            )}
            <div className="p-5 grid grid-cols-3 gap-4 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Motor propio</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  Ejecución verificable
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Cumplimiento</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  Ley 1581 de 2012
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Arquitectura</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  Aislamiento por cliente
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-6 flex items-center">
          <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setRoleTab('admin');
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  roleTab === 'admin'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Administrador (Jair)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRoleTab('client');
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  roleTab === 'client'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                <span>Panel del Cliente</span>
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            {roleTab === 'admin' ? (
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    {needsFirstRunClaim
                      ? 'Configurar acceso inicial de administrador'
                      : 'Ingreso al Centro de Operaciones'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {needsFirstRunClaim
                      ? 'Define la contraseña maestra del servidor para proteger clientes, conectores y propuestas.'
                      : envPasscodeActive
                        ? 'Autenticación administrada mediante variable de entorno ADMIN_PASSCODE.'
                        : 'Ingresa la contraseña de administrador configurada.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {needsFirstRunClaim ? 'Nueva contraseña (mínimo 8 caracteres)' : 'Contraseña de administrador'}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={needsFirstRunClaim ? 8 : 1}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                {needsFirstRunClaim && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Confirmar contraseña
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={adminConfirm}
                      onChange={(e) => setAdminConfirm(e.target.value)}
                      placeholder="Repite la contraseña"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white transition-colors"
                >
                  {loading
                    ? 'Verificando...'
                    : needsFirstRunClaim
                      ? 'Guardar clave y entrar al panel'
                      : 'Ingresar como Administrador'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleClientSubmit} className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    Portal Independiente de Clientes
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Consulta exclusivamente tus automatizaciones, ejecuciones, pagos y solicitudes de soporte.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Correo registrado
                  </label>
                  <input
                    type="email"
                    required
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="correo@tuempresa.com"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Clave de acceso
                  </label>
                  <input
                    type="password"
                    required
                    value={clientPassword}
                    onChange={(e) => setClientPassword(e.target.value)}
                    placeholder="Clave asignada por JairRestaura"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                {demoClients.length > 0 && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                    <p className="font-medium text-slate-700 dark:text-slate-200">
                      Cuentas de demostración disponibles (clave: <span className="font-mono">DemoCliente2026!</span>)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {demoClients.map((dc) => (
                        <button
                          key={dc.id}
                          type="button"
                          onClick={() => {
                            setClientEmail(dc.email);
                            setClientPassword('DemoCliente2026!');
                          }}
                          className="text-left px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-600 transition-colors"
                        >
                          <span className="font-medium text-slate-800 dark:text-slate-200">{dc.businessName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white transition-colors"
                >
                  {loading ? 'Validando acceso...' : 'Entrar al Panel del Cliente'}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
