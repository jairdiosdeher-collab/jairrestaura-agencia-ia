export type UserRole = 'admin' | 'client';

export type CommercialStatus =
  | 'Prospecto'
  | 'Propuesta enviada'
  | 'Activo'
  | 'Mantenimiento'
  | 'Pausado';

export type AutomationStatus = 'draft' | 'active' | 'paused' | 'error';

export type ConnectorKey =
  | 'internal_crm'
  | 'web_form'
  | 'webhook'
  | 'whatsapp'
  | 'gmail'
  | 'google_calendar'
  | 'google_sheets'
  | 'telegram'
  | 'external_api';

export type ConnectorStatus = 'verified' | 'pending_config' | 'error';

export type StepType =
  | 'trigger'
  | 'ai_interpret'
  | 'condition'
  | 'action'
  | 'crm_record'
  | 'notification';

export interface WorkflowStep {
  id: string;
  order: number;
  type: StepType;
  title: string;
  description: string;
  connectorKey: ConnectorKey;
  configSummary: string;
  requiredFields?: string[];
  dependsOnOrder?: number;
  conditionRule?: string;
}

export interface AIExplanation {
  whatItDoes: string;
  whenItRuns: string;
  dataUsed: string[];
  requiredApps: string[];
  requiredPermissions: string[];
  externalCosts: string;
}

export interface Automation {
  id: string;
  clientId: string;
  name: string;
  description: string;
  sector: string;
  templateId?: string;
  status: AutomationStatus;
  version?: number;
  goal?: string;
  inputs?: string[];
  outputs?: string[];
  missingInfo?: string[];
  lastEditedBy?: string;
  clientCanToggle: boolean;
  webhookSlug: string;
  steps: WorkflowStep[];
  explanation: AIExplanation;
  executionCount: number;
  errorCount: number;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface ClientSupportEntry {
  id: string;
  type: 'soporte' | 'error_reportado' | 'solicitud_cambio';
  subject: string;
  message: string;
  status: 'abierto' | 'en_revision' | 'resuelto';
  createdAt: string;
  createdBy: UserRole;
}

export interface ClientRecord {
  id: string;
  name: string;
  businessName: string;
  sector: string;
  email: string;
  phone: string;
  city: string;
  commercialStatus: CommercialStatus;
  contractedServices: string[];
  monthlyMaintenanceCop: number;
  habeasDataConsent: boolean;
  consentDate: string;
  privacyNoticeVersion: string;
  portalAccessEnabled: boolean;
  notes: string;
  supportHistory: ClientSupportEntry[];
  createdAt: string;
  isDemo?: boolean;
}

export type ProposalStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada';

export interface Proposal {
  id: string;
  clientId: string;
  clientName: string;
  businessName: string;
  shareToken: string;
  title: string;
  problemStatement: string;
  proposedSolution: string;
  howItWorks: string;
  benefits: string[];
  installationPriceCop: number;
  monthlyMaintenanceCop: number;
  currency: 'COP' | 'USD';
  estimatedDays: number;
  terms: string;
  validUntil: string;
  status: ProposalStatus;
  planName?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface ConnectorConfig {
  key: ConnectorKey;
  name: string;
  category: 'local' | 'mensajeria' | 'google' | 'integracion';
  description: string;
  status: ConnectorStatus;
  isLocalCapable: boolean;
  requiredFields: Array<{
    key: string;
    label: string;
    placeholder: string;
    secret: boolean;
  }>;
  maskedValues: Record<string, string>;
  lastVerifiedAt?: string;
  lastError?: string;
}

export interface ExecutionStepTrace {
  stepId: string;
  title: string;
  connectorKey: ConnectorKey;
  status: 'ok' | 'skipped' | 'error';
  connectorMode?: 'simulado' | 'real_local' | 'real_externo';
  detail: string;
  durationMs: number;
}

export interface ExecutionLog {
  id: string;
  automationId: string;
  automationName: string;
  clientId: string;
  clientName?: string;
  automationVersion?: number;
  actorLabel?: string;
  isSimulated?: boolean;
  mode: 'test' | 'live';
  status: 'success' | 'error';
  triggerSource: string;
  inputSummary: string;
  outputSummary: string;
  stepTraces: ExecutionStepTrace[];
  errorMessage?: string;
  durationMs: number;
  createdAt: string;
  isDemo?: boolean;
}

export interface PaymentTransaction {
  id: string;
  clientId: string;
  clientName: string;
  concept: string;
  kind: 'unico' | 'instalacion' | 'mantenimiento' | 'suscripcion';
  provider: 'wompi' | 'stripe' | 'manual_autorizado';
  amount: number;
  currency: 'COP' | 'USD';
  status: 'pendiente_confirmacion' | 'verificado' | 'fallido';
  providerReference?: string;
  providerVerified: boolean;
  adminAuthorized: boolean;
  createdAt: string;
  verifiedAt?: string;
  isDemo?: boolean;
}

export interface PaymentGatewaySettings {
  realPaymentsAuthorizedByAdmin: boolean;
  wompiConfigured: boolean;
  stripeConfigured: boolean;
  wompiEnvironment: 'sandbox' | 'production';
  stripeMode: 'test' | 'live';
}

export interface CommercialPlan {
  id: 'inicial' | 'profesional' | 'empresarial';
  name: string;
  audience: string;
  installationPriceCop: number;
  monthlyPriceCop: number;
  maxAutomations: number;
  maxMonthlyExecutions: number;
  includedSupport: string;
  features: string[];
  active: boolean;
}

export interface CatalogTemplate {
  id: string;
  category: 'especializada' | 'general';
  name: string;
  sector: string;
  tagline: string;
  description: string;
  guardrailNote?: string;
  recommendedPlan: 'inicial' | 'profesional' | 'empresarial';
  estimatedDays: number;
  suggestedInstallCop: number;
  suggestedMonthlyCop: number;
  steps: WorkflowStep[];
  explanation: AIExplanation;
}

export interface AuditLogEntry {
  id: string;
  actorRole: UserRole | 'system' | 'webhook';
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  clientId?: string;
  clientName?: string;
  version?: number;
  detail: string;
  createdAt: string;
}

export interface ArcoRequest {
  id: string;
  clientId: string;
  clientName: string;
  rightType: 'Acceso' | 'Rectificación' | 'Cancelación' | 'Oposición';
  description: string;
  status: 'recibida' | 'en_proceso' | 'completada';
  createdAt: string;
  resolvedAt?: string;
}

export interface AuthSession {
  token: string;
  role: UserRole;
  displayName: string;
  clientId?: string;
}

export interface OperationsSummary {
  totalClients: number;
  realClients: number;
  demoClients: number;
  totalAutomations: number;
  realAutomations: number;
  activeAutomations: number;
  totalExecutions: number;
  realExecutions: number;
  detectedErrors: number;
  proposalsSent: number;
  proposalsAccepted: number;
  verifiedRevenueCop: number;
  realRevenueCop: number;
  demoRevenueCop: number;
  capturedLeadsCount: number;
  pendingServicesCount: number;
  persistenceMode?: 'local_json' | 'vercel_ephemeral_tmp' | 'upstash_kv_rest';
  maintenanceAlerts: Array<{
    id: string;
    severity: 'warning' | 'error';
    title: string;
    detail: string;
    targetView: string;
  }>;
}
