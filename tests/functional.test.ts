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
