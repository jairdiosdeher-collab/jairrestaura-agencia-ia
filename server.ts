import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ALL_CATALOG_TEMPLATES, GENERAL_TEMPLATES, SPECIALIZED_SOLUTIONS } from './server/catalog.ts';
import { designWorkflowLocally, designWorkflowWithGemini, isGeminiConfigured } from './server/ai.ts';
import {
  createSessionToken,
  encryptSecret,
  hashPassword,
  isSafeExternalUrl,
  maskSecret,
  sanitizeText,
  verifyPassword,
  verifySessionToken,
  verifyWebhookSignature,
  type SessionPayload,
} from './server/crypto.ts';
import { runAutomationExecution, validateAutomationRequirements } from './server/engine.ts';
import { store } from './server/store.ts';
import type {
  ArcoRequest,
  Automation,
  ClientRecord,
  ConnectorKey,
  OperationsSummary,
  PaymentTransaction,
  Proposal,
} from './src/types.ts';

dotenv.config();

interface AuthedRequest extends Request {
  user?: SessionPayload;
}

export const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

// Security headers (avoid X-Frame-Options so AI Studio preview iframe works cleanly)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Hydrate external free KV persistence once per serverless cold start when configured
app.use('/api', async (_req, _res, next) => {
  await store.ensureHydrated();
  next();
});

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'Sesión requerida. Inicia sesión para continuar.' });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Tu sesión expiró o es inválida. Vuelve a iniciar sesión.' });
    return;
  }
  req.user = payload;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Acceso restringido al administrador de JairRestaura.' });
      return;
    }
    next();
  });
}

function isEnvAdminPasscodeSet(): boolean {
  return Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
}

// ---------- HEALTH & AUTH ----------

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'JAIRRESTAURA AUTOMATIZA IA',
    aiConfigured: isGeminiConfigured(),
    persistenceMode: store.getPersistenceMode(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/auth/status', (_req, res) => {
  const db = store.getState();
  const envPassSet = isEnvAdminPasscodeSet();
  const claimed = Boolean(db.adminPasswordHash);
  res.json({
    adminConfigured: envPassSet || claimed,
    needsFirstRunClaim: !envPassSet && !claimed,
    envPasscodeActive: envPassSet,
    aiConfigured: isGeminiConfigured(),
    demoClients: db.clients
      .filter((c) => c.isDemo && c.portalAccessEnabled)
      .map((c) => ({ id: c.id, name: c.name, businessName: c.businessName, email: c.email })),
  });
});

app.post('/api/auth/claim-admin', (req, res) => {
  const db = store.getState();
  if (isEnvAdminPasscodeSet() || db.adminPasswordHash) {
    res.status(409).json({
      error: 'La clave de administrador ya fue configurada. Inicia sesión con tu contraseña.',
    });
    return;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 8) {
    res.status(400).json({
      error: 'La contraseña de administrador debe tener al menos 8 caracteres.',
    });
    return;
  }
  db.adminPasswordHash = hashPassword(password);
  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'CONFIGURAR_CLAVE_ADMIN',
    targetType: 'autenticacion',
    targetId: 'admin',
    detail: 'Administrador inicial configurado mediante registro seguro en primer uso.',
  });
  const token = createSessionToken({
    sub: 'admin-jair',
    role: 'admin',
    displayName: 'Jair (Administrador)',
  });
  res.json({
    token,
    role: 'admin',
    displayName: 'Jair (Administrador)',
  });
});

app.post('/api/auth/login-admin', (req, res) => {
  const db = store.getState();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) {
    res.status(400).json({ error: 'Ingresa tu contraseña de administrador.' });
    return;
  }

  let valid = false;
  if (isEnvAdminPasscodeSet()) {
    const expected = process.env.ADMIN_PASSCODE!.trim();
    const a = Buffer.from(password, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  } else if (db.adminPasswordHash) {
    valid = verifyPassword(password, db.adminPasswordHash);
  } else {
    res.status(400).json({ error: 'Aún no se ha configurado una clave de administrador.' });
    return;
  }

  if (!valid) {
    store.addAudit({
      actorRole: 'system',
      actorLabel: 'Control de Acceso',
      action: 'INTENTO_LOGIN_FALLIDO',
      targetType: 'autenticacion',
      targetId: 'admin',
      detail: 'Intento fallido de inicio de sesión como administrador.',
    });
    res.status(401).json({ error: 'Contraseña de administrador incorrecta.' });
    return;
  }

  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'INICIO_SESION_ADMIN',
    targetType: 'autenticacion',
    targetId: 'admin',
    detail: 'Sesión de administrador iniciada.',
  });

  const token = createSessionToken({
    sub: 'admin-jair',
    role: 'admin',
    displayName: 'Jair (Administrador)',
  });
  res.json({
    token,
    role: 'admin',
    displayName: 'Jair (Administrador)',
  });
});

app.post('/api/auth/login-client', (req, res) => {
  const db = store.getState();
  const email = sanitizeText(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    res.status(400).json({ error: 'Correo y clave de acceso son obligatorios.' });
    return;
  }
  const cred = db.clientCredentials.find((c) => c.email.toLowerCase() === email);
  const client = cred ? db.clients.find((c) => c.id === cred.clientId) : undefined;

  if (!cred || !client || !client.portalAccessEnabled || !verifyPassword(password, cred.passwordHash)) {
    res.status(401).json({ error: 'Credenciales inválidas o acceso al portal deshabilitado.' });
    return;
  }

  store.addAudit({
    actorRole: 'client',
    actorLabel: client.businessName,
    action: 'INICIO_SESION_CLIENTE',
    targetType: 'cliente',
    targetId: client.id,
    detail: `Acceso al Panel del Cliente para ${client.businessName}.`,
  });

  const token = createSessionToken({
    sub: client.id,
    role: 'client',
    displayName: `${client.name} · ${client.businessName}`,
    clientId: client.id,
  });

  res.json({
    token,
    role: 'client',
    displayName: `${client.name} · ${client.businessName}`,
    clientId: client.id,
  });
});

app.post('/api/auth/demo-client-preview', requireAdmin, (req, res) => {
  const db = store.getState();
  const clientId = sanitizeText(req.body?.clientId, 80);
  const client = db.clients.find((c) => c.id === clientId);
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }

  const token = createSessionToken({
    sub: client.id,
    role: 'client',
    displayName: `${client.name} · ${client.businessName}`,
    clientId: client.id,
  });

  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'VISTA_PREVIA_PORTAL_CLIENTE',
    targetType: 'cliente',
    targetId: client.id,
    detail: `Sesión aislada de cliente emitida para ${client.businessName}.`,
  });

  res.json({
    token,
    role: 'client',
    displayName: `${client.name} · ${client.businessName}`,
    clientId: client.id,
  });
});

// ---------- PUBLIC PROPOSALS & SIGNED WEBHOOKS ----------

app.get('/api/public/proposals/:shareToken', (req, res) => {
  const db = store.getState();
  const token = sanitizeText(req.params.shareToken, 120);
  const proposal = db.proposals.find((p) => p.shareToken === token);
  if (!proposal) {
    res.status(404).json({ error: 'Propuesta comercial no encontrada o enlace expirado.' });
    return;
  }
  res.json({
    proposal: {
      id: proposal.id,
      clientName: proposal.clientName,
      businessName: proposal.businessName,
      shareToken: proposal.shareToken,
      title: proposal.title,
      problemStatement: proposal.problemStatement,
      proposedSolution: proposal.proposedSolution,
      howItWorks: proposal.howItWorks,
      benefits: proposal.benefits,
      installationPriceCop: proposal.installationPriceCop,
      monthlyMaintenanceCop: proposal.monthlyMaintenanceCop,
      currency: proposal.currency,
      estimatedDays: proposal.estimatedDays,
      terms: proposal.terms,
      validUntil: proposal.validUntil,
      status: proposal.status,
      planName: proposal.planName,
      createdAt: proposal.createdAt,
      isDemo: proposal.isDemo,
    },
  });
});

app.post('/api/public/proposals/:shareToken/respond', (req, res) => {
  const db = store.getState();
  const token = sanitizeText(req.params.shareToken, 120);
  const proposal = db.proposals.find((p) => p.shareToken === token);
  if (!proposal) {
    res.status(404).json({ error: 'Propuesta no encontrada.' });
    return;
  }
  const decision = req.body?.decision === 'aceptada' ? 'aceptada' : req.body?.decision === 'rechazada' ? 'rechazada' : null;
  if (!decision) {
    res.status(400).json({ error: 'Decisión inválida.' });
    return;
  }
  proposal.status = decision;
  proposal.updatedAt = new Date().toISOString();

  const client = db.clients.find((c) => c.id === proposal.clientId);
  if (client && decision === 'aceptada' && client.commercialStatus === 'Propuesta enviada') {
    client.commercialStatus = 'Activo';
  }

  store.addAudit({
    actorRole: 'client',
    actorLabel: proposal.businessName,
    action: `PROPUESTA_${decision.toUpperCase()}`,
    targetType: 'propuesta',
    targetId: proposal.id,
    detail: `La propuesta "${proposal.title}" fue marcada como ${decision} desde el enlace compartido.`,
  });
  store.commit();
  res.json({ ok: true, status: proposal.status });
});

// Public Contact Forms connected to active automations
app.get('/api/public/forms/:slug', (req, res) => {
  const db = store.getState();
  const slug = sanitizeText(req.params.slug, 100);
  const automation = db.automations.find((a) => a.webhookSlug === slug);
  if (!automation) {
    res.status(404).json({ error: 'Formulario de contacto no encontrado.' });
    return;
  }
  const client = db.clients.find((c) => c.id === automation.clientId);
  const triggerStep = automation.steps.find((s) => s.type === 'trigger');
  res.json({
    form: {
      slug: automation.webhookSlug,
      title: automation.name,
      description: automation.description,
      businessName: client?.businessName || 'JairRestaura Automatiza IA',
      sector: automation.sector,
      active: automation.status === 'active',
      requiredFields: triggerStep?.requiredFields || ['nombre', 'telefono'],
      isDemo: automation.isDemo,
    },
  });
});

app.post('/api/public/forms/:slug', async (req, res) => {
  const db = store.getState();
  const slug = sanitizeText(req.params.slug, 100);
  const automation = db.automations.find((a) => a.webhookSlug === slug);
  if (!automation) {
    res.status(404).json({ error: 'Formulario de contacto no encontrado.' });
    return;
  }

  const habeasDataConsent = Boolean(req.body?.habeasDataConsent);
  if (!habeasDataConsent) {
    res.status(400).json({
      error: 'Debes autorizar el tratamiento de datos personales (Ley 1581 de 2012) para enviar el formulario.',
    });
    return;
  }

  const nombre = sanitizeText(req.body?.nombre, 120);
  const correo = sanitizeText(req.body?.correo, 120);
  const telefono = sanitizeText(req.body?.telefono, 40);
  const mensaje = sanitizeText(req.body?.mensaje, 600);
  const peticion = sanitizeText(req.body?.peticion, 600);

  const payload: Record<string, unknown> = {
    ...(nombre ? { nombre } : {}),
    ...(correo ? { correo } : {}),
    ...(telefono ? { telefono } : {}),
    ...(mensaje ? { mensaje } : {}),
    ...(peticion ? { peticion } : {}),
    habeasDataConsent: true,
  };

  const execution = await runAutomationExecution(
    automation,
    payload,
    'live',
    `Formulario de Contacto (/api/public/forms/${slug})`,
  );

  if (execution.status !== 'success') {
    res.status(422).json({
      error: execution.errorMessage || 'No se pudo procesar el formulario en este momento.',
      execution,
    });
    return;
  }

  res.status(201).json({
    ok: true,
    message: 'Tu solicitud fue recibida y procesada correctamente.',
    executionId: execution.id,
  });
});

// Real incoming webhook trigger endpoint for active automations
app.post('/api/hooks/:slug', async (req, res) => {
  const db = store.getState();
  const slug = sanitizeText(req.params.slug, 100);
  const automation = db.automations.find((a) => a.webhookSlug === slug);
  if (!automation) {
    res.status(404).json({ error: 'Flujo de automatización no encontrado.' });
    return;
  }

  // Optional HMAC verification if secret is configured in webhook connector
  const webhookSecrets = db.connectorEncryptedSecrets['webhook'];
  const sigHeader = req.headers['x-jairrestaura-signature'];
  if (webhookSecrets?.signingSecret && typeof sigHeader === 'string') {
    const rawBody = JSON.stringify(req.body ?? {});
    // Verify signature strictly when configured
    const { decryptSecret } = await import('./server/crypto.ts');
    const plainSecret = decryptSecret(webhookSecrets.signingSecret);
    if (!verifyWebhookSignature(plainSecret, rawBody, sigHeader)) {
      res.status(401).json({ error: 'Firma HMAC de webhook inválida.' });
      return;
    }
  }

  const payload = typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const execution = await runAutomationExecution(
    automation,
    payload,
    'live',
    `Webhook HTTP (/api/hooks/${slug})`,
  );

  res.status(execution.status === 'success' ? 200 : 422).json({ execution });
});

// Real payment provider webhook confirmation gate (Wompi / Stripe)
app.post('/api/webhooks/payments/:provider', (req, res) => {
  const provider = req.params.provider;
  const db = store.getState();

  if (provider !== 'wompi' && provider !== 'stripe') {
    res.status(400).json({ error: 'Proveedor no soportado.' });
    return;
  }

  if (!db.paymentSettings.realPaymentsAuthorizedByAdmin) {
    res.status(403).json({ error: 'Cobros reales no autorizados por el administrador.' });
    return;
  }

  // Verify signature before accepting payment confirmation
  if (provider === 'wompi') {
    const secret = process.env.WOMPI_INTEGRITY_SECRET?.trim();
    const sig = req.headers['x-event-checksum'];
    if (!secret || typeof sig !== 'string') {
      res.status(401).json({ error: 'Falta firma verificable de Wompi.' });
      return;
    }
    const raw = JSON.stringify(req.body ?? {});
    if (!verifyWebhookSignature(secret, raw, sig)) {
      res.status(401).json({ error: 'Firma de Wompi inválida.' });
      return;
    }
  } else if (provider === 'stripe') {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    const sig = req.headers['stripe-signature'];
    if (!secret || typeof sig !== 'string') {
      res.status(401).json({ error: 'Falta firma verificable de Stripe.' });
      return;
    }
    const raw = JSON.stringify(req.body ?? {});
    if (!verifyWebhookSignature(secret, raw, sig)) {
      res.status(401).json({ error: 'Firma de Stripe inválida.' });
      return;
    }
  }

  const paymentId = sanitizeText(req.body?.paymentId, 80);
  const providerRef = sanitizeText(req.body?.reference, 120);
  const tx = db.payments.find((p) => p.id === paymentId);
  if (!tx) {
    res.status(404).json({ error: 'Transacción no encontrada.' });
    return;
  }

  tx.status = 'verificado';
  tx.providerVerified = true;
  tx.providerReference = providerRef || tx.providerReference;
  tx.verifiedAt = new Date().toISOString();

  store.addAudit({
    actorRole: 'webhook',
    actorLabel: provider.toUpperCase(),
    action: 'PAGO_VERIFICADO_PROVEEDOR',
    targetType: 'pago',
    targetId: tx.id,
    detail: `Confirmación verificada por ${provider} para ${tx.clientName}.`,
  });
  store.commit();
  res.json({ ok: true, transaction: tx });
});

// ---------- ADMIN: OVERVIEW & CATALOG ----------

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const db = store.getState();

  const maintenanceAlerts: OperationsSummary['maintenanceAlerts'] = [];

  const pendingConnectors = db.connectors.filter((c) => c.status !== 'verified');
  if (pendingConnectors.length > 0) {
    maintenanceAlerts.push({
      id: 'alert-connectors',
      severity: 'warning',
      title: `${pendingConnectors.length} integraciones pendientes de verificación`,
      detail: `Conecta y verifica ${pendingConnectors.slice(0, 3).map((c) => c.name).join(', ')} para activar flujos externos.`,
      targetView: 'motor',
    });
  }

  const errorExecs = db.executions.filter((e) => e.status === 'error');
  if (errorExecs.length > 0) {
    maintenanceAlerts.push({
      id: 'alert-errors',
      severity: 'error',
      title: `${errorExecs.length} error(es) registrado(s) en ejecuciones`,
      detail: `Último evento: ${errorExecs[0]!.automationName}`,
      targetView: 'motor',
    });
  }

  const openSupport = db.clients.flatMap((c) =>
    c.supportHistory.filter((s) => s.status !== 'resuelto').map((s) => ({ client: c.businessName, s })),
  );
  if (openSupport.length > 0) {
    maintenanceAlerts.push({
      id: 'alert-support',
      severity: 'warning',
      title: `${openSupport.length} solicitud(es) de soporte o cambio abiertas`,
      detail: `${openSupport[0]!.client}: ${openSupport[0]!.s.subject}`,
      targetView: 'crm',
    });
  }

  const realClientsList = db.clients.filter((c) => !c.isDemo);
  const demoClientsList = db.clients.filter((c) => Boolean(c.isDemo));
  const verifiedPayments = db.payments.filter((p) => p.status === 'verificado' && p.providerVerified);
  const realRevenueCop = verifiedPayments
    .filter((p) => !p.isDemo)
    .reduce((acc, p) => acc + (p.currency === 'USD' ? p.amount * 4000 : p.amount), 0);
  const demoRevenueCop = verifiedPayments
    .filter((p) => Boolean(p.isDemo))
    .reduce((acc, p) => acc + (p.currency === 'USD' ? p.amount * 4000 : p.amount), 0);

  const summary: OperationsSummary = {
    totalClients: db.clients.length,
    realClients: realClientsList.length,
    demoClients: demoClientsList.length,
    totalAutomations: db.automations.length,
    realAutomations: db.automations.filter((a) => !a.isDemo).length,
    activeAutomations: db.automations.filter((a) => a.status === 'active').length,
    totalExecutions: db.executions.length,
    realExecutions: db.executions.filter((e) => !e.isDemo).length,
    detectedErrors: db.executions.filter((e) => e.status === 'error').length,
    proposalsSent: db.proposals.filter((p) => p.status === 'enviada' || p.status === 'aceptada').length,
    proposalsAccepted: db.proposals.filter((p) => p.status === 'aceptada').length,
    verifiedRevenueCop: realRevenueCop,
    realRevenueCop,
    demoRevenueCop,
    capturedLeadsCount: db.crmCapturedLeads.length,
    pendingServicesCount:
      db.clients.filter((c) => c.commercialStatus === 'Propuesta enviada' || c.commercialStatus === 'Prospecto')
        .length + openSupport.length,
    persistenceMode: store.getPersistenceMode(),
    maintenanceAlerts,
  };

  res.json({
    summary,
    recentExecutions: db.executions.slice(0, 8),
    recentAudit: db.auditLogs.slice(0, 6),
    aiConfigured: isGeminiConfigured(),
  });
});

app.get('/api/admin/catalog', requireAdmin, (_req, res) => {
  const db = store.getState();
  res.json({
    specializedSolutions: SPECIALIZED_SOLUTIONS,
    generalTemplates: GENERAL_TEMPLATES,
    plans: db.plans,
  });
});

app.put('/api/admin/plans/:id', requireAdmin, (req, res) => {
  const db = store.getState();
  const plan = db.plans.find((p) => p.id === req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'Plan comercial no encontrado.' });
    return;
  }
  if (typeof req.body?.audience === 'string') plan.audience = sanitizeText(req.body.audience, 140);
  if (typeof req.body?.installationPriceCop === 'number' && req.body.installationPriceCop >= 0) {
    plan.installationPriceCop = Math.round(req.body.installationPriceCop);
  }
  if (typeof req.body?.monthlyPriceCop === 'number' && req.body.monthlyPriceCop >= 0) {
    plan.monthlyPriceCop = Math.round(req.body.monthlyPriceCop);
  }
  if (typeof req.body?.maxAutomations === 'number' && req.body.maxAutomations > 0) {
    plan.maxAutomations = Math.round(req.body.maxAutomations);
  }
  if (typeof req.body?.maxMonthlyExecutions === 'number' && req.body.maxMonthlyExecutions > 0) {
    plan.maxMonthlyExecutions = Math.round(req.body.maxMonthlyExecutions);
  }
  if (typeof req.body?.includedSupport === 'string') {
    plan.includedSupport = sanitizeText(req.body.includedSupport, 160);
  }
  if (Array.isArray(req.body?.features)) {
    plan.features = req.body.features
      .map((f: unknown) => sanitizeText(f, 140))
      .filter(Boolean)
      .slice(0, 8);
  }

  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'ACTUALIZAR_PLAN_COMERCIAL',
    targetType: 'plan',
    targetId: plan.id,
    detail: `Tarifas actualizadas para el plan ${plan.name}.`,
  });
  store.commit();
  res.json({ plan });
});

// ---------- ADMIN: JAIR IA AUTOMATIZA ----------

app.post('/api/ai/design-workflow', requireAdmin, async (req, res) => {
  const instruction = sanitizeText(req.body?.instruction, 1500);
  const mode = req.body?.mode === 'local' ? 'local' : 'gemini';

  if (instruction.length < 10) {
    res.status(400).json({
      error: 'Describe la automatización con al menos 10 caracteres para que JAIR IA AUTOMATIZA pueda diseñarla.',
    });
    return;
  }

  if (mode === 'local') {
    const designed = designWorkflowLocally(instruction);
    const db = store.getState();
    const enrichedSteps = designed.steps.map((s) => {
      const conn = db.connectors.find((c) => c.key === s.connectorKey);
      return {
        ...s,
        connectorStatus: conn?.status || 'pending_config',
        connectorName: conn?.name || s.connectorKey,
      };
    });
    res.json({ workflow: { ...designed, steps: enrichedSteps } });
    return;
  }

  try {
    const designed = await designWorkflowWithGemini(instruction);
    const db = store.getState();
    const enrichedSteps = designed.steps.map((s) => {
      const conn = db.connectors.find((c) => c.key === s.connectorKey);
      return {
        ...s,
        connectorStatus: conn?.status || 'pending_config',
        connectorName: conn?.name || s.connectorKey,
      };
    });

    store.addAudit({
      actorRole: 'admin',
      actorLabel: 'JAIR IA AUTOMATIZA',
      action: 'DISEÑAR_FLUJO_IA',
      targetType: 'ia',
      targetId: designed.name,
      detail: `Flujo diseñado con ${designed.modelUsed} (${designed.steps.length} pasos).`,
    });

    res.json({ workflow: { ...designed, steps: enrichedSteps } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al consultar el servicio Gemini.';
    const isMissingKey = message.includes('GEMINI_API_KEY_NOT_CONFIGURED');
    res.status(isMissingKey ? 503 : 502).json({
      error: isMissingKey
        ? 'La clave GEMINI_API_KEY aún no está configurada en el servidor (Settings > Secrets). Puedes configurarla o usar explícitamente el Analizador Estructural Local.'
        : `No se pudo completar el diseño con Gemini API: ${message}`,
      aiConfigured: isGeminiConfigured(),
      canUseLocalMode: true,
    });
  }
});

// ---------- ADMIN: AUTOMATIONS & ENGINE ----------

app.get('/api/admin/automations', requireAdmin, (_req, res) => {
  const db = store.getState();
  const list = db.automations.map((a) => ({
    ...a,
    validation: validateAutomationRequirements(a, db.connectors),
  }));
  res.json({ automations: list });
});

app.post('/api/admin/automations', requireAdmin, (req: AuthedRequest, res) => {
  const db = store.getState();
  const clientId = sanitizeText(req.body?.clientId, 80);
  const client = db.clients.find((c) => c.id === clientId);
  if (!client) {
    res.status(400).json({ error: 'Selecciona un cliente válido del CRM.' });
    return;
  }

  const name = sanitizeText(req.body?.name, 140);
  const description = sanitizeText(req.body?.description, 400);
  const sector = sanitizeText(req.body?.sector, 80) || client.sector;
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
  const explanation = req.body?.explanation;

  if (!name || steps.length === 0) {
    res.status(400).json({ error: 'La automatización requiere un nombre y al menos un paso.' });
    return;
  }

  const slugBase = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);

  const now = new Date().toISOString();
  const actor = req.user?.displayName || 'Jair (Admin)';
  const newAuto: Automation = {
    id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    clientId,
    name,
    description: description || name,
    sector,
    templateId: sanitizeText(req.body?.templateId, 80) || undefined,
    status: 'draft', // Always starts in draft until validated & activated
    version: 1,
    goal: sanitizeText(req.body?.goal, 280) || undefined,
    inputs: Array.isArray(req.body?.inputs)
      ? req.body.inputs.map((x: unknown) => sanitizeText(x, 80)).filter(Boolean)
      : undefined,
    outputs: Array.isArray(req.body?.outputs)
      ? req.body.outputs.map((x: unknown) => sanitizeText(x, 80)).filter(Boolean)
      : undefined,
    missingInfo: Array.isArray(req.body?.missingInfo)
      ? req.body.missingInfo.map((x: unknown) => sanitizeText(x, 180)).filter(Boolean)
      : undefined,
    lastEditedBy: actor,
    clientCanToggle: Boolean(req.body?.clientCanToggle),
    webhookSlug: `${slugBase || 'flujo'}-${Math.random().toString(36).slice(2, 6)}`,
    steps: steps.map((s: Record<string, unknown>, idx: number) => ({
      id: sanitizeText(s.id, 60) || `step-${Date.now()}-${idx + 1}`,
      order: idx + 1,
      type: (['trigger', 'ai_interpret', 'condition', 'action', 'crm_record', 'notification'].includes(
        String(s.type),
      )
        ? s.type
        : 'action') as Automation['steps'][number]['type'],
      title: sanitizeText(s.title, 120) || `Paso ${idx + 1}`,
      description: sanitizeText(s.description, 240),
      connectorKey: (sanitizeText(s.connectorKey, 40) || 'internal_crm') as ConnectorKey,
      configSummary: sanitizeText(s.configSummary, 160) || 'Configuración estándar',
      conditionRule: sanitizeText(s.conditionRule, 160) || undefined,
      dependsOnOrder:
        typeof s.dependsOnOrder === 'number' && s.dependsOnOrder >= 1 && s.dependsOnOrder <= idx
          ? s.dependsOnOrder
          : idx === 0
            ? undefined
            : idx,
      requiredFields: Array.isArray(s.requiredFields)
        ? s.requiredFields.map((f) => sanitizeText(f, 40)).filter(Boolean)
        : undefined,
    })),
    explanation: explanation || {
      whatItDoes: description || name,
      whenItRuns: 'Al dispararse el evento inicial.',
      dataUsed: ['Datos de contacto'],
      requiredApps: ['CRM Interno JairRestaura'],
      requiredPermissions: ['Ejecución autorizada'],
      externalCosts: 'Según conectores externos configurados.',
    },
    executionCount: 0,
    errorCount: 0,
    createdAt: now,
    updatedAt: now,
    isDemo: false,
  };

  db.automations.unshift(newAuto);
  store.addAudit({
    actorRole: 'admin',
    actorLabel: actor,
    action: 'CREAR_AUTOMATIZACION',
    targetType: 'automatizacion',
    targetId: newAuto.id,
    clientId: client.id,
    clientName: client.businessName,
    version: 1,
    detail: `Automatización "${newAuto.name}" (v1) creada para ${client.businessName} en estado Borrador.`,
  });
  store.commit();

  res.status(201).json({
    automation: {
      ...newAuto,
      validation: validateAutomationRequirements(newAuto, db.connectors),
    },
  });
});

app.post('/api/admin/automations/:id/test', requireAdmin, async (req: AuthedRequest, res) => {
  const db = store.getState();
  const auto = db.automations.find((a) => a.id === req.params.id);
  if (!auto) {
    res.status(404).json({ error: 'Automatización no encontrada.' });
    return;
  }
  const payload =
    typeof req.body?.payload === 'object' && req.body.payload !== null
      ? (req.body.payload as Record<string, unknown>)
      : { nombre: 'Prueba de Validación', telefono: '+57 300 000 0000' };

  const actor = req.user?.displayName || 'Jair (Admin)';
  const execution = await runAutomationExecution(
    auto,
    payload,
    'test',
    'Laboratorio de Pruebas (Simulación)',
    actor,
  );
  res.json({ execution, validation: validateAutomationRequirements(auto, db.connectors) });
});

app.post('/api/admin/automations/:id/toggle', requireAdmin, (req: AuthedRequest, res) => {
  const db = store.getState();
  const auto = db.automations.find((a) => a.id === req.params.id);
  if (!auto) {
    res.status(404).json({ error: 'Automatización no encontrada.' });
    return;
  }
  const desired = req.body?.status === 'active' ? 'active' : 'paused';
  const validation = validateAutomationRequirements(auto, db.connectors);

  if (desired === 'active') {
    if (!auto.steps.length || auto.steps[0]?.type !== 'trigger') {
      res.status(409).json({
        error: 'El flujo debe comenzar con un paso de tipo Disparador inicial antes de activarse.',
        validation,
      });
      return;
    }
    if (!validation.readyToActivate) {
      res.status(409).json({
        error: `No se puede activar todavía. Faltan integraciones verificadas: ${validation.missingConnectors
          .map((m) => m.name)
          .join(', ')}.`,
        validation,
      });
      return;
    }
    if (req.body?.adminConfirmed === false) {
      res.status(400).json({
        error: 'Se requiere confirmación explícita del administrador para activar el flujo.',
      });
      return;
    }
  }

  const client = db.clients.find((c) => c.id === auto.clientId);
  auto.status = desired;
  auto.updatedAt = new Date().toISOString();

  store.addAudit({
    actorRole: 'admin',
    actorLabel: req.user?.displayName || 'Jair (Admin)',
    action: desired === 'active' ? 'ACTIVAR_AUTOMATIZACION' : 'PAUSAR_AUTOMATIZACION',
    targetType: 'automatizacion',
    targetId: auto.id,
    clientId: auto.clientId,
    clientName: client?.businessName || auto.clientId,
    version: auto.version || 1,
    detail: `Estado cambiado a ${desired === 'active' ? 'Activa (confirmada)' : 'Pausada'} en versión v${auto.version || 1}.`,
  });
  store.commit();
  res.json({ automation: { ...auto, validation } });
});

app.post('/api/admin/automations/:id/emergency-stop', requireAdmin, (req: AuthedRequest, res) => {
  const db = store.getState();
  const auto = db.automations.find((a) => a.id === req.params.id);
  if (!auto) {
    res.status(404).json({ error: 'Automatización no encontrada.' });
    return;
  }
  const client = db.clients.find((c) => c.id === auto.clientId);
  auto.status = 'paused';
  auto.clientCanToggle = false;
  auto.updatedAt = new Date().toISOString();

  store.addAudit({
    actorRole: 'admin',
    actorLabel: req.user?.displayName || 'Jair (Admin)',
    action: 'DESACTIVACION_EMERGENCIA',
    targetType: 'automatizacion',
    targetId: auto.id,
    clientId: auto.clientId,
    clientName: client?.businessName || auto.clientId,
    version: auto.version || 1,
    detail: `Desactivación de emergencia aplicada a "${auto.name}". Se pausó la ejecución y se bloqueó reactivación por cliente.`,
  });
  store.commit();
  res.json({
    automation: { ...auto, validation: validateAutomationRequirements(auto, db.connectors) },
  });
});

app.patch('/api/admin/automations/:id', requireAdmin, (req: AuthedRequest, res) => {
  const db = store.getState();
  const auto = db.automations.find((a) => a.id === req.params.id);
  if (!auto) {
    res.status(404).json({ error: 'Automatización no encontrada.' });
    return;
  }
  const client = db.clients.find((c) => c.id === auto.clientId);
  const actor = req.user?.displayName || 'Jair (Admin)';
  let structureEdited = false;

  if (typeof req.body?.clientCanToggle === 'boolean') {
    auto.clientCanToggle = req.body.clientCanToggle;
  }
  if (typeof req.body?.name === 'string' && req.body.name.trim()) {
    auto.name = sanitizeText(req.body.name, 140);
    structureEdited = true;
  }
  if (typeof req.body?.description === 'string') {
    auto.description = sanitizeText(req.body.description, 400);
    structureEdited = true;
  }
  if (typeof req.body?.sector === 'string' && req.body.sector.trim()) {
    auto.sector = sanitizeText(req.body.sector, 80);
  }
  if (typeof req.body?.goal === 'string') {
    auto.goal = sanitizeText(req.body.goal, 280);
  }
  if (Array.isArray(req.body?.inputs)) {
    auto.inputs = req.body.inputs.map((x: unknown) => sanitizeText(x, 80)).filter(Boolean);
  }
  if (Array.isArray(req.body?.outputs)) {
    auto.outputs = req.body.outputs.map((x: unknown) => sanitizeText(x, 80)).filter(Boolean);
  }
  if (Array.isArray(req.body?.missingInfo)) {
    auto.missingInfo = req.body.missingInfo.map((x: unknown) => sanitizeText(x, 180)).filter(Boolean);
  }
  if (req.body?.explanation && typeof req.body.explanation === 'object') {
    auto.explanation = req.body.explanation;
  }
  if (Array.isArray(req.body?.steps) && req.body.steps.length > 0) {
    auto.steps = req.body.steps.map((s: Record<string, unknown>, idx: number) => ({
      id: sanitizeText(s.id, 60) || `step-${Date.now()}-${idx + 1}`,
      order: idx + 1,
      type: (['trigger', 'ai_interpret', 'condition', 'action', 'crm_record', 'notification'].includes(
        String(s.type),
      )
        ? s.type
        : 'action') as Automation['steps'][number]['type'],
      title: sanitizeText(s.title, 120) || `Paso ${idx + 1}`,
      description: sanitizeText(s.description, 240),
      connectorKey: (sanitizeText(s.connectorKey, 40) || 'internal_crm') as ConnectorKey,
      configSummary: sanitizeText(s.configSummary, 160) || 'Configuración estándar',
      conditionRule: sanitizeText(s.conditionRule, 160) || undefined,
      dependsOnOrder:
        typeof s.dependsOnOrder === 'number' && s.dependsOnOrder >= 1 && s.dependsOnOrder <= idx
          ? s.dependsOnOrder
          : idx === 0
            ? undefined
            : idx,
      requiredFields: Array.isArray(s.requiredFields)
        ? s.requiredFields.map((f) => sanitizeText(f, 40)).filter(Boolean)
        : undefined,
    }));
    auto.version = (auto.version || 1) + 1;
    // Editing flow structure pauses live flow until re-validated & confirmed
    if (auto.status === 'active') {
      auto.status = 'paused';
    }
    structureEdited = true;
  }

  auto.lastEditedBy = actor;
  auto.updatedAt = new Date().toISOString();

  if (structureEdited) {
    store.addAudit({
      actorRole: 'admin',
      actorLabel: actor,
      action: 'EDITAR_FLUJO_AUTOMATIZACION',
      targetType: 'automatizacion',
      targetId: auto.id,
      clientId: auto.clientId,
      clientName: client?.businessName || auto.clientId,
      version: auto.version || 1,
      detail: `Flujo "${auto.name}" actualizado a versión v${auto.version || 1}.`,
    });
  }

  store.commit();
  res.json({
    automation: { ...auto, validation: validateAutomationRequirements(auto, db.connectors) },
  });
});

// ---------- ADMIN: CRM CLIENTS ----------

app.get('/api/admin/clients', requireAdmin, (_req, res) => {
  const db = store.getState();
  res.json({ clients: db.clients });
});

app.post('/api/admin/clients', requireAdmin, (req, res) => {
  const db = store.getState();
  const name = sanitizeText(req.body?.name, 120);
  const businessName = sanitizeText(req.body?.businessName, 140);
  const email = sanitizeText(req.body?.email, 120).toLowerCase();
  const phone = sanitizeText(req.body?.phone, 40);
  const sector = sanitizeText(req.body?.sector, 80) || 'Comercio y Pymes';
  const city = sanitizeText(req.body?.city, 80) || 'Colombia';
  const habeasDataConsent = Boolean(req.body?.habeasDataConsent);

  if (!name || !businessName || !email) {
    res.status(400).json({ error: 'Nombre, negocio/institución y correo son obligatorios.' });
    return;
  }
  if (!habeasDataConsent) {
    res.status(400).json({
      error: 'Según la Ley 1581 de 2012, debes confirmar la autorización de tratamiento de datos para registrar al cliente.',
    });
    return;
  }

  const now = new Date().toISOString();
  const client: ClientRecord = {
    id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    businessName,
    sector,
    email,
    phone: phone || 'Sin teléfono',
    city,
    commercialStatus: 'Prospecto',
    contractedServices: Array.isArray(req.body?.contractedServices)
      ? req.body.contractedServices.map((s: unknown) => sanitizeText(s, 80)).filter(Boolean)
      : [],
    monthlyMaintenanceCop: Math.max(0, Number(req.body?.monthlyMaintenanceCop) || 0),
    habeasDataConsent: true,
    consentDate: now,
    privacyNoticeVersion: 'v1.2-Ley1581',
    portalAccessEnabled: Boolean(req.body?.portalAccessEnabled ?? true),
    notes: sanitizeText(req.body?.notes, 500),
    supportHistory: [],
    createdAt: now,
    isDemo: false,
  };

  db.clients.unshift(client);
  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'REGISTRAR_CLIENTE_CRM',
    targetType: 'cliente',
    targetId: client.id,
    detail: `Cliente registrado: ${client.businessName} (consentimiento Ley 1581 verificado).`,
  });
  store.commit();
  res.status(201).json({ client });
});

app.patch('/api/admin/clients/:id', requireAdmin, (req, res) => {
  const db = store.getState();
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }
  const allowedStatuses = ['Prospecto', 'Propuesta enviada', 'Activo', 'Mantenimiento', 'Pausado'];
  if (typeof req.body?.commercialStatus === 'string' && allowedStatuses.includes(req.body.commercialStatus)) {
    client.commercialStatus = req.body.commercialStatus as ClientRecord['commercialStatus'];
  }
  if (typeof req.body?.notes === 'string') client.notes = sanitizeText(req.body.notes, 800);
  if (typeof req.body?.monthlyMaintenanceCop === 'number' && req.body.monthlyMaintenanceCop >= 0) {
    client.monthlyMaintenanceCop = Math.round(req.body.monthlyMaintenanceCop);
  }
  if (typeof req.body?.portalAccessEnabled === 'boolean') {
    client.portalAccessEnabled = req.body.portalAccessEnabled;
  }
  if (Array.isArray(req.body?.contractedServices)) {
    client.contractedServices = req.body.contractedServices
      .map((s: unknown) => sanitizeText(s, 90))
      .filter(Boolean);
  }
  store.commit();
  res.json({ client });
});

app.post('/api/admin/clients/:id/support', requireAdmin, (req, res) => {
  const db = store.getState();
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }
  const subject = sanitizeText(req.body?.subject, 140);
  const message = sanitizeText(req.body?.message, 600);
  if (!subject || !message) {
    res.status(400).json({ error: 'Asunto y detalle son obligatorios.' });
    return;
  }
  client.supportHistory.unshift({
    id: `sup-${Date.now()}`,
    type: 'soporte',
    subject,
    message,
    status: req.body?.status === 'resuelto' ? 'resuelto' : 'abierto',
    createdAt: new Date().toISOString(),
    createdBy: 'admin',
  });
  store.commit();
  res.status(201).json({ client });
});

app.patch('/api/admin/clients/:id/support/:supportId', requireAdmin, (req, res) => {
  const db = store.getState();
  const client = db.clients.find((c) => c.id === req.params.id);
  const entry = client?.supportHistory.find((s) => s.id === req.params.supportId);
  if (!client || !entry) {
    res.status(404).json({ error: 'Registro de soporte no encontrado.' });
    return;
  }
  if (req.body?.status === 'abierto' || req.body?.status === 'en_revision' || req.body?.status === 'resuelto') {
    entry.status = req.body.status;
  }
  store.commit();
  res.json({ client });
});

app.post('/api/admin/clients/:id/portal-credentials', requireAdmin, (req, res) => {
  const db = store.getState();
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 8) {
    res.status(400).json({ error: 'La clave de acceso del cliente debe tener mínimo 8 caracteres.' });
    return;
  }
  const existing = db.clientCredentials.find((c) => c.clientId === client.id);
  const hash = hashPassword(password);
  const now = new Date().toISOString();
  if (existing) {
    existing.email = client.email;
    existing.passwordHash = hash;
    existing.updatedAt = now;
  } else {
    db.clientCredentials.push({
      clientId: client.id,
      email: client.email,
      passwordHash: hash,
      updatedAt: now,
    });
  }
  client.portalAccessEnabled = true;
  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'ASIGNAR_CREDENCIAL_CLIENTE',
    targetType: 'cliente',
    targetId: client.id,
    detail: `Acceso independiente habilitado para ${client.businessName}.`,
  });
  store.commit();
  res.json({ ok: true, email: client.email });
});

// ---------- ADMIN: PROPOSALS ----------

app.get('/api/admin/proposals', requireAdmin, (_req, res) => {
  const db = store.getState();
  res.json({ proposals: db.proposals });
});

app.post('/api/admin/proposals', requireAdmin, (req, res) => {
  const db = store.getState();
  const clientId = sanitizeText(req.body?.clientId, 80);
  const client = db.clients.find((c) => c.id === clientId);
  if (!client) {
    res.status(400).json({ error: 'Selecciona un cliente del CRM.' });
    return;
  }

  const title = sanitizeText(req.body?.title, 160);
  const problemStatement = sanitizeText(req.body?.problemStatement, 1000);
  const proposedSolution = sanitizeText(req.body?.proposedSolution, 1000);
  const howItWorks = sanitizeText(req.body?.howItWorks, 1200);
  if (!title || !problemStatement || !proposedSolution) {
    res.status(400).json({ error: 'Título, problema y solución son obligatorios.' });
    return;
  }

  const now = new Date().toISOString();
  const proposal: Proposal = {
    id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    clientId: client.id,
    clientName: client.name,
    businessName: client.businessName,
    shareToken: `prop-${crypto.randomBytes(6).toString('hex')}`,
    title,
    problemStatement,
    proposedSolution,
    howItWorks: howItWorks || 'Flujo automatizado conectado al motor verificable de JairRestaura.',
    benefits: Array.isArray(req.body?.benefits)
      ? req.body.benefits.map((b: unknown) => sanitizeText(b, 200)).filter(Boolean)
      : ['Reducción de tareas manuales', 'Registro verificable de ejecuciones'],
    installationPriceCop: Math.max(0, Number(req.body?.installationPriceCop) || 0),
    monthlyMaintenanceCop: Math.max(0, Number(req.body?.monthlyMaintenanceCop) || 0),
    currency: req.body?.currency === 'USD' ? 'USD' : 'COP',
    estimatedDays: Math.max(1, Number(req.body?.estimatedDays) || 5),
    terms:
      sanitizeText(req.body?.terms, 1000) ||
      '50% al aprobar la propuesta y 50% al validar conexiones y pruebas. Mantenimiento mensual renovable.',
    validUntil: sanitizeText(req.body?.validUntil, 20) || '2026-12-31',
    status: req.body?.status === 'enviada' ? 'enviada' : 'borrador',
    planName: sanitizeText(req.body?.planName, 40) || undefined,
    createdAt: now,
    updatedAt: now,
    isDemo: false,
  };

  db.proposals.unshift(proposal);
  if (proposal.status === 'enviada' && client.commercialStatus === 'Prospecto') {
    client.commercialStatus = 'Propuesta enviada';
  }
  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'CREAR_PROPUESTA',
    targetType: 'propuesta',
    targetId: proposal.id,
    detail: `Propuesta "${proposal.title}" creada para ${client.businessName}.`,
  });
  store.commit();
  res.status(201).json({ proposal });
});

app.patch('/api/admin/proposals/:id', requireAdmin, (req, res) => {
  const db = store.getState();
  const prop = db.proposals.find((p) => p.id === req.params.id);
  if (!prop) {
    res.status(404).json({ error: 'Propuesta no encontrada.' });
    return;
  }
  if (typeof req.body?.title === 'string') prop.title = sanitizeText(req.body.title, 160);
  if (typeof req.body?.problemStatement === 'string')
    prop.problemStatement = sanitizeText(req.body.problemStatement, 1000);
  if (typeof req.body?.proposedSolution === 'string')
    prop.proposedSolution = sanitizeText(req.body.proposedSolution, 1000);
  if (typeof req.body?.howItWorks === 'string') prop.howItWorks = sanitizeText(req.body.howItWorks, 1200);
  if (Array.isArray(req.body?.benefits)) {
    prop.benefits = req.body.benefits.map((b: unknown) => sanitizeText(b, 200)).filter(Boolean);
  }
  if (typeof req.body?.installationPriceCop === 'number' && req.body.installationPriceCop >= 0) {
    prop.installationPriceCop = Math.round(req.body.installationPriceCop);
  }
  if (typeof req.body?.monthlyMaintenanceCop === 'number' && req.body.monthlyMaintenanceCop >= 0) {
    prop.monthlyMaintenanceCop = Math.round(req.body.monthlyMaintenanceCop);
  }
  if (req.body?.currency === 'COP' || req.body?.currency === 'USD') prop.currency = req.body.currency;
  if (typeof req.body?.estimatedDays === 'number' && req.body.estimatedDays > 0) {
    prop.estimatedDays = Math.round(req.body.estimatedDays);
  }
  if (typeof req.body?.terms === 'string') prop.terms = sanitizeText(req.body.terms, 1000);
  if (typeof req.body?.validUntil === 'string') prop.validUntil = sanitizeText(req.body.validUntil, 20);
  if (
    req.body?.status === 'borrador' ||
    req.body?.status === 'enviada' ||
    req.body?.status === 'aceptada' ||
    req.body?.status === 'rechazada'
  ) {
    prop.status = req.body.status;
  }
  prop.updatedAt = new Date().toISOString();
  store.commit();
  res.json({ proposal: prop });
});

// ---------- ADMIN: CONNECTORS & EXECUTIONS ----------

app.get('/api/admin/connectors', requireAdmin, (_req, res) => {
  const db = store.getState();
  res.json({ connectors: db.connectors });
});

app.put('/api/admin/connectors/:key', requireAdmin, (req, res) => {
  const db = store.getState();
  const connector = db.connectors.find((c) => c.key === req.params.key);
  if (!connector) {
    res.status(404).json({ error: 'Conector no encontrado.' });
    return;
  }

  const values = typeof req.body?.values === 'object' && req.body.values !== null ? req.body.values : {};
  const encryptedBucket = db.connectorEncryptedSecrets[connector.key] || {};

  for (const field of connector.requiredFields) {
    const rawVal = values[field.key];
    if (typeof rawVal === 'string' && rawVal.trim().length > 0) {
      const cleaned = rawVal.trim();
      if (field.key.toLowerCase().includes('url')) {
        const safeCheck = isSafeExternalUrl(cleaned);
        if (!safeCheck.valid) {
          res.status(400).json({ error: safeCheck.reason });
          return;
        }
      }
      encryptedBucket[field.key] = encryptSecret(cleaned);
      connector.maskedValues[field.key] = field.secret ? maskSecret(cleaned) : cleaned;
    }
  }

  db.connectorEncryptedSecrets[connector.key] = encryptedBucket;
  // Saving new config resets verification until real check runs
  if (!connector.isLocalCapable) {
    connector.status = 'pending_config';
    connector.lastError = undefined;
  }

  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'ACTUALIZAR_CREDENCIALES_CONECTOR',
    targetType: 'conector',
    targetId: connector.key,
    detail: `Credenciales cifradas actualizadas para ${connector.name}.`,
  });
  store.commit();
  res.json({ connector });
});

app.post('/api/admin/connectors/:key/verify', requireAdmin, async (req, res) => {
  const db = store.getState();
  const connector = db.connectors.find((c) => c.key === req.params.key);
  if (!connector) {
    res.status(404).json({ error: 'Conector no encontrado.' });
    return;
  }

  if (connector.isLocalCapable) {
    connector.status = 'verified';
    connector.lastVerifiedAt = new Date().toISOString();
    connector.lastError = undefined;
    store.commit();
    res.json({ connector });
    return;
  }

  const encryptedBucket = db.connectorEncryptedSecrets[connector.key] || {};
  const missing = connector.requiredFields.filter((f) => !encryptedBucket[f.key]);
  if (missing.length > 0) {
    connector.status = 'error';
    connector.lastError = `Faltan campos por configurar: ${missing.map((m) => m.label).join(', ')}.`;
    store.commit();
    res.status(422).json({ error: connector.lastError, connector });
    return;
  }

  // Real verification logic per provider without faking unverified connections
  try {
    const { decryptSecret } = await import('./server/crypto.ts');
    if (connector.key === 'external_api') {
      const url = decryptSecret(encryptedBucket.baseUrl!);
      const safe = isSafeExternalUrl(url);
      if (!safe.valid) throw new Error(safe.reason);
      const apiKey = decryptSecret(encryptedBucket.apiKey!);
      const resp = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok && resp.status >= 500) {
        throw new Error(`El servidor externo respondió HTTP ${resp.status}.`);
      }
    } else if (connector.key === 'telegram') {
      const botToken = decryptSecret(encryptedBucket.botToken!);
      const resp = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/getMe`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        throw new Error(`Telegram rechazó el token (HTTP ${resp.status}). Verifica el token de BotFather.`);
      }
    } else if (connector.key === 'whatsapp') {
      const phoneId = decryptSecret(encryptedBucket.phoneNumberId!);
      const accessToken = decryptSecret(encryptedBucket.accessToken!);
      const resp = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        throw new Error(`Meta Graph API rechazó las credenciales (HTTP ${resp.status}).`);
      }
    } else if (connector.key === 'gmail' || connector.key === 'google_calendar' || connector.key === 'google_sheets') {
      const tokenKey =
        connector.key === 'gmail'
          ? 'smtpOrApiToken'
          : connector.key === 'google_calendar'
            ? 'oauthToken'
            : 'serviceToken';
      const token = decryptSecret(encryptedBucket[tokenKey]!);
      if (token.length < 12) {
        throw new Error('La credencial ingresada no tiene un formato de token OAuth válido.');
      }
      // Verify Google OAuth token against Google tokeninfo when OAuth token is provided
      const resp = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!resp.ok) {
        throw new Error(
          `Google rechazó el token OAuth (HTTP ${resp.status}). Ingresa un token OAuth vigente y autorizado.`,
        );
      }
    }

    connector.status = 'verified';
    connector.lastVerifiedAt = new Date().toISOString();
    connector.lastError = undefined;

    store.addAudit({
      actorRole: 'admin',
      actorLabel: 'Jair (Admin)',
      action: 'VERIFICAR_CONECTOR',
      targetType: 'conector',
      targetId: connector.key,
      detail: `Conector ${connector.name} verificado frente al proveedor real.`,
    });
    store.commit();
    res.json({ connector });
  } catch (err) {
    connector.status = 'error';
    connector.lastError =
      err instanceof Error ? err.message : 'No fue posible verificar la conexión externa.';
    store.commit();
    res.status(422).json({ error: connector.lastError, connector });
  }
});

app.post('/api/admin/connectors/telegram/test-message', requireAdmin, async (req, res) => {
  const db = store.getState();
  const tg = db.connectors.find((c) => c.key === 'telegram');
  if (!tg || tg.status !== 'verified') {
    res.status(422).json({ error: 'Verifica primero las credenciales del bot de Telegram.' });
    return;
  }
  const encryptedBucket = db.connectorEncryptedSecrets['telegram'] || {};
  const { decryptSecret } = await import('./server/crypto.ts');
  const botToken = encryptedBucket.botToken
    ? decryptSecret(encryptedBucket.botToken)
    : process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const chatId = encryptedBucket.defaultChatId
    ? decryptSecret(encryptedBucket.defaultChatId)
    : process.env.TELEGRAM_CHAT_ID?.trim() || '';

  if (!botToken || !chatId) {
    res.status(422).json({ error: 'Faltan botToken o defaultChatId configurados.' });
    return;
  }

  const customText = sanitizeText(req.body?.message, 300);
  const text =
    customText ||
    'JAIRRESTAURA AUTOMATIZA IA: Conexión segura de Telegram Bot API verificada correctamente.';

  try {
    const resp = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(6000),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!resp.ok || !data.ok) {
      res.status(422).json({ error: data.description || `Telegram respondió HTTP ${resp.status}.` });
      return;
    }
    store.addAudit({
      actorRole: 'admin',
      actorLabel: 'Jair (Admin)',
      action: 'TELEGRAM_MENSAJE_VERIFICADO',
      targetType: 'conector',
      targetId: 'telegram',
      detail: `Mensaje real enviado a Telegram (message_id: ${data.result?.message_id ?? 'ok'}).`,
    });
    res.json({ ok: true, messageId: data.result?.message_id });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Error de red enviando mensaje a Telegram.',
    });
  }
});

app.get('/api/admin/leads', requireAdmin, (_req, res) => {
  const db = store.getState();
  const leads = db.crmCapturedLeads.map((lead) => {
    const auto = db.automations.find((a) => a.id === lead.automationId);
    const client = db.clients.find((c) => c.id === lead.clientId);
    return {
      ...lead,
      automationName: auto?.name || lead.automationId,
      businessName: client?.businessName || lead.clientId,
    };
  });
  res.json({ leads });
});

app.get('/api/admin/executions', requireAdmin, (_req, res) => {
  const db = store.getState();
  res.json({ executions: db.executions, capturedLeadsCount: db.crmCapturedLeads.length });
});

// ---------- ADMIN: PAYMENTS & SUBSCRIPTIONS ----------

app.get('/api/admin/payments', requireAdmin, (_req, res) => {
  const db = store.getState();
  res.json({
    payments: db.payments,
    settings: db.paymentSettings,
    plans: db.plans,
  });
});

app.patch('/api/admin/payments/settings', requireAdmin, (req, res) => {
  const db = store.getState();
  if (typeof req.body?.realPaymentsAuthorizedByAdmin === 'boolean') {
    db.paymentSettings.realPaymentsAuthorizedByAdmin = req.body.realPaymentsAuthorizedByAdmin;
  }
  if (req.body?.wompiEnvironment === 'sandbox' || req.body?.wompiEnvironment === 'production') {
    db.paymentSettings.wompiEnvironment = req.body.wompiEnvironment;
  }
  if (req.body?.stripeMode === 'test' || req.body?.stripeMode === 'live') {
    db.paymentSettings.stripeMode = req.body.stripeMode;
  }
  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'AUTORIZACION_COBROS',
    targetType: 'pagos',
    targetId: 'pasarelas',
    detail: `Autorización de cobros reales establecida en: ${db.paymentSettings.realPaymentsAuthorizedByAdmin ? 'AUTORIZADA' : 'DESACTIVADA'}.`,
  });
  store.commit();
  res.json({ settings: db.paymentSettings });
});

app.post('/api/admin/payments', requireAdmin, (req, res) => {
  const db = store.getState();
  const clientId = sanitizeText(req.body?.clientId, 80);
  const client = db.clients.find((c) => c.id === clientId);
  if (!client) {
    res.status(400).json({ error: 'Cliente no encontrado.' });
    return;
  }
  const amount = Math.max(0, Number(req.body?.amount) || 0);
  const concept = sanitizeText(req.body?.concept, 160);
  const provider =
    req.body?.provider === 'stripe'
      ? 'stripe'
      : req.body?.provider === 'manual_autorizado'
        ? 'manual_autorizado'
        : 'wompi';
  const kind =
    req.body?.kind === 'unico' ||
    req.body?.kind === 'instalacion' ||
    req.body?.kind === 'mantenimiento' ||
    req.body?.kind === 'suscripcion'
      ? req.body.kind
      : 'mantenimiento';

  if (!concept || amount <= 0) {
    res.status(400).json({ error: 'Concepto y monto válido son obligatorios.' });
    return;
  }

  // Never register online payments as verified without provider webhook confirmation
  if (provider !== 'manual_autorizado' && !db.paymentSettings.realPaymentsAuthorizedByAdmin) {
    res.status(403).json({
      error:
        'Los cobros en línea (Wompi / Stripe) requieren autorización expresa del administrador en la configuración de cobros.',
    });
    return;
  }

  const tx: PaymentTransaction = {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    clientId: client.id,
    clientName: client.businessName,
    concept,
    kind,
    provider,
    amount: Math.round(amount),
    currency: req.body?.currency === 'USD' ? 'USD' : 'COP',
    // Pending confirmation until provider webhook confirms!
    status: 'pendiente_confirmacion',
    providerReference:
      provider === 'manual_autorizado'
        ? sanitizeText(req.body?.providerReference, 80) || 'PENDIENTE-SOPORTE-BANCARIO'
        : 'ESPERANDO-CONFIRMACION-WEBHOOK',
    providerVerified: false,
    adminAuthorized: db.paymentSettings.realPaymentsAuthorizedByAdmin,
    createdAt: new Date().toISOString(),
    isDemo: false,
  };

  db.payments.unshift(tx);
  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'CREAR_ORDEN_COBRO',
    targetType: 'pago',
    targetId: tx.id,
    detail: `Orden de cobro (${tx.provider}) creada en estado Pendiente de confirmación.`,
  });
  store.commit();
  res.status(201).json({ transaction: tx });
});

// ---------- ADMIN: SECURITY, AUDIT, LEY 1581 & BACKUP ----------

app.get('/api/admin/security', requireAdmin, (_req, res) => {
  const db = store.getState();
  res.json({
    auditLogs: db.auditLogs,
    arcoRequests: db.arcoRequests,
    consentsCount: db.clients.filter((c) => c.habeasDataConsent).length,
    totalClients: db.clients.length,
    envPasscodeActive: isEnvAdminPasscodeSet(),
    persistenceMode: store.getPersistenceMode(),
  });
});

app.post('/api/admin/arco', requireAdmin, (req, res) => {
  const db = store.getState();
  const clientId = sanitizeText(req.body?.clientId, 80);
  const client = db.clients.find((c) => c.id === clientId);
  if (!client) {
    res.status(400).json({ error: 'Cliente no encontrado.' });
    return;
  }
  const rightType = (['Acceso', 'Rectificación', 'Cancelación', 'Oposición'].includes(req.body?.rightType)
    ? req.body.rightType
    : 'Acceso') as ArcoRequest['rightType'];
  const description = sanitizeText(req.body?.description, 500);
  if (!description) {
    res.status(400).json({ error: 'Describe la solicitud ARCO.' });
    return;
  }

  const arco: ArcoRequest = {
    id: `arco-${Date.now()}`,
    clientId: client.id,
    clientName: client.businessName,
    rightType,
    description,
    status: 'recibida',
    createdAt: new Date().toISOString(),
  };
  db.arcoRequests.unshift(arco);
  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'REGISTRAR_SOLICITUD_ARCO',
    targetType: 'ley1581',
    targetId: arco.id,
    detail: `Solicitud ${rightType} registrada para ${client.businessName}.`,
  });
  store.commit();
  res.status(201).json({ arco });
});

app.patch('/api/admin/arco/:id', requireAdmin, (req, res) => {
  const db = store.getState();
  const arco = db.arcoRequests.find((a) => a.id === req.params.id);
  if (!arco) {
    res.status(404).json({ error: 'Solicitud ARCO no encontrada.' });
    return;
  }
  if (req.body?.status === 'recibida' || req.body?.status === 'en_proceso' || req.body?.status === 'completada') {
    arco.status = req.body.status;
    if (arco.status === 'completada') {
      arco.resolvedAt = new Date().toISOString();
    }
  }
  store.commit();
  res.json({ arco });
});

app.get('/api/admin/backup', requireAdmin, (_req, res) => {
  const db = store.getState();
  // Export sanitized backup: NEVER export password hashes or encrypted secret strings
  const sanitizedBackup = {
    exportedAt: new Date().toISOString(),
    platform: 'JAIRRESTAURA AUTOMATIZA IA',
    clients: db.clients,
    automations: db.automations,
    proposals: db.proposals,
    plans: db.plans,
    executions: db.executions,
    payments: db.payments,
    arcoRequests: db.arcoRequests,
    auditLogs: db.auditLogs,
    connectorsMetadata: db.connectors.map((c) => ({
      key: c.key,
      name: c.name,
      status: c.status,
      lastVerifiedAt: c.lastVerifiedAt,
    })),
  };

  store.addAudit({
    actorRole: 'admin',
    actorLabel: 'Jair (Admin)',
    action: 'DESCARGAR_COPIA_SEGURIDAD',
    targetType: 'sistema',
    targetId: 'backup',
    detail: 'Copia de seguridad JSON sanitizada generada (sin secretos ni claves privadas).',
  });

  res.setHeader('Content-Disposition', 'attachment; filename="jairrestaura-backup.json"');
  res.json(sanitizedBackup);
});

app.post('/api/admin/reset-demo', requireAdmin, (_req, res) => {
  store.resetDemoData();
  res.json({ ok: true });
});

// ---------- CLIENT PORTAL (STRICT TENANT ISOLATION) ----------

app.get('/api/portal/dashboard', requireAuth, (req: AuthedRequest, res) => {
  const db = store.getState();
  const targetClientId =
    req.user!.role === 'client' ? req.user!.clientId : sanitizeText(req.query.clientId, 80);

  if (!targetClientId) {
    res.status(400).json({ error: 'Identificador de cliente requerido.' });
    return;
  }

  const client = db.clients.find((c) => c.id === targetClientId);
  if (!client) {
    res.status(404).json({ error: 'Espacio de cliente no encontrado.' });
    return;
  }

  // Strict tenant isolation: filter every collection solely by targetClientId
  const automations = db.automations
    .filter((a) => a.clientId === targetClientId)
    .map((a) => ({
      ...a,
      validation: validateAutomationRequirements(a, db.connectors),
    }));

  const executions = db.executions.filter((e) => e.clientId === targetClientId);
  const payments = db.payments.filter((p) => p.clientId === targetClientId);
  const proposals = db.proposals
    .filter((p) => p.clientId === targetClientId)
    .map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      shareToken: p.shareToken,
      installationPriceCop: p.installationPriceCop,
      monthlyMaintenanceCop: p.monthlyMaintenanceCop,
      currency: p.currency,
      validUntil: p.validUntil,
    }));

  res.json({
    client: {
      id: client.id,
      name: client.name,
      businessName: client.businessName,
      sector: client.sector,
      email: client.email,
      city: client.city,
      commercialStatus: client.commercialStatus,
      contractedServices: client.contractedServices,
      monthlyMaintenanceCop: client.monthlyMaintenanceCop,
      habeasDataConsent: client.habeasDataConsent,
      consentDate: client.consentDate,
      supportHistory: client.supportHistory,
      isDemo: client.isDemo,
    },
    automations,
    executions,
    payments,
    proposals,
  });
});

app.post('/api/portal/automations/:id/toggle', requireAuth, (req: AuthedRequest, res) => {
  const db = store.getState();
  const targetClientId =
    req.user!.role === 'client' ? req.user!.clientId : sanitizeText(req.body?.clientId, 80);

  const auto = db.automations.find((a) => a.id === req.params.id);
  if (!auto || auto.clientId !== targetClientId) {
    res.status(403).json({ error: 'No tienes permiso para modificar esta automatización.' });
    return;
  }
  if (!auto.clientCanToggle) {
    res.status(403).json({
      error: 'Este proceso es administrado por JairRestaura. Solicita el cambio desde tu soporte.',
    });
    return;
  }

  const desired = req.body?.status === 'active' ? 'active' : 'paused';
  const validation = validateAutomationRequirements(auto, db.connectors);
  if (desired === 'active' && !validation.readyToActivate) {
    res.status(409).json({
      error: `Faltan integraciones por verificar (${validation.missingConnectors.map((m) => m.name).join(', ')}). Contacta a soporte.`,
    });
    return;
  }

  auto.status = desired;
  auto.updatedAt = new Date().toISOString();
  store.addAudit({
    actorRole: 'client',
    actorLabel: req.user!.displayName,
    action: desired === 'active' ? 'CLIENTE_ACTIVO_FLUJO' : 'CLIENTE_PAUSO_FLUJO',
    targetType: 'automatizacion',
    targetId: auto.id,
    detail: `Cambio realizado desde el Panel del Cliente.`,
  });
  store.commit();
  res.json({ automation: { ...auto, validation } });
});

app.post('/api/portal/support', requireAuth, (req: AuthedRequest, res) => {
  const db = store.getState();
  const targetClientId =
    req.user!.role === 'client' ? req.user!.clientId : sanitizeText(req.body?.clientId, 80);
  const client = db.clients.find((c) => c.id === targetClientId);
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }

  const type = req.body?.type === 'error_reportado' ? 'error_reportado' : 'solicitud_cambio';
  const subject = sanitizeText(req.body?.subject, 140);
  const message = sanitizeText(req.body?.message, 700);
  if (!subject || !message) {
    res.status(400).json({ error: 'Asunto y descripción son obligatorios.' });
    return;
  }

  const entry = {
    id: `sup-${Date.now()}`,
    type: type as 'error_reportado' | 'solicitud_cambio',
    subject,
    message,
    status: 'abierto' as const,
    createdAt: new Date().toISOString(),
    createdBy: 'client' as const,
  };
  client.supportHistory.unshift(entry);
  store.addAudit({
    actorRole: 'client',
    actorLabel: client.businessName,
    action: type === 'error_reportado' ? 'REPORTE_ERROR_CLIENTE' : 'SOLICITUD_MODIFICACION_CLIENTE',
    targetType: 'soporte',
    targetId: entry.id,
    detail: `${subject}`,
  });
  store.commit();
  res.status(201).json({ entry });
});

app.post('/api/portal/arco', requireAuth, (req: AuthedRequest, res) => {
  const db = store.getState();
  const targetClientId =
    req.user!.role === 'client' ? req.user!.clientId : sanitizeText(req.body?.clientId, 80);
  const client = db.clients.find((c) => c.id === targetClientId);
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }
  const rightType = (['Acceso', 'Rectificación', 'Cancelación', 'Oposición'].includes(req.body?.rightType)
    ? req.body.rightType
    : 'Acceso') as ArcoRequest['rightType'];
  const description = sanitizeText(req.body?.description, 500);
  if (!description) {
    res.status(400).json({ error: 'Describe tu solicitud Ley 1581.' });
    return;
  }
  const arco: ArcoRequest = {
    id: `arco-${Date.now()}`,
    clientId: client.id,
    clientName: client.businessName,
    rightType,
    description,
    status: 'recibida',
    createdAt: new Date().toISOString(),
  };
  db.arcoRequests.unshift(arco);
  store.addAudit({
    actorRole: 'client',
    actorLabel: client.businessName,
    action: 'SOLICITUD_ARCO_CLIENTE',
    targetType: 'ley1581',
    targetId: arco.id,
    detail: `Solicitud de ${rightType} enviada desde Panel del Cliente.`,
  });
  store.commit();
  res.status(201).json({ arco });
});

// Explicit JSON 404 for unknown /api/* routes (never fall through to SPA HTML)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint API no encontrado.' });
});

// ---------- VITE / STATIC FRONTEND SERVER ----------

async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build dist/index.html no encontrado. Ejecuta npm run build.');
      }
    });
  }

  if (!process.env.VERCEL) {
    app.listen(port, '0.0.0.0', () => {
      console.log(`JAIRRESTAURA AUTOMATIZA IA activo en http://0.0.0.0:${port}`);
    });
  }
}

const isMainEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (!process.env.VERCEL && isMainEntry) {
  startServer();
}

export default app;
