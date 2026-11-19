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

test('asignar responsable a partidas/tareas de la Carta Gantt persiste responsable_id en actividades sin dejarlas al 0% ni secuestrarlas como asignación a obra', () => {
  const { teamAssignmentIntake } = require('../lib/ai/team-assignment.ts');
  const { checkActionPermissions } = require('../lib/ai/permissions.ts');
  const { isolatedState, planWhatsAppActions } = require('../lib/whatsapp/state.ts');
  const { actionReply } = require('../lib/ai/action-reply.ts');

  const admin = { id: 'u-admin', empresa_id: 'e-1', nombre: 'Jorge', rol: 'admin' };
  const felipe = { id: 'u-felipe', empresa_id: 'e-1', nombre: 'Felipe Poblete', rol: 'terreno' };
  const project = { id: 'p-sb', empresa_id: 'e-1', nombre: 'Pintura de pieza 2 × 3 m — San Bernardo', estado: 'activo' };
  const activities = [
    { id: 'act-1', proyecto_id: 'p-sb', nombre: 'Limpieza, protección y lijado de muros', porcentaje_avance: 25, estado: 'en_curso', orden: 1 },
    { id: 'act-2', proyecto_id: 'p-sb', nombre: 'Reparación localizada de dos grietas y aplicación de base látex', porcentaje_avance: 0, estado: 'pendiente', orden: 2 },
    { id: 'act-3', proyecto_id: 'p-sb', nombre: 'Aplicación de esmalte al agua, terminaciones y limpieza', porcentaje_avance: 0, estado: 'pendiente', orden: 3 },
  ];

  // 1) teamAssignmentIntake no debe secuestrar órdenes que mencionan partidas, tareas, actividades o carta gantt
  assert.equal(
    teamAssignmentIntake('asigna como responsable de esas tareas a felipe poblete', [project], [admin, felipe], 'p-sb'),
    null,
  );
  assert.equal(
    teamAssignmentIntake('asigna a felipe poblete como responsable de las partidas de la carta gantt', [project], [admin, felipe], 'p-sb'),
    null,
  );

  // 2) Aunque el modelo envíe porcentaje_avance: 0 en las 3 partidas, si el usuario solo pidió asignar responsable se conserva el avance y se guarda responsable_id
  const userMessage = 'asiga a felipe poblete como responsable de las partidas de la carta gantt';
  const envelope = JSON.parse(
    toolCallsToChatEnvelope('Asignaré a Felipe Poblete a las partidas.', [
      { name: 'actualizar_avance', arguments: JSON.stringify({ proyecto_id: 'p-sb', actividad_id: 'act-1', porcentaje_avance: 0, responsable_nombre: 'Felipe Poblete' }) },
      { name: 'actualizar_avance', arguments: JSON.stringify({ proyecto_id: 'p-sb', actividad_id: 'act-2', porcentaje_avance: 0, responsable_nombre: 'Felipe Poblete' }) },
      { name: 'actualizar_avance', arguments: JSON.stringify({ proyecto_id: 'p-sb', actividad_id: 'act-3', porcentaje_avance: 0, responsable_nombre: 'Felipe Poblete' }) },
    ]),
  );

  const permitted = checkActionPermissions(admin, envelope.acciones, userMessage);
  const service = isolatedState(admin, { usuarios: [admin, felipe], proyectos: [project], actividades: activities }, 'pro_ia');
  const plan = planWhatsAppActions(service, permitted);

  assert.equal(plan.changed.actividades.length, 3);
  for (const act of plan.changed.actividades) {
    assert.equal(act.responsable_id, 'u-felipe');
  }
  // Conservó el 25% de la partida 1 en vez de reiniciar al 0%
  assert.equal(plan.changed.actividades.find((a) => a.id === 'act-1').porcentaje_avance, 25);

  const reply = actionReply(plan.result);
  assert.doesNotMatch(reply, /al 0%/);
  assert.match(reply, /Asigné a Felipe Poblete como responsable de la partida "Limpieza, protección y lijado de muros"/);

  // 3) Si el modelo invoca actualizar_avance una sola vez con nombre="todas" (o sin nombre), actualiza las 3 partidas de una vez
  const serviceAll = isolatedState(admin, { usuarios: [admin, felipe], proyectos: [project], actividades: activities }, 'pro_ia');
  const singleEnvelope = JSON.parse(
    toolCallsToChatEnvelope('Asignaré a Felipe Poblete.', [
      { name: 'actualizar_avance', arguments: JSON.stringify({ proyecto_id: 'p-sb', nombre: 'todas', responsable_nombre: 'Felipe Poblete' }) },
    ]),
  );
  const planAll = planWhatsAppActions(serviceAll, checkActionPermissions(admin, singleEnvelope.acciones, 'asigna como responsable de esas tareas a felipe poblete'));
  assert.equal(planAll.changed.actividades.length, 3);
  assert.match(actionReply(planAll.result), /Asigné a Felipe Poblete como responsable de las 3 partidas de la Carta Gantt/);
});
