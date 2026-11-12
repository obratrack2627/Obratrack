require("./helpers/typescript.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  assignedCrew,
  crewAttendance,
  crewSuggestions,
  attendanceDuration,
} = require("../lib/crew.ts");
const { isolatedState } = require("../lib/whatsapp/state.ts");
const manager = {
  id: "boss",
  empresa_id: "company",
  nombre: "Jefe",
  rol: "admin",
};
const worker = (id, extra = {}) => ({
  id,
  empresa_id: "company",
  nombre: id,
  rol: "terreno",
  ...extra,
});
const project = {
  id: "p",
  empresa_id: "company",
  nombre: "Quincho",
  trabajadores_ids: [],
};
const stage = {
  id: "a",
  proyecto_id: "p",
  nombre: "Montaje de estructura metálica",
  estado: "pendiente",
  porcentaje_avance: 0,
  fecha_inicio: "2026-11-15",
  orden: 1,
};

test("cuadrilla vacía no recurre al equipo global y respeta empresa e identificadores", () => {
  const users = [
    manager,
    worker("pedro"),
    worker("foreign", { empresa_id: "other" }),
  ];
  assert.deepEqual(assignedCrew(project, users), []);
  assert.deepEqual(
    assignedCrew(
      { ...project, trabajadores_ids: ["pedro", "foreign"] },
      users,
    ).map((row) => row.id),
    ["pedro"],
  );
});

test("sugerencias explicadas por especialidades reales, sin asumir disponibilidad ni usar personas ajenas", () => {
  const users = [
    worker("soldador", { especialidades: ["Soldadura"] }),
    worker("pintor", { especialidades: ["Pintura"] }),
    worker("sin-ficha"),
    worker("otro", { empresa_id: "other", especialidades: ["Soldadura"] }),
    { ...manager, especialidades: ["Soldadura"] },
  ];
  const other = {
    id: "p2",
    empresa_id: "company",
    nombre: "Galpón",
    estado: "activo",
    trabajadores_ids: ["soldador"],
  };
  const suggestions = crewSuggestions(
    project,
    users,
    [project, other],
    [stage],
    [],
    "2026-11-12",
  );
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].user.id, "soldador");
  assert.deepEqual(suggestions[0].matched, ["Soldadura"]);
  assert.match(suggestions[0].reason, /estructura metálica/);
  assert.equal(suggestions[0].otherProjects[0].nombre, "Galpón");
  assert.deepEqual(
    crewSuggestions(
      { ...project, trabajadores_ids: ["soldador"] },
      users,
      [project],
      [stage],
      [],
      "2026-11-12",
    ),
    [],
  );
  assert.deepEqual(
    crewSuggestions(
      project,
      users,
      [project],
      [{ ...stage, estado: "terminada", porcentaje_avance: 100 }],
      [],
      "2026-11-12",
    ),
    [],
  );
  assert.deepEqual(
    crewSuggestions(
      project,
      users,
      [project],
      [stage],
      [{ usuario_id: "soldador", fecha: "2026-11-12", estado: "licencia" }],
      "2026-11-12",
    ),
    [],
  );
  assert.equal(
    crewSuggestions(
      project,
      users,
      [project],
      [stage],
      [{ usuario_id: "soldador", fecha: "2026-11-11", estado: "licencia" }],
      "2026-11-12",
    ).length,
    1,
  );
});

test("registros antiguos solo se vinculan por nombre inequívoco; nunca a un ID diferente", () => {
  const person = worker("one", { nombre: "José Pérez" }),
    twin = worker("two", { nombre: "Jose Perez" });
  const legacy = { id: "legacy", trabajador_nombre: "JOSE PEREZ" };
  assert.equal(crewAttendance(person, [legacy], [person]), legacy);
  assert.equal(crewAttendance(person, [legacy], [person, twin]), undefined);
  assert.equal(
    crewAttendance(person, [{ ...legacy, usuario_id: "two" }], [person]),
    undefined,
  );
  const identified = { ...legacy, usuario_id: "one" };
  assert.equal(
    crewAttendance(person, [identified], [person, twin]),
    identified,
  );
});

test("solo calcula horas de un horario real y una colación explícita", () => {
  assert.equal(attendanceDuration("", ""), 0);
  assert.equal(attendanceDuration("08:00", ""), 0);
  assert.equal(attendanceDuration("09:00", "17:00"), 8);
  assert.equal(attendanceDuration("09:00", "17:00", 60), 7);
  for (const args of [
    ["18:00", "08:00"],
    ["25:00", "26:00"],
    ["09:60", "17:00"],
    ["09:00", "09:00"],
    ["09:00", "10:00", 90],
    ["09:00", "10:00", -5],
    ["09:00", "10:00", NaN],
  ])
    assert.throws(() => attendanceDuration(...args));
});

test("marcación colectiva conserva licencias, personas con registro y no inventa horas", () => {
  const users = [manager, worker("a"), worker("b"), worker("c")];
  const old = {
    id: "leave",
    empresa_id: "company",
    proyecto_id: "p",
    usuario_id: "a",
    trabajador_nombre: "a",
    fecha: "2026-11-12",
    estado: "licencia",
    horas_trabajadas: 0,
  };
  const service = isolatedState(
    manager,
    {
      usuarios: users,
      proyectos: [project],
      proyecto_trabajadores: ["a", "b"].map((usuario_id) => ({
        proyecto_id: "p",
        usuario_id,
      })),
      asistencia_obreros: [old],
    },
    "pro_ia",
  );
  const results = service.marcarCuadrillaPresente("p", "2026-11-12");
  assert.equal(results.length, 1);
  assert.equal(results[0].usuario_id, "b");
  assert.equal(results[0].hora_entrada, "");
  assert.equal(results[0].hora_salida, "");
  assert.equal(results[0].horas_trabajadas, 0);
  assert.deepEqual(
    service.getAsistencias().find((row) => row.id === "leave"),
    old,
  );
  assert.equal(service.marcarCuadrillaPresente("p", "2026-11-12").length, 0);
});

test("dos trabajadores del mismo nombre conservan registros individuales", () => {
  const service = isolatedState(
    manager,
    { usuarios: [manager], proyectos: [project] },
    "pro_ia",
  );
  const row = {
    proyecto_id: "p",
    trabajador_nombre: "José Pérez",
    fecha: "2026-11-12",
    estado: "presente",
    origen: "web",
  };
  service.upsertAsistenciaObrero({ ...row, usuario_id: "one" });
  service.upsertAsistenciaObrero({ ...row, usuario_id: "two" });
  assert.equal(service.getAsistencias().length, 2);
});
