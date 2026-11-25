import fs from 'node:fs';
import path from 'node:path';
import type {
  ArcoRequest,
  AuditLogEntry,
  Automation,
  ClientRecord,
  CommercialPlan,
  ConnectorConfig,
  ConnectorKey,
  ExecutionLog,
  PaymentGatewaySettings,
  PaymentTransaction,
  Proposal,
} from '../src/types.ts';
import { DEFAULT_CONNECTORS, DEFAULT_PLANS, SPECIALIZED_SOLUTIONS } from './catalog.ts';
import { hashPassword } from './crypto.ts';

export interface ClientCredential {
  clientId: string;
  email: string;
  passwordHash: string;
  updatedAt: string;
}

export interface PersistedDatabase {
  adminPasswordHash: string | null;
  clientCredentials: ClientCredential[];
  clients: ClientRecord[];
  automations: Automation[];
  proposals: Proposal[];
  connectors: ConnectorConfig[];
  connectorEncryptedSecrets: Record<string, Record<string, string>>;
  executions: ExecutionLog[];
  payments: PaymentTransaction[];
  paymentSettings: PaymentGatewaySettings;
  plans: CommercialPlan[];
  auditLogs: AuditLogEntry[];
  arcoRequests: ArcoRequest[];
  crmCapturedLeads: Array<{
    id: string;
    automationId: string;
    clientId: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'jairrestaura-db.json');

function createInitialDemoState(): PersistedDatabase {
  const now = '2026-11-24T15:30:00.000Z';

  const clients: ClientRecord[] = [
    {
      id: 'cli-demo-1',
      name: 'Dra. Carolina Mendoza',
      businessName: 'Clínica Bienestar Integral',
      sector: 'Salud y Bienestar',
      email: 'coordinacion@bienestarintegral.demo',
      phone: '+57 310 555 0142',
      city: 'Bogotá, Colombia',
      commercialStatus: 'Activo',
      contractedServices: ['JAIRRESTAURA CONSULTORIO', 'Recordatorios automáticos'],
      monthlyMaintenanceCop: 380000,
      habeasDataConsent: true,
      consentDate: '2026-10-12T10:00:00.000Z',
      privacyNoticeVersion: 'v1.2-Ley1581',
      portalAccessEnabled: true,
      notes: 'Flujo principal de recepción administrativa y agenda de citas.',
      supportHistory: [
        {
          id: 'sup-demo-1',
          type: 'soporte',
          subject: 'Ajuste de horario de atención sábados',
          message: 'Se configuró franja de 8:00 a.m. a 12:30 p.m. en el flujo web.',
          status: 'resuelto',
          createdAt: '2026-11-18T14:20:00.000Z',
          createdBy: 'admin',
        },
      ],
      createdAt: '2026-10-12T10:00:00.000Z',
      isDemo: true,
    },
    {
      id: 'cli-demo-2',
      name: 'Pastor Mateo Restrepo',
      businessName: 'Iglesia Comunidad Vida Nueva',
      sector: 'Iglesias y Ministerios',
      email: 'secretaria@vidanueva.demo',
      phone: '+57 315 555 0198',
      city: 'Medellín, Colombia',
      commercialStatus: 'Activo',
      contractedServices: ['JAIRRESTAURA IGLESIAS', 'Gestión de solicitudes de oración'],
      monthlyMaintenanceCop: 320000,
      habeasDataConsent: true,
      consentDate: '2026-10-20T09:15:00.000Z',
      privacyNoticeVersion: 'v1.2-Ley1581',
      portalAccessEnabled: true,
      notes: 'Captación de visitantes dominicales y canal privado de intercesión.',
      supportHistory: [
        {
          id: 'sup-demo-2',
          type: 'solicitud_cambio',
          subject: 'Agregar campo de barrio en tarjeta de visitantes',
          message: 'Solicitan capturar barrio para asignar grupo cercano.',
          status: 'en_revision',
          createdAt: '2026-11-22T11:05:00.000Z',
          createdBy: 'client',
        },
      ],
      createdAt: '2026-10-20T09:15:00.000Z',
      isDemo: true,
    },
    {
      id: 'cli-demo-3',
      name: 'Julián Torres',
      businessName: 'Esmeraldas Muzo Real S.A.S.',
      sector: 'Joyería y Minería Responsable',
      email: 'gerencia@muzoreal.demo',
      phone: '+57 320 555 0174',
      city: 'Bogotá / Boyacá, Colombia',
      commercialStatus: 'Mantenimiento',
      contractedServices: ['JAIRRESTAURA ESMERALDA'],
      monthlyMaintenanceCop: 720000,
      habeasDataConsent: true,
      consentDate: '2026-11-02T16:40:00.000Z',
      privacyNoticeVersion: 'v1.2-Ley1581',
      portalAccessEnabled: true,
      notes: 'Trazabilidad de lotes certificados y envío de dossiers comerciales.',
      supportHistory: [],
      createdAt: '2026-11-02T16:40:00.000Z',
      isDemo: true,
    },
    {
      id: 'cli-demo-4',
      name: 'Valeria Gómez',
      businessName: 'Café Origen Andino',
      sector: 'Comercio y Pymes',
      email: 'ventas@origenandino.demo',
      phone: '+57 301 555 0166',
      city: 'Armenia, Quindío',
      commercialStatus: 'Propuesta enviada',
      contractedServices: ['JAIRRESTAURA EMPRENDE'],
      monthlyMaintenanceCop: 390000,
      habeasDataConsent: true,
      consentDate: '2026-11-20T13:10:00.000Z',
      privacyNoticeVersion: 'v1.2-Ley1581',
      portalAccessEnabled: false,
      notes: 'Propuesta enviada para automatizar pedidos mayoristas e inventario.',
      supportHistory: [],
      createdAt: '2026-11-20T13:10:00.000Z',
      isDemo: true,
    },
  ];

  // Demo client credentials (clearly isolated per client for demo preview & client sign-in)
  const clientCredentials: ClientCredential[] = [
    {
      clientId: 'cli-demo-1',
      email: 'coordinacion@bienestarintegral.demo',
      passwordHash: hashPassword('DemoCliente2026!'),
      updatedAt: now,
    },
    {
      clientId: 'cli-demo-2',
      email: 'secretaria@vidanueva.demo',
      passwordHash: hashPassword('DemoCliente2026!'),
      updatedAt: now,
    },
    {
      clientId: 'cli-demo-3',
      email: 'gerencia@muzoreal.demo',
      passwordHash: hashPassword('DemoCliente2026!'),
      updatedAt: now,
    },
  ];

  const consultorio = SPECIALIZED_SOLUTIONS[0]!;
  const iglesias = SPECIALIZED_SOLUTIONS[3]!;
  const esmeralda = SPECIALIZED_SOLUTIONS[5]!;

  const automations: Automation[] = [
    {
      id: 'auto-demo-1',
      clientId: 'cli-demo-1',
      name: 'Recepción web y registro de solicitudes de cita',
      description: 'Flujo local verificado para recibir solicitudes de atención con consentimiento y registrar en CRM.',
      sector: 'Salud y Bienestar',
      templateId: consultorio.id,
      status: 'active',
      clientCanToggle: true,
      webhookSlug: 'demo-consultorio-citas',
      steps: [
        {
          id: 'st-d1-1',
          order: 1,
          type: 'trigger',
          title: 'Recepción de solicitud web',
          description: 'Captura datos básicos y autorización Ley 1581.',
          connectorKey: 'web_form',
          configSummary: 'Endpoint local /api/hooks/demo-consultorio-citas',
          requiredFields: ['nombre', 'telefono'],
        },
        {
          id: 'st-d1-2',
          order: 2,
          type: 'crm_record',
          title: 'Registro administrativo en CRM',
          description: 'Guarda la solicitud sin almacenar diagnósticos médicos.',
          connectorKey: 'internal_crm',
          configSummary: 'CRM Interno JairRestaura',
        },
      ],
      explanation: consultorio.explanation,
      executionCount: 18,
      errorCount: 1,
      lastRunAt: '2026-11-24T14:10:00.000Z',
      createdAt: '2026-10-14T11:00:00.000Z',
      updatedAt: '2026-11-24T14:10:00.000Z',
      isDemo: true,
    },
    {
      id: 'auto-demo-2',
      clientId: 'cli-demo-2',
      name: 'Registro confidencial de solicitudes de oración',
      description: 'Canal seguro de recepción de peticiones y almacenamiento cifrado en CRM pastoral.',
      sector: 'Iglesias y Ministerios',
      templateId: iglesias.id,
      status: 'active',
      clientCanToggle: true,
      webhookSlug: 'demo-vidanueva-oracion',
      steps: [
        {
          id: 'st-d2-1',
          order: 1,
          type: 'trigger',
          title: 'Envío de petición de oración',
          description: 'Recibe petición con opción de reserva de identidad.',
          connectorKey: 'web_form',
          configSummary: 'Formulario confidencial',
          requiredFields: ['peticion'],
        },
        {
          id: 'st-d2-2',
          order: 2,
          type: 'crm_record',
          title: 'Registro pastoral protegido',
          description: 'Almacena en bitácora de intercesión.',
          connectorKey: 'internal_crm',
          configSummary: 'Acceso exclusivo ministerio',
        },
      ],
      explanation: iglesias.explanation,
      executionCount: 31,
      errorCount: 0,
      lastRunAt: '2026-11-24T13:05:00.000Z',
      createdAt: '2026-10-21T16:00:00.000Z',
      updatedAt: '2026-11-24T13:05:00.000Z',
      isDemo: true,
    },
    {
      id: 'auto-demo-3',
      clientId: 'cli-demo-3',
      name: 'Trazabilidad de lotes de esmeraldas (pendiente WhatsApp/Sheets)',
      description: 'Flujo diseñado esperando verificación de credenciales externas de Google Sheets.',
      sector: 'Joyería y Minería Responsable',
      templateId: esmeralda.id,
      status: 'paused',
      clientCanToggle: false,
      webhookSlug: 'demo-muzo-trazabilidad',
      steps: esmeralda.steps,
      explanation: esmeralda.explanation,
      executionCount: 2,
      errorCount: 1,
      lastRunAt: '2026-11-23T09:40:00.000Z',
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-23T09:40:00.000Z',
      isDemo: true,
    },
  ];

  const proposals: Proposal[] = [
    {
      id: 'prop-demo-1',
      clientId: 'cli-demo-4',
      clientName: 'Valeria Gómez',
      businessName: 'Café Origen Andino',
      shareToken: 'prop-origen-andino-demo',
      title: 'Automatización de Pedidos Mayoristas e Inventario',
      problemStatement:
        'Los pedidos recibidos por mensajes dispersos generan retrasos en la confirmación, errores en inventario y demoras al emitir cotizaciones.',
      proposedSolution:
        'Implementación del módulo JAIRRESTAURA EMPRENDE con captura estructurada de pedidos, verificación automática de existencias y registro en CRM.',
      howItWorks:
        '1) El comprador registra su pedido en formulario o webhook. 2) El motor valida existencias en inventario. 3) Se crea el registro en CRM y se envía confirmación formal.',
      benefits: [
        'Reducción superior al 70% en tiempo de respuesta comercial',
        'Control actualizado de inventario sin registros duplicados',
        'Panel independiente para consultar pedidos y ejecuciones en tiempo real',
      ],
      installationPriceCop: 1300000,
      monthlyMaintenanceCop: 390000,
      currency: 'COP',
      estimatedDays: 6,
      terms:
        'Pago del 50% al aprobar la propuesta y 50% contra entrega verificada. El mantenimiento mensual cubre monitoreo, soporte prioritario y ajustes menores. Sujeto a Ley 1581 de 2012.',
      validUntil: '2026-12-15',
      status: 'enviada',
      planName: 'PROFESIONAL',
      createdAt: '2026-11-20T14:00:00.000Z',
      updatedAt: '2026-11-20T14:00:00.000Z',
      isDemo: true,
    },
    {
      id: 'prop-demo-2',
      clientId: 'cli-demo-1',
      clientName: 'Dra. Carolina Mendoza',
      businessName: 'Clínica Bienestar Integral',
      shareToken: 'prop-bienestar-integral-demo',
      title: 'Sistema de Solicitudes de Atención y Recordatorios',
      problemStatement:
        'Alta carga operativa en recepción para responder solicitudes de cita y recordar horarios a los pacientes.',
      proposedSolution:
        'Módulo JAIRRESTAURA CONSULTORIO enfocado en coordinación administrativa y recordatorios sin automatizar decisiones clínicas.',
      howItWorks:
        '1) Solicitud verificada con consentimiento. 2) Registro administrativo en CRM. 3) Confirmación de horario y recordatorio previo.',
      benefits: [
        'Disminución de inasistencias a citas programadas',
        'Cumplimiento integral de privacidad y Habeas Data',
        'Trazabilidad completa de solicitudes desde el Panel del Cliente',
      ],
      installationPriceCop: 1350000,
      monthlyMaintenanceCop: 380000,
      currency: 'COP',
      estimatedDays: 5,
      terms:
        'Instalación única más mantenimiento mensual renovable sin cláusulas de permanencia forzada.',
      validUntil: '2026-11-30',
      status: 'aceptada',
      planName: 'PROFESIONAL',
      createdAt: '2026-10-10T09:00:00.000Z',
      updatedAt: '2026-10-12T10:00:00.000Z',
      isDemo: true,
    },
  ];

  const executions: ExecutionLog[] = [
    {
      id: 'exec-demo-1',
      automationId: 'auto-demo-1',
      automationName: 'Recepción web y registro de solicitudes de cita',
      clientId: 'cli-demo-1',
      mode: 'live',
      status: 'success',
      triggerSource: 'Formulario Web (/api/hooks/demo-consultorio-citas)',
      inputSummary: 'Solicitante: Andrés Felipe Ruiz · Tel: +57 312 *** 8810',
      outputSummary: 'Registro CRM creado correctamente (con consentimiento Ley 1581).',
      stepTraces: [
        {
          stepId: 'st-d1-1',
          title: 'Recepción de solicitud web',
          connectorKey: 'web_form',
          status: 'ok',
          detail: 'Campos obligatorios validados (nombre, telefono).',
          durationMs: 14,
        },
        {
          stepId: 'st-d1-2',
          title: 'Registro administrativo en CRM',
          connectorKey: 'internal_crm',
          status: 'ok',
          detail: 'Contacto almacenado en base local verificada.',
          durationMs: 22,
        },
      ],
      durationMs: 36,
      createdAt: '2026-11-24T14:10:00.000Z',
      isDemo: true,
    },
    {
      id: 'exec-demo-2',
      automationId: 'auto-demo-3',
      automationName: 'Trazabilidad de lotes de esmeraldas (pendiente WhatsApp/Sheets)',
      clientId: 'cli-demo-3',
      mode: 'test',
      status: 'error',
      triggerSource: 'Prueba de validación manual',
      inputSummary: 'Lote: MZ-2026-09 · Quilates: 3.4',
      outputSummary: 'Detenido en paso 3: conector Google Sheets pendiente de configuración.',
      stepTraces: [
        {
          stepId: 's-1',
          title: 'Alta o movimiento de lote de esmeralda',
          connectorKey: 'webhook',
          status: 'ok',
          detail: 'Estructura del lote validada.',
          durationMs: 9,
        },
        {
          stepId: 's-2',
          title: 'Registro comercial y trazabilidad',
          connectorKey: 'internal_crm',
          status: 'ok',
          detail: 'Simulación de escritura CRM superada.',
          durationMs: 11,
        },
        {
          stepId: 's-3',
          title: 'Actualización de libro maestro de inventario',
          connectorKey: 'google_sheets',
          status: 'error',
          detail: 'Conector Google Sheets está en estado Pendiente de configuración.',
          durationMs: 4,
        },
      ],
      errorMessage:
        'El conector Google Sheets requiere credenciales verificadas antes de activar el flujo en producción.',
      durationMs: 24,
      createdAt: '2026-11-23T09:40:00.000Z',
      isDemo: true,
    },
  ];

  const payments: PaymentTransaction[] = [
    {
      id: 'pay-demo-1',
      clientId: 'cli-demo-1',
      clientName: 'Clínica Bienestar Integral',
      concept: 'Instalación JAIRRESTAURA CONSULTORIO + Mes 1',
      kind: 'instalacion',
      provider: 'wompi',
      amount: 1730000,
      currency: 'COP',
      status: 'verificado',
      providerReference: 'WOMPI-DEMO-90812',
      providerVerified: true,
      adminAuthorized: true,
      createdAt: '2026-10-12T10:15:00.000Z',
      verifiedAt: '2026-10-12T10:16:00.000Z',
      isDemo: true,
    },
    {
      id: 'pay-demo-2',
      clientId: 'cli-demo-2',
      clientName: 'Iglesia Comunidad Vida Nueva',
      concept: 'Mantenimiento mensual Noviembre 2026',
      kind: 'mantenimiento',
      provider: 'wompi',
      amount: 320000,
      currency: 'COP',
      status: 'pendiente_confirmacion',
      providerReference: 'PENDIENTE-CONFIRMACION-PROVEEDOR',
      providerVerified: false,
      adminAuthorized: false,
      createdAt: '2026-11-24T09:00:00.000Z',
      isDemo: true,
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'aud-demo-1',
      actorRole: 'system',
      actorLabel: 'Sistema JairRestaura',
      action: 'INICIALIZACION_MODULO',
      targetType: 'plataforma',
      targetId: 'jairrestaura-automatiza-ia',
      detail: 'Datos de demostración iniciales cargados con separación por cliente y cumplimiento Ley 1581.',
      createdAt: now,
    },
  ];

  const arcoRequests: ArcoRequest[] = [
    {
      id: 'arco-demo-1',
      clientId: 'cli-demo-1',
      clientName: 'Clínica Bienestar Integral',
      rightType: 'Acceso',
      description: 'Solicitud de copia de registros de consentimiento de noviembre (Demo).',
      status: 'completada',
      createdAt: '2026-11-15T10:00:00.000Z',
      resolvedAt: '2026-11-15T16:30:00.000Z',
    },
  ];

  return {
    adminPasswordHash: null,
    clientCredentials,
    clients,
    automations,
    proposals,
    connectors: DEFAULT_CONNECTORS.map((c) => ({ ...c })),
    connectorEncryptedSecrets: {},
    executions,
    payments,
    paymentSettings: {
      realPaymentsAuthorizedByAdmin: false,
      wompiConfigured: Boolean(process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET),
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      wompiEnvironment: 'sandbox',
      stripeMode: 'test',
    },
    plans: DEFAULT_PLANS.map((p) => ({ ...p })),
    auditLogs,
    arcoRequests,
    crmCapturedLeads: [],
  };
}

class StoreManager {
  private db: PersistedDatabase;
  private persistEnabled = true;

  constructor() {
    this.db = this.loadFromDisk();
  }

  private loadFromDisk(): PersistedDatabase {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as PersistedDatabase;
        // Ensure any newly added default connectors exist
        const existingKeys = new Set(parsed.connectors.map((c) => c.key));
        for (const def of DEFAULT_CONNECTORS) {
          if (!existingKeys.has(def.key)) {
            parsed.connectors.push({ ...def });
          }
        }
        parsed.paymentSettings = {
          realPaymentsAuthorizedByAdmin: Boolean(parsed.paymentSettings?.realPaymentsAuthorizedByAdmin),
          wompiConfigured: Boolean(process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET),
          stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
          wompiEnvironment: parsed.paymentSettings?.wompiEnvironment || 'sandbox',
          stripeMode: parsed.paymentSettings?.stripeMode || 'test',
        };
        return parsed;
      }
    } catch (err) {
      console.warn('[Store] No se pudo leer base local, iniciando estado base:', err);
    }
    const initial = createInitialDemoState();
    this.saveToDisk(initial);
    return initial;
  }

  private saveToDisk(data: PersistedDatabase = this.db): void {
    if (!this.persistEnabled) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      this.persistEnabled = false;
      console.warn('[Store] Modo memoria activo (sin escritura en disco):', err);
    }
  }

  public getState(): PersistedDatabase {
    return this.db;
  }

  public commit(): void {
    this.saveToDisk(this.db);
  }

  public addAudit(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): AuditLogEntry {
    const full: AuditLogEntry = {
      ...entry,
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.db.auditLogs.unshift(full);
    if (this.db.auditLogs.length > 300) {
      this.db.auditLogs = this.db.auditLogs.slice(0, 300);
    }
    this.commit();
    return full;
  }

  public getConnector(key: ConnectorKey): ConnectorConfig | undefined {
    return this.db.connectors.find((c) => c.key === key);
  }

  public resetDemoData(): void {
    const adminHash = this.db.adminPasswordHash;
    const fresh = createInitialDemoState();
    fresh.adminPasswordHash = adminHash;
    this.db = fresh;
    this.addAudit({
      actorRole: 'admin',
      actorLabel: 'Jair (Admin)',
      action: 'RESTABLECER_DEMO',
      targetType: 'sistema',
      targetId: 'demo',
      detail: 'Se restablecieron los datos de demostración conservando credenciales de administrador.',
    });
  }
}

export const store = new StoreManager();
