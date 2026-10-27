require('./helpers/typescript.cjs');
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { generateGemini, AIError } = require('../lib/ai/provider.ts');
const {
  parseChatResponse,
  extractLegacyActions,
  normalizeQuote,
  flattenActions,
} = require('../lib/ai/protocol.ts');
const { prepareActionPlan, resolveEntity } = require('../lib/ai/actions.ts');
const originalEnv = { ...process.env };
afterEach(() => {
  for (const key of [
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_GENAI_API_KEY',
    'GEMINI_MODEL',
  ]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});
const completion = (text) =>
  new Response(
    JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
test('falta de clave produce error de configuración y no una respuesta de muestra', async () => {
  for (const k of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY'])
    delete process.env[k];
  await assert.rejects(
    generateGemini('Hola'),
    (e) => e.code === 'AI_NOT_CONFIGURED' && e.status === 503,
  );
});
test('clave solo en cabecera, salida JSON y presupuesto de respuesta acotado', async () => {
  process.env.GEMINI_API_KEY = 'fixture-token';
  const result = await generateGemini('Cotiza', {
    json: true,
    fetcher: async (url, opts) => {
      assert.ok(!url.includes('fixture-token'));
      assert.equal(opts.headers['x-goog-api-key'], 'fixture-token');
      assert.equal(
        JSON.parse(opts.body).generationConfig.responseMimeType,
        'application/json',
      );
      assert.ok(opts.signal);
      return completion('{"respuesta":"Lista"}');
    },
  });
  assert.equal(result, '{"respuesta":"Lista"}');
});
test('cuota y credenciales fallidas se informan sin filtrar el cuerpo del proveedor', async () => {
  process.env.GEMINI_API_KEY = 'fixture-token';
  for (const [http, code] of [
    [429, 'AI_RATE_LIMIT'],
    [403, 'AI_CREDENTIALS'],
  ])
    await assert.rejects(
      generateGemini('Hola', {
        fetcher: async () =>
          new Response('sensitive-provider-message', { status: http }),
      }),
      (e) => e.code === code && !e.message.includes('sensitive'),
    );
});
test('modelo inexistente usa el modelo estable; respuestas truncadas no generan acciones', async () => {
  process.env.GEMINI_API_KEY = 'fixture-token';
  process.env.GEMINI_MODEL = 'gemini-no-existe';
  let calls = 0;
  const result = await generateGemini('Hola', {
    fetcher: async () =>
      ++calls === 1 ? new Response('', { status: 404 }) : completion('Hola'),
  });
  assert.equal(result, 'Hola');
  assert.equal(calls, 2);
  await assert.rejects(
    generateGemini('Hola', {
      fetcher: async () =>
        new Response(
          JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS' }] }),
        ),
    }),
    (e) => e.code === 'AI_INCOMPLETE',
  );
});
test('timeout y JSON del proveedor inválido son errores explícitos', async () => {
  process.env.GEMINI_API_KEY = 'fixture-token';
  await assert.rejects(
    generateGemini('hola', {
      fetcher: async () => {
        throw new DOMException('timeout', 'TimeoutError');
      },
    }),
    (e) => e.code === 'AI_TIMEOUT',
  );
  await assert.rejects(
    generateGemini('hola', { fetcher: async () => new Response('not json') }),
    (e) => e.code === 'AI_INVALID_RESPONSE',
  );
});
test('parser preserva materiales anidados, corchetes en cadenas y múltiples etiquetas', () => {
  const raw =
    'Preparado [ACCION_OBRA: {"tipo":"agregar_materiales","materiales":[{"nombre":"Perfil [A]","cantidad":2,"precio_unitario":5000}]}] y [ACCION_OBRA: {"tipo":"crear_cliente","nombre":"Ana"}]';
  const result = extractLegacyActions(raw);
  assert.equal(result.accion.acciones.length, 2);
  assert.equal(result.accion.acciones[0].materiales[0].nombre, 'Perfil [A]');
  assert.equal(result.textoLimpio, 'Preparado  y');
  assert.throws(
    () => extractLegacyActions('[ACCION_OBRA: {"tipo":"crear_cliente"'),
    /completó/,
  );
});
test('respuesta estructurada no acepta JSON roto, acciones desconocidas ni montos negativos', () => {
  assert.throws(
    () => parseChatResponse('{"respuesta":"Listo"'),
    (e) => e.code === 'AI_INVALID_RESPONSE',
  );
  assert.throws(
    () =>
      parseChatResponse(
        JSON.stringify({
          respuesta: 'Listo',
          acciones: [{ tipo: 'ejecutar_sql' }],
        }),
      ),
    /no admite/,
  );
  assert.throws(
    () => flattenActions({ tipo: 'registrar_pago', monto: -10 }),
    /no negativo/,
  );
  assert.throws(
    () =>
      flattenActions({
        tipo: 'actualizar_avance',
        nombre: 'Radier',
        porcentaje_avance: 130,
      }),
    /100/,
  );
});
test('nunca selecciona la primera obra cuando no hay coincidencia o hay ambigüedad', () => {
  const projects = [
    { id: 'a', nombre: 'Casa Pérez' },
    { id: 'b', nombre: 'Casa López' },
  ];
  assert.throws(
    () => resolveEntity(projects, 'Casa desconocida'),
    /No se encontró/,
  );
  assert.throws(() => resolveEntity(projects, 'Casa'), /más de una/);
  assert.throws(() => resolveEntity(projects), /Indica/);
  assert.equal(resolveEntity(projects, 'a').id, 'a');
  assert.equal(resolveEntity(projects, undefined, 'b').id, 'b');
});
test('lote completo se valida antes de ejecutar y admite referenciar una obra nueva', () => {
  const context = {
    proyectos: [],
    clientes: [],
    actividades: [],
    usuarios: [],
  };
  const plan = prepareActionPlan(
    [
      {
        tipo: 'crear_proyecto',
        nombre: 'Terraza',
        comuna: 'Maipú',
        monto: 3000000,
        dias: 10,
      },
      { tipo: 'registrar_pago', proyecto_nombre: 'Terraza', monto: 1000000 },
    ],
    context,
  );
  assert.equal(plan.length, 2);
  assert.equal(plan[1].proyecto_nombre, 'Terraza');
  assert.equal(plan[1].proyecto_id, undefined);
  assert.throws(
    () =>
      prepareActionPlan(
        [
          { tipo: 'crear_cliente', nombre: 'Ana' },
          {
            tipo: 'registrar_pago',
            proyecto_nombre: 'Inexistente',
            monto: 100,
          },
        ],
        context,
      ),
    /No se encontró/,
  );
});
test('no se puede modificar otra obra desde el chat de una obra', () => {
  assert.throws(
    () =>
      prepareActionPlan(
        { tipo: 'registrar_pago', proyecto_id: 'b', monto: 100 },
        {
          proyectos: [
            { id: 'a', nombre: 'A' },
            { id: 'b', nombre: 'B' },
          ],
          clientes: [],
          actividades: [],
          usuarios: [],
        },
        'a',
      ),
    /otra obra/,
  );
});
test('cotización recalcula CLP, IVA, costos y no inventa descuentos ni datos del cliente', () => {
  const quote = normalizeQuote({
    titulo_proyecto: 'Terraza',
    comuna_region: 'Maipú',
    materiales: [
      {
        nombre: 'Cemento',
        cantidad: 10,
        precio_unitario_estimado: 5000,
        subtotal: 1,
      },
    ],
    mano_de_obra: [
      {
        rol: 'Maestro',
        cantidad_personas: 2,
        dias_estimados: 3,
        valor_jornal_diario: 40000,
      },
    ],
    estructura_financiera: {
      gastos_generales_porcentaje: 10,
      imprevistos_porcentaje: 5,
      margen_utilidad_porcentaje: 20,
    },
  });
  assert.equal(quote.materiales[0].subtotal, 50000);
  assert.equal(quote.estructura_financiera.costo_directo, 290000);
  assert.equal(quote.estructura_financiera.precio_sugerido_neto, 400200);
  assert.equal(quote.estructura_financiera.precio_total_con_iva, 476238);
  assert.deepEqual(quote.radar_proveedores, []);
  assert.equal(quote.estructura_financiera.ahorro_compras_estrategicas, 0);
  assert.throws(
    () =>
      normalizeQuote({
        titulo_proyecto: 'Terraza',
        materiales: [],
        mano_de_obra: [],
      }),
    /costos/,
  );
});
test('cantidades decimales se redondean en CLP sin perder pesos por precisión binaria', () => {
  const { roundLine } = require('../lib/ai/protocol.ts');
  assert.equal(roundLine(0.58, 25), 15);
  assert.equal(roundLine(1.25, 3000), 3750);
});
test('el formateador conserva nombres de variables con guiones bajos', () => {
  const React = require('react'),
    { renderToStaticMarkup } = require('react-dom/server');
  const Formatter = require('../components/ChatMessageFormatter.tsx').default;
  const html = renderToStaticMarkup(
    React.createElement(Formatter, {
      content: 'Configura GEMINI_API_KEY en el servidor.',
    }),
  );
  assert.ok(html.includes('GEMINI_API_KEY'));
  assert.ok(!html.includes('<em>API</em>'));
});

test('las cotizaciones simples usan el prompt breve sin perder solicitudes con acciones', () => {
  const { isQuoteRequest, quotePrompt } = require('../lib/ai/prompt.ts');
  for (const message of [
    'Cotiza 20 m2 de radier. No crees una obra.',
    'Genera una cotización para una obra de 35 m2',
    'Prepara un presupuesto de terraza',
  ]) assert.equal(isQuoteRequest(message), true, message);
  for (const message of [
    'Cotiza la terraza y crea una obra',
    'Envía la cotización por WhatsApp',
    'Actualiza el avance de la obra',
    'Cotiza y registra un pago',
  ]) assert.equal(isQuoteRequest(message), false, message);
  const prompt = quotePrompt([], 'Cotiza', { clientes:[{id:'cliente-real', nombre:'Ana'}] });
  assert.ok(prompt.includes('cliente-real'));
});
