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

test('actualizar_proyecto reprograma automáticamente las partidas de la Carta Gantt al cambiar fechas y descarta campos repetidos no solicitados', () => {
  const { checkActionPermissions } = require('../lib/ai/permissions.ts');
  const { isolatedState, planWhatsAppActions } = require('../lib/whatsapp/state.ts');
  const { actionReply } = require('../lib/ai/action-reply.ts');

  const admin = { id: 'u-admin', empresa_id: 'e-1', nombre: 'Jorge', rol: 'admin' };
  const project = {
    id: 'p-sb',
    empresa_id: 'e-1',
    nombre: 'Pintura de pieza 2 × 3 m — San Bernardo',
    descripcion: 'Pintura interior en San Bernardo',
    estado: 'activo',
    fecha_inicio: '2026-11-19',
    fecha_termino_estimada: '2026-11-22',
    monto_cotizado: 250000,
  };
  const activities = [
    { id: 'act-1', proyecto_id: 'p-sb', nombre: 'Limpieza, protección y lijado de muros', fecha_inicio: '2026-11-19', fecha_termino: '2026-11-20', porcentaje_avance: 0, estado: 'pendiente', orden: 1, responsable_id: 'u-felipe' },
    { id: 'act-2', proyecto_id: 'p-sb', nombre: 'Reparación localizada de dos grietas y aplicación de base látex', fecha_inicio: '2026-11-20', fecha_termino: '2026-11-21', porcentaje_avance: 0, estado: 'pendiente', orden: 2, responsable_id: 'u-felipe' },
    { id: 'act-3', proyecto_id: 'p-sb', nombre: 'Aplicación de esmalte al agua, terminaciones y limpieza', fecha_inicio: '2026-11-21', fecha_termino: '2026-11-22', porcentaje_avance: 0, estado: 'pendiente', orden: 3, responsable_id: 'u-felipe' },
  ];

  // Aunque el modelo envíe nuevo_nombre, estado y descripcion repetidos al cambiar las fechas:
  const envelope = JSON.parse(
    toolCallsToChatEnvelope('Actualizaré las fechas.', [
      {
        name: 'actualizar_proyecto',
        arguments: JSON.stringify({
          proyecto_id: 'p-sb',
          nuevo_nombre: 'Pintura de pieza 2 × 3 m — San Bernardo',
          estado: 'activo',
          descripcion: 'Pintura interior en San Bernardo',
          fecha_inicio: '2026-12-25',
          fecha_termino_estimada: '2026-12-29',
        }),
      },
    ]),
  );

  const permitted = checkActionPermissions(
    admin,
    envelope.acciones,
    'quiero cambies el inicio y termino, iniciara el dia 25 de diciembre hasta el 29',
  );
  const service = isolatedState(admin, { usuarios: [admin], proyectos: [project], actividades: activities }, 'pro_ia');
  const plan = planWhatsAppActions(service, permitted);

  // 1) Actualizó inicio y término de la obra
  assert.equal(plan.changed.proyectos[0].fecha_inicio, '2026-12-25');
  assert.equal(plan.changed.proyectos[0].fecha_termino_estimada, '2026-12-29');

  // 2) Reprogramó automáticamente las 3 partidas de la Carta Gantt dentro del rango 2026-12-25..2026-12-29
  assert.equal(plan.changed.actividades.length, 3);
  const sorted = plan.changed.actividades.slice().sort((a, b) => a.orden - b.orden);
  assert.equal(sorted[0].fecha_inicio, '2026-12-25');
  assert.equal(sorted[2].fecha_termino, '2026-12-29');
  for (const act of sorted) {
    assert.equal(act.responsable_id, 'u-felipe');
  }

  // 3) El mensaje de respuesta NO dice "Renombré la obra... a ...", "El estado quedó como en curso" ni "Actualicé la descripción"
  const reply = actionReply(plan.result);
  assert.doesNotMatch(reply, /Renombré la obra/);
  assert.doesNotMatch(reply, /El estado quedó como/);
  assert.doesNotMatch(reply, /Actualicé la descripción/);
  assert.match(reply, /El inicio quedó para el 25\/12\/2026/);
  assert.match(reply, /La entrega quedó para el 29\/12\/2026/);
  assert.match(reply, /Ajusté automáticamente las 3 partidas de la Carta Gantt/);
});

test('auditoría de gestión integral: resumen financiero, responsable_nombre en contexto, actualizar todos los materiales/partidas, crear_actividad con responsable y pagos/asistencia', () => {
  const { operationsContext } = require('../lib/ai/operations-context.ts');
  const { compactAIContext } = require('../lib/ai/prompt-context.ts');
  const { checkActionPermissions } = require('../lib/ai/permissions.ts');
  const { isolatedState, planWhatsAppActions } = require('../lib/whatsapp/state.ts');

  const admin = { id: 'u-admin', empresa_id: 'e-1', nombre: 'Jorge', rol: 'admin' };
  const felipe = { id: 'u-felipe', empresa_id: 'e-1', nombre: 'Felipe Poblete', rol: 'terreno' };
  const project = {
    id: 'p-sb',
    empresa_id: 'e-1',
    nombre: 'Pintura de pieza 2 × 3 m — San Bernardo',
    estado: 'activo',
    fecha_inicio: '2026-12-25',
    fecha_termino_estimada: '2026-12-29',
    monto_cotizado: 500000,
    trabajadores_ids: ['u-felipe'],
  };
  const activities = [
    { id: 'act-1', proyecto_id: 'p-sb', nombre: 'Limpieza', fecha_inicio: '2026-12-25', fecha_termino: '2026-12-27', porcentaje_avance: 0, estado: 'pendiente', orden: 1, responsable_id: 'u-felipe' },
    { id: 'act-2', proyecto_id: 'p-sb', nombre: 'Pintura', fecha_inicio: '2026-12-27', fecha_termino: '2026-12-29', porcentaje_avance: 0, estado: 'pendiente', orden: 2, responsable_id: 'u-felipe' },
  ];
  const materials = [
    { id: 'm-1', proyecto_id: 'p-sb', nombre: 'Látex blanco', cantidad: 2, unidad: 'galón', precio_unitario: 25000, subtotal: 50000, comprado: false, pagado: null },
    { id: 'm-2', proyecto_id: 'p-sb', nombre: 'Rodillo', cantidad: 2, unidad: 'unidad', precio_unitario: 5000, subtotal: 10000, comprado: false, pagado: null },
  ];

  // 1) Contexto operativo enriquece responsable_nombre en actividades y resumen_financiero verificado
  const opCtx = operationsContext(
    { usuarios: [admin, felipe], proyectos: [project], actividades: activities, materiales_proyecto: materials, pagos: [{ id: 'pay-1', proyecto_id: 'p-sb', monto: 200000, estado: 'completado' }] },
    'p-sb',
    'admin',
    'estado financiero',
  );
  assert.equal(opCtx.registros.actividades.incluidos[0].responsable_nombre, 'Felipe Poblete');
  assert.equal(opCtx.resumen_financiero[0].monto_cotizado, 500000);
  assert.equal(opCtx.resumen_financiero[0].total_pagado, 200000);
  assert.equal(opCtx.resumen_financiero[0].saldo_por_cobrar, 300000);
  assert.equal(opCtx.resumen_financiero[0].total_materiales_presupuestados, 60000);

  const compacted = compactAIContext({ proyectos: [project] });
  assert.deepEqual(compacted.proyectos[0].trabajadores_ids, ['u-felipe']);

  // 2) Marcar todos los materiales como comprados, agregar partida con responsable (extiende plazo) y marcar todas las partidas al 100%
  const service = isolatedState(
    admin,
    { usuarios: [admin, felipe], proyectos: [project], actividades: activities, materiales_proyecto: materials, proyecto_trabajadores: [{ proyecto_id: 'p-sb', usuario_id: 'u-felipe' }] },
    'pro_ia',
  );

  const batchEnv = JSON.parse(
    toolCallsToChatEnvelope('Ejecutando cambios.', [
      { name: 'actualizar_material', arguments: JSON.stringify({ proyecto_id: 'p-sb', nombre: 'todos', comprado: true, proveedor: 'Sodimac' }) },
      { name: 'crear_actividad', arguments: JSON.stringify({ proyecto_id: 'p-sb', nombre: 'Barnizado final', dias: 2, responsable_nombre: 'Felipe Poblete' }) },
      { name: 'registrar_pago', arguments: JSON.stringify({ proyecto_id: 'p-sb', monto: 100000, metodo: 'credito', notas: 'Pago con tarjeta' }) },
      { name: 'registrar_asistencia', arguments: JSON.stringify({ proyecto_id: 'p-sb', trabajador_nombre: 'Felipe Poblete' }) },
    ]),
  );

  const permitted = checkActionPermissions(admin, batchEnv.acciones, 'Marca todos los materiales como comprados en Sodimac, agrega partida Barnizado final de 2 días a cargo de Felipe Poblete, registra pago de 100000 con crédito y marca presente a Felipe Poblete');
  const plan = planWhatsAppActions(service, permitted);

  assert.equal(plan.changed.materiales_proyecto.length, 2);
  assert.ok(plan.changed.materiales_proyecto.every((m) => m.comprado === true && m.proveedor === 'Sodimac'));
  assert.equal(plan.changed.actividades.length, 1);
  assert.equal(plan.changed.actividades[0].nombre, 'Barnizado final');
  assert.equal(plan.changed.actividades[0].responsable_id, 'u-felipe');
  assert.equal(plan.changed.proyectos[0].fecha_termino_estimada, '2026-12-31');
  assert.equal(plan.changed.pagos[0].metodo, 'credito');
  assert.equal(plan.changed.pagos[0].notas, 'Pago con tarjeta');
  assert.equal(plan.changed.asistencia_obreros[0].usuario_id, 'u-felipe');
  assert.equal(plan.changed.asistencia_obreros[0].estado, 'presente');
});
