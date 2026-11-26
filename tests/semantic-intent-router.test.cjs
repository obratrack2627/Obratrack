require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { classifyTurnIntent, shouldUseSemanticIntentRouter } = require('../lib/ai/intent-router.ts');
const { applyStructuredQuoteEdit } = require('../lib/obrabot/quote-edit-natural.ts');
const { tryNaturalQuoteEdit } = require('../lib/obrabot/quotes.ts');
const { normalizeQuote } = require('../lib/ai/protocol.ts');

test('shouldUseSemanticIntentRouter filtra roles terreno, comandos explícitos, saludos y requiere señal de dominio o cotización', () => {
  const ctxAdmin = { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true };
  assert.equal(shouldUseSemanticIntentRouter('sácale la fecha al pdf porfa', ctxAdmin, true), true);
  assert.equal(shouldUseSemanticIntentRouter('bájalo a un palo ochocientos', ctxAdmin, true), true);
  assert.equal(shouldUseSemanticIntentRouter('hola', ctxAdmin, true), false);
  assert.equal(shouldUseSemanticIntentRouter('ok', ctxAdmin, true), false);
  assert.equal(shouldUseSemanticIntentRouter('1', ctxAdmin, true), false);
  assert.equal(shouldUseSemanticIntentRouter('aprueba cotización 11111111-1111-4111-8111-111111111111 1', ctxAdmin, true), false);
  assert.equal(shouldUseSemanticIntentRouter('sácale la fecha', { channel: 'whatsapp', rol: 'terreno', hasActiveQuote: true }, true), false);
  assert.equal(shouldUseSemanticIntentRouter('qué tiempo hace hoy', { channel: 'whatsapp', rol: 'admin', hasActiveQuote: false }, true), false);
  assert.equal(shouldUseSemanticIntentRouter('ponle ese presupuesto a la obra del baño', { channel: 'whatsapp', rol: 'admin', hasActiveQuote: false }, true), true);
});

test('classifyTurnIntent interpreta modismos chilenos con JSON Schema y degrada limpio ante fallos', async () => {
  const ctx = { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true, hasPendingQuoteReview: true };

  const removeDate = await classifyTurnIntent('sácale la fecha al pdf porfa', ctx, async () => JSON.stringify({
    intent: 'editar_cotizacion',
    confidence: 'alta',
    edicion_cotizacion: { operacion: 'cambiar_fecha', mostrar_fecha: false, solicita_pdf: true },
  }));
  assert.equal(removeDate?.intent, 'editar_cotizacion');
  assert.equal(removeDate?.edicion_cotizacion?.mostrar_fecha, false);

  const lowerTotal = await classifyTurnIntent('bájalo a un palo ochocientos', ctx, async () => JSON.stringify({
    intent: 'editar_cotizacion',
    confidence: 'alta',
    edicion_cotizacion: { operacion: 'cambiar_total', nuevo_monto_clp: 1800000 },
  }));
  assert.equal(lowerTotal?.edicion_cotizacion?.nuevo_monto_clp, 1800000);

  const linkToProject = await classifyTurnIntent('ponle esa cotización a la obra del baño', ctx, async () => JSON.stringify({
    intent: 'aplicar_cotizacion_a_obra',
    confidence: 'alta',
    destino_obra: { obra_nombre: 'baño' },
  }));
  assert.equal(linkToProject?.intent, 'aplicar_cotizacion_a_obra');
  assert.equal(linkToProject?.destino_obra?.obra_nombre, 'baño');

  const createProject = await classifyTurnIntent('ármame la obra con ese presupuesto para Claudio Zapata', ctx, async () => JSON.stringify({
    intent: 'crear_obra_desde_cotizacion',
    confidence: 'alta',
    destino_obra: { cliente_nombre: 'Claudio Zapata', incluir_gantt: true },
  }));
  assert.equal(createProject?.intent, 'crear_obra_desde_cotizacion');
  assert.equal(createProject?.destino_obra?.cliente_nombre, 'Claudio Zapata');

  const downloadExcel = await classifyTurnIntent('mándame la planilla excel', ctx, async () => JSON.stringify({
    intent: 'descargar_archivo_cotizacion',
    confidence: 'alta',
    formato_archivo: 'excel',
  }));
  assert.equal(downloadExcel?.formato_archivo, 'excel');

  // Tolerancia a errores de red o JSON inválido
  const onError = await classifyTurnIntent('bájalo a un palo ochocientos', ctx, async () => { throw new Error('timeout'); });
  assert.equal(onError, null);
  const onBadJson = await classifyTurnIntent('bájalo a un palo ochocientos', ctx, async () => 'no es json');
  assert.equal(onBadJson, null);
});

test('applyStructuredQuoteEdit ejecuta ediciones deterministas y tryNaturalQuoteEdit las aplica con recalculo completo', async () => {
  const baseQuote = normalizeQuote({
    titulo_proyecto: 'Remodelación cocina Padre Hurtado',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    resumen_ejecutivo: '• Demolición\n• Instalación eléctrica\n• Retiro de escombro',
    partidas_venta: [
      { nombre: 'Remodelación cocina', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 2000000, tipo: 'partida' },
    ],
    materiales_considerados: [{ nombre: 'Porcelanato piso', cantidad: 12, unidad: 'm2' }],
    hitos_pago: [
      { nombre: 'Inicio del proyecto', porcentaje: 60 },
      { nombre: 'Al finalizar el proyecto', porcentaje: 40 },
    ],
    materiales: [],
    mano_de_obra: [],
  });

  // 1. Cambiar total preservando resumen, materiales considerados e hitos
  const totalPatch = applyStructuredQuoteEdit(baseQuote, {
    operacion: 'cambiar_total',
    nuevo_monto_clp: 1800000,
  });
  assert.ok(totalPatch);
  assert.equal(totalPatch.partidas_venta[0].subtotal, 1800000);
  assert.equal(totalPatch.materiales_considerados?.length, 1);
  assert.match(totalPatch.resumen_ejecutivo || '', /Demolición/);

  // 2. Ocultar fecha
  const noDatePatch = applyStructuredQuoteEdit(baseQuote, {
    operacion: 'cambiar_fecha',
    mostrar_fecha: false,
  });
  assert.equal(noDatePatch?.mostrar_fecha, false);

  // 3. Agregar y eliminar partida + protección de última partida
  const addPatch = applyStructuredQuoteEdit(baseQuote, {
    operacion: 'agregar_partida',
    partida_objetivo: 'Pintura cielo',
    nuevo_monto_clp: 180000,
  });
  assert.equal(addPatch?.partidas_venta.length, 2);
  assert.equal(addPatch?.partidas_venta[1].tipo, 'partida');

  const twoLineQuote = normalizeQuote({
    ...addPatch,
    modo_presupuesto: 'precio_acordado',
    materiales: [],
    mano_de_obra: [],
  });
  const delPatch = applyStructuredQuoteEdit(twoLineQuote, {
    operacion: 'eliminar_partida',
    partida_objetivo: 'Pintura',
  });
  assert.equal(delPatch?.partidas_venta.length, 1);

  assert.throws(
    () => applyStructuredQuoteEdit(baseQuote, { operacion: 'eliminar_partida', partida_objetivo: 'cocina' }),
    /al menos una partida/,
  );

  // 4. tryNaturalQuoteEdit con semanticIntent sobre frases que regex por sí sola no capturaba ("sácale la fecha al pdf porfa")
  const reviewId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const reviews = new Map([
    [reviewId, { id: reviewId, empresa_id: 'emp-sem', estado: 'pendiente', revision: 1, borrador: baseQuote, presupuesto_id: null }],
  ]);
  const db = {
    from() {
      let idFilter = null;
      return {
        select() { return this; },
        eq(k, v) { if (k === 'id') idFilter = v; return this; },
        async maybeSingle() { return { data: reviews.get(idFilter) || null, error: null }; },
      };
    },
    async rpc(name, args) {
      if (name === 'obrabot_revisar_cotizacion') {
        const cur = reviews.get(args.p_id);
        const next = { ...cur, revision: cur.revision + 1, borrador: args.p_cambios };
        reviews.set(args.p_id, next);
        return { data: next, error: null };
      }
      throw new Error(name);
    },
  };

  const reply = await tryNaturalQuoteEdit(
    db,
    { id: 'admin', empresa_id: 'emp-sem', rol: 'admin' },
    'whatsapp',
    'sácale la fecha al pdf porfa y déjalo en 1 palo 8',
    [reviewId],
    false,
    'req-sem-1',
    {
      intent: 'editar_cotizacion',
      confidence: 'alta',
      edicion_cotizacion: { operacion: 'cambiar_total', nuevo_monto_clp: 1800000, mostrar_fecha: false },
    },
  );
  assert.ok(reply);
  assert.equal(reply.revision, 2);
  assert.match(reply.respuesta, /Sin fecha en PDF/);
  assert.match(reply.respuesta, /\$1\.800\.000/);
  assert.match(reply.respuesta, /\$1\.080\.000/);
  assert.match(reply.respuesta, /\$720\.000/);
  assert.equal(reviews.get(reviewId).borrador.mostrar_fecha, false);
});
