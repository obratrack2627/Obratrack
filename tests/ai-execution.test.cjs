require("./helpers/typescript.cjs");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./helpers/supabase.cjs");
require.cache[require.resolve("../lib/supabase/client.ts")] = {
  id: require.resolve("../lib/supabase/client.ts"),
  filename: require.resolve("../lib/supabase/client.ts"),
  loaded: true,
  exports: fixture,
};
require("./helpers/browser.cjs")();
const { dataService } = require("../lib/data-service.ts");
const { executeAI, retryAIWrite } = require("../lib/ai/execute.ts");
const active = {
  id: "owner",
  auth_user_id: "owner",
  empresa_id: "test-company",
  nombre: "Contratista",
  email: "owner@example.test",
  rol: "admin",
  telefono_whatsapp: "",
};
beforeEach(() => {
  fixture.reset();
  localStorage.clear();
  localStorage.setItem("obratrack_active_user_v7", JSON.stringify(active));
  localStorage.setItem('obratrack_usuarios_v7_test-company',JSON.stringify([active,...team]));
  localStorage.setItem(
    "obratrack_active_plan_v7_test-company",
    JSON.stringify("pro"),
  );
});
const team = ['Maestro A','Maestro B'].map((nombre,i)=>({id:'worker-'+i,empresa_id:active.empresa_id,nombre:nombre,email:nombre.toLowerCase()+'@empresa.cl',telefono_whatsapp:'+5698000000'+i,rol:'terreno',rut:i?'11111111-1':'12345678-5'}));
const project = {
  tipo: "crear_proyecto",
  nombre: "Terraza",
  comuna: "Maipú",
  monto: 3000000,
  dias: 10,
  cliente_nombre: "Cliente nuevo",
  partidas: [
    { nombre: "Fundaciones", dias: 2 },
    { nombre: "Estructura", dias: 3 },
  ],
  materiales: [
    { nombre: "Cemento", cantidad: 10, precio_unitario: 5000 },
    { nombre: "Madera", cantidad: 15, precio_unitario: 8000 },
  ],
  trabajadores_nombres: ["Maestro A", "Maestro B"],
};
test("crea obra, cliente, partidas, materiales y cuadrilla con IDs únicos y guarda cada entidad", async () => {
  const result = await executeAI(project);
  assert.ok(result.result);
  assert.equal(result.pendingId, undefined);
  assert.equal(dataService.getProyectos().length, 1);
  assert.equal(fixture.tables.get("proyectos").length, 1);
  assert.equal(fixture.tables.get("clientes").length, 1);
  assert.equal(fixture.tables.get("actividades").length, 2);
  assert.equal(
    new Set(fixture.tables.get("actividades").map((a) => a.id)).size,
    2,
  );
  assert.equal(fixture.tables.get("materiales_proyecto").length, 2);
  assert.equal(fixture.tables.get("proyecto_trabajadores").length, 2);
  assert.equal(dataService.getUsuarios().length, 3);
  assert.equal(fixture.calls.some(c => c.table === 'usuarios' && c.mode === 'upsert'), false);
  const tables = fixture.calls
    .filter((x) => x.mode === "upsert")
    .map((x) => x.table);
  assert.ok(tables.indexOf("clientes") < tables.indexOf("proyectos"));
  assert.ok(tables.indexOf("proyectos") < tables.indexOf("actividades"));
});
test("valida todo el lote antes del primer efecto local o remoto", async () => {
  await assert.rejects(
    executeAI([
      { tipo: "crear_cliente", nombre: "No debe crearse" },
      { tipo: "registrar_pago", proyecto_nombre: "Inexistente", monto: 100 },
    ]),
    /No se encontró/,
  );
  assert.equal(dataService.getClientes().length, 0);
  assert.equal(fixture.calls.length, 0);
});
test("un error de plan a mitad del lote revierte los cambios locales sin escribir en Supabase", async () => {
  localStorage.setItem('obratrack_usuarios_v7_test-company',JSON.stringify([active,...team]));
  localStorage.setItem(
    "obratrack_active_plan_v7_test-company",
    JSON.stringify("gratis"),
  );
  await assert.rejects(
    executeAI([
      { ...project, nombre: "Obra 1" },
      { ...project, nombre: "Obra 2" },
    ]),
    /Límite/,
  );
  assert.equal(dataService.getProyectos().length, 0);
  assert.equal(dataService.getClientes().length, 0);
  assert.equal(fixture.calls.length, 0);
});
test("pago fallido queda pendiente y reintentar no duplica el abono", async () => {
  await executeAI(project);
  fixture.fail("pagos");
  const result = await executeAI({
    tipo: "registrar_pago",
    proyecto_nombre: "Terraza",
    monto: 250000,
    metodo: "transferencia",
    nota: "Anticipo",
    fecha: "2026-10-27",
  });
  assert.equal(result.result, undefined);
  assert.ok(result.pendingId);
  assert.match(result.warning, /pendiente/);
  assert.equal(dataService.getPagos().length, 1);
  await retryAIWrite(result.pendingId);
  assert.equal(fixture.tables.get("pagos").length, 1);
  assert.equal(fixture.tables.get("pagos")[0].notas, "Anticipo");
  assert.equal(fixture.tables.get("pagos")[0].fecha, "2026-10-27");
  assert.equal(dataService.getPagos().length, 1);
});
test("actualiza avance, asistencia, adicionales, documentos y agenda en la obra indicada", async () => {
  await executeAI(project);
  await executeAI([
    {
      tipo: "actualizar_avance",
      proyecto_nombre: "Terraza",
      nombre: "Fundaciones",
      porcentaje_avance: 50,
    },
    {
      tipo: "registrar_asistencia",
      proyecto_nombre: "Terraza",
      trabajador_nombre: "Maestro A",
      estado: "presente",
      fecha: "2026-10-27",
      hora_entrada: "08:00",
      hora_salida: "17:00",
    },
    {
      tipo: "crear_solicitud_cambio",
      proyecto_nombre: "Terraza",
      titulo: "Techo",
      descripcion: "Techar terraza",
      monto: 500000,
      dias: 0,
    },
    {
      tipo: "registrar_documento",
      proyecto_nombre: "Terraza",
      nombre: "Acuerdo techo",
      categoria: "correo",
      correo_asunto: "Aprobación",
    },
    {
      tipo: "agendar_visita",
      titulo: "Visita",
      fecha: "2026-10-28",
      hora: "10:00",
    },
  ]);
  assert.equal(
    fixture.tables.get("actividades").find((a) => a.nombre === "Fundaciones")
      .porcentaje_avance,
    50,
  );
  assert.equal(fixture.tables.get("asistencia_obreros").length, 1);
  assert.equal(fixture.tables.get("reclamos_cambios_obra").length, 1);
  assert.equal(fixture.tables.get("documentos_obra").length, 1);
  assert.equal(fixture.tables.get("agenda_eventos").length, 1);
});
test("actualización a monto cero respeta el valor y no cambia otra obra", async () => {
  await executeAI(project);
  await executeAI({ ...project, nombre: "Casa" });
  await executeAI({
    tipo: "actualizar_proyecto",
    proyecto_nombre: "Terraza",
    monto_cotizado: 0,
  });
  assert.equal(
    dataService.getProyectos().find((p) => p.nombre === "Terraza")
      .monto_cotizado,
    0,
  );
  assert.equal(
    dataService.getProyectos().find((p) => p.nombre === "Casa").monto_cotizado,
    3000000,
  );
});
test("IDs de clientes y actividades prevalecen sobre coincidencias parciales de nombre", async () => {
  dataService.runLocalAI(() => {
    dataService.createCliente({
      nombre: "Juan Pérez Hijo",
      email: "",
      telefono: "",
    });
    dataService.createCliente({
      nombre: "Juan Pérez",
      email: "",
      telefono: "",
    });
  });
  const target = dataService
    .getClientes()
    .find((c) => c.nombre === "Juan Pérez");
  await executeAI({
    tipo: "actualizar_cliente",
    cliente_id: target.id,
    telefono: "+56912345678",
  });
  assert.equal(
    dataService.getClientes().find((c) => c.nombre === "Juan Pérez Hijo")
      .telefono,
    "",
  );
  assert.equal(dataService.getClienteById(target.id).telefono, "+56912345678");
  await executeAI({
    ...project,
    partidas: [
      { nombre: "Fundaciones terraza", dias: 2 },
      { nombre: "Fundaciones", dias: 1 },
    ],
  });
  await executeAI({
    tipo: "actualizar_avance",
    proyecto_nombre: "Terraza",
    nombre: "Fundaciones",
    porcentaje_avance: 80,
  });
  assert.equal(
    dataService.getActividades().find((a) => a.nombre === "Fundaciones")
      .porcentaje_avance,
    80,
  );
  assert.equal(
    dataService.getActividades().find((a) => a.nombre === "Fundaciones terraza")
      .porcentaje_avance,
    0,
  );
});

test("registrar asistencia de toda la obra exige cuadrilla y no usa por defecto a otros trabajadores de la empresa", async () => {
  await executeAI({ ...project, trabajadores_nombres: [] });
  const p = dataService.getProyectos()[0];
  await assert.rejects(
    () =>
      executeAI({
        tipo: "registrar_asistencia",
        proyecto_id: p.id,
        todos_presentes: true,
        fecha: "2026-11-02",
      }),
    /cuadrilla asignada/,
  );
  assert.equal(dataService.getAsistencias().length, 0);
  assert.equal(fixture.tables.get("asistencia_obreros")?.length || 0, 0);
});

test("el documento conserva proveedor, monto y fecha documentales del contrato de la IA", async () => {
  await executeAI({ ...project, trabajadores_nombres: [] });
  const p = dataService.getProyectos()[0];
  await executeAI({
    tipo: "registrar_documento",
    proyecto_id: p.id,
    nombre: "Factura de materiales",
    categoria: "factura_boleta",
    proveedor_entidad: "Proveedor de materiales",
    monto_documento: 150000,
    fecha_documento: "2026-11-02",
  });
  const d = fixture.tables.get("documentos_obra")[0];
  assert.equal(d.proveedor_entidad, "Proveedor de materiales");
  assert.equal(d.monto_documento, 150000);
  assert.equal(d.fecha_documento, "2026-11-02");
});

test('la edición del contacto propio usa RPC y conserva el vínculo Auth y el rol', async () => {
  localStorage.setItem('obratrack_active_plan_v7_test-company', JSON.stringify('pro_ia'));
  fixture.handleRPC('actualizar_contacto_equipo', p => ({ data: { id: p.p_usuario, ...p.p_datos } }));
  const outcome = await executeAI({ tipo: 'actualizar_trabajador', usuario_id: active.id, email: 'CONTACTO@EMPRESA.CL', telefono: '912345678' });
  assert.equal(outcome.pendingId, undefined);
  const call = fixture.rpcCalls.find(c => c.name === 'actualizar_contacto_equipo');
  assert.equal(call.params.p_usuario, active.id);
  assert.equal(call.params.p_datos.email, 'contacto@empresa.cl');
  assert.equal(call.params.p_datos.telefono_whatsapp, '+56912345678');
  assert.equal(call.params.p_anterior.email, active.email);
  assert.equal(call.params.p_datos.rol, undefined);
  assert.equal(fixture.calls.some(c => c.table === 'usuarios' && c.mode === 'upsert'), false);
  assert.equal(dataService.getActiveUser().auth_user_id, active.auth_user_id);
  assert.equal(dataService.getActiveUser().rol, 'admin');
  assert.match(outcome.result.resultado_texto, /inicio de sesión se conserva/);
});

test('un contacto rechazado por el servidor queda pendiente sin afirmar que se guardó', async () => {
  fixture.handleRPC('actualizar_contacto_equipo', () => ({ error: { message: 'CONTACT_CONFLICT' } }));
  const outcome = await executeAI({ tipo: 'actualizar_trabajador', usuario_id: active.id, email: 'nuevo@empresa.cl' });
  assert.equal(outcome.result, undefined);
  assert.ok(outcome.pendingId);
  assert.match(outcome.warning, /ficha cambió/);
});

test('actualizar_proyecto permite renombrar una obra con nuevo_nombre sin alterar el presupuesto', async () => {
  await executeAI({ ...project, trabajadores_nombres: [] });
  const p = dataService.getProyectos()[0];
  const outcome = await executeAI({
    tipo: 'actualizar_proyecto',
    proyecto_id: p.id,
    nuevo_nombre: 'Remodelación de cocina — Providencia',
  });
  assert.equal(outcome.pendingId, undefined);
  assert.equal(dataService.getProyectos()[0].nombre, 'Remodelación de cocina — Providencia');
  assert.equal(dataService.getProyectos()[0].monto_cotizado, p.monto_cotizado);
  assert.match(outcome.result.resultado_texto, /Renombré la obra/);
});

test('evidenceActions asocia fotografía cuando el usuario menciona el nombre base de una obra con sufijo de comuna', () => {
  const { evidenceActions } = require('../lib/whatsapp/evidence.ts');
  const projects = [
    { id: 'p-cocina', nombre: 'Remodelación de cocina — Las Condes' },
    { id: 'p-tabique', nombre: 'Tabique divisorio en volcanita — Maipú' },
  ];
  const res = evidenceActions(
    [],
    { path: 'emp-1/foto.jpg', mime_type: 'image/jpeg', descripcion: 'Muro cocina' },
    projects,
    'Es de la remodelación de cocina.',
  );
  assert.equal(res.linked, true);
  assert.equal(res.attachment.proyecto_id, 'p-cocina');
  assert.equal(res.actions.length, 1);
  assert.equal(res.actions[0].proyecto_id, 'p-cocina');
});

