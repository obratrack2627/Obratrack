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

test('convertirPresupuestoEnObra acota textos largos al esquema SQL y /api/presupuestos/convertir completa defaults NOT NULL de proyectos', async () => {
  const { convertirPresupuestoEnObra } = require('../lib/presupuestos-to-obra.ts');
  const { isolatedState } = require('../lib/whatsapp/state.ts');
  const service = isolatedState({ id: 'u1', empresa_id: 'emp-1', nombre: 'Admin', rol: 'admin', email: 'a@b.cl' }, {}, 'pro_ia');

  const quote = {
    id: 'cot-long',
    titulo_proyecto: 'X'.repeat(180),
    tipo_obra: 'Radier',
    comuna_region: 'Santiago, Región Metropolitana',
    cliente_nombre: 'C'.repeat(180),
    cliente_telefono: '+56912345678901234567890',
    duracion_dias_estimada: 5,
    resumen_ejecutivo: 'Radier exterior',
    materiales: [
      {
        nombre: 'M'.repeat(180),
        categoria: 'G'.repeat(100),
        cantidad: 2,
        unidad: 'U'.repeat(50),
        precio_unitario_estimado: 10000,
        subtotal_estimado: 20000,
        mejor_tienda: 'T'.repeat(130),
      },
    ],
    mano_de_obra: [],
    estructura_financiera: {
      costo_materiales_total: 20000,
      costo_mano_obra_total: 0,
      costo_directo: 20000,
      gastos_generales_porcentaje: 0,
      gastos_generales_monto: 0,
      imprevistos_porcentaje: 0,
      imprevistos_monto: 0,
      margen_utilidad_porcentaje: 0,
      margen_utilidad_monto: 0,
      precio_sugerido_neto: 20000,
      iva_19: 3800,
      precio_total_con_iva: 23800.5,
      ahorro_compras_estrategicas: 0,
    },
    actividades_gantt: [{ nombre: 'A'.repeat(180), dias: 5, orden: 1 }],
    radar_proveedores: [],
    consejos_experto_pyme: [],
    fecha_creacion: new Date().toISOString(),
  };

  const res = convertirPresupuestoEnObra(quote, { service, fechaInicio: '2026-11-17' });
  assert.equal(res.proyecto.nombre.length, 150);
  assert.equal(res.proyecto.monto_cotizado, 23800.5);
  assert.deepEqual(res.proyecto.dias_laborales, [1, 2, 3, 4, 5]);
  assert.equal(res.cliente.telefono.length, 20);
  const mat = service.getMaterialesProyecto(res.proyecto.id)[0];
  assert.equal(mat.unidad.length, 30);
  assert.equal(mat.proveedor.length, 100);
  assert.equal(mat.categoria.length, 80);

  fixture.tables.set('empresas', [{ id: 'emp-1', nombre: 'Demo', plan_id: 'pro_ia', rut: '76111111-1' }]);
  fixture.tables.set('usuarios', [{ id: 'u1', empresa_id: 'emp-1', nombre: 'Admin', rol: 'admin' }]);
  fixture.tables.set('presupuestos', [
    {
      id: 'cot-long',
      empresa_id: 'emp-1',
      creado_por: 'u1',
      proyecto_id: null,
      estado: 'borrador',
      origen: 'plataforma',
      cotizacion: quote,
      created_at: '2026-11-17T00:00:00Z',
      updated_at: '2026-11-17T00:00:00Z',
    },
  ]);

  let rpcPayload = null;
  fixture.handleRPC('convertir_presupuesto_obra', (params) => {
    rpcPayload = params.p_payload;
    return {
      data: {
        presupuesto: { id: 'cot-long', proyecto_id: params.p_payload.proyectos[0].id, estado: 'aprobada' },
        proyecto: params.p_payload.proyectos[0],
        actividadesCreadas: 1,
        materialesCargados: 1,
      },
      error: null,
    };
  });

  server.authorizeAI = async () => ({
    client: fixture.supabase,
    user: { id: 'u1', empresa_id: 'emp-1', rol: 'admin', nombre: 'Admin' },
  });

  const quoteDocPath = require.resolve('../lib/whatsapp/quote-document.ts');
  const prevQuoteDoc = require.cache[quoteDocPath];
  require.cache[quoteDocPath] = {
    id: quoteDocPath,
    filename: quoteDocPath,
    loaded: true,
    exports: { sendAcceptedQuotePdfToWhatsApp: async () => false },
  };
  try {
    const { POST } = require('../app/api/presupuestos/convertir/route.ts');
    const convertRes = await POST(
      new NextRequest('https://example.test/api/presupuestos/convertir', {
        method: 'POST',
        body: JSON.stringify({ id: 'cot-long', updated_at: '2026-11-17T00:00:00Z' }),
      }),
    );
    assert.equal(convertRes.status, 200);
    assert.deepEqual(rpcPayload.proyectos[0].dias_laborales, [1, 2, 3, 4, 5]);
    assert.deepEqual(rpcPayload.proyectos[0].fechas_no_laborales, []);
    assert.equal(rpcPayload.proyectos[0].finalizada_automaticamente, false);
    assert.equal(rpcPayload.proyectos[0].recepcion_estado, 'pendiente');
  } finally {
    if (prevQuoteDoc) require.cache[quoteDocPath] = prevQuoteDoc;
    else delete require.cache[quoteDocPath];
  }
});

test('Reportes: DELETE /api/whatsapp/mensajes valida rol, empresa y elimina reporte propio', async () => {
  fixture.tables.set('whatsapp_mensajes', [
    { message_id: 'rep-own', empresa_id: 'emp-1', actor_id: 'u1', texto: 'Avance' },
    { message_id: 'rep-other', empresa_id: 'emp-2', actor_id: 'u2', texto: 'Ajeno' },
  ]);

  let role = 'terreno';
  server.authorizeAI = async () => ({
    client: fixture.supabase,
    user: { id: 'u1', empresa_id: 'emp-1', rol: role, nombre: 'Usuario' },
  });

  const { DELETE } = require('../app/api/whatsapp/mensajes/route.ts');

  const denied = await DELETE(new NextRequest('https://example.test/api/whatsapp/mensajes?id=rep-own', { method: 'DELETE' }));
  assert.equal(denied.status, 403);

  role = 'admin';
  const foreign = await DELETE(new NextRequest('https://example.test/api/whatsapp/mensajes?id=rep-other', { method: 'DELETE' }));
  assert.equal(foreign.status, 404);

  const ok = await DELETE(new NextRequest('https://example.test/api/whatsapp/mensajes?id=rep-own', { method: 'DELETE' }));
  assert.equal(ok.status, 200);
  const remaining = fixture.tables.get('whatsapp_mensajes') || [];
  assert.deepEqual(remaining.map((r) => r.message_id), ['rep-other']);
});
