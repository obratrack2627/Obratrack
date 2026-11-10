require("./helpers/typescript.cjs");
const { test, afterEach, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const fixture = require("./helpers/supabase.cjs");
require.cache[require.resolve("../lib/supabase/client.ts")] = {
  id: require.resolve("../lib/supabase/client.ts"),
  filename: require.resolve("../lib/supabase/client.ts"),
  loaded: true,
  exports: fixture,
};
const { createChatHandler, authorizeAI } = require("../lib/ai/server.ts");
const { AIError } = require("../lib/ai/errors.ts");
const response = {
  respuesta: "Puedo preparar el presupuesto.",
  accion: null,
  sugerencias: [],
  cotizacion: null,
};
const makeRequest = (body) =>
  new NextRequest("http://localhost/api/cotizador/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const authorized = async () => ({
  client: fixture.supabase,
  user: { id: "u", empresa_id: "company-a", rol: "admin" },
});
beforeEach(() =>
  fixture.tables.set("empresas", [{ id: "company-a", plan_id: "pro_ia" }]),
);
afterEach(() => fixture.reset());
test("una cookie inventada no autoriza solicitudes a Gemini", async () => {
  const req = new NextRequest("http://localhost/api/cotizador/chat", {
    method: "POST",
    headers: { cookie: "obratrack_auth_token=inventado" },
    body: "{}",
  });
  await assert.rejects(
    authorizeAI(req),
    (e) => e.code === "AUTH_REQUIRED" && e.status === 401,
  );
});
test("la ruta devuelve la cotización real y no duplica el mensaje actual en el historial", async () => {
  let called = 0;
  const handler = createChatHandler({
    authorize: authorized,
    global: async (history, message, context) => {
      called++;
      assert.equal(message, "Cotiza una terraza");
      assert.equal(history.length, 1);
      assert.equal(history[0].rol, "model");
      assert.equal(context.cotizacion_actual, null);
      return response;
    },
    project: async () => response,
  });
  const res = await handler(
    makeRequest({
      mensaje: "Cotiza una terraza",
      historial: [{ remitente: "agente", texto: "¿Qué necesitas?" }],
    }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), response);
  assert.equal(called, 1);
});
test("errores de configuración y cuota mantienen su código y no aparentan éxito", async () => {
  for (const [code, status] of [
    ["AI_NOT_CONFIGURED", 503],
    ["AI_RATE_LIMIT", 429],
  ]) {
    const handler = createChatHandler({
      authorize: authorized,
      global: async () => {
        throw new AIError(code, "Configuración necesaria", status);
      },
      project: async () => response,
    });
    const res = await handler(makeRequest({ mensaje: "Hola" }));
    assert.equal(res.status, status);
    const body = await res.json();
    assert.equal(body.code, code);
    assert.equal(body.respuesta, undefined);
  }
});
test("JSON malformado y mensaje vacío se rechazan sin llamar al modelo", async () => {
  let calls = 0;
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => {
      calls++;
      return response;
    },
    project: async () => response,
  });
  assert.equal((await handler(makeRequest("{"))).status, 400);
  assert.equal((await handler(makeRequest({ mensaje: " " }))).status, 400);
  assert.equal(calls, 0);
});
test("el chat por obra comprueba pertenencia en la base y descarta el contexto de otra empresa", async () => {
  fixture.tables.set("proyectos", [
    { id: "p-a", nombre: "Obra A", empresa_id: "company-a" },
    { id: "p-b", nombre: "Obra B", empresa_id: "company-b" },
  ]);
  let calls = 0;
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => response,
    project: async ({ contextoProyecto }) => {
      calls++;
      assert.equal(contextoProyecto.empresa_id, "company-a");
      assert.equal(contextoProyecto.nombre, "Obra A");
      return response;
    },
  });
  const denied = await handler(
    makeRequest({
      mensaje: "Saldo",
      contexto_proyecto: { empresa_id: "company-a" },
    }),
    "p-b",
  );
  assert.equal(denied.status, 403);
  assert.equal(calls, 0);
  const allowed = await handler(
    makeRequest({
      mensaje: "Saldo",
      contexto_proyecto: {
        empresa_id: "company-b",
        nombre: "Datos inventados",
      },
    }),
    "p-a",
  );
  assert.equal(allowed.status, 200);
  assert.equal(calls, 1);
});

test("Next puede pasar el contexto de ruta al chat general sin convertirlo en un ID de obra", async () => {
  const server = require("../lib/ai/server.ts");
  const original = server.createChatHandler;
  let called = false;
  server.createChatHandler = () =>
    original({
      authorize: authorized,
      global: async () => {
        called = true;
        return response;
      },
      project: async () => {
        throw Error("El chat general no es por obra");
      },
    });
  try {
    const { POST } = require("../app/api/cotizador/chat/route.ts");
    const res = await POST(makeRequest({ mensaje: "Hola" }), { params: {} });
    assert.equal(res.status, 200);
    assert.equal(called, true);
  } finally {
    server.createChatHandler = original;
    delete require.cache[require.resolve("../app/api/cotizador/chat/route.ts")];
  }
});

test("el contexto global usa registros actuales de la empresa, incluso si el navegador envía otros", async () => {
  fixture.tables.set("proyectos", [
    {
      id: "p-a",
      empresa_id: "company-a",
      nombre: "Obra actual",
      monto_cotizado: 500,
    },
    { id: "p-b", empresa_id: "company-b", nombre: "Ajena" },
  ]);
  const handler = createChatHandler({
    authorize: authorized,
    global: async (_, __, context) => {
      assert.equal(context.proyectos.length, 1);
      assert.equal(context.proyectos[0].nombre, "Obra actual");
      return response;
    },
    project: async () => response,
  });
  assert.equal(
    (
      await handler(
        makeRequest({
          mensaje: "Mis obras",
          contexto_db: { proyectos: [{ id: "inventada" }] },
        }),
      )
    ).status,
    200,
  );
});

test("la cotización del copiloto se guarda en la nube y un fallo de guardado no aparenta éxito", async () => {
  const { normalizeQuote } = require("../lib/ai/protocol.ts");
  const cotizacion = normalizeQuote({
    titulo_proyecto: "Radier real",
    materiales: [
      { nombre: "Cemento", cantidad: 2, precio_unitario_estimado: 5000 },
    ],
    mano_de_obra: [],
  });
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => ({ ...response, cotizacion }),
    project: async () => response,
  });
  assert.equal(
    (await handler(makeRequest({ mensaje: "Cotiza un radier" }))).status,
    200,
  );
  const rows = fixture.tables.get("presupuestos");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].empresa_id, "company-a");
  assert.equal(rows[0].cotizacion.id, cotizacion.id);
  fixture.fail("presupuestos");
  const failed = await handler(makeRequest({ mensaje: "Cotiza otro" }));
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).code, "BUDGET_SAVE");
});

test("un fallo de lectura no inventa un inventario vacío", async () => {
  fixture.fail("proyectos");
  let called = false;
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => {
      called = true;
      return response;
    },
    project: async () => response,
  });
  assert.equal(
    (await handler(makeRequest({ mensaje: "Mis obras" }))).status,
    503,
  );
  assert.equal(called, false);
});

test("el copiloto web respeta los mismos permisos de terreno que WhatsApp", async () => {
  const handler = createChatHandler({
    authorize: async () => ({
      client: fixture.supabase,
      user: {
        id: "worker",
        nombre: "Trabajador",
        empresa_id: "company-a",
        rol: "terreno",
      },
    }),
    global: async () => ({
      ...response,
      accion: { tipo: "registrar_pago", proyecto_id: "p1", monto: 1000 },
    }),
    project: async () => response,
  });
  const res = await handler(makeRequest({ mensaje: "Registra pago" }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "ACTION_FORBIDDEN");
});

test("el copiloto web encola el aviso real y no devuelve una acción para simular en el navegador", async () => {
  fixture.tables.set("empresas", [{ id: "company-a", plan_id: "pro_ia" }]);
  fixture.tables.set("usuarios", [
    { id: "u", empresa_id: "company-a", rol: "admin", nombre: "Jefa" },
    {
      id: "worker",
      empresa_id: "company-a",
      rol: "terreno",
      nombre: "Maestro",
      telefono_whatsapp: "+56912345679",
    },
  ]);
  fixture.handleRPC("encolar_aviso_equipo", async (p) => {
    assert.deepEqual(p.p_destinatarios, ["worker"]);
    assert.equal(p.p_empresa, "company-a");
    return {
      data: { id: "11111111-1111-4111-a111-111111111111" },
      error: null,
    };
  });
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => ({
      ...response,
      accion: {
        tipo: "enviar_mensaje_equipo",
        roles_destino: ["terreno"],
        mensaje: "Mañana a las 08:00.",
      },
    }),
    project: async () => response,
  });
  const result = await handler(
    makeRequest({
      mensaje:
        "Envía un aviso a los trabajadores de terreno: mañana a las 08:00",
      request_id: "11111111-1111-4111-a111-111111111112",
    }),
  );
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.accion, null);
  assert.equal(body.accion_ejecutada.tipo, "enviar_mensaje_equipo");
  assert.match(body.respuesta, /en cola/);
  assert.equal(fixture.rpcCalls.length, 1);
});

test("empresas con plan gratis no pueden utilizar los endpoints del asistente de IA", async () => {
  fixture.tables.set("empresas", [{ id: "company-a", plan_id: "gratis" }]);
  fixture.tables.set("proyectos", [
    { id: "p-a", nombre: "Obra A", empresa_id: "company-a" },
  ]);
  let calls = 0;
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => {
      calls++;
      return response;
    },
    project: async () => {
      calls++;
      return response;
    },
  });
  const globalRes = await handler(makeRequest({ mensaje: "Cotiza radier" }));
  assert.equal(globalRes.status, 403);
  assert.equal((await globalRes.json()).code, "PLAN_REQUIRED");
  const projectRes = await handler(makeRequest({ mensaje: "Avance" }), "p-a");
  assert.equal(projectRes.status, 403);
  assert.equal((await projectRes.json()).code, "PLAN_REQUIRED");
  assert.equal(calls, 0);
});

test("el Plan Pro permite cotizaciones pero bloquea cambios por el copiloto antes de escribir", async () => {
  fixture.tables.set("empresas", [{ id: "company-a", plan_id: "pro" }]);
  let context;
  const read = createChatHandler({
    authorize: authorized,
    global: async (_, __, ctx) => {
      context = ctx;
      return response;
    },
    project: async () => response,
  });
  assert.equal(
    (await read(makeRequest({ mensaje: "Quiero cotizar" }))).status,
    200,
  );
  assert.equal(context.acciones_habilitadas, false);
  const write = createChatHandler({
    authorize: authorized,
    global: async () => ({
      ...response,
      accion: { tipo: "crear_cliente", nombre: "Ana" },
    }),
    project: async () => response,
  });
  assert.equal(
    (await write(makeRequest({ mensaje: "Crea el cliente Ana" }))).status,
    403,
  );
  assert.ok(!fixture.calls.some((c) => c.mode === "upsert"));
});

test("el presupuesto anterior se lee de la base de la empresa y no de los importes del navegador", async () => {
  fixture.tables.set("presupuestos", [
    {
      id: "q1",
      empresa_id: "company-a",
      proyecto_id: null,
      cotizacion: {
        titulo_proyecto: "Presupuesto nativo",
        materiales: [{ nombre: "Original" }],
      },
    },
  ]);
  const handler = createChatHandler({
    authorize: authorized,
    global: async (_, __, ctx) => {
      assert.equal(ctx.cotizacion_actual.titulo_proyecto, "Presupuesto nativo");
      return response;
    },
    project: async () => response,
  });
  assert.equal(
    (
      await handler(
        makeRequest({
          mensaje: "Cambia la utilidad",
          contexto_cotizacion: {
            id: "q1",
            titulo_proyecto: "Inventado desde navegador",
          },
        }),
      )
    ).status,
    200,
  );
});

test('pedir otra alternativa usa el presupuesto canónico como origen, conserva la obra y no ejecuta cambios', async () => {
  const { normalizeQuote } = require('../lib/ai/protocol.ts');
  const q=normalizeQuote({titulo_proyecto:'Remodelación',materiales:[{nombre:'Wall panel',cantidad:1,unidad:'un',precio_unitario_estimado:10000}],mano_de_obra:[]});
  const row={id:'wa:source',empresa_id:'company-a',proyecto_id:'p-a',grupo_id:'bg1',updated_at:'2026-11-03T12:00:00Z',cotizacion:q};
  fixture.tables.set('proyectos',[{id:'p-a',empresa_id:'company-a',nombre:'Remodelación'}]);
  fixture.tables.set('presupuestos',[row]);
  fixture.handleRPC('guardar_alternativas_presupuesto',async(p)=>{
    assert.equal(p.p_origen_id,'wa:source');assert.equal(p.p_version,row.updated_at);assert.equal(p.p_proyecto,'p-a');
    assert.equal(p.p_cotizaciones.length,1);
    return {data:{grupo:{id:'bg1'},presupuestos:[]},error:null};
  });
  const handler=createChatHandler({authorize:authorized,global:async()=>response,project:async({contextoProyecto})=>{
    assert.equal(contextoProyecto.cotizacion_actual.id,q.id);
    return {...response,cotizacion:normalizeQuote({...q,nombre_alternativa:'WPC'})};
  }});
  const res=await handler(makeRequest({mensaje:'Prepara otra alternativa con WPC',contexto_cotizacion:{id:q.id,estructura_financiera:{precio_total_con_iva:1}}}),'p-a');
  assert.equal(res.status,200);assert.equal((await res.json()).cotizacion.grupo_presupuesto_id,'bg1');
  assert.equal(fixture.tables.get('proyectos').length,1);
  assert.equal(fixture.rpcCalls.length,1);
});

test('el chat de obra recibe sus actividades, materiales y cliente actuales del servidor en vez de pedir datos guardados',async()=>{
 fixture.tables.set('proyectos',[{id:'p-a',empresa_id:'company-a',nombre:'Terraza',cliente_id:'c1'}]);
 fixture.tables.set('clientes',[{id:'c1',empresa_id:'company-a',nombre:'Ana',email:'ana@example.test'}]);
 fixture.tables.set('actividades',[{id:'act1',proyecto_id:'p-a',nombre:'Montaje',porcentaje_avance:25}]);
 fixture.tables.set('materiales_proyecto',[{id:'m1',proyecto_id:'p-a',nombre:'Madera',comprado:false,cantidad:20}]);
 const handler=createChatHandler({authorize:authorized,global:async()=>response,project:async({contextoDB})=>{
  assert.equal(contextoDB.operacion_obra.registros.actividades.incluidos[0].id,'act1');assert.equal(contextoDB.operacion_obra.registros.materiales_proyecto.incluidos[0].nombre,'Madera');assert.equal(contextoDB.cliente_actual.email,'ana@example.test');return response;
 }});
 assert.equal((await handler(makeRequest({mensaje:'¿Qué falta comprar?',contexto_proyecto:{materiales:[{nombre:'Inventado'}]}}),'p-a')).status,200);
});

test('consulta de obras vencidas usa registros autorizados actuales, sin llamada al modelo ni cargar módulos ajenos',async()=>{
 fixture.tables.set('proyectos',[
  {id:'expired-a',empresa_id:'company-a',nombre:'Pintura vencida',estado:'activo',fecha_termino_estimada:'2000-01-01'},
  {id:'expired-b',empresa_id:'company-a',nombre:'Piso vencido',estado:'activo',fecha_termino_estimada:'2000-01-02'},
  {id:'closed',empresa_id:'company-a',nombre:'Obra cerrada',estado:'terminado',fecha_termino_estimada:'2000-01-01'},
  {id:'foreign',empresa_id:'otra-empresa',nombre:'Obra privada',estado:'activo',fecha_termino_estimada:'2000-01-01'},
 ]);
 const never=async()=>{throw new Error('No debe esperar al modelo para leer plazos')};
 const handler=createChatHandler({authorize:authorized,global:never,project:never});
 const res=await handler(makeRequest({mensaje:'¿Qué obras tengo vencidas?',historial:[{remitente:'agente',texto:'No hay obras vencidas'}]}));
 assert.equal(res.status,200);
 const result=await res.json();assert.match(result.respuesta,/Tienes 2 obras/);assert.match(result.respuesta,/Pintura vencida/);assert.doesNotMatch(result.respuesta,/Obra privada/);assert.equal(result.accion,null);
 assert.equal(fixture.calls.some(call=>call.table==='materiales_proyecto'),false);
 const denied=await handler(makeRequest({mensaje:'Obras vencidas'}),'foreign');assert.equal(denied.status,403);
});

test('si falla la lectura de proyectos no informa falsamente cero obras vencidas',async()=>{
 fixture.fail('proyectos');
 const handler=createChatHandler({authorize:authorized,global:async()=>response,project:async()=>response});
 const res=await handler(makeRequest({mensaje:'Obras vencidas'}));
 assert.equal(res.status,503);assert.equal((await res.json()).respuesta,undefined);
});

test('el chat web propone el estado exacto solicitado sin inventar monto ni esperar al modelo',async()=>{
 fixture.tables.set('proyectos',[{id:'floor',empresa_id:'company-a',nombre:'Porcelanato La Florida',estado:'activo',monto_cotizado:570493},{id:'other',empresa_id:'company-a',nombre:'Quincho',estado:'activo',monto_cotizado:2500000}]);
 const never=async()=>{throw Error('No debe llamar al modelo')};
 const handler=createChatHandler({authorize:authorized,global:never,project:never});
 const res=await handler(makeRequest({mensaje:'Pon esa obra como terminada',historial:[{remitente:'agente',texto:'Porcelanato La Florida tiene 3 días de atraso.'}]}));
 assert.equal(res.status,200);const body=await res.json();
 assert.deepEqual(body.accion,{tipo:'actualizar_proyecto',proyecto_id:'floor',estado:'terminado'});
 assert.doesNotMatch(body.respuesta,/guardad|listo/i);
});

test('el widget resuelve «quiero que la dejes como cancelada» después del listado de vencidas',async()=>{
 fixture.tables.set('proyectos',[{id:'floor',empresa_id:'company-a',nombre:'Porcelanato La Florida',estado:'activo',monto_cotizado:570493},{id:'other',empresa_id:'company-a',nombre:'Ampliación PAC',estado:'activo',monto_cotizado:12000000}]);
 const never=async()=>{throw Error('La instrucción inequívoca no necesita llamar al modelo')};
 const handler=createChatHandler({authorize:authorized,global:never,project:never});
 const result=await handler(makeRequest({mensaje:'quiero que la dejes como cancelada',historial:[{remitente:'usuario',texto:'hay obras con plazo vencido?'},{remitente:'agente',texto:'Tienes 1 obra con el plazo vencido: Porcelanato La Florida, hace 3 días.'}]}));
 assert.equal(result.status,200);
 const body=await result.json();assert.deepEqual(body.accion,{tipo:'actualizar_proyecto',proyecto_id:'floor',estado:'cancelada'});
 assert.doesNotMatch(body.respuesta,/guardad|quedó|listo/);
});

test('el chat conserva la orden durante una aclaración sin adivinar entre varias obras',async()=>{
 fixture.tables.set('proyectos',[{id:'north',empresa_id:'company-a',nombre:'Obra Norte',estado:'activo'},{id:'south',empresa_id:'company-a',nombre:'Obra Sur',estado:'activo'}]);
 const never=async()=>{throw Error('No debe delegar una aclaración determinística al modelo')};
 const handler=createChatHandler({authorize:authorized,global:never,project:never});
 const message='Déjala como cancelada';
 const first=await handler(makeRequest({mensaje:message,historial:[{remitente:'agente',texto:'Obra Norte y Obra Sur tienen pendientes.'}]}));
 const pending=await first.json();assert.equal(pending.accion,null);assert.match(pending.respuesta,/Qué obra/);
 const second=await handler(makeRequest({mensaje:'Obra Sur',historial:[{remitente:'usuario',texto:message},{remitente:'agente',texto:pending.respuesta}]}));
 assert.deepEqual((await second.json()).accion,{tipo:'actualizar_proyecto',proyecto_id:'south',estado:'cancelada'});
});

test('la obra de referencia llega al modelo y no se toma de inventarios del navegador',async()=>{
 fixture.tables.set('proyectos',[{id:'north',empresa_id:'company-a',nombre:'Obra Norte',estado:'activo'},{id:'south',empresa_id:'company-a',nombre:'Obra Sur',estado:'activo'}]);
 const handler=createChatHandler({authorize:authorized,global:async(_history,_message,context)=>{assert.equal(context.proyecto_actual.id,'north');assert.equal(context.proyecto_actual.nombre,'Obra Norte');return response;},project:async()=>response});
 const out=await handler(makeRequest({mensaje:'¿Qué materiales le faltan?',proyecto_actual:{id:'south'},historial:[{remitente:'usuario',texto:'Veamos Obra Norte'},{remitente:'agente',texto:'¿Qué necesitas revisar?'}]}));
 assert.equal(out.status,200);
});

test('una consulta o negativa no permite que el modelo cambie el estado',async()=>{
 fixture.tables.set('proyectos',[{id:'floor',empresa_id:'company-a',nombre:'Radier',estado:'activo'}]);
 const wrong=async()=>({...response,accion:{tipo:'actualizar_proyecto',proyecto_id:'floor',estado:'cancelada'}});
 const handler=createChatHandler({authorize:authorized,global:wrong,project:wrong});
 for(const mensaje of ['No la canceles','Solo quiero saber si está cancelada','¿Está cancelada?']){
  const out=await handler(makeRequest({mensaje}));assert.equal(out.status,422);assert.equal((await out.json()).accion,undefined);
 }
});

test('el chat de una obra no propone modificar otra aunque se mencione su nombre',async()=>{
 fixture.tables.set('proyectos',[{id:'north',empresa_id:'company-a',nombre:'Obra Norte',estado:'activo'},{id:'south',empresa_id:'company-a',nombre:'Obra Sur',estado:'activo'}]);
 const never=async()=>{throw Error('No debe llamar al modelo')};
 const handler=createChatHandler({authorize:authorized,global:never,project:never});
 const out=await handler(makeRequest({mensaje:'Cancela la obra Obra Sur'}),'north');
 assert.equal(out.status,422);assert.equal((await out.json()).code,'PROJECT_CONTEXT');
});

test('web y widget conservan el registro entre mensajes y consultas sin depender del modelo para completar teléfonos', async()=>{
  const {conversationRequest}=require('../lib/ai/conversation.ts');
  fixture.tables.set('proyectos',[{id:'bath',nombre:'Baño',empresa_id:'company-a'},{id:'terrace',nombre:'Terraza',empresa_id:'company-a'}]);
  let calls=0;
  const handler=createChatHandler({authorize:authorized,global:async()=>{calls++;return {...response,respuesta:'Baño y Terraza están en curso.'}},project:async()=>{throw Error('No debe llamar al modelo para el registro');}});
  let messages=[];
  async function send(message,scope){
    const result=await handler(makeRequest({mensaje:message,historial:conversationRequest(messages,message)}),scope);
    assert.equal(result.status,200);const data=await result.json();
    messages.push({remitente:'usuario',texto:message},{remitente:'agente',texto:data.respuesta,accion_ejecutada:data.accion_ejecutada});
    return data;
  }
  let reply=await send('Necesito agregar un trabajador');
  assert.match(reply.respuesta,/Nombre completo/);assert.equal(calls,0);
  reply=await send('Ramón Escobar, terreno, 67345678, rut 200635468, correo ramon@example.test, asignalo a la obra Baño');
  assert.match(reply.respuesta,/RUT válido/);assert.doesNotMatch(reply.respuesta,/duración|Teléfono|Correo/);assert.equal(calls,0);
  reply=await send('¿Qué obras tengo?');assert.equal(calls,1);assert.ok(reply.accion_ejecutada.detalles.borrador_registro);
  reply=await send('12.345.678-5');
  assert.equal(calls,1);assert.equal(reply.accion.tipo,'lote_acciones');
  assert.equal(reply.accion.acciones[0].telefono,'+56967345678');assert.equal(reply.accion.acciones[1].proyecto_id,'bath');
});

test('una gestión de seguimiento usa la obra del contexto y no vuelve a pedirla si es inequívoca',async()=>{
 fixture.tables.set('proyectos',[{id:'bath',nombre:'Baño',empresa_id:'company-a'},{id:'terrace',nombre:'Terraza',empresa_id:'company-a'}]);
 const handler=createChatHandler({authorize:authorized,global:async()=>({...response,accion:{tipo:'registrar_pago',monto:50000}}),project:async()=>response});
 const out=await handler(makeRequest({mensaje:'Registra un abono de 50 mil',historial:[{remitente:'usuario',texto:'Veamos Baño'},{remitente:'agente',texto:'Baño está en curso.'}]}));
 const data=await out.json();assert.equal(out.status,200);assert.equal(data.accion.proyecto_id,'bath');
});

test('el registro rápido tampoco permite saltarse la pertenencia del chat de una obra',async()=>{
 const never=async()=>{throw Error('No llamar al modelo');};
 const handler=createChatHandler({authorize:authorized,global:never,project:never});
 const out=await handler(makeRequest({mensaje:'Agrega al trabajador Ramón Escobar'}),'other-company-project');
 assert.equal(out.status,403);assert.equal((await out.json()).code,'PROJECT_FORBIDDEN');
 assert.ok(!fixture.calls.some(call=>['upsert','update'].includes(call.mode)));
});

test('la edición web conserva el nombre solicitado y usa el RUT siguiente solo para identificar la ficha',async()=>{
 const {conversationRequest}=require('../lib/ai/conversation.ts');
 fixture.tables.set('usuarios',[{id:'bad-name',empresa_id:'company-a',nombre:'Ya te di todos los datos',rut:'12345678-5',telefono_whatsapp:'+56967345678',rol:'terreno'}]);
 const never=async()=>{throw Error('No debe delegar esta corrección al modelo');};
 const handler=createChatHandler({authorize:authorized,global:never,project:never});
 const original='Ok pero cámbiale el nombre, se llama Felipe melo';
 const first=await handler(makeRequest({mensaje:original}));const pending=await first.json();
 assert.equal(first.status,200);assert.equal(pending.accion,null);assert.equal(pending.accion_ejecutada.detalles.edicion_nombre_pendiente.nuevo_nombre,'Felipe melo');
 const messages=[{remitente:'usuario',texto:original},{remitente:'agente',texto:pending.respuesta,accion_ejecutada:pending.accion_ejecutada}];
 const second=await handler(makeRequest({mensaje:'Su rut es 123456785',historial:conversationRequest(messages,'Su rut es 123456785')}));
 assert.equal(second.status,200);const reply=await second.json();
 assert.deepEqual(reply.accion,{tipo:'actualizar_trabajador',usuario_id:'bad-name',nuevo_nombre:'Felipe melo'});
 assert.equal(reply.accion_ejecutada.detalles.edicion_nombre_pendiente,null);
});
