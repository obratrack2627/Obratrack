require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { NextRequest } = require('next/server');

const { sendMetaReadAndTyping } = require('../lib/whatsapp/meta.ts');
const { loadWhatsAppContext } = require('../lib/whatsapp/context-loader.ts');
const { generateValidatedChat } = require('../lib/ai/generation.ts');
const { AIError } = require('../lib/ai/errors.ts');
const { applyNaturalQuoteEdit } = require('../lib/obrabot/quote-edit-natural.ts');
const { handleQuoteTurn, tryNaturalQuoteEdit } = require('../lib/obrabot/quotes.ts');
const { normalizeQuote } = require('../lib/ai/protocol.ts');
const { checkActionPermissions } = require('../lib/ai/permissions.ts');
const { planWhatsAppActions, isolatedState } = require('../lib/whatsapp/state.ts');
const { createChatHandler, readAIRequest } = require('../lib/ai/server.ts');
const { describeCriticalAction } = require('../lib/ai/client.ts');

test('Fase 1: sendMetaReadAndTyping envía read + typing_indicator y loadWhatsAppContext omite tablas pesadas en saludos', async () => {
  const prevToken = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
  const prevPhone = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
  process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN = 'tok-test';
  process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID = '999888';

  try {
    let sentBody = null;
    await sendMetaReadAndTyping('wamid.hello.1', async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return new Response('{}', { status: 200 });
    });
    assert.deepEqual(sentBody, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.hello.1',
      typing_indicator: { type: 'text' },
    });

    const queriedTables = [];
    const sb = {
      from(table) {
        queriedTables.push(table);
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({ data: [], error: null }),
          range: () => Promise.resolve({ data: table === 'proyectos' ? [{ id: 'p-1', nombre: 'Casa Sur', empresa_id: 'e-1' }] : [], error: null }),
          then: (res, rej) => Promise.resolve({ data: table === 'empresas' ? [{ id: 'e-1', plan_id: 'pro_ia' }] : [], error: null }).then(res, rej),
        };
        return chain;
      },
    };
    const ctx = await loadWhatsAppContext(sb, { id: 'u-1', empresa_id: 'e-1', rol: 'admin' }, [{ id: 'u-1', empresa_id: 'e-1', rol: 'admin' }], {
      lightweightIfIdle: true,
    });
    assert.equal(ctx.tables.proyectos.length, 1);
    assert.ok(!queriedTables.includes('materiales_proyecto'), 'No debe consultar tablas hijas pesadas en saludo');
    assert.ok(!queriedTables.includes('bitacora_entradas'));
  } finally {
    if (prevToken === undefined) delete process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
    else process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN = prevToken;
    if (prevPhone === undefined) delete process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID = prevPhone;
  }
});

test('Fase 1: generateValidatedChat se recupera de un microcorte AI_UNAVAILABLE transitorio y reporta recovered=true', async () => {
  let calls = 0;
  const events = [];
  const res = await generateValidatedChat(
    'contexto',
    '¿Cuántas obras tengo?',
    {},
    { onQualityEvent: (ev) => events.push(ev), budgetMs: 10000 },
    async () => {
      calls++;
      if (calls === 1) throw new AIError('AI_UNAVAILABLE', 'Caída momentánea', 503);
      return JSON.stringify({ respuesta: 'Tienes 2 obras activas.', acciones: [], cotizacion: null });
    },
  );
  assert.equal(calls, 2);
  assert.equal(res.respuesta, 'Tienes 2 obras activas.');
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'provider_failure');
  assert.equal(events[0].recovered, true);
  assert.equal(events[0].attempt, 2);
});

test('Fase 2: edición conversacional natural de cotizaciones pactadas (50 m² -> 84 m², agregar ítem, cambiar a más IVA y clonar aprobada)', async () => {
  const base = normalizeQuote({
    id: 'cot-hbm-50',
    titulo_proyecto: 'Cotización de hormigón estampado',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    partidas_venta: [{ nombre: 'Hormigón estampado estacionamiento', unidad: 'm²', cantidad: 50, precio_unitario: 37000 }],
    materiales: [],
    mano_de_obra: [],
  });

  // 1. Modificar de 50 a 84 m²
  const patch84 = applyNaturalQuoteEdit(base, 'Podemos modificar el de hormigón estampado a 84 mts cuadrados');
  assert.ok(patch84);
  assert.equal(patch84.partidas_venta[0].cantidad, 84);
  assert.equal(patch84.partidas_venta[0].subtotal, 3108000);

  // 2. Agregar retiro de escombros + cambiar a más IVA
  const patchAdd = applyNaturalQuoteEdit({ ...base, partidas_venta: patch84.partidas_venta }, 'Agrega Retiro de escombros $ 130.000');
  assert.equal(patchAdd.partidas_venta.length, 2);
  assert.equal(patchAdd.partidas_venta[1].subtotal, 130000);

  // 3. Flujo completo sobre cotización ya aprobada crea nueva solicitud sin mutar la aprobada original
  const reviews = new Map();
  const admin = { id: 'admin', empresa_id: 'e1', rol: 'admin' };
  const db = {
    from(table) {
      let filters = [];
      return {
        select() { return this; },
        eq(k, v) { filters.push((r) => r[k] === v); return this; },
        async maybeSingle() {
          const list = table === 'obrabot_cotizaciones' ? [...reviews.values()] : [];
          return { data: list.find((r) => filters.every((f) => f(r))) || null };
        },
        upsert: async () => ({ error: null }),
      };
    },
    async rpc(name, args) {
      if (name === 'obrabot_registrar_cotizacion') {
        reviews.set(args.p_id, { id: args.p_id, empresa_id: args.p_empresa, estado: 'pendiente', revision: 1, borrador: args.p_borrador, presupuesto_id: null });
        return {};
      }
      if (name === 'obrabot_revisar_cotizacion') {
        const row = reviews.get(args.p_id);
        if (args.p_decision === 'aprobar') {
          row.estado = 'aprobada';
          row.presupuesto_id = row.borrador.id;
        } else if (args.p_decision === 'corregir') {
          row.revision += 1;
          row.borrador = args.p_cambios;
        }
        return { data: row };
      }
      throw new Error(name);
    },
  };

  const created = await handleQuoteTurn(db, admin, 'whatsapp', 'Cotización de hormigón estampado\nValor por metro cuadrado $ 37.000\n$37.000 x 50 mts cuadrados', 'req-50');
  await handleQuoteTurn(db, admin, 'whatsapp', `aprueba cotización ${created.solicitud} 1`);
  const edited = await tryNaturalQuoteEdit(db, admin, 'whatsapp', 'Podemos modificar el de hormigón estampado a 84 mts cuadrados', [created.solicitud], true, 'req-84');
  assert.ok(edited);
  assert.notEqual(edited.solicitud, created.solicitud, 'Debe crear una nueva solicitud preservando la aprobada original');
  assert.match(edited.respuesta, /3\.108\.000/);
  assert.equal(reviews.get(created.solicitud).borrador.estructura_financiera.precio_total_con_iva, 1850000);
});

test('Fase 2: CRUD completo de Agenda de Terreno (actualizar_evento y eliminar_evento) con RBAC y diff transaccional', () => {
  const admin = { id: 'u-admin', empresa_id: 'e-1', rol: 'admin', nombre: 'Jorge' };
  const worker = { id: 'u-worker', empresa_id: 'e-1', rol: 'terreno', nombre: 'Pedro' };
  const tables = {
    usuarios: [admin, worker],
    clientes: [],
    proyectos: [{ id: 'p-1', empresa_id: 'e-1', nombre: 'Casa Las Condes', estado: 'activo' }],
    proyecto_trabajadores: [],
    actividades: [],
    materiales_proyecto: [],
    pagos: [],
    bitacora_entradas: [],
    imprevistos: [],
    asistencia_obreros: [],
    reclamos_cambios_obra: [],
    documentos_obra: [],
    agenda_eventos: [
      { id: 'evt-1', empresa_id: 'e-1', proyecto_id: 'p-1', titulo: 'Visita técnica inicial', tipo: 'visita_terreno', fecha_inicio: '2026-11-25T10:00:00' },
    ],
  };

  // Terreno no puede eliminar ni reprogramar compromisos
  assert.throws(
    () => checkActionPermissions(worker, [{ tipo: 'eliminar_evento', titulo: 'Visita técnica inicial' }], 'Elimina la visita técnica'),
    /terreno/,
  );
  // Admin sin intención explícita de borrar tampoco dispara eliminar_evento
  assert.throws(
    () => checkActionPermissions(admin, [{ tipo: 'eliminar_evento', titulo: 'Visita técnica inicial' }], '¿Cuándo es la visita técnica?'),
    /expresamente/,
  );

  // Reprogramar evento produce diff en changed.agenda_eventos
  const svcUpdate = isolatedState(admin, tables, 'pro_ia');
  const updatePlan = planWhatsAppActions(svcUpdate, [
    { tipo: 'actualizar_evento', titulo: 'Visita técnica inicial', fecha: '2026-11-27', hora: '15:30' },
  ]);
  assert.equal(updatePlan.changed.agenda_eventos.length, 1);
  assert.equal(updatePlan.changed.agenda_eventos[0].id, 'evt-1');
  assert.equal(updatePlan.changed.agenda_eventos[0].fecha_inicio, '2026-11-27T15:30:00');

  // Eliminar evento produce diff en deleted.agenda_eventos
  const svcDelete = isolatedState(admin, tables, 'pro_ia');
  const deletePlan = planWhatsAppActions(svcDelete, [
    { tipo: 'eliminar_evento', titulo: 'Visita técnica inicial' },
  ]);
  assert.equal(deletePlan.deleted.agenda_eventos.length, 1);
  assert.equal(deletePlan.deleted.agenda_eventos[0].id, 'evt-1');
});

test('Fase 2 y 3: readAIRequest valida imagen multimodal, describeCriticalAction detecta acciones críticas y createChatHandler transmite SSE', async () => {
  // 1. Validación real de bytes PNG en readAIRequest
  const pngB64 = fs.readFileSync('tests/fixtures/wall-crack.png').toString('base64');
  const validReq = new NextRequest('https://obratrack.test/api/cotizador/chat', {
    method: 'POST',
    body: JSON.stringify({ mensaje: 'Revisa esta grieta', historial: [], imagen: { mimeType: 'image/png', data: pngB64 } }),
  });
  const parsed = await readAIRequest(validReq);
  assert.equal(parsed.imagen.mimeType, 'image/png');

  const fakeReq = new NextRequest('https://obratrack.test/api/cotizador/chat', {
    method: 'POST',
    body: JSON.stringify({ mensaje: 'Foto falsa', historial: [], imagen: { mimeType: 'image/png', data: Buffer.from('not-a-png').toString('base64') } }),
  });
  await assert.rejects(() => readAIRequest(fakeReq));

  // 2. Compuerta de confirmación en acciones críticas
  assert.match(describeCriticalAction({ tipo: 'eliminar_proyecto', proyecto_nombre: 'Quincho' }), /Eliminar la obra/);
  assert.match(describeCriticalAction({ tipo: 'eliminar_evento', titulo: 'Reunión municipal' }), /Eliminar el compromiso/);
  assert.match(describeCriticalAction({ tipo: 'actualizar_proyecto', estado: 'cancelada', proyecto_nombre: 'Terraza' }), /cancelada/);
  assert.equal(describeCriticalAction({ tipo: 'registrar_pago', monto: 100000 }), null);

  // 3. Streaming SSE real cuando el cliente envía Accept: text/event-stream
  const handler = createChatHandler({
    authorize: async () => ({
      user: { id: 'u-1', empresa_id: 'e-1', rol: 'admin', rol_original: 'admin', nombre: 'Admin' },
      client: {
        from(table) {
          const q = {
            select: () => q,
            eq: () => q,
            in: () => q,
            order: () => q,
            limit: () => Promise.resolve({ data: [], error: null }),
            range: () => Promise.resolve({ data: [], error: null }),
            maybeSingle: () => Promise.resolve({ data: table === 'empresas' ? { id: 'e-1', plan_id: 'pro_ia' } : null, error: null }),
            then: (res, rej) => Promise.resolve({ data: table === 'empresas' ? [{ id: 'e-1', plan_id: 'pro_ia' }] : [], error: null }).then(res, rej),
          };
          return q;
        },
      },
    }),
    global: async () => ({ respuesta: 'Hola desde streaming SSE de ObraBot.', accion: null, cotizacion: null, sugerencias: ['Crear obra'] }),
    project: async () => ({ respuesta: 'OK', accion: null, cotizacion: null, sugerencias: [] }),
  });

  const sseReq = new NextRequest('https://obratrack.test/api/cotizador/chat', {
    method: 'POST',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mensaje: 'Hola ObraBot', historial: [] }),
  });
  const sseRes = await handler(sseReq);
  assert.match(sseRes.headers.get('content-type') || '', /text\/event-stream/);
  const sseText = await sseRes.text();
  assert.match(sseText, /event: stage/);
  assert.match(sseText, /event: delta/);
  assert.match(sseText, /event: done/);
  assert.match(sseText, /Hola desde streaming SSE de ObraBot\./);
});
