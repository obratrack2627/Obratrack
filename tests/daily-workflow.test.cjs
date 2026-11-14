require("./helpers/typescript.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  calendarDays,
  addWorkingDays,
  projectProgress,
  csvCell,
  chileToday,
} = require("../lib/work-calendar.ts");
const { dailySummary } = require("../lib/daily-close.ts");
const { isolatedState } = require("../lib/whatsapp/state.ts");
const { checkActionPermissions } = require("../lib/ai/permissions.ts");
const { validateAction } = require("../lib/ai/protocol.ts");
const user = {
  id: "boss",
  empresa_id: "company",
  nombre: "Jefe",
  rol: "admin",
};
const project = {
  id: "p",
  empresa_id: "company",
  nombre: "Cobertizo",
  estado: "activo",
  monto_cotizado: 12000000,
  fecha_inicio: "2026-11-02",
  fecha_termino_estimada: "2026-11-13",
};
const activity = (id, progress) => ({
  id,
  proyecto_id: "p",
  nombre: id,
  porcentaje_avance: progress,
  estado: progress === 100 ? "terminada" : "pendiente",
  orden: 1,
  fecha_inicio: "2026-11-02",
  fecha_termino: "2026-11-13",
});
test("fechas civiles y calendario laboral resisten medianoche, fin de semana, feriados y sábado configurado", () => {
  assert.equal(chileToday(new Date("2026-11-14T01:30:00Z")), "2026-11-13");
  assert.equal(calendarDays("2026-11-13", "2026-11-12"), -1);
  assert.equal(addWorkingDays("2026-11-13", 2), "2026-11-17");
  assert.equal(
    addWorkingDays("2026-11-13", 2, [1, 2, 3, 4, 5], ["2026-11-16"]),
    "2026-11-18",
  );
  assert.equal(
    addWorkingDays("2026-11-13", 2, [1, 2, 3, 4, 5, 6]),
    "2026-11-16",
  );
  assert.throws(() => addWorkingDays("2026-11-13", 2, []));
});
test("cierre de obra automático requiere partidas completas y conserva cancelada y cierre manual", () => {
  for (const [estado, tasks, expected] of [
    ["activo", [], "activo"],
    ["activo", [activity("a", 100), activity("b", 0)], "activo"],
    ["activo", [activity("a", 100), activity("b", 100)], "terminado"],
    ["cancelada", [activity("a", 100)], "cancelada"],
    ["terminado", [activity("a", 0)], "terminado"],
  ]) {
    const service = isolatedState(
      user,
      {
        usuarios: [user],
        proyectos: [{ ...project, estado }],
        actividades: tasks,
      },
      "pro_ia",
    );
    assert.equal(service.getProyectoById("p").estado, expected);
  }
  const service = isolatedState(
    user,
    {
      usuarios: [user],
      proyectos: [
        {
          ...project,
          estado: "terminado",
          finalizada_automaticamente: true,
          estado_anterior_cierre: "pausado",
        },
      ],
      actividades: [activity("a", 50)],
    },
    "pro_ia",
  );
  assert.equal(service.getProyectoById("p").estado, "activo");
});
test("el avance por monto contractual pondera partidas, no su cantidad", () => {
  assert.deepEqual(
    projectProgress([
      { porcentaje_avance: 100, monto_contratado: 1000000 },
      { porcentaje_avance: 0, monto_contratado: 9000000 },
    ]),
    { percentage: 10, weighted: true },
  );
  assert.deepEqual(
    projectProgress([{ porcentaje_avance: 100 }, { porcentaje_avance: 0 }]),
    { percentage: 50, weighted: false },
  );
});
test("recepciones parciales acumulan y no permiten recibir más de lo pedido ni confirman pagos", () => {
  const service = isolatedState(
    user,
    {
      usuarios: [user],
      proyectos: [project],
      materiales_proyecto: [
        {
          id: "m",
          proyecto_id: "p",
          nombre: "Hormigón",
          cantidad: 2.5,
          unidad: "m3",
          precio_unitario: 95000,
          subtotal: 237500,
          comprado: false,
        },
      ],
    },
    "pro_ia",
  );
  const receipt = {
    proyecto_id: "p",
    material_id: "m",
    cantidad_recibida: 1.5,
    autor_nombre: user.nombre,
    titulo: "Recepción",
    nota: "Guía 101",
    fecha: "2026-11-13",
    tipo: "entrega_material",
  };
  service.createBitacoraEntrada(receipt);
  service.createBitacoraEntrada({ ...receipt, cantidad_recibida: 1 });
  assert.throws(() =>
    service.createBitacoraEntrada({ ...receipt, cantidad_recibida: 0.1 }),
  );
  assert.equal(service.getBitacora("p").length, 2);
  assert.equal(service.getMaterialesProyecto("p")[0].comprado, false);
  assert.equal(service.getMaterialesProyecto("p")[0].pagado, undefined);
});
test("cierre diario solo compila hechos de su fecha y no inventa asistencia, foto ni cobro", () => {
  const summary = dailySummary(
    project,
    "2026-11-13",
    [],
    [
      {
        proyecto_id: "p",
        fecha: "2026-11-13",
        trabajador_nombre: "Maestro",
        estado: "presente",
        horas_trabajadas: 8,
      },
      {
        fecha: "2026-11-12",
        trabajador_nombre: "Ayer",
        estado: "presente",
        horas_trabajadas: 8,
      },
    ],
    [],
    [],
    [{ fecha: "2026-11-13", monto: 45000, categoria_gasto: "mano_obra" }],
    [{ fecha: "2026-11-13", monto: 400000, estado: "pendiente" }],
    [],
    [],
  );
  assert.equal(summary.presentes, 1);
  assert.equal(summary.horas, 8);
  assert.equal(summary.mano_obra, 45000);
  assert.equal(summary.ingresos, 0);
  assert.deepEqual(summary.avances, []);
});
test("cierre por ObraBot solo para jefatura y en un pedido separado", () => {
  const close = {
    tipo: "registrar_documento",
    categoria: "cierre_diario",
    proyecto_id: "p",
    fecha_documento: "2026-11-13",
  };
  assert.equal(validateAction(close).nombre, "Cierre de jornada");
  assert.throws(
    () =>
      checkActionPermissions(
        { id: "w", rol: "terreno" },
        close,
        "Cierra la jornada",
      ),
    (e) => e.code === "ATTENDANCE_FORBIDDEN",
  );
  assert.doesNotThrow(() =>
    checkActionPermissions(user, close, "Cierra la jornada"),
  );
  assert.throws(
    () =>
      checkActionPermissions(
        user,
        [close, { tipo: "registrar_pago", proyecto_id: "p", monto: 1000 }],
        "Registra y cierra la jornada",
      ),
    (e) => e.code === "CLOSE_SEPARATE",
  );
});
test("CSV conserva nombres con comillas y evita fórmulas de planilla", () => {
  assert.equal(csvCell('Maestro "Pepe"'), '"Maestro ""Pepe"""');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
});

test("terminar una partida por ObraBot no envía un cierre manual de proyecto que anule el cierre automático nativo", () => {
  const { snapshot, changesBetween } = require("../lib/ai/rows.ts");
  const service = isolatedState(
    user,
    { usuarios: [user], proyectos: [project], actividades: [activity("a", 0)] },
    "pro_ia",
  );
  const before = snapshot(service, "company");
  service.updateActividad("a", { porcentaje_avance: 100, estado: "terminada" });
  const result = changesBetween(before, snapshot(service, "company"));
  assert.equal(service.getProyectoById("p").estado, "terminado");
  assert.equal(result.changed.actividades.length, 1);
  assert.equal(result.changed.proyectos.length, 0);
});

test('documentos, incidencias y asistencias conservan IDs únicos con registros simultáneos', () => {
  const service = isolatedState(user, {usuarios:[user],proyectos:[project]}, 'pro_ia');
  const previousNow = Date.now;
  const previousRandom = Math.random;
  Date.now = () => 1794657600000;
  Math.random = () => 0;
  try {
    const docs = Array.from({length:10},(_,i)=>service.createDocumentoObra({proyecto_id:'p',nombre:'Documento '+i,categoria:'otro'}));
    const changes = Array.from({length:10},(_,i)=>service.createReclamoCambio({proyecto_id:'p',tipo:'incidente',titulo:'Incidente '+i,descripcion:'Reporte independiente',estado:'pendiente',prioridad:'baja'}));
    const attendance = Array.from({length:10},(_,i)=>service.upsertAsistenciaObrero({proyecto_id:'p',trabajador_nombre:'Trabajador '+i,fecha:'2026-11-14',estado:'presente'}));
    for(const records of [docs,changes,attendance]) assert.equal(new Set(records.map(r=>r.id)).size,10);
    assert.equal(service.getDocumentosObra('p').length,10);
    assert.equal(service.getReclamosCambios('p').length,10);
    assert.equal(service.getAsistencias('p','2026-11-14').length,10);
    const updated=service.upsertAsistenciaObrero({proyecto_id:'p',trabajador_nombre:'Trabajador 0',fecha:'2026-11-14',estado:'ausente'});
    assert.equal(updated.id,attendance[0].id,'corregir asistencia conserva su identidad');
    assert.equal(service.getAsistencias('p','2026-11-14').length,10);
  } finally {
    Date.now = previousNow;
    Math.random = previousRandom;
  }
});
