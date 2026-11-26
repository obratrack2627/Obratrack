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

test('adapta presupuestos de suma alzada (caso cocina WhatsApp), detalle material por material, sin fecha y fallback IA', async () => {
  const { isPastedQuote, readPastedQuote } = require('../lib/obrabot/quote-message.ts');
  const { parseQuoteMessage } = require('../lib/obrabot/quotes.ts');
  const { parseNaturalQuoteWithAI } = require('../lib/obrabot/quote-ai-parser.ts');
  const { normalizeQuote } = require('../lib/ai/protocol.ts');
  const { buildQuoteDocument } = require('../lib/quotes/document.ts');
  const { createQuotePdf } = require('../lib/quotes/pdf.ts');

  // 1. Caso exacto de la captura de WhatsApp: suma alzada + 9 tareas con viñeta "·" + sin fecha + pagos 60%/40% con montos en línea siguiente
  const kitchenMsg = [
    'Me haces esta cotización con la plantilla de hbm sin fecha',
    'Presupuesto padre hurtado',
    '',
    'Realización de cocina trabajos a realizar :',
    '',
    '· demolición',
    '· red de agua - gas y sanitaria',
    '· instalación de cerámico de piso',
    '· instalación de porcelanato muro ( sectores donde irá a la vista )',
    '· instalación eléctrica',
    '· realización de tabiquería sector puerta - refrigerador y ventana',
    '· Empastado y pintado de techumbre ( solo sector donde se empasto )',
    '· traslado de material',
    '· retiro de escombro',
    '',
    'Total de proyecto $ 2.247.000',
    '',
    'Para dar inicio al proyecto se solicitará el 60% del presupuesto',
    '$ 1.342.800',
    '',
    'Al finalizar el proyecto se solicitara el 40 % restante',
    '$898.800',
  ].join('\n');

  assert.equal(isPastedQuote(kitchenMsg), true);
  const kitchen = readPastedQuote(kitchenMsg);
  assert.equal(kitchen.mostrar_fecha, false);
  assert.equal(kitchen.titulo_proyecto, 'Presupuesto padre hurtado');
  assert.equal(kitchen.partidas_venta.length, 1);
  assert.equal(kitchen.partidas_venta[0].nombre, 'Realización de cocina');
  assert.equal(kitchen.partidas_venta[0].subtotal, 2247000);
  assert.equal(kitchen.partidas_venta[0].tipo, 'partida');
  assert.equal(kitchen.materiales_considerados, undefined);
  assert.match(kitchen.resumen_ejecutivo, /demolición/);
  assert.match(kitchen.resumen_ejecutivo, /retiro de escombro/);
  assert.deepEqual(kitchen.hitos_pago, [
    { nombre: 'Inicio del proyecto', porcentaje: 60 },
    { nombre: 'Al finalizar el proyecto', porcentaje: 40 },
  ]);
  assert.equal(kitchen.condiciones_pago, undefined);
  assert.match(kitchen.aviso_validacion || '', /\$1\.348\.200.*\$1\.342\.800/);

  const kitchenDraft = normalizeQuote({
    ...kitchen,
    modo_presupuesto: 'precio_acordado',
    materiales: [],
    mano_de_obra: [],
    actividades_gantt: [],
  });
  const kitchenDoc = buildQuoteDocument(kitchenDraft);
  assert.equal(kitchenDoc.fecha, '');
  assert.equal(kitchenDoc.total, 2247000);
  assert.match(kitchenDoc.condiciones, /\$ 1\.348\.200/);
  assert.match(kitchenDoc.condiciones, /\$ 898\.800/);
  const kitchenPdf = createQuotePdf(kitchenDoc);
  assert.equal(Buffer.from(kitchenPdf.output('arraybuffer')).subarray(0, 5).toString(), '%PDF-');

  // 2. Suma alzada mínima: solo título general y total
  const minimal = readPastedQuote([
    'Me haces esta cotización',
    'Remodelación baño principal',
    'Total $ 1.500.000',
  ].join('\n'));
  assert.equal(minimal.partidas_venta.length, 1);
  assert.equal(minimal.partidas_venta[0].nombre, 'Remodelación baño principal');
  assert.equal(minimal.partidas_venta[0].subtotal, 1500000);

  // 3. Detalle material por material con precio unitario
  const itemized = readPastedQuote([
    'Presupuesto techumbre bodega',
    '12 planchas zinc $ 11.500 c/u',
    '2 cajas tornillos techo $ 8.900 c/u',
    '4 caballetes $ 6.200 c/u',
  ].join('\n'));
  assert.deepEqual(itemized.partidas_venta.map((p) => p.tipo), ['material', 'material', 'material']);
  assert.equal(itemized.partidas_venta.reduce((s, p) => s + p.subtotal, 0), 12 * 11500 + 2 * 8900 + 4 * 6200);
  const itemizedDoc = buildQuoteDocument(normalizeQuote({
    ...itemized,
    modo_presupuesto: 'precio_acordado',
    materiales: [],
    mano_de_obra: [],
    actividades_gantt: [],
  }));
  assert.equal(itemizedDoc.partidasSeccion.length, 0);
  assert.equal(itemizedDoc.materialesSeccion.length, 3);

  // 4. Suma alzada + materiales considerados sin precio unitario
  const fence = readPastedQuote([
    'Presupuesto reja antejardín',
    'Materiales:',
    '4 Perfil tubular 50x50',
    'Anticorrosivo',
    'Total $ 580.000',
  ].join('\n'));
  assert.equal(fence.partidas_venta.length, 1);
  assert.equal(fence.partidas_venta[0].subtotal, 580000);
  assert.equal(fence.materiales_considerados?.length, 2);
  assert.equal(fence.resumen_ejecutivo, '');

  // 5. Fallback inteligente con IA cuando el texto viene en prosa libre
  const proseQuote = 'Por favor arma una cotización sin fecha para arreglar el baño de la casa por un total de $1.800.000 pagando mitad al inicio y mitad al finalizar.';
  const aiParsed = await parseQuoteMessage(proseQuote, undefined, 'incluido', async () => JSON.stringify({
    legible: true,
    titulo_proyecto: 'Reparación de baño',
    mostrar_fecha: false,
    tratamiento_iva: 'incluido',
    total_declarado: 1800000,
    partidas_venta: [{ nombre: 'Reparación completa de baño', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 1800000, tipo: 'partida' }],
    hitos_pago: [{ nombre: 'Inicio', porcentaje: 50 }, { nombre: 'Término', porcentaje: 50 }],
  }));
  assert.equal(aiParsed.mostrar_fecha, false);
  assert.equal(aiParsed.partidas_venta[0].subtotal, 1800000);
  assert.equal(aiParsed.hitos_pago?.length, 2);

  // Validación aritmética determinista incluso sobre la respuesta de la IA
  await assert.rejects(
    parseNaturalQuoteWithAI(proseQuote, {}, async () => JSON.stringify({
      legible: true,
      tratamiento_iva: 'incluido',
      total_declarado: 2000000,
      partidas_venta: [{ nombre: 'Reparación', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 1800000, tipo: 'partida' }],
    })),
    /2\.000\.000.*1\.800\.000/,
  );
});

test('emisión directa autoAprobar guarda metadatos, genera PDF en 1 paso e hidrata estado del cliente en bandeja', async () => {
  const { handleQuoteTurn, listQuotes } = require('../lib/obrabot/quotes.ts');
  const admin = { id: 'admin', empresa_id: 'emp-fast', rol: 'admin' };
  const reviews = new Map();
  const budgets = new Map();

  const db = {
    from(table) {
      let filters = [];
      let inFilter = null;
      return {
        async upsert() { return { error: null }; },
        select() { return this; },
        eq(k, v) { filters.push((r) => r[k] === v); return this; },
        in(k, arr) { inFilter = (r) => arr.includes(r[k]); return this; },
        order() { return this; },
        limit() {
          const pool = table === 'obrabot_cotizaciones'
            ? [...reviews.values()]
            : table === 'presupuestos'
              ? [...budgets.values()]
              : [];
          return { data: pool.filter((r) => filters.every((f) => f(r))), error: null };
        },
        then(resolve, reject) {
          const pool = table === 'obrabot_cotizaciones'
            ? [...reviews.values()]
            : table === 'presupuestos'
              ? [...budgets.values()]
              : [];
          const data = pool.filter((r) => filters.every((f) => f(r)) && (!inFilter || inFilter(r)));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
        async maybeSingle() {
          const pool = table === 'obrabot_cotizaciones'
            ? [...reviews.values()]
            : table === 'presupuestos'
              ? [...budgets.values()]
              : [];
          return { data: pool.find((r) => filters.every((f) => f(r))) || null, error: null };
        },
      };
    },
    async rpc(name, args) {
      if (name === 'obrabot_registrar_cotizacion') {
        if (!reviews.has(args.p_id)) {
          reviews.set(args.p_id, {
            id: args.p_id,
            empresa_id: args.p_empresa,
            estado: 'pendiente',
            revision: 1,
            borrador: args.p_borrador,
            presupuesto_id: null,
          });
        }
        return { error: null };
      }
      if (name === 'obrabot_revisar_cotizacion') {
        const row = reviews.get(args.p_id);
        row.estado = 'aprobada';
        row.presupuesto_id = row.borrador.id;
        budgets.set(row.presupuesto_id, {
          id: row.presupuesto_id,
          empresa_id: row.empresa_id,
          estado: 'enviada',
          updated_at: '2026-11-26T00:00:00Z',
        });
        return { data: row, error: null };
      }
      throw new Error(name);
    },
  };

  const quickMsg = [
    'Nueva cotización:',
    'Presupuesto portón sur',
    'Materiales considerados:',
    '2 Perfil 50x50',
    'Anticorrosivo',
    'Materiales $ 120.000',
    'Mano de obra $ 180.000',
    'Total $ 300.000',
  ].join('\n');

  const res = await handleQuoteTurn(db, admin, 'plataforma', quickMsg, 'req-direct-1', undefined, {
    clienteNombre: 'Constructora Sur',
    comunaRegion: 'Padre Hurtado',
    mostrarFecha: false,
    fechaValidez: '2026-12-31',
    autoAprobar: true,
    permiteVincular: false,
  });

  assert.equal(res.archivo?.formato, 'pdf');
  assert.ok(res.cotizacionAprobadaId);
  assert.match(res.respuesta, /Sin fecha en PDF/);
  assert.match(res.respuesta, /Cliente: Constructora Sur/);
  assert.match(res.respuesta, /Ubicación: Padre Hurtado/);
  assert.match(res.respuesta, /Materiales considerados \(2\): Perfil 50x50, Anticorrosivo/);

  const approvedList = await listQuotes(db, admin, 'aprobada');
  assert.equal(approvedList.length, 1);
  assert.equal(approvedList[0].presupuesto_estado, 'enviada');
  assert.equal(approvedList[0].presupuesto_updated_at, '2026-11-26T00:00:00Z');
  assert.equal(approvedList[0].borrador.fecha_validez, '2026-12-31');
  assert.equal(approvedList[0].borrador.mostrar_fecha, false);
});

test('formato de confirmación en WhatsApp omite Por definir y destaca bloques, hitos y total cercano', async () => {
  const { handleQuoteTurn } = require('../lib/obrabot/quotes.ts');
  const admin = { id: 'admin', empresa_id: 'emp-wa-fmt', rol: 'admin' };
  const reviews = new Map();
  const db = {
    async rpc(name, args) {
      if (name === 'obrabot_registrar_cotizacion') {
        reviews.set(args.p_id, {
          id: args.p_id,
          empresa_id: args.p_empresa,
          estado: 'pendiente',
          revision: 1,
          borrador: { ...args.p_borrador, cliente_nombre: 'Por definir', comuna_region: 'Por definir' },
          presupuesto_id: null,
        });
        return { error: null };
      }
      throw new Error(name);
    },
    from() {
      let idFilter = null;
      return {
        select() { return this; },
        eq(k, v) { if (k === 'id') idFilter = v; return this; },
        async maybeSingle() { return { data: reviews.get(idFilter) || null, error: null }; },
      };
    },
  };

  const reply = await handleQuoteTurn(db, admin, 'whatsapp', [
    'Me haces esta cotización sin fecha',
    'Presupuesto remodelación baño Maipú',
    'Remodelación baño principal trabajos a realizar :',
    '· demolición',
    '· instalación de porcelanato',
    '· retiro de escombro',
    'Total de proyecto $ 1.850.000',
    'Para dar inicio al proyecto se solicitará el 60% del presupuesto',
    '$ 1.110.000',
    'Al finalizar el proyecto se solicitará el 40% restante',
    '$ 740.000',
  ].join('\n'), 'req-wa-format-1');

  assert.doesNotMatch(reply.respuesta, /Por definir/);
  assert.match(reply.respuesta, /\*📋 Presupuesto remodelación baño Maipú\*/);
  assert.match(reply.respuesta, /_Rev\. 1 · IVA incluido · Sin fecha en PDF_/);
  assert.match(reply.respuesta, /_Incluye 3 trabajos detallados en el alcance del PDF\._/);
  assert.match(reply.respuesta, /\*💳 Forma de pago:\*/);
  assert.match(reply.respuesta, /\*💰 Resumen\*/);
  assert.match(reply.respuesta, /\*Total: \$1\.850\.000\*/);
  assert.ok(reply.respuesta.length < 1024);
});

test('corrige chat real: subjuntivo en edición preserva alcance/hitos, ignora equipo para presupuesto y extrae Gantt y materiales', () => {
  const { readPastedQuote } = require('../lib/obrabot/quote-message.ts');
  const { applyNaturalQuoteEdit } = require('../lib/obrabot/quote-edit-natural.ts');
  const { normalizeQuote } = require('../lib/ai/protocol.ts');
  const { teamAssignmentIntake } = require('../lib/ai/team-assignment.ts');
  const { appliesQuoteToExistingProject, quotedProjectDraft } = require('../lib/whatsapp/quote-intake.ts');
  const { extractQuoteGanttTasks, extractQuoteMaterials } = require('../lib/quotes/project-bridge.ts');
  const { projectLiterals } = require('../lib/whatsapp/project-literals.ts');

  // 1. Edición natural con subjuntivo ("dejes el total en 1.800.000, arregla el pdf") preserva las 8 tareas, sin fecha e hitos 60/40
  const initialParsed = readPastedQuote([
    'Me haces esta cotización sin fecha',
    'Presupuesto remodelación baño Maipú',
    'Remodelación baño principal trabajos a realizar :',
    '· demolición de cerámica existente',
    '· red de agua potable y alcantarillado',
    '· instalación de porcelanato piso y muros',
    '· instalación de vanitorio, WC y ducha',
    '· instalación eléctrica y extractor',
    '· empastado y pintado de cielo',
    '· traslado de material',
    '· retiro de escombro',
    'Total de proyecto $ 1.850.000',
    'Para dar inicio al proyecto se solicitará el 60% del presupuesto',
    '$ 1.110.000',
    'Al finalizar el proyecto se solicitará el 40% restante',
    '$ 740.000',
  ].join('\n'));

  const initialQuote = normalizeQuote({
    ...initialParsed,
    modo_presupuesto: 'precio_acordado',
    materiales: [],
    mano_de_obra: [],
    actividades_gantt: [],
  });

  const editPatch = applyNaturalQuoteEdit(
    initialQuote,
    'esta bien pero quiero que dejes el total en 1.800.000, arregla el pdf',
  );
  assert.ok(editPatch);
  assert.equal(editPatch.partidas_venta[0].subtotal, 1800000);
  assert.equal(editPatch.mostrar_fecha, false);
  assert.match(editPatch.resumen_ejecutivo || '', /retiro de escombro/);

  const editedQuote = normalizeQuote({
    ...editPatch,
    modo_presupuesto: 'precio_acordado',
    materiales: editPatch.materiales ?? [],
    mano_de_obra: editPatch.mano_de_obra ?? [],
    actividades_gantt: editPatch.actividades_gantt ?? [],
  });
  assert.equal(editedQuote.estructura_financiera.precio_total_con_iva, 1800000);
  assert.deepEqual(editedQuote.hitos_pago.map((h) => h.monto), [1080000, 720000]);

  // 2. Gantt y materiales desde presupuesto suma alzada y con materiales considerados
  const ganttFromScope = extractQuoteGanttTasks(editedQuote);
  assert.equal(ganttFromScope.length, 8);
  assert.equal(ganttFromScope[0].nombre, 'Demolición de cerámica existente');
  const draft = quotedProjectDraft(editedQuote);
  assert.equal(draft.partidas.length, 8);

  const materialsQuote = normalizeQuote({
    titulo_proyecto: 'Portón peatonal WPC',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    partidas_venta: [
      { nombre: 'Fabricación e instalación portón WPC', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 280000, tipo: 'partida' },
      { nombre: 'Perfil tubular 50x50', unidad: 'barra', cantidad: 3, precio_unitario: 15000, tipo: 'material' },
    ],
    materiales: [],
    materiales_considerados: [{ nombre: 'Anticorrosivo', cantidad: null }, { nombre: 'Soldadura', cantidad: 2, unidad: 'kg' }],
    mano_de_obra: [],
  });
  const extractedMats = extractQuoteMaterials(materialsQuote);
  assert.deepEqual(
    extractedMats.map((m) => ({ nombre: m.nombre, cantidad: m.cantidad, unidad: m.unidad })),
    [
      { nombre: 'Perfil tubular 50x50', cantidad: 3, unidad: 'barra' },
      { nombre: 'Anticorrosivo', cantidad: 1, unidad: 'un' },
      { nombre: 'Soldadura', cantidad: 2, unidad: 'kg' },
    ],
  );
  assert.equal(quotedProjectDraft(materialsQuote).materiales.length, 3);

  // 3. Guard de equipo nunca confunde "agrega tambien el presupuesto a la obra" con un trabajador
  const team = teamAssignmentIntake(
    'agrega tambien el presupuesto a la obra',
    [{ id: 'p-1', nombre: 'Remodelacción baño Maipu' }],
    [{ id: 'u-1', nombre: 'Felipe Poblete', rol: 'terreno' }],
    'p-1',
  );
  assert.equal(team, null);

  // 4. Detección de aplicación de presupuesto a obra existente (indicativo y subjuntivo) + cliente inline
  assert.equal(appliesQuoteToExistingProject('agrega tambien el presupuesto a la obra'), true);
  assert.equal(appliesQuoteToExistingProject('necesito que agregues el presupuesto a la obra'), true);
  assert.equal(
    projectLiterals('genial, ahora crea la obra para el cliente claudio zapata, añade la gantt sugerida', draft).cliente_nombre,
    'claudio zapata',
  );
});
