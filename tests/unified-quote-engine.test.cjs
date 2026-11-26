require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveUnifiedQuoteStage,
  unifiedStageLabel,
  extractWhatsAppQuoteRefs,
  extractWebQuoteRefs,
  resolveUnifiedQuote,
} = require('../lib/quotes/unified.ts');
const { tryNaturalQuoteEdit } = require('../lib/obrabot/quotes.ts');
const { budgetApplication } = require('../lib/quotes/application.ts');
const { normalizeQuote } = require('../lib/ai/protocol.ts');

test('deriveUnifiedQuoteStage y unifiedStageLabel cubren el ciclo de vida unificado', () => {
  assert.equal(deriveUnifiedQuoteStage({ reviewEstado: 'pendiente' }), 'pendiente_revision');
  assert.equal(deriveUnifiedQuoteStage({ reviewEstado: 'devuelta' }), 'borrador');
  assert.equal(deriveUnifiedQuoteStage({ reviewEstado: 'aprobada', presupuestoEstado: 'aprobada' }), 'aprobada');
  assert.equal(deriveUnifiedQuoteStage({ presupuestoEstado: 'enviada' }), 'enviada');
  assert.equal(deriveUnifiedQuoteStage({ presupuestoEstado: 'rechazada' }), 'rechazada');
  assert.equal(deriveUnifiedQuoteStage({ presupuestoEstado: 'anulada' }), 'anulada');
  assert.equal(deriveUnifiedQuoteStage({ presupuestoEstado: 'no_elegida' }), 'anulada');
  assert.equal(deriveUnifiedQuoteStage({ reviewEstado: 'aprobada', proyectoId: 'proy-1' }), 'vinculada_a_obra');
  assert.equal(deriveUnifiedQuoteStage({ presupuestoEstado: 'borrador', hasDestination: true }), 'vinculada_a_obra');

  assert.equal(unifiedStageLabel('borrador'), 'Borrador');
  assert.equal(unifiedStageLabel('pendiente_revision'), 'Pendiente de revisión');
  assert.equal(unifiedStageLabel('aprobada'), 'Aprobada');
  assert.equal(unifiedStageLabel('enviada'), 'Enviada al cliente');
  assert.equal(unifiedStageLabel('aceptada_cliente'), 'Aceptada por cliente');
  assert.equal(unifiedStageLabel('rechazada'), 'Rechazada');
  assert.equal(unifiedStageLabel('anulada'), 'Anulada');
  assert.equal(unifiedStageLabel('vinculada_a_obra'), 'Vinculada a obra');
});

test('extractWhatsAppQuoteRefs y extractWebQuoteRefs preservan orden de recencia y deduplican', () => {
  const reviewId = '11111111-1111-4111-8111-111111111111';
  const reviewId2 = '22222222-2222-4222-8222-222222222222';
  const nowIso = new Date().toISOString();
  const expiredIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const waRows = [
    { message_id: 'm1', created_at: nowIso, acciones: { presupuesto_pdf_id: 'wa:b1' } },
    { message_id: 'm2', created_at: nowIso, acciones: { solicitud_cotizacion: reviewId } },
    { message_id: 'm3', created_at: nowIso, cotizacion: { id: 'cot-b1' }, acciones: { presupuesto_pdf_id: 'wa:b1' } },
    { message_id: 'm4', created_at: expiredIso, acciones: { solicitud_cotizacion: reviewId2 } },
  ];

  const recentRefs = extractWhatsAppQuoteRefs(waRows, undefined, { maxAgeMs: 12 * 60 * 60 * 1000 });
  assert.deepEqual(recentRefs, [
    { kind: 'budget', id: 'wa:b1' },
    { kind: 'review', id: reviewId },
    { kind: 'budget', id: 'cot-b1' },
  ]);

  const repliedRefs = extractWhatsAppQuoteRefs(waRows, 'm2');
  assert.deepEqual(repliedRefs, [{ kind: 'review', id: reviewId }]);

  const webTurns = [
    { remitente: 'agente', cotizacion_obrabot: { solicitud_cotizacion: reviewId }, cotizacion: null },
    { remitente: 'usuario', texto: 'ok' },
    { remitente: 'agente', cotizacion: { id: 'cot-web-1' }, accion_ejecutada: { tipo: 'obrabot_cotizacion', detalles: { cotizacion_aprobada_id: reviewId2 } } },
  ];
  const webRefs = extractWebQuoteRefs(webTurns, 'cot-context-9');
  assert.deepEqual(webRefs, [
    { kind: 'review', id: reviewId2 },
    { kind: 'budget', id: 'cot-web-1' },
    { kind: 'review', id: reviewId },
    { kind: 'budget', id: 'cot-context-9' },
  ]);
});

test('resolveUnifiedQuote resuelve entre obrabot_cotizaciones y presupuestos con enriquecimiento y coincidencia por título', async () => {
  const revId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const quoteBathroom = normalizeQuote({
    titulo_proyecto: 'Remodelación baño Maipú',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    partidas_venta: [{ nombre: 'Baño completo', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 1850000, tipo: 'partida' }],
    materiales: [],
    mano_de_obra: [],
  });
  const quoteKitchen = normalizeQuote({
    titulo_proyecto: 'Ampliación cocina Providencia',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    partidas_venta: [{ nombre: 'Cocina completa', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 2500000, tipo: 'partida' }],
    materiales: [],
    mano_de_obra: [],
  });

  const db = createMemoryQuoteDb({
    reviews: [
      { id: revId, empresa_id: 'emp-1', estado: 'aprobada', revision: 2, borrador: quoteBathroom, presupuesto_id: `obrabot-v2:${revId}`, actualizado_at: '2026-11-25T20:00:00Z' },
    ],
    budgets: [
      { id: `obrabot-v2:${revId}`, empresa_id: 'emp-1', estado: 'aprobada', proyecto_id: 'proy-99', updated_at: '2026-11-25T20:05:00Z', cotizacion: quoteBathroom },
      { id: 'wa:kitchen', empresa_id: 'emp-1', estado: 'enviada', proyecto_id: null, updated_at: '2026-11-25T21:00:00Z', cotizacion: quoteKitchen },
    ],
  });

  const actor = { id: 'usr-1', empresa_id: 'emp-1', rol: 'admin' };
  const resolvedRev = await resolveUnifiedQuote(db, actor, [{ kind: 'review', id: revId }]);
  assert.equal(resolvedRev?.origin, 'obrabot_revision');
  assert.equal(resolvedRev?.proyectoId, 'proy-99');
  assert.equal(resolvedRev?.stage, 'vinculada_a_obra');
  assert.equal(resolvedRev?.isImmutableBudget, true);

  const resolvedNative = await resolveUnifiedQuote(db, actor, [{ kind: 'budget', id: 'wa:kitchen' }]);
  assert.equal(resolvedNative?.origin, 'presupuesto');
  assert.equal(resolvedNative?.stage, 'enviada');
  assert.equal(resolvedNative?.isImmutableBudget, false);

  const resolvedByHint = await resolveUnifiedQuote(
    db,
    actor,
    [{ kind: 'budget', id: 'wa:kitchen' }, { kind: 'review', id: revId }],
    { titleHint: 'cambia el baño de Maipú' },
  );
  assert.equal(resolvedByHint?.reviewId, revId);
});

test('tryNaturalQuoteEdit actualiza presupuesto nativo en presupuestos preservando resumen, hitos y materiales', async () => {
  const nativeQuote = normalizeQuote({
    titulo_proyecto: 'Remodelación baño Maipú',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    resumen_ejecutivo: '• Demolición cerámica\n• Porcelanato muros y piso\n• Grifería ducha',
    partidas_venta: [{ nombre: 'Remodelación baño', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 1850000, tipo: 'partida' }],
    materiales_considerados: [{ nombre: 'Porcelanato gris', cantidad: 14, unidad: 'm2' }],
    hitos_pago: [
      { nombre: 'Inicio del proyecto', porcentaje: 60 },
      { nombre: 'Al finalizar el proyecto', porcentaje: 40 },
    ],
    materiales: [],
    mano_de_obra: [],
  });
  const revImmutableId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const db = createMemoryQuoteDb({
    reviews: [],
    budgets: [
      { id: 'wa:native-1', empresa_id: 'emp-1', estado: 'aprobada', proyecto_id: null, updated_at: '2026-11-25T22:00:00Z', cotizacion: nativeQuote },
      { id: `obrabot-v2:${revImmutableId}`, empresa_id: 'emp-1', estado: 'aprobada', proyecto_id: null, updated_at: '2026-11-25T22:00:00Z', cotizacion: nativeQuote },
    ],
  });

  const actor = { id: 'usr-1', empresa_id: 'emp-1', rol: 'admin' };
  const reply = await tryNaturalQuoteEdit(
    db,
    actor,
    'whatsapp',
    'deja el total en $1.800.000',
    [],
    true,
    'req-native-1',
    null,
    [{ kind: 'budget', id: 'wa:native-1' }],
  );

  assert.ok(reply);
  assert.equal(reply.presupuestoPdfId, 'wa:native-1');
  assert.equal(reply.cotizacion?.estructura_financiera.precio_total_con_iva, 1800000);
  assert.equal(reply.cotizacion?.hitos_pago?.[0]?.monto, 1080000);
  assert.equal(reply.cotizacion?.hitos_pago?.[1]?.monto, 720000);
  assert.equal(reply.cotizacion?.materiales_considerados?.length, 1);
  assert.match(reply.cotizacion?.resumen_ejecutivo || '', /Demolición cerámica/);
  assert.equal(db.state.budgets.find((b) => b.id === 'wa:native-1').cotizacion.estructura_financiera.precio_total_con_iva, 1800000);

  // Presupuesto obrabot-v2 inmutable nunca hace UPDATE directo en presupuestos; deriva nueva revisión.
  const immReply = await tryNaturalQuoteEdit(
    db,
    actor,
    'whatsapp',
    'deja el total en $1.750.000',
    [],
    true,
    'req-imm-1',
    null,
    [{ kind: 'budget', id: `obrabot-v2:${revImmutableId}` }],
  );
  assert.ok(immReply?.solicitud);
  assert.equal(immReply?.revision, 1);
  assert.equal(db.state.registeredRevisions.length, 1);
  assert.equal(db.state.budgets.find((b) => b.id === `obrabot-v2:${revImmutableId}`).cotizacion.estructura_financiera.precio_total_con_iva, 1850000);
});

test('budgetApplication genera tareas reales de Gantt y materiales desde partidas/alcance en cotización pactada', () => {
  const pactadaQuote = normalizeQuote({
    titulo_proyecto: 'Remodelación baño Maipú',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    duracion_dias_estimada: 10,
    resumen_ejecutivo: 'Trabajos a realizar:\n• Demolición cerámica existente\n• Instalación porcelanato\n• Instalación sanitarios\n• Pintura cielo',
    partidas_venta: [
      { nombre: 'Remodelación integral baño principal', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 1800000, tipo: 'partida' },
    ],
    materiales_considerados: [
      { nombre: 'Porcelanato piso y muro', cantidad: 16, unidad: 'm2' },
      { nombre: 'Adhesivo cerámico saco 25 kg', cantidad: 8, unidad: 'saco' },
    ],
    materiales: [],
    mano_de_obra: [],
  });
  const project = {
    id: 'proy-1',
    empresa_id: 'emp-1',
    nombre: 'Baño Maipú',
    fecha_inicio: '2026-12-01',
    fecha_termino_estimada: '2026-12-10',
    estado: 'activo',
    monto_cotizado: 1800000,
  };

  const applied = budgetApplication(pactadaQuote, project, [], null);
  assert.equal(applied.actividades.length, 4);
  assert.equal(applied.actividades[0].nombre, 'Demolición cerámica existente');
  assert.equal(applied.materiales_proyecto.length, 2);
  assert.equal(applied.materiales_proyecto[0].nombre, 'Porcelanato piso y muro');
  assert.equal(applied.materiales_proyecto[1].cantidad, 8);
});

function createMemoryQuoteDb({ reviews = [], budgets = [] }) {
  const state = {
    reviews: [...reviews],
    budgets: [...budgets],
    registeredRevisions: [],
  };

  const makeTable = (tableName) => {
    const filters = [];
    const chain = {
      _select: '*',
      select(cols) {
        this._select = cols;
        return this;
      },
      eq(col, val) {
        filters.push({ op: 'eq', col, val });
        return this;
      },
      in(col, vals) {
        filters.push({ op: 'in', col, val: vals });
        return this;
      },
      order() {
        return this;
      },
      limit(n) {
        this._limit = n;
        return this;
      },
      async maybeSingle() {
        const rows = applyFilters();
        return { data: rows[0] || null, error: null };
      },
      update(patch) {
        return {
          eq(col, val) {
            filters.push({ op: 'eq', col, val });
            return {
              eq(col2, val2) {
                filters.push({ op: 'eq', col: col2, val: val2 });
                const source = tableName === 'presupuestos' ? state.budgets : state.reviews;
                for (const row of source) {
                  if (matches(row, filters)) Object.assign(row, patch);
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
      then(resolve, reject) {
        try {
          let rows = applyFilters();
          if (typeof this._limit === 'number') rows = rows.slice(0, this._limit);
          resolve({ data: rows, error: null });
        } catch (err) {
          if (reject) reject(err);
        }
      },
    };
    const matches = (row, list) =>
      list.every((f) => {
        if (f.op === 'eq') {
          if (f.col === 'cotizacion->>id') return row.cotizacion?.id === f.val;
          return row[f.col] === f.val;
        }
        if (f.op === 'in') return f.val.includes(row[f.col]);
        return true;
      });
    const applyFilters = () => {
      const source = tableName === 'presupuestos' ? state.budgets : state.reviews;
      return source.filter((r) => matches(r, filters));
    };
    return chain;
  };

  return {
    state,
    from(tableName) {
      return makeTable(tableName);
    },
    async rpc(fn, params) {
      if (fn === 'obrabot_registrar_cotizacion') {
        const record = {
          id: params.p_id,
          empresa_id: params.p_empresa,
          solicitado_por: params.p_actor,
          origen: params.p_origen,
          estado: 'pendiente',
          revision: 1,
          borrador: params.p_borrador,
          presupuesto_id: null,
          actualizado_at: new Date().toISOString(),
        };
        state.reviews.push(record);
        state.registeredRevisions.push(record);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };
}
