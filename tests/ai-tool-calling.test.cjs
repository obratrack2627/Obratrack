require('./helpers/typescript.cjs');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { getObraBotTools, toolCallsToChatEnvelope } = require('../lib/ai/tools.ts');
const { generateOpenAI } = require('../lib/ai/openai-provider.ts');
const { parseChatResponse } = require('../lib/ai/protocol.ts');
const { chatGenerationRequest } = require('../lib/gemini.ts');

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env.OPENAI_API_KEY = 'fixture-openai';
  delete process.env.OBRABOT_TOOL_CALLING;
});
afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  Object.assign(process.env, originalEnv);
});

test('getObraBotTools aplica RBAC por rol, plan y canal (Web vs WhatsApp)', () => {
  const names = (opts) => getObraBotTools(opts).map((t) => t.name);

  const freeTools = names({ role: 'admin', actionsEnabled: false });
  assert.deepEqual(freeTools, ['buscar_precios_materiales']);

  const workerTools = names({ role: 'terreno', actionsEnabled: true });
  assert.ok(workerTools.includes('actualizar_avance'));
  assert.ok(workerTools.includes('crear_bitacora'));
  for (const forbidden of ['registrar_pago', 'crear_proyecto', 'proponer_obra_whatsapp', 'enviar_mensaje_equipo', 'eliminar_proyecto', 'actualizar_proyecto']) {
    assert.ok(!workerTools.includes(forbidden), `terreno no debe ver la herramienta ${forbidden}`);
  }

  const supWaTools = names({ role: 'supervisor', actionsEnabled: true, whatsapp: true });
  assert.ok(supWaTools.includes('proponer_obra_whatsapp'));
  assert.ok(!supWaTools.includes('crear_proyecto'));
  assert.ok(!supWaTools.includes('eliminar_proyecto'));

  const adminWebTools = names({ role: 'admin', actionsEnabled: true, whatsapp: false });
  assert.ok(adminWebTools.includes('crear_proyecto'));
  assert.ok(adminWebTools.includes('eliminar_proyecto'));
  assert.ok(!adminWebTools.includes('proponer_obra_whatsapp'));
});

test('generateOpenAI envía tools nativas en /v1/responses y traduce llamadas paralelas a sobre válido de ObraBot', async () => {
  const tools = getObraBotTools({ role: 'admin', actionsEnabled: true, whatsapp: false });
  let capturedBody = null;

  const raw = await generateOpenAI('Marca Cerámicas al 30% y busca 10 sacos de cemento', {
    tools,
    toolChoice: 'auto',
    fetcher: async (url, opts) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      capturedBody = JSON.parse(opts.body);
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Voy a actualizar Cerámicas al 30% y revisar precios de cemento.' }],
            },
            {
              type: 'function_call',
              call_id: 'call_1',
              name: 'actualizar_avance',
              arguments: JSON.stringify({ proyecto_id: 'p-bano', nombre: 'Cerámicas', porcentaje_avance: 30 }),
            },
            {
              type: 'function_call',
              call_id: 'call_2',
              name: 'buscar_precios_materiales',
              arguments: JSON.stringify({ producto: 'cemento', presentacion: 'saco de 25 kg', cantidad: 10 }),
            },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  assert.equal(capturedBody.tool_choice, 'auto');
  assert.equal(capturedBody.parallel_tool_calls, true);
  assert.equal(capturedBody.text, undefined);
  assert.ok(Array.isArray(capturedBody.tools) && capturedBody.tools.length === tools.length);

  const parsed = parseChatResponse(raw);
  assert.equal(parsed.accion.tipo, 'actualizar_avance');
  assert.equal(parsed.accion.porcentaje_avance, 30);
  assert.equal(parsed.busqueda_materiales.producto, 'cemento');
  assert.equal(parsed.busqueda_materiales.cantidad, 10);
});

test('toolCallsToChatEnvelope soporta texto natural puro y proponer_obra_whatsapp', () => {
  const textOnly = JSON.parse(toolCallsToChatEnvelope('El saldo pendiente de Casa Norte es $311.632.', []));
  assert.equal(textOnly.respuesta, 'El saldo pendiente de Casa Norte es $311.632.');
  assert.deepEqual(textOnly.acciones, []);

  const waDraft = JSON.parse(
    toolCallsToChatEnvelope('Preparé el borrador.', [
      { name: 'proponer_obra_whatsapp', arguments: JSON.stringify({ nombre: 'Quincho', monto_cotizado: 1500000 }) },
    ]),
  );
  assert.deepEqual(waDraft.obra_propuesta, { nombre: 'Quincho', monto_cotizado: 1500000 });
  assert.deepEqual(waDraft.acciones, []);
});

test('chatGenerationRequest usa Tool Calling compacto en modo chat y conserva esquemas especializados en quote y search', () => {
  const chatReq = chatGenerationRequest([], '¿Cuál es el saldo de Baño Ñuñoa?', { rol: 'terreno', acciones_habilitadas: true });
  assert.equal(chatReq.mode, 'chat');
  assert.ok(Array.isArray(chatReq.options.tools) && chatReq.options.tools.length > 0);
  assert.equal(chatReq.options.schema, undefined);
  assert.ok(chatReq.options.instructions.length < 2000, 'Las instrucciones de Tool Calling deben ser compactas');
  assert.ok(!chatReq.options.tools.some((t) => t.name === 'registrar_pago'));

  const quoteReq = chatGenerationRequest([], 'Cotiza un radier de 20 m2 en Maipú', {});
  assert.equal(quoteReq.mode, 'quote');
  assert.ok(quoteReq.options.schema);

  const searchReq = chatGenerationRequest([], 'Busca precios de 10 sacos de cemento de 25 kg', {});
  assert.equal(searchReq.mode, 'search');
  assert.ok(searchReq.options.schema);
});
