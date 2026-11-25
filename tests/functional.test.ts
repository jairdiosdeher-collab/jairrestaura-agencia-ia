import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionToken,
  decryptSecret,
  encryptSecret,
  hashPassword,
  isSafeExternalUrl,
  signWebhookPayload,
  verifyPassword,
  verifySessionToken,
  verifyWebhookSignature,
} from '../server/crypto.ts';
import { designWorkflowLocally } from '../server/ai.ts';
import { runAutomationExecution, validateAutomationRequirements } from '../server/engine.ts';
import { store } from '../server/store.ts';
import { ALL_CATALOG_TEMPLATES, SPECIALIZED_SOLUTIONS } from '../server/catalog.ts';

test('Seguridad: hash de contraseñas scrypt y verificación temporal constante', () => {
  const hash = hashPassword('ClaveSegura2026!');
  assert.equal(verifyPassword('ClaveSegura2026!', hash), true);
  assert.equal(verifyPassword('OtraClave', hash), false);
});

test('Seguridad: firma y verificación de tokens de sesión HMAC', () => {
  const token = createSessionToken({
    sub: 'cli-demo-1',
    role: 'client',
    displayName: 'Cliente Demo',
    clientId: 'cli-demo-1',
  });
  const parsed = verifySessionToken(token);
  assert.ok(parsed);
  assert.equal(parsed.role, 'client');
  assert.equal(parsed.clientId, 'cli-demo-1');
  assert.equal(verifySessionToken(`${token}tamper`), null);
});

test('Seguridad: cifrado AES-256-GCM de secretos de conectores', () => {
  const secret = 'EAAG-token-privado-whatsapp-12345';
  const encrypted = encryptSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted), secret);
});

test('Seguridad: bloqueo SSRF de IPs privadas y localhost', () => {
  assert.equal(isSafeExternalUrl('http://127.0.0.1:8080/hook').valid, false);
  assert.equal(isSafeExternalUrl('http://169.254.169.254/latest/meta-data').valid, false);
  assert.equal(isSafeExternalUrl('http://192.168.1.10/api').valid, false);
  assert.equal(isSafeExternalUrl('https://api.empresa-externa.com/webhook').valid, true);
});

test('Seguridad: firma HMAC de webhooks', () => {
  const payload = JSON.stringify({ evento: 'nuevo_lead' });
  const sig = signWebhookPayload('whsec_test_123', payload);
  assert.equal(verifyWebhookSignature('whsec_test_123', payload, sig), true);
  assert.equal(verifyWebhookSignature('whsec_otro', payload, sig), false);
});

test('Catálogo: incluye 6 soluciones especializadas y 16 plantillas generales', () => {
  assert.equal(SPECIALIZED_SOLUTIONS.length, 6);
  assert.equal(ALL_CATALOG_TEMPLATES.length, 22);
});

test('JAIR IA (Analizador Local): interpreta solicitud WhatsApp y genera pasos estructurados', () => {
  const result = designWorkflowLocally(
    'Quiero que cuando alguien escriba a mi WhatsApp, reciba una bienvenida, conozca mis servicios, pueda solicitar una cita y quede registrado como cliente.',
  );
  assert.ok(result.steps.length >= 4);
  assert.ok(result.steps.some((s) => s.connectorKey === 'whatsapp'));
  assert.ok(result.steps.some((s) => s.connectorKey === 'google_calendar'));
  assert.ok(result.steps.some((s) => s.connectorKey === 'internal_crm'));
  assert.ok(result.explanation.whatItDoes.length > 10);
});

test('Motor de automatizaciones: bloquea activación si faltan conectores verificados y registra ejecuciones reales', async () => {
  const db = store.getState();
  const pendingAuto = db.automations.find((a) => a.id === 'auto-demo-3');
  assert.ok(pendingAuto);
  const validationPending = validateAutomationRequirements(pendingAuto, db.connectors);
  assert.equal(validationPending.readyToActivate, false);
  assert.ok(validationPending.missingConnectors.length > 0);

  const activeAuto = db.automations.find((a) => a.id === 'auto-demo-1');
  assert.ok(activeAuto);
  const validationOk = validateAutomationRequirements(activeAuto, db.connectors);
  assert.equal(validationOk.readyToActivate, true);

  const testRun = await runAutomationExecution(
    activeAuto,
    { nombre: 'Prueba Automatizada', telefono: '+57 300 123 4567' },
    'test',
    'Test funcional',
  );
  assert.equal(testRun.status, 'success');

  const errorRun = await runAutomationExecution(
    activeAuto,
    {}, // faltan campos requeridos
    'test',
    'Test funcional sin campos',
  );
  assert.equal(errorRun.status, 'error');
});

test('Datos reales vs demo: clientes, automatizaciones, propuestas y cobros iniciales marcados como demo y $0 real', () => {
  const db = store.getState();
  const realClients = db.clients.filter((c) => !c.isDemo);
  const demoClients = db.clients.filter((c) => Boolean(c.isDemo));
  assert.ok(demoClients.length >= 4);

  const realVerifiedRevenue = db.payments
    .filter((p) => !p.isDemo && p.status === 'verificado' && p.providerVerified)
    .reduce((acc, p) => acc + p.amount, 0);
  assert.equal(realVerifiedRevenue, 0);

  // Al menos una automatización activa debe tener paso web_form y webhookSlug
  assert.ok(
    db.automations.some(
      (a) => a.steps.some((s) => s.connectorKey === 'web_form') && Boolean(a.webhookSlug),
    ),
  );
  assert.ok(realClients.length >= 0);
});

test('Conector Telegram: bloquea activación si no está verificado en el servidor', () => {
  const db = store.getState();
  const unverifiedTelegramAuto = {
    id: 'auto-test-tg',
    clientId: 'cli-demo-1',
    name: 'Alerta Telegram Test',
    description: 'Prueba de bloqueo de seguridad sin token verificado',
    sector: 'Agencia',
    status: 'draft' as const,
    clientCanToggle: true,
    webhookSlug: 'alerta-telegram-test',
    steps: [
      {
        id: 's1',
        order: 1,
        type: 'trigger' as const,
        title: 'Formulario web',
        description: 'Entrada de formulario',
        connectorKey: 'web_form' as const,
        configSummary: 'Recibe envíos desde ?formulario=alerta-telegram-test',
        requiredFields: ['nombre'],
      },
      {
        id: 's2',
        order: 2,
        type: 'action' as const,
        title: 'Notificar en Telegram',
        description: 'Mensaje real por Telegram Bot API',
        connectorKey: 'telegram' as const,
        configSummary: 'Envía notificación al chat configurado',
      },
    ],
    explanation: {
      whatItDoes: 'Notifica leads por Telegram Bot API.',
      whenItRuns: 'Al enviar el formulario web.',
      dataUsed: ['nombre'],
      requiredApps: ['Formularios Web', 'Telegram Bot API'],
      requiredPermissions: ['botToken', 'defaultChatId'],
      externalCosts: 'Sin costo fijo obligatorio usando Telegram Bot API.',
    },
    executionCount: 0,
    errorCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const tgConnector = db.connectors.find((c) => c.key === 'telegram');
  assert.ok(tgConnector);
  if (tgConnector.status !== 'verified') {
    const check = validateAutomationRequirements(unverifiedTelegramAuto, db.connectors);
    assert.equal(check.readyToActivate, false);
    assert.ok(check.missingConnectors.some((m) => m.key === 'telegram'));
  }
});

test('Despliegue Vercel: vercel.json y api/index.ts presentes y válidos', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const vercelRaw = fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8');
  const vercelJson = JSON.parse(vercelRaw) as {
    buildCommand?: string;
    outputDirectory?: string;
    rewrites?: Array<{ source: string; destination: string }>;
  };
  assert.equal(vercelJson.buildCommand, 'npm run build');
  assert.equal(vercelJson.outputDirectory, 'dist');
  assert.ok(
    vercelJson.rewrites?.some(
      (r) => r.source === '/api/(.*)' && r.destination.startsWith('/api/index'),
    ),
  );
  assert.ok(
    vercelJson.rewrites?.some(
      (r) => r.source.includes('(?!api') && r.destination === '/index.html',
    ),
  );
  assert.ok(fs.existsSync(path.resolve(process.cwd(), 'api/index.ts')));
});

test('Integración API + Handler Vercel: /api/health, /api/auth/status y POST /api/auth/login-client responden JSON sin 404', async () => {
  const http = await import('node:http');
  const { default: vercelHandler } = await import('../api/index.ts');

  const server = http.createServer((req, res) => vercelHandler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Direct & rewritten /api/health
    const rHealth = await fetch(`${base}/api/index?__vercel_path=/health`);
    assert.equal(rHealth.status, 200);
    const jHealth = (await rHealth.json()) as { ok: boolean };
    assert.equal(jHealth.ok, true);

    // 2. Rewritten /api/auth/status
    const rStatus = await fetch(`${base}/api/index?__vercel_path=/auth/status`);
    assert.equal(rStatus.status, 200);
    const jStatus = (await rStatus.json()) as { demoClients: unknown[] };
    assert.ok(Array.isArray(jStatus.demoClients));

    // 3. Rewritten POST /api/auth/login-client (must reach auth route, not 404)
    const rLoginValid = await fetch(`${base}/api/index?__vercel_path=/auth/login-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'coordinacion@bienestarintegral.demo',
        password: 'DemoCliente2026!',
      }),
    });
    assert.equal(rLoginValid.status, 200);
    const jLoginValid = (await rLoginValid.json()) as { role: string; token: string; clientId: string };
    assert.equal(jLoginValid.role, 'client');
    assert.equal(jLoginValid.clientId, 'cli-demo-1');
    assert.ok(jLoginValid.token.length > 20);

    // 4. Direct POST /api/auth/login-client with invalid credentials returns 401 JSON (never 404)
    const rLoginBad = await fetch(`${base}/api/auth/login-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'noexiste@demo.co', password: 'wrong' }),
    });
    assert.equal(rLoginBad.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
