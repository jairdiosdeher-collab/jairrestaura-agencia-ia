/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  Cpu,
  CreditCard,
  FileText,
  Inbox,
  Layers,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { AuthGate } from './components/AuthGate.tsx';
import { AutomationStudio } from './components/AutomationStudio.tsx';
import { CatalogHub } from './components/CatalogHub.tsx';
import { ClientPortal } from './components/ClientPortal.tsx';
import { ContactFormsModule } from './components/ContactFormsModule.tsx';
import { CrmClients } from './components/CrmClients.tsx';
import { EngineAndConnectors } from './components/EngineAndConnectors.tsx';
import { OperationsCenter } from './components/OperationsCenter.tsx';
import { PaymentsModule } from './components/PaymentsModule.tsx';
import { ProposalsAndPlans } from './components/ProposalsAndPlans.tsx';
import { PublicContactFormView } from './components/PublicContactFormView.tsx';
import { PublicProposalView } from './components/PublicProposalView.tsx';
import { SecurityCompliance } from './components/SecurityCompliance.tsx';
import { apiFetch, setMemorySession } from './lib/api.ts';
import type {
  AuditLogEntry,
  AuthSession,
  Automation,
  CatalogTemplate,
  ClientRecord,
  CommercialPlan,
  ConnectorConfig,
  ExecutionLog,
  OperationsSummary,
  PaymentGatewaySettings,
  PaymentTransaction,
  Proposal,
} from './types.ts';

type AdminViewId =
  | 'operaciones'
  | 'creador'
  | 'catalogo'
  | 'crm'
  | 'formularios'
  | 'propuestas'
  | 'motor'
  | 'cobros'
  | 'seguridad'
  | 'portal_preview';

const NAV_ITEMS: Array<{ id: AdminViewId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'operaciones', label: 'Centro de Operaciones', icon: Activity },
  { id: 'creador', label: 'Creador IA', icon: Sparkles },
  { id: 'catalogo', label: 'Catálogo JairRestaura', icon: Layers },
  { id: 'crm', label: 'CRM de Clientes', icon: Users },
  { id: 'formularios', label: 'Formularios de Contacto', icon: Inbox },
  { id: 'propuestas', label: 'Propuestas y Planes', icon: FileText },
  { id: 'motor', label: 'Motor y Conectores', icon: Cpu },
  { id: 'cobros', label: 'Cobros y Suscripciones', icon: CreditCard },
  { id: 'seguridad', label: 'Seguridad y Ley 1581', icon: ShieldCheck },
];

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [publicProposalToken, setPublicProposalToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('propuesta');
  });
  const [publicFormSlug, setPublicFormSlug] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('formulario');
  });

  const [authStatus, setAuthStatus] = useState<{
    needsFirstRunClaim: boolean;
    envPasscodeActive: boolean;
    aiConfigured: boolean;
    demoClients: Array<{ id: string; name: string; businessName: string; email: string }>;
  } | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);

  const [activeView, setActiveView] = useState<AdminViewId>('operaciones');
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);

  // Admin shared state
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [recentExecutions, setRecentExecutions] = useState<ExecutionLog[]>([]);
  const [recentAudit, setRecentAudit] = useState<AuditLogEntry[]>([]);
  const [aiConfigured, setAiConfigured] = useState(false);

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([]);
  const [executions, setExecutions] = useState<ExecutionLog[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentGatewaySettings>({
    realPaymentsAuthorizedByAdmin: false,
    wompiConfigured: false,
    stripeConfigured: false,
    wompiEnvironment: 'sandbox',
    stripeMode: 'test',
  });
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  const [specializedSolutions, setSpecializedSolutions] = useState<CatalogTemplate[]>([]);
  const [generalTemplates, setGeneralTemplates] = useState<CatalogTemplate[]>([]);

  const [selectedTemplate, setSelectedTemplate] = useState<CatalogTemplate | null>(null);
  const [proposalPrefill, setProposalPrefill] = useState<{
    title: string;
    solution: string;
    howItWorks: string;
    clientId?: string;
    installCop?: number;
    monthlyCop?: number;
    estimatedDays?: number;
    planName?: string;
  } | null>(null);

  const [emblemError, setEmblemError] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const loadAuthStatus = useCallback(async () => {
    try {
      const status = await apiFetch<{
        needsFirstRunClaim: boolean;
        envPasscodeActive: boolean;
        aiConfigured: boolean;
        demoClients: Array<{ id: string; name: string; businessName: string; email: string }>;
      }>('/api/auth/status');
      setAuthStatus(status);
      setAiConfigured(status.aiConfigured);
    } catch {
      // ignore transient startup
    }
  }, []);

  useEffect(() => {
    loadAuthStatus();
  }, [loadAuthStatus]);

  const loadAdminWorkspace = useCallback(async () => {
    setLoadingAdmin(true);
    try {
      const [ov, cat, cli, aut, prop, conn, execRes, payRes] = await Promise.all([
        apiFetch<{
          summary: OperationsSummary;
          recentExecutions: ExecutionLog[];
          recentAudit: AuditLogEntry[];
          aiConfigured: boolean;
        }>('/api/admin/overview'),
        apiFetch<{
          specializedSolutions: CatalogTemplate[];
          generalTemplates: CatalogTemplate[];
          plans: CommercialPlan[];
        }>('/api/admin/catalog'),
        apiFetch<{ clients: ClientRecord[] }>('/api/admin/clients'),
        apiFetch<{ automations: Automation[] }>('/api/admin/automations'),
        apiFetch<{ proposals: Proposal[] }>('/api/admin/proposals'),
        apiFetch<{ connectors: ConnectorConfig[] }>('/api/admin/connectors'),
        apiFetch<{ executions: ExecutionLog[] }>('/api/admin/executions'),
        apiFetch<{
          payments: PaymentTransaction[];
          settings: PaymentGatewaySettings;
          plans: CommercialPlan[];
        }>('/api/admin/payments'),
      ]);

      setSummary(ov.summary);
      setRecentExecutions(ov.recentExecutions);
      setRecentAudit(ov.recentAudit);
      setAiConfigured(ov.aiConfigured);

      setSpecializedSolutions(cat.specializedSolutions);
      setGeneralTemplates(cat.generalTemplates);
      setPlans(cat.plans);

      setClients(cli.clients);
      setAutomations(aut.automations);
      setProposals(prop.proposals);
      setConnectors(conn.connectors);
      setExecutions(execRes.executions);
      setPayments(payRes.payments);
      setPaymentSettings(payRes.settings);
    } finally {
      setLoadingAdmin(false);
    }
  }, []);

  function handleAuthenticated(newSession: AuthSession) {
    setMemorySession(newSession);
    setSession(newSession);
    if (newSession.role === 'admin') {
      setActiveView('operaciones');
      loadAdminWorkspace();
    }
  }

  function handleLogout() {
    setMemorySession(null);
    setSession(null);
    setPreviewClientId(null);
    loadAuthStatus();
  }

  function openPublicProposal(token: string) {
    setPublicProposalToken(token);
  }

  function openPublicForm(slug: string) {
    setPublicFormSlug(slug);
  }

  if (publicProposalToken) {
    return (
      <PublicProposalView
        shareToken={publicProposalToken}
        onExit={() => {
          setPublicProposalToken(null);
          if (window.location.search.includes('propuesta=')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }}
      />
    );
  }

  if (publicFormSlug) {
    return (
      <PublicContactFormView
        slug={publicFormSlug}
        onExit={() => {
          setPublicFormSlug(null);
          if (window.location.search.includes('formulario=')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }}
      />
    );
  }

  if (!session) {
    return (
      <AuthGate
        needsFirstRunClaim={authStatus?.needsFirstRunClaim ?? false}
        envPasscodeActive={authStatus?.envPasscodeActive ?? false}
        demoClients={authStatus?.demoClients ?? []}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  // Strictly isolated view when logged in as a Client user
  if (session.role === 'client') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <Building2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            <span className="font-display font-bold text-sm sm:text-base tracking-tight">
              JAIRRESTAURA · Portal del Cliente
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Cambiar modo claro u oscuro"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
          <ClientPortal
            clientId={session.clientId}
            isAdminPreview={false}
            onOpenPublicProposal={openPublicProposal}
          />
        </main>
      </div>
    );
  }

  const currentNavLabel =
    activeView === 'portal_preview'
      ? 'Panel del Cliente (Vista previa)'
      : NAV_ITEMS.find((n) => n.id === activeView)?.label || 'Centro de Operaciones';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          {!emblemError ? (
            <img
              src="/src/assets/images/jairrestaura_emblem_1795615927397.jpg"
              alt="Logo JairRestaura"
              referrerPolicy="no-referrer"
              onError={() => setEmblemError(true)}
              className="w-8 h-8 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-md bg-emerald-700 text-white flex items-center justify-center font-display font-bold text-xs shrink-0">
              JR
            </div>
          )}
          <div className="min-w-0">
            <p className="font-display text-xs font-bold tracking-tight text-slate-900 dark:text-white truncate">
              JAIRRESTAURA
            </p>
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 truncate">
              AUTOMATIZA IA
            </p>
          </div>
        </div>

        <nav aria-label="Navegación principal" className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveView(item.id);
                  setPreviewClientId(null);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg transition-colors text-left ${
                  active
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          {clients.length > 0 && (
            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 space-y-1">
              <p className="px-3 text-[11px] font-medium text-slate-400">Vista Panel Cliente</p>
              <button
                type="button"
                onClick={() => {
                  setPreviewClientId(clients[0]!.id);
                  setActiveView('portal_preview');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-lg transition-colors text-left ${
                  activeView === 'portal_preview'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Building2 className="w-4 h-4 shrink-0" />
                <span className="truncate">Panel del Cliente</span>
              </button>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          Tu negocio trabaja inteligentemente mientras tú avanzas.
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-10">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-display text-sm font-bold">JAIRRESTAURA AUTOMATIZA IA</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar menú"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg text-left ${
                      active
                        ? 'bg-emerald-700 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700"
              aria-label="Abrir navegación"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
              <span>JairRestaura Automatiza IA</span>
              <span className="mx-2" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-white">{currentNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              aria-label="Cambiar modo claro u oscuro"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{darkMode ? 'Claro' : 'Oscuro'}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7">
          {activeView === 'operaciones' && (
            <OperationsCenter
              summary={summary}
              recentExecutions={recentExecutions}
              recentAudit={recentAudit}
              aiConfigured={aiConfigured}
              loading={loadingAdmin}
              onNavigate={(v) => setActiveView(v as AdminViewId)}
            />
          )}

          {activeView === 'creador' && (
            <AutomationStudio
              clients={clients}
              connectors={connectors}
              initialTemplate={selectedTemplate}
              aiConfigured={aiConfigured}
              onClearInitialTemplate={() => setSelectedTemplate(null)}
              onNavigate={(v) => setActiveView(v as AdminViewId)}
              onCreateProposalFromDraft={(draft) => {
                setProposalPrefill(draft);
                setActiveView('propuestas');
              }}
              onDataChanged={loadAdminWorkspace}
            />
          )}

          {activeView === 'catalogo' && (
            <CatalogHub
              specializedSolutions={specializedSolutions}
              generalTemplates={generalTemplates}
              onConfigureTemplate={(tpl) => {
                setSelectedTemplate(tpl);
                setActiveView('creador');
              }}
              onCreateProposalFromTemplate={(tpl) => {
                setProposalPrefill({
                  title: tpl.name,
                  solution: tpl.description,
                  howItWorks: tpl.steps.map((s) => `${s.order}. ${s.title}`).join(' · '),
                  installCop: tpl.suggestedInstallCop,
                  monthlyCop: tpl.suggestedMonthlyCop,
                  estimatedDays: tpl.estimatedDays,
                  planName: tpl.recommendedPlan.toUpperCase(),
                });
                setActiveView('propuestas');
              }}
            />
          )}

          {activeView === 'crm' && (
            <CrmClients
              clients={clients}
              automations={automations}
              proposals={proposals}
              onRefresh={loadAdminWorkspace}
              onOpenClientPortalPreview={(cid) => {
                setPreviewClientId(cid);
                setActiveView('portal_preview');
              }}
            />
          )}

          {activeView === 'formularios' && (
            <ContactFormsModule
              automations={automations}
              clients={clients}
              onOpenPublicForm={openPublicForm}
            />
          )}

          {activeView === 'propuestas' && (
            <ProposalsAndPlans
              clients={clients}
              proposals={proposals}
              plans={plans}
              prefillDraft={proposalPrefill}
              onClearPrefill={() => setProposalPrefill(null)}
              onOpenPublicProposal={openPublicProposal}
              onRefresh={loadAdminWorkspace}
            />
          )}

          {activeView === 'motor' && (
            <EngineAndConnectors
              connectors={connectors}
              executions={executions}
              onRefresh={loadAdminWorkspace}
            />
          )}

          {activeView === 'cobros' && (
            <PaymentsModule
              clients={clients}
              payments={payments}
              settings={paymentSettings}
              onRefresh={loadAdminWorkspace}
            />
          )}

          {activeView === 'seguridad' && (
            <SecurityCompliance clients={clients} onRefresh={loadAdminWorkspace} />
          )}

          {activeView === 'portal_preview' && (
            <div className="space-y-4">
              {clients.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-slate-500">Cambiar cliente en vista previa:</span>
                  <select
                    value={previewClientId || clients[0]!.id}
                    onChange={(e) => setPreviewClientId(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <ClientPortal
                clientId={previewClientId || clients[0]?.id}
                isAdminPreview={true}
                onReturnToAdmin={() => setActiveView('crm')}
                onOpenPublicProposal={openPublicProposal}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
