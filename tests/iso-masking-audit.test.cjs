require('./helpers/typescript.cjs');
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const fixture = require('./helpers/supabase.cjs');
require.cache[require.resolve('../lib/supabase/client.ts')] = {
  id: require.resolve('../lib/supabase/client.ts'),
  filename: require.resolve('../lib/supabase/client.ts'),
  loaded: true,
  exports: fixture,
};
require('./helpers/browser.cjs')();
const server = require('../lib/ai/server.ts');

const {
  MASKED_CLP_AMOUNT,
  maskCLP,
  maskRUT,
  maskPhone,
  maskEmail,
  redactSensitiveText,
  sanitizeLogData,
  sanitizeErrorForLog,
} = require('../lib/privacy/mask.ts');
const { compactAIContext } = require('../lib/ai/prompt-context.ts');
const { recordSecurityEvent } = require('../lib/security/audit-log.ts');

afterEach(() => {
  fixture.reset();
});

test('ISO A.8.11: maskRUT, maskPhone, maskEmail y maskCLP enmascaran PII y montos correctamente', () => {
  assert.equal(maskRUT('12.345.678-5'), '12.345.•••-•');
  assert.equal(maskRUT('9876543-k'), '9.876.•••-•');
  assert.equal(maskRUT(''), '');

  assert.equal(maskPhone('+56987654321'), '+56 9 8765 ••••');
  assert.equal(maskPhone('987654321'), '98765 ••••');
  assert.equal(maskPhone(''), '');

  assert.equal(maskEmail('constructor@obratrack.cl'), '•••or@obratrack.cl');
  assert.equal(maskEmail('a@b.cl'), '•••@b.cl');
  assert.equal(maskEmail(''), '');

  assert.equal(maskCLP(), MASKED_CLP_AMOUNT);
  assert.equal(MASKED_CLP_AMOUNT, '$ *******');
});

test('ISO A.8.12/A.8.15: redactSensitiveText y sanitizeLogData ocultan JWT, tokens, RUT, email y teléfonos', () => {
  const raw = 'Authorization Bearer eyJhbGciOiJIUzI1NiJ9.payload123.sig456789 RUT 12.345.678-5 email jefe@constructora.cl fono +56912345678';
  const redacted = redactSensitiveText(raw);
  assert.equal(redacted.includes('payload123'), false);
  assert.equal(redacted.includes('12.345.678-5'), false);
  assert.equal(redacted.includes('jefe@constructora.cl'), false);
  assert.equal(redacted.includes('56912345678'), false);
  assert.match(redacted, /Bearer \[REDACTED\]|\[JWT_REDACTED\]/);
  assert.match(redacted, /12\.345\.•••-•/);
  assert.match(redacted, /•••fe@constructora\.cl/);

  const sanitizedObj = sanitizeLogData({
    password: 'SecretPassword123',
    token: 'abc',
    email: 'pedro@example.test',
  });
  assert.equal(sanitizedObj.password, '[REDACTED]');
  assert.equal(sanitizedObj.token, '[REDACTED]');
  assert.equal(sanitizedObj.email, '•••ro@example.test');

  const errInfo = sanitizeErrorForLog(new Error('Fallo para pedro@example.test con token sk-1234567890abcdef'));
  assert.equal(errInfo.message.includes('pedro@example.test'), false);
  assert.equal(errInfo.message.includes('sk-1234567890abcdef'), false);
});

test('ISO A.8.11: compactAIContext enmascara RUT, email y teléfono antes de enviar contexto a la IA', () => {
  const compact = compactAIContext({
    clientes: [
      { id: 'c1', nombre: 'Inmobiliaria Sur', rut: '76.123.456-7', email: 'contacto@sur.cl', telefono: '+56911223344', comuna: 'Maipú' },
    ],
    trabajadores: [
      { id: 'w1', nombre: 'Pedro Soto', rol: 'terreno', rut: '12.345.678-5', email: 'pedro@obra.cl', telefono_whatsapp: '+56987654321' },
    ],
  });

  assert.equal(compact.clientes[0].nombre, 'Inmobiliaria Sur');
  assert.equal(compact.clientes[0].rut, '76.123.•••-•');
  assert.equal(compact.clientes[0].email, '•••to@sur.cl');
  assert.equal(compact.clientes[0].telefono, '+56 9 1122 ••••');

  assert.equal(compact.trabajadores[0].nombre, 'Pedro Soto');
  assert.equal(compact.trabajadores[0].rut, '12.345.•••-•');
  assert.equal(compact.trabajadores[0].email, '•••ro@obra.cl');
  assert.equal(compact.trabajadores[0].telefono_whatsapp, '+56 9 8765 ••••');
});

test('ISO A.8.15: recordSecurityEvent y /api/auditoria/evento validan permisos y sanitizan metadata', async () => {
  let activeRole = 'terreno';
  server.authorizeAI = async () => ({
    client: fixture.supabase,
    user: { id: 'u1', empresa_id: 'emp-1', rol: activeRole, nombre: 'Usuario' },
  });

  const { GET, POST } = require('../app/api/auditoria/evento/route.ts');

  // Terreno no puede listar audit logs de la empresa
  const deniedGet = await GET(new NextRequest('https://example.test/api/auditoria/evento'));
  assert.equal(deniedGet.status, 403);

  // Evento inválido rechazado con 400
  const invalidPost = await POST(
    new NextRequest('https://example.test/api/auditoria/evento', {
      method: 'POST',
      body: JSON.stringify({ event_type: 'arbitrary.event' }),
    }),
  );
  assert.equal(invalidPost.status, 400);

  // Evento válido permitido se guarda con metadata sanitizada
  const okPost = await POST(
    new NextRequest('https://example.test/api/auditoria/evento', {
      method: 'POST',
      body: JSON.stringify({
        event_type: 'privacy.pii_revealed',
        resource_type: 'cliente',
        resource_id: 'c1',
        metadata: { field: 'rut', token: 'secret-value' },
      }),
    }),
  );
  assert.equal(okPost.status, 200);
  const rows = fixture.tables.get('security_audit_logs') || [];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.token, '[REDACTED]');

  // Admin sí puede consultar eventos de auditoría
  activeRole = 'admin';
  const okGet = await GET(new NextRequest('https://example.test/api/auditoria/evento'));
  assert.equal(okGet.status, 200);
  const payload = await okGet.json();
  assert.equal(payload.events.length, 1);

  // recordSecurityEvent nunca falla aunque falle el cliente
  await recordSecurityEvent(
    { from: () => ({ insert: () => { throw new Error('table missing'); } }) },
    { empresaId: 'emp-1', actorId: 'u1', eventType: 'auth.session_established' },
  );
});
