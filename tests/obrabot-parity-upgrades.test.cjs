require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { normalizeTurnAction } = require('../lib/ai/normalize-turn-action.ts');
const { loadRecentCrossChannelTurns } = require('../lib/ai/cross-channel-context.ts');
const {
  buildWhatsAppUndoInverse,
  describePermanentDelete,
  isWhatsAppUndoRequest,
  resolvePendingCriticalDecision,
} = require('../lib/whatsapp/critical-and-undo.ts');
const {
  buildWhatsAppInteractivePayload,
  parseWhatsAppInteractiveReply,
} = require('../lib/whatsapp/interactive.ts');
const { createChatHandler } = require('../lib/ai/server.ts');
const ExcelJS = require('exceljs');
const { handleQuoteTurn, tryNaturalQuoteEdit } = require('../lib/obrabot/quotes.ts');
const { readExcelQuote } = require('../lib/obrabot/quote-input.ts');
const { quoteFile } = require('../lib/obrabot/quote-files.ts');
const { isPastedQuote, readPastedQuote } = require('../lib/obrabot/quote-message.ts');
const { normalizeQuote } = require('../lib/ai/protocol.ts');

test('normalizeTurnAction convierte imprevistos de $0 en incidentes de bitácora y completa avisos con obra activa', () => {
  const normalized = normalizeTurnAction(
    {
      tipo: 'lote_acciones',
      acciones: [
        { tipo: 'registrar_imprevisto', monto: 0, descripcion: 'Camión de hormigón atrasado 2 horas' },
        { tipo: 'enviar_mensaje_equipo', mensaje: 'Reunión de seguridad a las 09:00' },
      ],
    },
    { userRole: 'admin', rawText: 'Registra atraso del camión', activeProjectId: 'obra-1' },
  );

  assert.equal(normalized.acciones[0].tipo, 'crear_bitacora');
  assert.equal(normalized.acciones[0].tipo_bitacora, 'incidente');
  assert.match(normalized.acciones[0].titulo, /Camión de hormigón/);
  assert.equal(normalized.acciones[1].proyecto_id, 'obra-1');
  assert.deepEqual(normalized.acciones[1].roles_destino, ['terreno', 'supervisor']);
});

test('createChatHandler en Web entrega descarga directa en PDF y Excel cuando hay cotización en contexto', async () => {
  let llmCalled = 0;
  const fakeClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { plan_id: 'pro_ia' }, error: null }),
        }),
      }),
    }),
  };
  const handler = createChatHandler({
    authorize: async () => ({
      client: fakeClient,
      user: { id: 'u-1', empresa_id: 'emp-1', rol: 'admin', rol_original: 'admin', nombre: 'Admin' },
    }),
    global: async () => {
      llmCalled++;
      return { respuesta: 'LLM', accion: null, cotizacion: null, sugerencias: [] };
    },
    project: async () => {
      llmCalled++;
      return { respuesta: 'LLM', accion: null, cotizacion: null, sugerencias: [] };
    },
  });

  const excelReq = new NextRequest('http://localhost/api/cotizador/chat', {
    method: 'POST',
    body: JSON.stringify({
      mensaje: 'Envíame la cotización en Excel',
      historial: [],
      contexto_cotizacion: { id: 'cot-demo-123' },
    }),
  });
  const excelRes = await handler(excelReq);
  assert.equal(excelRes.status, 200);
  const excelBody = await excelRes.json();
  assert.equal(llmCalled, 0);
  assert.equal(excelBody.accion_ejecutada.tipo, 'obrabot_cotizacion');
  assert.equal(
    excelBody.accion_ejecutada.link_destino,
    '/api/obrabot/cotizaciones/cot-demo-123?formato=excel&origen=presupuesto',
  );
  assert.equal(excelBody.accion_ejecutada.link_texto, 'Descargar Excel');
});

test('confirmación de borrado permanente y comando Deshacer en WhatsApp funcionan de extremo a extremo', () => {
  const summary = describePermanentDelete([
    { tipo: 'eliminar_evento', titulo: 'Visita municipal' },
  ]);
  assert.match(summary, /Visita municipal/);
  assert.equal(resolvePendingCriticalDecision('Confirmar eliminación'), 'confirm');
  assert.equal(resolvePendingCriticalDecision('Cancelar eliminación'), 'cancel');
  assert.equal(
    parseWhatsAppInteractiveReply({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'ot:crit:confirm', title: 'Confirmar' } },
    }),
    'Confirmar eliminación',
  );

  const payload = buildWhatsAppInteractivePayload({
    acciones: {
      accion_critica_pendiente: { resumen: 'eliminar el compromiso «Visita municipal»' },
    },
  });
  assert.ok(payload && payload.kind === 'buttons');
  assert.deepEqual(
    payload.buttons.map((b) => b.id),
    ['ot:crit:confirm', 'ot:crit:cancel'],
  );

  assert.equal(isWhatsAppUndoRequest('Deshacer'), true);
  assert.equal(isWhatsAppUndoRequest('Deshacer último cambio'), true);
  assert.equal(isWhatsAppUndoRequest('Hola cómo estás'), false);

  const beforeTables = {
    proyectos: [{ id: 'p-1', nombre: 'Quincho', estado: 'activo', monto_cotizado: 5000000 }],
    bitacora_entradas: [],
  };
  const plan = {
    changed: {
      proyectos: [{ id: 'p-1', nombre: 'Quincho', estado: 'cancelada', monto_cotizado: 5000000 }],
      bitacora_entradas: [{ id: 'b-new', proyecto_id: 'p-1', titulo: 'Nota nueva' }],
    },
    deleted: {},
    result: { titulo: 'Estado actualizado' },
  };
  const inverse = buildWhatsAppUndoInverse(beforeTables, plan);
  assert.ok(inverse);
  assert.equal(inverse.changed.proyectos[0].estado, 'activo');
  assert.deepEqual(inverse.deleted.bitacora_entradas, [{ id: 'b-new' }]);
});

test('loadRecentCrossChannelTurns recupera turnos recientes de las últimas 2 horas y tolera mocks parciales', async () => {
  const nowIso = new Date().toISOString();
  const mockDb = {
    from: (table) => {
      if (table === 'whatsapp_mensajes') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: [
                        {
                          texto: 'Subí avance del radier al 60%',
                          respuesta: 'Avance guardado en Terraza.',
                          created_at: nowIso,
                          acciones: { tipo: 'actualizar_avance' },
                        },
                      ],
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  };

  const turns = await loadRecentCrossChannelTurns(
    mockDb,
    { id: 'u-1', empresa_id: 'emp-1', rol: 'admin' },
    'web',
  );
  assert.equal(turns.length, 1);
  assert.equal(turns[0].canal, 'whatsapp');
  assert.match(turns[0].usuario, /radier al 60%/);

  const empty = await loadRecentCrossChannelTurns(null, { id: 'u-1', empresa_id: 'emp-1', rol: 'admin' }, 'whatsapp');
  assert.deepEqual(empty, []);
});

test('ObraBot separa pasar presupuesto a PDF de ayudar a cotizar y distingue partidas vs materiales en Excel y texto', async () => {
  const admin = { id: 'admin', empresa_id: 'empresa1', rol: 'admin' };
  const guide = await handleQuoteTurn({}, admin, 'plataforma', 'Pasar mi presupuesto a PDF');
  assert.match(guide.respuesta, /formato oficial de cotización/i);

  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('Presupuesto');
  s.addRow(['Partida', 'Unidad', 'Cantidad', 'Precio unitario con IVA']);
  s.addRow(['Instalación de puerta', 'gl', 1, 120000]);
  s.addRow(['Cemento Polpaico', 'saco', 4, 5950]);
  const rows = await readExcelQuote(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.deepEqual(rows.map((r) => r.tipo), ['partida', 'material']);

  const pasted = readPastedQuote([
    'Remodelación patio',
    'Partidas:',
    'Armado de deck $ 500.000',
    'Materiales:',
    'Pino impregnado 2x4 $ 120.000',
    'Total $ 620.000',
  ].join('\n'));
  assert.deepEqual(pasted.partidas_venta.map((p) => p.tipo), ['partida', 'material']);

  const draft = normalizeQuote({
    id: 'cot-split-excel',
    titulo_proyecto: pasted.titulo_proyecto,
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    partidas_venta: pasted.partidas_venta,
    materiales: [],
    mano_de_obra: [],
  });
  const xlsx = await quoteFile({}, admin.empresa_id, draft, 'excel');
  const outSheet = (await new ExcelJS.Workbook().xlsx.load(Buffer.from(xlsx.bytes))).worksheets[0];
  assert.equal(outSheet.getRow(1).getCell(1).value, 'Partida / Descripción');
  assert.equal(outSheet.getRow(1).getCell(6).value, 'Sección');
  assert.equal(outSheet.getCell('F2').value, 'Partida / Trabajo');
  assert.equal(outSheet.getCell('F3').value, 'Material');
});

test('rescata edición multilínea sin $, búsqueda de cotización guardada, pago 60/40, pegado rápido y descripción técnica previa', async () => {
  const admin = { id: 'admin', empresa_id: 'emp-hbm', rol: 'admin' };
  const reviews = new Map();
  const baseHbm = normalizeQuote({
    id: 'cot-11111111-1111-4111-8111-111111111111',
    titulo_proyecto: 'HBM Construcciones – Obras exteriores y remodelación',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    resumen_ejecutivo: 'Hormigón estampado H25 con malla acma C92 y sellador acrílico.',
    partidas_venta: [
      { nombre: 'Hormigón estampado 64 m²', unidad: 'gl', cantidad: 1, precio_unitario: 2368000, tipo: 'partida' },
      { nombre: 'Retiro de escombros', unidad: 'gl', cantidad: 1, precio_unitario: 120000, tipo: 'partida' },
      { nombre: 'Paneles perimetrales', unidad: 'gl', cantidad: 1, precio_unitario: 2900000, tipo: 'partida' },
      { nombre: 'Cobertizo', unidad: 'gl', cantidad: 1, precio_unitario: 3825000, tipo: 'partida' },
      { nombre: 'Quincho', unidad: 'gl', cantidad: 1, precio_unitario: 2759000, tipo: 'partida' },
    ],
    hitos_pago: [
      { nombre: 'Anticipo inicial para materiales', porcentaje: 60 },
      { nombre: 'Mano de obra según avance', porcentaje: 40 },
    ],
    materiales: [],
    mano_de_obra: [],
  });
  const storedId1 = '11111111-1111-4111-8111-111111111111';
  reviews.set(storedId1, {
    id: storedId1,
    empresa_id: admin.empresa_id,
    estado: 'aprobada',
    revision: 1,
    presupuesto_id: baseHbm.id,
    borrador: baseHbm,
  });

  const stampId = '22222222-2222-4222-8222-222222222222';
  const stampTemplate = normalizeQuote({
    id: `cot-${stampId}`,
    titulo_proyecto: 'Cotización de hormigón estampado',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    resumen_ejecutivo: 'Incluye preparación de subrasante, moldaje perimetral, pigmento y sellador UV.',
    partidas_venta: [
      { nombre: 'Hormigón estampado', unidad: 'm²', cantidad: 40, precio_unitario: 35000, tipo: 'partida' },
    ],
    materiales: [],
    mano_de_obra: [],
  });
  reviews.set(stampId, {
    id: stampId,
    empresa_id: admin.empresa_id,
    estado: 'aprobada',
    revision: 1,
    presupuesto_id: stampTemplate.id,
    borrador: stampTemplate,
  });

  const db = {
    from(table) {
      let filters = [];
      let inFilter = null;
      return {
        select() { return this; },
        eq(k, v) { filters.push((r) => r[k] === v); return this; },
        in(k, arr) { inFilter = (r) => arr.includes(r[k]); return this; },
        order() { return this; },
        limit: async (n) => {
          const list = table === 'obrabot_cotizaciones' ? [...reviews.values()] : [];
          return {
            data: list.filter((r) => filters.every((f) => f(r)) && (!inFilter || inFilter(r))).slice(0, n),
          };
        },
        async maybeSingle() {
          const list = table === 'obrabot_cotizaciones' ? [...reviews.values()] : [];
          return { data: list.find((r) => filters.every((f) => f(r))) || null };
        },
      };
    },
    async rpc(name, args) {
      if (name === 'obrabot_registrar_cotizacion') {
        reviews.set(args.p_id, {
          id: args.p_id,
          empresa_id: args.p_empresa,
          estado: 'pendiente',
          revision: 1,
          presupuesto_id: null,
          borrador: args.p_borrador,
        });
        return {};
      }
      throw new Error(name);
    },
  };

  // 1. Edición multilínea sin $ buscando cotización por nombre sin candidateIds
  const editMsg =
    'Podemos modificar el presupuesto del hormigón estampado el de obras exteriores y remodelación\n' +
    'Al valor de paneles perimetrales a 3.158.000';
  const editReply = await tryNaturalQuoteEdit(db, admin, 'whatsapp', editMsg, [], false, 'req-hbm-edit');
  assert.ok(editReply);
  assert.match(editReply.respuesta, /Forma de pago:/);
  assert.match(editReply.respuesta, /12\.230\.000/);
  assert.match(editReply.respuesta, /7\.338\.000/);
  assert.match(editReply.respuesta, /4\.892\.000/);
  const updatedRow = reviews.get(editReply.solicitud);
  assert.equal(updatedRow.borrador.partidas_venta[2].subtotal, 3158000);
  assert.equal(updatedRow.borrador.partidas_venta[2].tipo, 'partida');
  assert.match(updatedRow.borrador.resumen_ejecutivo, /Hormigón estampado H25/);

  // 2. Pegado rápido: "Me haces esta cotización" + precio en la línea siguiente + reutilización de descripción técnica
  const pastedMsg = [
    'Me haces esta cotización',
    '35.5 mts cuadrados hormigón estampado',
    '$ 1.242.500',
    'Camara hormigón $ 95.000',
    'Retiro de escombro $ 60.000',
    '',
    'Total $ 1.397.500',
  ].join('\n');
  assert.equal(isPastedQuote(pastedMsg), true);
  const pastedReply = await handleQuoteTurn(db, admin, 'whatsapp', pastedMsg, 'req-estampado-35');
  assert.ok(pastedReply);
  assert.match(pastedReply.respuesta, /1\.397\.500/);
  const createdRow = reviews.get(pastedReply.solicitud);
  assert.equal(createdRow.borrador.partidas_venta.length, 3);
  assert.equal(createdRow.borrador.partidas_venta[0].cantidad, 35.5);
  assert.equal(createdRow.borrador.partidas_venta[0].subtotal, 1242500);
  assert.match(createdRow.borrador.resumen_ejecutivo, /sellador UV/);
});

test('readPastedQuote extrae materiales considerados sin precio desde un presupuesto agrupado sin dejarlos en resumen_ejecutivo', () => {
  const { readPastedQuote } = require('../lib/obrabot/quote-message.ts');
  const { normalizeQuote } = require('../lib/ai/protocol.ts');
  const { buildQuoteDocument } = require('../lib/quotes/document.ts');
  const { createQuotePdf } = require('../lib/quotes/pdf.ts');

  const parsed = readPastedQuote([
    'Cotización Portón peatonal WPC',
    'Materiales considerados:',
    '13 Deck WPC de 25 mm',
    '2 Perfil tubular 70 × 30 × 2 mm',
    '1 Perfil tubular 50 × 50 × 2 mm',
    '3 Canal 25 × 25 × 2 mm',
    '1 Cerradura',
    'Anticorrosivo',
    'Brocha y rodillo',
    '2 kg Soldadura',
    '10 Discos de corte',
    '2 Discos prelaminados',
    'Materiales $ 335.000',
    'Mano de obra $ 280.000',
    'Total $ 615.000',
  ].join('\n'));

  assert.equal(parsed.materiales_considerados?.length, 10);
  assert.equal(parsed.resumen_ejecutivo, '');

  const normalized = normalizeQuote({
    ...parsed,
    modo_presupuesto: 'precio_acordado',
    materiales: [],
    mano_de_obra: [],
    actividades_gantt: [],
  });
  const doc = buildQuoteDocument(normalized);
  assert.equal(doc.isGroupedSummaryOnly, true);
  assert.equal(doc.materialesConsiderados.length, 10);
  assert.equal(doc.materialesConsiderados[0].cantidadTexto, '13');
  assert.equal(doc.materialesConsiderados[1].cantidadTexto, '2');
  assert.equal(doc.materialesConsiderados[5].cantidadTexto, '—');
  assert.equal(doc.materialesConsiderados[7].cantidadTexto, '2 kg');
  assert.deepEqual(doc.resumenEconomico, [
    { label: 'MATERIALES', amount: 335000 },
    { label: 'MANO DE OBRA', amount: 280000 },
  ]);
  assert.equal(doc.total, 615000);

  const pdf = createQuotePdf(doc);
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.equal(pdf.lastAutoTable.body.length, 10);
});
