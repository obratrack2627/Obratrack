require("./helpers/typescript.cjs");
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const fixture = require("./helpers/supabase.cjs");
require.cache[require.resolve("../lib/supabase/client.ts")] = {
  id: require.resolve("../lib/supabase/client.ts"),
  filename: require.resolve("../lib/supabase/client.ts"),
  loaded: true,
  exports: fixture,
};
require("./helpers/browser.cjs")();
const { dataService } = require("../lib/data-service.ts");
const server = require("../lib/ai/server.ts");
let user;
server.authorizeAI = async () => ({ client: fixture.supabase, user });
const { GET, POST } = require("../app/api/supabase/sync/route.ts");
const originalFetch = global.fetch;
const p1 = {
  id: "p1",
  empresa_id: "a",
  nombre: "Obra A",
  monto_cotizado: 100000,
  fecha_inicio: "2026-10-29",
  fecha_termino_estimada: "2026-11-10",
  estado: "activo",
};
const request = (body) =>
  new NextRequest("https://example.test/api/supabase/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  fixture.reset();
  localStorage.clear();
  user = {
    id: "u",
    empresa_id: "a",
    nombre: "Admin",
    rol: "admin",
    auth_user_id: "u",
  };
  localStorage.setItem("obratrack_active_user_v7", JSON.stringify(user));
  localStorage.setItem("obratrack_usuarios_v7_a", JSON.stringify([user]));
  localStorage.setItem("obratrack_active_plan_v7_a", JSON.stringify("pro_ia"));
  fixture.tables.set("usuarios", [user]);
  fixture.tables.set("empresas", [{ id: "a", plan_id: "pro_ia" }]);
  fixture.tables.set("proyectos", [p1]);
});
afterEach(() => {
  dataService.runLocalAI(() => {});
  global.fetch = originalFetch;
});
test("la sincronización de un pago conserva avances recibidos y el plan contratado", async () => {
  fixture.tables.set("bitacora_entradas", [
    { id: "wa-photo", proyecto_id: "p1", nota: "Avance recibido por WhatsApp" },
  ]);
  fixture.tables.set("empresas", [{ id: "a", plan_id: "gratis" }]);
  const res = await POST(
    request({
      empresaId: "b",
      cambios: {
        pagos: [
          {
            id: "pay1",
            proyecto_id: "p1",
            monto: 10000,
            fecha: "2026-10-29",
            estado: "completado",
          },
        ],
      },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(fixture.tables.get("pagos").length, 1);
  assert.equal(
    fixture.tables.get("bitacora_entradas")[0].nota,
    "Avance recibido por WhatsApp",
  );
  assert.equal(fixture.tables.get("empresas")[0].plan_id, "gratis");
});
test("la sesión decide la empresa; un snapshot antiguo, obra ajena o escalada de rol se rechazan", async () => {
  fixture.tables.set("proyectos", [p1, { ...p1, id: "pb", empresa_id: "b" }]);
  const read = await (
    await GET(
      new NextRequest("https://example.test/api/supabase/sync?empresaId=b"),
    )
  ).json();
  assert.equal(read.empresaId, "a");
  assert.deepEqual(
    read.proyectos.map((p) => p.id),
    ["p1"],
  );
  assert.equal((await POST(request({ proyectos: [p1] }))).status, 409);
  assert.equal(
    (
      await POST(
        request({
          cambios: { pagos: [{ id: "bad", proyecto_id: "pb", monto: 10 }] },
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await POST(
        request({ cambios: { usuarios: [{ ...user, rol: "supervisor" }] } }),
      )
    ).status,
    403,
  );
  assert.ok(!fixture.calls.some((c) => c.mode === "upsert"));
});
test("un fallo de escritura nunca confirma la sincronización", async () => {
  fixture.fail("pagos", 1, "upsert");
  const res = await POST(
    request({
      cambios: { pagos: [{ id: "pay1", proyecto_id: "p1", monto: 1000 }] },
    }),
  );
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "SYNC_SAVE");
});
test("el navegador envía solo la obra editada, sin reenviar otra obra antigua", async () => {
  localStorage.setItem(
    "obratrack_proyectos_v7_a",
    JSON.stringify([
      p1,
      { ...p1, id: "p2", nombre: "Obra antigua en otra pestaña" },
    ]),
  );
  dataService.updateProyecto("p1", { nombre: "Obra actualizada" });
  let sent;
  global.fetch = async (url, options) => {
    assert.match(options.headers.Authorization, /^Bearer /);
    sent = JSON.parse(options.body);
    return new Response("{}", { status: 200 });
  };
  assert.equal((await dataService.pushToCloudServer()).success, true);
  assert.deepEqual(
    sent.cambios.proyectos.map((p) => p.id),
    ["p1"],
  );
  assert.equal(sent.cambios.proyectos[0].nombre, "Obra actualizada");
  assert.equal(
    Object.keys(
      JSON.parse(localStorage.getItem("obratrack_dirty_v1_a")).proyectos,
    ).length,
    0,
  );
});
test("leer una base vacía elimina la caché antigua y no resucita obras eliminadas", async () => {
  localStorage.setItem("obratrack_proyectos_v7_a", JSON.stringify([p1]));
  let posts = 0;
  global.fetch = async (url, options) => {
    if (options.method === "POST") posts++;
    return new Response(
      JSON.stringify({
        empresaId: "a",
        proyectos: [],
        usuarios: [user],
        clientes: [],
        actividades: [],
        pagos: [],
        materiales: [],
        bitacora: [],
        imprevistos: [],
        reclamos_cambios: [],
        documentos: [],
        asistencias: [],
        reportes_whatsapp: [],
        plan_id: "pro_ia",
      }),
      { status: 200 },
    );
  };
  assert.equal((await dataService.pullFromCloudServer()).success, true);
  assert.equal(dataService.getProyectos().length, 0);
  assert.equal(posts, 0);
});

test("actualizar la caché incorpora las tres obras y conserva solamente las ediciones locales pendientes", async () => {
  localStorage.setItem(
    "obratrack_proyectos_v7_a",
    JSON.stringify([
      { ...p1, nombre: "Cambio local pendiente" },
      { ...p1, id: "old" },
    ]),
  );
  localStorage.setItem(
    "obratrack_dirty_v1_a",
    JSON.stringify({
      proyectos: { p1: { ...p1, nombre: "Cambio local pendiente" } },
    }),
  );
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        empresaId: "a",
        proyectos: [p1, { ...p1, id: "p2" }, { ...p1, id: "p3" }],
      }),
    );
  assert.equal((await dataService.pullFromCloudServer()).success, true);
  assert.deepEqual(
    dataService
      .getProyectos()
      .map((p) => p.id)
      .sort(),
    ["p1", "p2", "p3"],
  );
  assert.equal(
    dataService.getProyectoById("p1").nombre,
    "Cambio local pendiente",
  );
  assert.ok(
    JSON.parse(localStorage.getItem("obratrack_dirty_v1_a")).proyectos.p1,
  );
});

test("lecturas simultáneas comparten la petición y una respuesta de otra sesión no contamina la caché", async () => {
  let release;
  let requests = 0;
  global.fetch = async () => {
    requests++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = dataService.pullFromCloudServer();
  const second = dataService.pullFromCloudServer();
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  localStorage.setItem(
    "obratrack_active_user_v7",
    JSON.stringify({ ...user, id: "another", empresa_id: "b" }),
  );
  release(new Response(JSON.stringify({ empresaId: "a", proyectos: [p1] })));
  assert.equal((await first).success, false);
  assert.equal((await second).success, false);
  assert.equal(localStorage.getItem("obratrack_proyectos_v7_b"), null);
  assert.equal(localStorage.getItem("obratrack_proyectos_v7_a"), null);
});

test("un fallo de red conserva las obras locales y permite recuperar las tres en el siguiente intento", async () => {
  localStorage.setItem("obratrack_proyectos_v7_a", JSON.stringify([p1]));
  global.fetch = async () => {
    throw Error("offline");
  };
  assert.equal((await dataService.pullFromCloudServer()).success, false);
  assert.equal(dataService.getProyectos().length, 1);
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        empresaId: "a",
        proyectos: [p1, { ...p1, id: "p2" }, { ...p1, id: "p3" }],
      }),
    );
  assert.equal((await dataService.pullFromCloudServer()).success, true);
  assert.equal(dataService.getProyectos().length, 3);
});

test("una lectura que responde con otra empresa no reemplaza los datos de la cuenta activa", async () => {
  localStorage.setItem("obratrack_proyectos_v7_a", JSON.stringify([p1]));
  global.fetch = async () =>
    new Response(JSON.stringify({ empresaId: "b", proyectos: [] }));
  assert.equal((await dataService.pullFromCloudServer()).success, false);
  assert.equal(dataService.getProyectos().length, 1);
});

test("subidas simultáneas no reenvían dos veces los mismos cambios pendientes", async () => {
  localStorage.setItem(
    "obratrack_dirty_v1_a",
    JSON.stringify({ proyectos: { p1 } }),
  );
  let release;
  let requests = 0;
  global.fetch = async () => {
    requests++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = dataService.pushToCloudServer();
  const second = dataService.pushToCloudServer();
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  release(new Response("{}"));
  assert.equal((await first).success, true);
  assert.equal((await second).success, true);
  assert.equal(
    Object.keys(
      JSON.parse(localStorage.getItem("obratrack_dirty_v1_a")).proyectos,
    ).length,
    0,
  );
});

test('un imprevisto se sincroniza con su evidencia y monto contra el esquema de producción', async () => {
  const { POST } = require('../app/api/supabase/sync/route.ts');
  const response = await POST(request({ cambios: { imprevistos: [{ id: 'incident-sync', proyecto_id: p1.id, descripcion: 'Ajuste de obra', monto: 12000, origen: 'manual', estado: 'pendiente', fecha: '2026-11-02', foto_url: 'https://example.test/evidencia.png' }] } }));
  assert.equal(response.status, 200);
  const saved = fixture.tables.get('imprevistos').find((r) => r.id === 'incident-sync');
  assert.equal(saved.monto_adicional,12000);
  assert.equal(saved.foto_url,'https://example.test/evidencia.png');
});

test('actualizar desde la nube incorpora los contactos editados en WhatsApp al usuario activo', async () => {
  const profile={...user,email:'contacto-nuevo@example.test',email_acceso:'login-original@example.test',telefono_whatsapp:'+56988887777',nombre:'Nombre corregido'};
  global.fetch=async()=>new Response(JSON.stringify({empresaId:'a',usuarios:[profile],proyectos:[p1]}),{status:200});
  assert.equal((await dataService.pullFromCloudServer()).success,true);
  assert.equal(dataService.getActiveUser().email,profile.email);
  assert.equal(dataService.getActiveUser().email_acceso,profile.email_acceso);
  assert.equal(dataService.getUsuarios()[0].telefono_whatsapp,profile.telefono_whatsapp);
  assert.equal(dataService.getUsuarios()[0].nombre,profile.nombre);
  assert.equal(dataService.getActiveUser().auth_user_id,user.auth_user_id);
});

test('el historial de proyecto pendiente no se guarda en la empresa de una sesión nueva',async()=>{
 const {supabaseService}=require('../lib/supabase/supabase-service.ts');
 const original=supabaseService.getProyectoChatHistorial;let finish;
 supabaseService.getProyectoChatHistorial=()=>new Promise(resolve=>{finish=resolve});
 try {
  const loading=dataService.loadProyectoChatFromSupabase('p1');
  localStorage.setItem('obratrack_active_user_v7',JSON.stringify({id:'new-user',empresa_id:'b',rol:'admin'}));
  finish([{id:'old-private',proyecto_id:'p1',empresa_id:'a',remitente:'usuario',texto:'Contexto de otra empresa',created_at:'2026-11-04T12:00:00Z'}]);
  assert.deepEqual(await loading,[]);assert.deepEqual(dataService.getProyectoChatHistorial('p1'),[]);
 } finally {supabaseService.getProyectoChatHistorial=original;}
});

test('el estado confirmado no se reenvía como pendiente ni retrocede con una lectura iniciada antes', async () => {
  const {supabaseService}=require('../lib/supabase/supabase-service.ts');
  const original=supabaseService.cambiarEstadoProyecto;
  const other={...p1,id:'p2',nombre:'Obra B'};
  localStorage.setItem('obratrack_proyectos_v7_a',JSON.stringify([p1,other]));
  let release,started;
  const fetching=new Promise(resolve=>{started=resolve});
  global.fetch=()=>{started();return new Promise(resolve=>{release=resolve})};
  supabaseService.cambiarEstadoProyecto=async(id,estado)=>({...p1,id,estado});
  try {
    const loading=dataService.pullFromCloudServer();await fetching;
    await dataService.cambiarEstadoProyecto('p1','terminado');
    assert.equal(dataService.getProyectoById('p1').estado,'terminado');
    assert.equal(JSON.parse(localStorage.getItem('obratrack_dirty_v1_a')||'{}').proyectos?.p1,undefined);
    release(new Response(JSON.stringify({empresaId:'a',proyectos:[p1,other]}),{status:200}));
    assert.equal((await loading).success,true);
    assert.equal(dataService.getProyectoById('p1').estado,'terminado');
    assert.equal(dataService.getProyectoById('p2').estado,'activo');
    global.fetch=async()=>new Response(JSON.stringify({empresaId:'a',proyectos:[{...p1,estado:'cancelada'},other]}),{status:200});
    await dataService.pullFromCloudServer();
    assert.equal(dataService.getProyectoById('p1').estado,'cancelada');
  } finally {supabaseService.cambiarEstadoProyecto=original;}
});

test('editar una obra espera al guardado y conserva los datos locales si falla la nube',async()=>{
 localStorage.setItem('obratrack_proyectos_v7_a',JSON.stringify([p1]));
 global.fetch=async()=>new Response('{}',{status:503});
 await assert.rejects(dataService.guardarEdicionProyecto('p1',{nombre:'Cambio sin confirmar'}),/No se pudo confirmar/);
 assert.equal(dataService.getProyectoById('p1').nombre,'Obra A');
 assert.equal(JSON.parse(localStorage.getItem('obratrack_dirty_v1_a')||'{}').proyectos?.p1,undefined);
});
test('editar una obra confirma nombre y asignación sin crear otro guardado pendiente',async()=>{
 localStorage.setItem('obratrack_proyectos_v7_a',JSON.stringify([p1]));
 let sent;
 global.fetch=async(url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({success:true}),{status:200})};
 await dataService.guardarEdicionProyecto('p1',{nombre:'Nombre confirmado',trabajadores_ids:['worker']});
 assert.equal(sent.cambios.proyectos[0].nombre,'Nombre confirmado');assert.deepEqual(sent.cambios.proyectos[0].trabajadores_ids,['worker']);
 assert.equal(dataService.getProyectoById('p1').nombre,'Nombre confirmado');
 assert.equal(JSON.parse(localStorage.getItem('obratrack_dirty_v1_a')||'{}').proyectos?.p1,undefined);
});

test('sincronizar una edición conserva los cinco estados de obra sin reactivar pendientes ni canceladas',async()=>{
 for(const estado of ['pendiente','cancelada','activo','pausado','terminado']){
  const result=await POST(request({cambios:{proyectos:[{...p1,estado,nombre:'Nombre editado'}]}}));
  assert.equal(result.status,200);
  const saved=fixture.tables.get('proyectos').find(p=>p.id===p1.id);
  assert.equal(saved.estado,estado);assert.equal(saved.monto_cotizado,p1.monto_cotizado);
 }
});

test('un estado inválido se rechaza antes de escribir y conserva la obra cancelada',async()=>{
 fixture.tables.set('proyectos',[{...p1,estado:'cancelada'}]);
 for(const estado of ['inexistente','en curso',undefined]){
  const result=await POST(request({cambios:{clientes:[{id:'client-new',nombre:'No debe crearse'}],proyectos:[{...p1,estado}]}}));
  assert.equal(result.status,400);assert.equal((await result.json()).code,'SYNC_INVALID');
  assert.equal(fixture.tables.get('proyectos')[0].estado,'cancelada');
  assert.equal((fixture.tables.get('clientes')||[]).length,0);
 }
});

test('sincronizar una ficha existente actualiza sus contactos sin reinsertar al administrador ni alterar su acceso', async () => {
  const profile = {...user,is_dev:true};
  fixture.tables.set('usuarios',[profile]);
  fixture.fail('usuarios', 1, 'upsert'); // Las altas de cuentas existentes dispararían el bloqueo de la base.
  const response = await POST(request({cambios:{usuarios:[{id:user.id,nombre:'Nombre corregido',rol:'admin',email:'nuevo@example.test',rut:'12.345.678-5',is_dev:false}]}}));
  assert.equal(response.status,200);
  const saved=fixture.tables.get('usuarios')[0];
  assert.equal(saved.nombre,'Nombre corregido');
  assert.equal(saved.auth_user_id,user.auth_user_id);
  assert.equal(saved.is_dev,true);
  assert.equal(saved.rol,'admin');
  assert.equal(saved.rut,'12.345.678-5');
  assert.ok(!fixture.calls.some(call=>call.table==='usuarios'&&call.mode==='upsert'));
});

test('sincronización no permite cambiar el vínculo de acceso ni conceder privilegios Dev', async () => {
  const denied=await POST(request({cambios:{usuarios:[{...user,auth_user_id:null}]}}));
  assert.equal(denied.status,403);
  const ignored=await POST(request({cambios:{usuarios:[{...user,is_dev:true,nombre:'Nombre permitido'}]}}));
  assert.equal(ignored.status,200);
  assert.equal(fixture.tables.get('usuarios')[0].is_dev,undefined);
  assert.equal(fixture.tables.get('usuarios')[0].auth_user_id,user.auth_user_id);
});

test('cargar la ficha activa en un dispositivo nuevo no genera escrituras pendientes', () => {
  localStorage.setItem('obratrack_usuarios_v7_a', JSON.stringify([{id:'worker-only',empresa_id:'a',nombre:'Trabajador',rol:'terreno'}]));
  dataService.getUsuarios();
  assert.equal(localStorage.getItem('obratrack_dirty_v1_a'),null);
  dataService.updateUsuario(user.id,{nombre:'Edición real'});
  assert.equal(JSON.parse(localStorage.getItem('obratrack_dirty_v1_a')).usuarios[user.id].nombre,'Edición real');
});

test('un rechazo identifica la partida y conserva exactamente el cambio pendiente', async () => {
  fixture.fail('actividades',1,'upsert');
  const failed=await POST(request({cambios:{actividades:[{id:'act-1',proyecto_id:p1.id,nombre:'Estructura metálica',fecha_inicio:'2026-11-01',fecha_termino:'2026-11-15',estado:'pendiente'}]}}));
  const payload=await failed.json();
  assert.match(payload.error,/partida «Estructura metálica»/);
  const pending={actividades:{'act-1':{id:'act-1',proyecto_id:p1.id,nombre:'Estructura metálica'}}};
  localStorage.setItem('obratrack_dirty_v1_a',JSON.stringify(pending));
  global.fetch=async()=>new Response(JSON.stringify(payload),{status:503});
  const result=await dataService.pushToCloudServer();
  assert.equal(result.success,false);assert.equal(result.message,payload.error);
  assert.deepEqual(JSON.parse(localStorage.getItem('obratrack_dirty_v1_a')),pending);
});

test('renueva una sesión rechazada una sola vez y reenvía el mismo cambio con el token nuevo', async () => {
  const originalRefresh=fixture.supabase.auth.refreshSession;
  let refreshes=0;const calls=[];
  localStorage.setItem('obratrack_dirty_v1_a',JSON.stringify({proyectos:{p1}}));
  fixture.supabase.auth.refreshSession=async()=>{refreshes++;return {data:{session:{access_token:'renewed-fixture-token'}},error:null};};
  global.fetch=async(url,options)=>{calls.push(options);return calls.length===1?new Response('{}',{status:401}):new Response('{}',{status:200});};
  try {
    const result=await dataService.pushToCloudServer();
    assert.equal(result.success,true);assert.equal(refreshes,1);assert.equal(calls.length,2);
    assert.equal(calls[1].headers.Authorization,'Bearer renewed-fixture-token');
    assert.equal(calls[0].body,calls[1].body);
    assert.deepEqual(JSON.parse(localStorage.getItem('obratrack_dirty_v1_a')).proyectos,{});
  } finally {fixture.supabase.auth.refreshSession=originalRefresh;}
});

test('una sesión que no se puede renovar conserva los cambios y solicita iniciar sesión sin bucles', async () => {
  const originalRefresh=fixture.supabase.auth.refreshSession;
  let refreshes=0,posts=0;
  localStorage.setItem('obratrack_dirty_v1_a',JSON.stringify({proyectos:{p1}}));
  fixture.supabase.auth.refreshSession=async()=>{refreshes++;return {data:{session:null},error:new Error('Invalid refresh')};};
  global.fetch=async()=>{posts++;return new Response('{}',{status:401});};
  try {
    const result=await dataService.pushToCloudServer();
    assert.equal(result.success,false);assert.match(result.message,/Vuelve a iniciar sesión/);
    assert.equal(refreshes,1);assert.equal(posts,1);
    assert.deepEqual(JSON.parse(localStorage.getItem('obratrack_dirty_v1_a')).proyectos.p1,p1);
  } finally {fixture.supabase.auth.refreshSession=originalRefresh;}
});

test('el administrador puede cambiar terreno y supervisor sin convertirlos en cuentas web', async () => {
  fixture.tables.set('usuarios',[user,{id:'worker-role',empresa_id:'a',nombre:'Trabajador',rol:'terreno',auth_user_id:null,is_dev:false}]);
  const changed=await POST(request({cambios:{usuarios:[{id:'worker-role',nombre:'Trabajador',rol:'supervisor'}]}}));
  assert.equal(changed.status,200);
  const worker=fixture.tables.get('usuarios').find(row=>row.id==='worker-role');
  assert.equal(worker.rol,'supervisor');assert.equal(worker.auth_user_id,null);assert.equal(worker.is_dev,false);
  assert.equal((await POST(request({cambios:{usuarios:[{id:'worker-role',rol:'admin'}]}}))).status,403);
});

test('no muestra cuerpos HTML ni mensajes desconocidos recibidos de un proxy', () => {
  const {syncFailureMessage,syncWriteFailure}=require('../lib/sync/failure.ts');
  assert.doesNotMatch(syncFailureMessage(502,{code:'UNKNOWN',error:'PRIVATE INTERNAL DETAIL'}),/PRIVATE/);
  assert.doesNotMatch(syncFailureMessage(502,'<html>PRIVATE</html>'),/PRIVATE/);
  assert.match(syncWriteFailure({code:'23503',message:'PRIVATE SQL VALUES'},'el pago').message,/asociado ya no está disponible/);
  assert.doesNotMatch(syncWriteFailure({code:'23503',message:'PRIVATE SQL VALUES'},'el pago').message,/PRIVATE/);
  assert.match(syncWriteFailure({code:'P0001',message:'CONTACT_DUPLICATE PRIVATE'},'el integrante').message,/teléfono, correo o RUT ya está registrado/);
  assert.doesNotMatch(syncWriteFailure({code:'P0001',message:'CONTACT_DUPLICATE PRIVATE'},'el integrante').message,/PRIVATE/);
  assert.match(syncWriteFailure({code:'P0001',message:'CONTACT_INVALID_PHONE'},'el integrante').message,/teléfono debe ser un número válido/);
  assert.match(syncWriteFailure({code:'P0001',message:'CONTACT_RESERVED_EMAIL'},'el integrante').message,/reservado/);
  assert.match(syncWriteFailure({code:'23505',message:'duplicate key violates "usuarios_rut_key" Key (rut)=(PRIVATE)'},'el trabajador').message,/RUT ya está registrado/);
  assert.doesNotMatch(syncWriteFailure({code:'23505',message:'duplicate key violates "usuarios_rut_key" Key (rut)=(PRIVATE)'},'el trabajador').message,/PRIVATE/);
});

test('la sincronización impide asistencia de terreno y guarda al administrador real como responsable',async()=>{
 user={...user,rol:'terreno'};
 const denied=await POST(request({cambios:{asistencias:[{id:'a-denied',proyecto_id:'p1',usuario_id:user.id,trabajador_nombre:user.nombre,fecha:'2026-11-12',estado:'presente'}]}}));
 assert.equal(denied.status,403);assert.equal((await denied.json()).code,'ATTENDANCE_FORBIDDEN');assert.equal(fixture.tables.get('asistencia_obreros')?.length || 0,0);
 user={...user,rol:'admin'};
 const allowed=await POST(request({cambios:{asistencias:[{id:'a-authorized',proyecto_id:'p1',usuario_id:user.id,trabajador_nombre:user.nombre,fecha:'2026-11-12',estado:'presente',registrado_por:'Responsable inventado'}]}}));
 assert.equal(allowed.status,200);assert.equal(fixture.tables.get('asistencia_obreros')[0].registrado_por,user.nombre);
});

test('sincroniza especialidades opcionales sin modificar roles ni credenciales y permite quitarlas', async()=>{
 for(const names of [['Carpintería','Pintura'],[]]){
  const response=await POST(request({cambios:{usuarios:[{id:user.id,especialidades:names}]}}));
  assert.equal(response.status,200);
  assert.deepEqual(fixture.tables.get('usuarios')[0].especialidades,names);
  assert.equal(fixture.tables.get('usuarios')[0].auth_user_id,user.auth_user_id);
 }
 assert.equal((await POST(request({cambios:{usuarios:[{id:user.id,especialidades:'Pintura'}]}}))).status,422);
});

test('borrados rechazados conservan su operación, no reaparecen al actualizar y se reintentan con los mismos IDs', async()=>{
 const pay={id:'pay-delete',proyecto_id:'p1',monto:2400000,metodo:'transferencia',fecha:'2026-11-13'};
 fixture.tables.set('pagos',[pay]);
 localStorage.setItem('obratrack_proyectos_v7_a',JSON.stringify([p1]));localStorage.setItem('obratrack_pagos_v7_a',JSON.stringify([pay]));
 let failing=true;
 global.fetch=async(url,init)=>{
  if(init?.method==='POST')return failing ? Response.json({error:'Error temporal'},{status:503}) : POST(request(JSON.parse(init.body)));
  return GET(new NextRequest('https://example.test/api/supabase/sync'));
 };
 dataService.deletePago(pay.id);
 assert.equal(dataService.getPagos().length,0);assert.equal(dataService.pendingCloudChanges(),1);
 assert.equal((await dataService.pushToCloudServer()).success,false);
 await dataService.pullFromCloudServer();assert.equal(dataService.getPagos().length,0);
 // Una lectura antigua al restaurar la sesión tampoco revive una eliminación pendiente.
 localStorage.setItem('obratrack_pagos_v7_a',JSON.stringify([pay]));assert.equal(dataService.getPagos().length,0);
 failing=false;await dataService.confirmarCambios();assert.equal(dataService.pendingCloudChanges(),0);assert.equal(fixture.tables.get('pagos').length,0);
 await dataService.pullFromCloudServer();assert.equal(dataService.getPagos().length,0);
});

test('el borrado solo afecta la empresa y no elimina cuentas Auth ni acepta claves de tablas heredadas',async()=>{
 fixture.tables.set('proyectos',[p1,{...p1,id:'foreign',empresa_id:'other'}]);fixture.tables.set('pagos',[{id:'owned',proyecto_id:'p1'},{id:'foreign-pay',proyecto_id:'foreign'}]);
 const res=await POST(request({cambios:{},eliminados:{pagos:['owned','foreign-pay']}}));assert.equal(res.status,200);assert.deepEqual(fixture.tables.get('pagos').map(row=>row.id),['foreign-pay']);
 assert.equal((await POST(request({cambios:{},eliminados:{usuarios:[user.id]}}))).status,403);
 assert.equal((await POST(request(JSON.parse('{"cambios":{},"eliminados":{"toString":["x"]}}')))).status,400);
});

test('POST /api/supabase/sync normaliza URLs firmadas de whatsapp-evidencias al formato persistente', async () => {
  fixture.tables.set('proyectos', [p1]);
  const signed = (name) => `${fixture.supabaseUrl}/storage/v1/object/sign/whatsapp-evidencias/a/u/${name}?token=tmp`;
  const res = await POST(request({
    cambios: {
      pagos: [{ id: 'pay-url', proyecto_id: 'p1', monto: 50000, metodo: 'transferencia', fecha: '2026-11-13', comprobante_url: signed('pago.jpg') }],
      bitacora: [{ id: 'bit-url', proyecto_id: 'p1', titulo: 'Avance', nota: 'Ok', tipo: 'avance', fecha: '2026-11-13', foto_url: signed('bit.jpg') }],
      imprevistos: [{ id: 'imp-url', proyecto_id: 'p1', titulo: 'Falla', descripcion: 'Detalle', monto: 10000, fecha: '2026-11-13', foto_url: signed('imp.jpg') }],
      reclamos_cambios: [{ id: 'rc-url', proyecto_id: 'p1', tipo: 'cambio', prioridad: 'alta', estado: 'pendiente', titulo: 'Cambio', descripcion: 'Desc', foto_url: signed('rc.jpg') }],
      documentos: [{ id: 'doc-url', proyecto_id: 'p1', categoria: 'factura_boleta', nombre: 'Doc', archivo_url: signed('doc.pdf') }],
    },
  }));
  assert.equal(res.status, 200);
  assert.equal(fixture.tables.get('pagos')[0].comprobante_url, 'whatsapp-evidencias:a/u/pago.jpg');
  assert.equal(fixture.tables.get('bitacora_entradas')[0].foto_url, 'whatsapp-evidencias:a/u/bit.jpg');
  assert.equal(fixture.tables.get('imprevistos')[0].foto_url, 'whatsapp-evidencias:a/u/imp.jpg');
  assert.equal(fixture.tables.get('reclamos_cambios_obra')[0].foto_url, 'whatsapp-evidencias:a/u/rc.jpg');
  assert.equal(fixture.tables.get('documentos_obra')[0].archivo_url, 'whatsapp-evidencias:a/u/doc.pdf');
});

test('dataService.updateUsuario no promueve trabajadores a admin ni degrada cuentas admin', () => {
  const worker = { id: 'w-1', empresa_id: 'a', nombre: 'Maestro', email: 'benja105.achavar@gmail.com', rol: 'terreno', auth_user_id: null, is_dev: false };
  localStorage.setItem('obratrack_usuarios_v7_a', JSON.stringify([user, worker]));

  const updatedWorker = dataService.updateUsuario('w-1', { rol: 'admin', nombre: 'Maestro Editado' });
  assert.equal(updatedWorker.rol, 'terreno');
  assert.equal(updatedWorker.is_dev, false);
  assert.equal(updatedWorker.nombre, 'Maestro Editado');

  const promotedSupervisor = dataService.updateUsuario('w-1', { rol: 'supervisor' });
  assert.equal(promotedSupervisor.rol, 'supervisor');

  const updatedAdmin = dataService.updateUsuario(user.id, { rol: 'terreno', nombre: 'Admin Editado' });
  assert.equal(updatedAdmin.rol, 'admin');
  assert.equal(updatedAdmin.nombre, 'Admin Editado');
});
