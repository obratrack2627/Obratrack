require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { applyNaturalQuoteEdit } = require('../lib/obrabot/quote-edit-natural.ts');
const { isQuoteWorkflow, parseQuoteMessage } = require('../lib/obrabot/quotes.ts');
const {
  isCommercialQuoteStatusCommand,
  handleCommercialQuoteStatusCommand,
} = require('../lib/quotes/commercial-status.ts');
const {
  parseMilestonePaymentCommand,
  parseExtraWorkCommand,
  parseWorkerTratoCommand,
  resolveChileanFieldOpsTurn,
} = require('../lib/ai/chilean-field-ops.ts');
const { checkActionPermissions } = require('../lib/ai/permissions.ts');
const { normalizeQuote } = require('../lib/ai/protocol.ts');

function sampleQuote() {
  return normalizeQuote({
    titulo_proyecto: 'Remodelación baño Maipú',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    resumen_ejecutivo: '• Demolición cerámica\n• Instalación porcelanato\n• Grifería',
    partidas_venta: [
      { nombre: 'Remodelación baño', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 2000000, tipo: 'partida' },
    ],
    hitos_pago: [
      { nombre: 'Inicio del proyecto', porcentaje: 60 },
      { nombre: 'Al finalizar el proyecto', porcentaje: 40 },
    ],
    materiales: [],
    mano_de_obra: [],
  });
}

test('Opción A1: descuentos y recargos porcentuales recalculan partidas, IVA e hitos', () => {
  const base = sampleQuote();
  const discounted = applyNaturalQuoteEdit(base, 'hazle un 10% de descuento');
  assert.ok(discounted);
  const qDisc = normalizeQuote({ ...base, ...discounted });
  assert.equal(qDisc.estructura_financiera.precio_total_con_iva, 1800000);
  assert.equal(qDisc.hitos_pago?.[0]?.monto, 1080000);
  assert.equal(qDisc.hitos_pago?.[1]?.monto, 720000);
  assert.match(qDisc.resumen_ejecutivo || '', /Demolición cerámica/);

  const disc2 = applyNaturalQuoteEdit(base, 'bájale un 5%');
  assert.equal(disc2?.partidas_venta[0].subtotal, 1900000);

  const surcharged = applyNaturalQuoteEdit(base, 'súbele un 15% por urgencia');
  assert.ok(surcharged);
  assert.equal(surcharged.partidas_venta[0].subtotal, 2300000);
});

test('Opción A2: cotización en UF convierte con valor UF explícito y exige valor si falta', async () => {
  const ufNoRate = [
    'Presupuesto ampliación quincho Pirque',
    'Estructura y cubierta madera 100 UF + IVA',
  ].join('\n');
  assert.equal(isQuoteWorkflow(ufNoRate), true);
  await assert.rejects(
    () => parseQuoteMessage(ufNoRate),
    /valor de (?:la )?UF/i,
  );

  const ufWithRate = [
    'Presupuesto ampliación quincho Pirque',
    'UF $38.500',
    'Estructura y cubierta madera 100 UF + IVA',
    '50% inicio y 50% entrega',
  ].join('\n');
  assert.equal(isQuoteWorkflow(ufWithRate), true);
  const parsed = await parseQuoteMessage(ufWithRate);
  assert.equal(parsed.tratamiento_iva, 'neto');
  assert.equal(parsed.partidas_venta[0].subtotal, 3850000);
  assert.equal(parsed.hitos_pago?.length, 2);
  assert.match(parsed.observaciones || '', /\$38\.500/);
});

test('Opción A3: seguimiento comercial de cotizaciones (listar, enviada, aceptada, rechazada, RBAC)', async () => {
  const qBath = sampleQuote();
  const revImmId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const dbState = {
    budgets: [
      { id: 'wa:bath', empresa_id: 'emp-1', estado: 'aprobada', proyecto_id: null, cotizacion: qBath, updated_at: '2026-11-26T00:00:00Z' },
      { id: `obrabot-v2:${revImmId}`, empresa_id: 'emp-1', estado: 'aprobada', proyecto_id: null, cotizacion: { ...qBath, titulo_proyecto: 'Portón Lo Barnechea' }, updated_at: '2026-11-25T20:00:00Z' },
    ],
    reviews: [],
  };
  const db = createCommercialDb(dbState);
  const admin = { id: 'u-adm', empresa_id: 'emp-1', rol: 'admin' };
  const worker = { id: 'u-ter', empresa_id: 'emp-1', rol: 'terreno' };

  assert.equal(isCommercialQuoteStatusCommand('¿Qué cotizaciones tengo esperando respuesta del cliente?'), true);
  assert.equal(isCommercialQuoteStatusCommand('Marca la cotización del baño Maipú como enviada'), true);
  assert.equal(isCommercialQuoteStatusCommand('Claudio aceptó la cotización'), true);
  assert.equal(isCommercialQuoteStatusCommand('El cliente rechazó el presupuesto'), true);
  assert.equal(isCommercialQuoteStatusCommand('aprueba cotización dddddddd-dddd-4ddd-8ddd-dddddddddddd 1'), false);

  await assert.rejects(
    () => handleCommercialQuoteStatusCommand(db, worker, 'whatsapp', 'Marca la cotización como enviada', []),
    /administrador|supervisor/i,
  );

  const sentReply = await handleCommercialQuoteStatusCommand(
    db,
    admin,
    'whatsapp',
    'Marca la cotización de Remodelación baño Maipú como enviada',
    [{ kind: 'budget', id: 'wa:bath' }],
  );
  assert.match(sentReply?.respuesta || '', /enviada al cliente/i);
  assert.equal(dbState.budgets[0].estado, 'enviada');

  const listReply = await handleCommercialQuoteStatusCommand(
    db,
    admin,
    'whatsapp',
    '¿Qué cotizaciones tengo esperando respuesta del cliente?',
    [],
  );
  assert.match(listReply?.respuesta || '', /Remodelación baño Maipú/);
  assert.match(listReply?.respuesta || '', /Enviada al cliente/);

  const acceptedReply = await handleCommercialQuoteStatusCommand(
    db,
    admin,
    'whatsapp',
    'Claudio aceptó la cotización',
    [{ kind: 'budget', id: 'wa:bath' }],
  );
  assert.match(acceptedReply?.respuesta || '', /aceptó «Remodelación baño Maipú»/i);
  assert.equal(dbState.budgets[0].estado, 'aprobada');

  const immSent = await handleCommercialQuoteStatusCommand(
    db,
    admin,
    'whatsapp',
    'Marca como enviada',
    [{ kind: 'budget', id: `obrabot-v2:${revImmId}` }],
  );
  assert.match(immSent?.respuesta || '', /enviada al cliente/i);
  assert.equal(dbState.budgets[1].estado, 'aprobada');

  const rejReply = await handleCommercialQuoteStatusCommand(
    db,
    admin,
    'whatsapp',
    'El cliente rechazó la cotización de baño Maipú',
    [{ kind: 'budget', id: 'wa:bath' }],
  );
  assert.match(rejReply?.respuesta || '', /rechazada/i);
  assert.equal(dbState.budgets[0].estado, 'rechazada');
});

test('Opción C: pagos por hito %, obras extras (adicionales) y tratos de maestros', () => {
  const projects = [
    { id: 'p-maipu', nombre: 'Remodelación baño Maipú', estado: 'activo', monto_cotizado: 1800000 },
  ];
  const users = [
    { id: 'u-fel', nombre: 'Felipe Poblete', rol: 'terreno' },
    { id: 'u-mar', nombre: 'Martín Villalobos', rol: 'terreno' },
  ];

  // 1. Pago de hito 60% inicial / 40% saldo final
  const hit60 = parseMilestonePaymentCommand({
    text: 'Claudio pagó el 60% inicial de Remodelación baño Maipú',
    userRole: 'admin',
    projects,
  });
  assert.ok(hit60);
  assert.equal(hit60.accion.tipo, 'registrar_pago');
  assert.equal(hit60.accion.monto, 1080000);
  assert.equal(hit60.accion.metodo, 'transferencia');
  assert.match(hit60.accion.nota, /60%.*anticipo inicial/);
  assert.equal(checkActionPermissions({ rol: 'admin', id: 'adm' }, hit60.accion, 'Claudio pagó el 60% inicial').length, 1);

  const hit40Cash = parseMilestonePaymentCommand({
    text: 'Recibí el 40% final en efectivo',
    userRole: 'supervisor',
    projects,
    activeProjectId: 'p-maipu',
  });
  assert.equal(hit40Cash?.accion.monto, 720000);
  assert.equal(hit40Cash?.accion.metodo, 'efectivo');

  assert.equal(
    parseMilestonePaymentCommand({
      text: 'Claudio pagó el 60% inicial en Remodelación baño Maipú',
      userRole: 'terreno',
      projects,
    }),
    null,
  );

  // 2. Obra extra / adicional con monto CLP y días
  const extra = parseExtraWorkCommand({
    text: 'El cliente pidió adicional punto eléctrico y llave de paso por $140.000 y 2 días en Remodelación baño Maipú',
    userRole: 'admin',
    projects,
  });
  assert.ok(extra);
  assert.equal(extra.accion.tipo, 'crear_solicitud_cambio');
  assert.equal(extra.accion.monto, 140000);
  assert.equal(extra.accion.dias, 2);
  assert.equal(checkActionPermissions({ rol: 'terreno', id: 'u-fel' }, extra.accion, extra.accion.descripcion).length, 1);

  // 3. Trato a trabajador (pagado vs por pagar)
  const tratoPaid = parseWorkerTratoCommand({
    text: 'Le pagué 180 lucas de trato a Felipe por la cerámica en Remodelación baño Maipú',
    userRole: 'admin',
    projects,
    users,
  });
  assert.ok(tratoPaid);
  assert.equal(tratoPaid.accion.tipo, 'registrar_imprevisto');
  assert.equal(tratoPaid.accion.categoria_gasto, 'mano_obra');
  assert.equal(tratoPaid.accion.usuario_id, 'u-fel');
  assert.equal(tratoPaid.accion.monto, 180000);
  assert.equal(tratoPaid.accion.pagado, true);
  assert.equal(checkActionPermissions({ rol: 'admin', id: 'adm' }, tratoPaid.accion, tratoPaid.accion.descripcion).length, 1);

  const tratoUnpaid = resolveChileanFieldOpsTurn({
    text: 'Acordamos trato con Martín por $220.000 para pintura',
    userRole: 'supervisor',
    projects,
    activeProjectId: 'p-maipu',
    users,
  });
  assert.equal(tratoUnpaid?.accion.usuario_id, 'u-mar');
  assert.equal((tratoUnpaid?.accion).pagado, undefined);
});

function createCommercialDb(state) {
  return {
    from(table) {
      const filters = [];
      let inFilter = null;
      const match = (row) =>
        filters.every(([c, v]) => (c === 'cotizacion->>id' ? row.cotizacion?.id === v : row[c] === v)) &&
        (!inFilter || inFilter[1].includes(row[inFilter[0]]));
      const chain = {
        select() { return this; },
        eq(c, v) { filters.push([c, v]); return this; },
        in(c, vals) { inFilter = [c, vals]; return this; },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() {
          const src = table === 'presupuestos' ? state.budgets : state.reviews;
          return { data: src.find(match) || null, error: null };
        },
        update(patch) {
          return {
            eq(c1, v1) {
              filters.push([c1, v1]);
              return {
                async eq(c2, v2) {
                  filters.push([c2, v2]);
                  const src = table === 'presupuestos' ? state.budgets : state.reviews;
                  for (const row of src) {
                    if (match(row)) Object.assign(row, patch);
                  }
                  return { error: null };
                },
              };
            },
          };
        },
        then(resolve) {
          const src = table === 'presupuestos' ? state.budgets : state.reviews;
          resolve({ data: src.filter(match), error: null });
        },
      };
      return chain;
    },
  };
}
