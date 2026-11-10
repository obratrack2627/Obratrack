require("./helpers/typescript.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { canonicalPhone, phonesInText } = require("../lib/phone.ts");
const { personIntake } = require("../lib/whatsapp/person-intake.ts");
const {
  pendingPerson,
  withPersonContext,
} = require("../lib/ai/person-context.ts");
const {
  conversationRequest,
  conversationHistory,
} = require("../lib/ai/conversation.ts");
const { validateAction, ACTION_TYPES } = require("../lib/ai/protocol.ts");
const { scopeProjectActions } = require("../lib/ai/actions.ts");
const projects = [
  { id: "bath", nombre: "Baño" },
  { id: "terrace", nombre: "Terraza" },
];

test("acepta móviles nacionales de ocho o nueve dígitos y conserva números internacionales", () => {
  for (const value of [
    "67345678",
    "9 6734 5678",
    "+56 9 6734 5678",
    "56967345678",
    "0056967345678",
  ])
    assert.equal(canonicalPhone(value), "56967345678", value);
  assert.equal(canonicalPhone("+54 9 11 2345 6789"), "5491123456789");
  for (const value of ["123", "5696734567", "569673456789"])
    assert.equal(canonicalPhone(value), "");
  assert.deepEqual(phonesInText("Teléfono 67345678, RUT 200635468"), [
    "56967345678",
  ]);
});

test("el caso de la captura conserva todos los datos y pregunta solo por el RUT inválido, nunca por duración", () => {
  const initial = personIntake(
    [],
    null,
    null,
    "Necesito agregar un trabajador",
    projects,
  );
  for (const phone of ["+56967345678", "967345678", "67345678"]) {
    const step = personIntake(
      [],
      null,
      initial.draft,
      `Ramón Escobar, terreno, ${phone}, rut 200635468, correo ramon@example.test, asignalo a la obra Baño`,
      projects,
    );
    assert.match(step.question, /RUT válido/);
    assert.doesNotMatch(
      step.question,
      /duración|Teléfono|Correo|Nombre completo|Obra asignada/,
    );
    assert.equal(step.draft.items[0].telefono, "+56967345678");
    assert.equal(step.draft.items[0].proyecto_id, "bath");
    const complete = personIntake(
      [],
      null,
      step.draft,
      "12.345.678-5",
      projects,
    );
    assert.equal(complete.question, null);
    assert.equal(complete.actions.length, 2);
    assert.equal(complete.actions[0].nombre, "Ramón Escobar");
    assert.equal(complete.actions[1].proyecto_id, "bath");
    assert.equal(complete.actions[0].telefono, "+56967345678");
  }
});

test("el borrador sobrevive consultas intermedias y se completa con los datos literales corregidos", () => {
  let step = personIntake(
    [],
    null,
    null,
    "Agrega al trabajador Ramón Escobar",
    projects,
  );
  step = personIntake(
    [],
    null,
    step.draft,
    "terreno, rut 12.345.678-5, asignalo a la obra Baño",
    projects,
  );
  const before = step.draft;
  const query = personIntake(
    [],
    null,
    step.draft,
    "¿Cómo va la Terraza?",
    projects,
  );
  assert.deepEqual(query.draft, before);
  assert.equal(query.question, null);
  step = personIntake(
    [],
    null,
    query.draft,
    "correo ramon@example.test, teléfono 67345678",
    projects,
  );
  assert.equal(step.question, null);
  assert.equal(step.actions[1].proyecto_id, "bath");
});

test("el chat web conserva el borrador en el historial existente sin enviar cotizaciones ni inventarios como hechos", () => {
  const draft = {
    items: [
      {
        tipo: "trabajador",
        nombre: "Ramón Escobar",
        rol: "terreno",
        proyecto_id: "bath",
      },
    ],
  };
  const reply = withPersonContext(
    { respuesta: "Falta su RUT, teléfono y correo." },
    draft,
  );
  const messages = [
    {
      remitente: "usuario",
      texto: "Agrega al trabajador Ramón Escobar a Baño",
    },
    {
      remitente: "agente",
      texto: reply.respuesta,
      accion_ejecutada: reply.accion_ejecutada,
      cotizacion_generada: { id: "no-enviar" },
    },
  ];
  const request = conversationRequest(messages, "67345678");
  assert.deepEqual(
    pendingPerson(request, conversationHistory(request, "67345678"), projects),
    draft,
  );
  assert.equal(request[1].cotizacion_generada, undefined);
  const finished = conversationRequest(
    [
      ...messages,
      {
        remitente: "agente",
        texto: "Ramón quedó registrado.",
        accion_ejecutada: {
          tipo: "agregar_trabajador",
          detalles: { trabajadores: [{ nombre: "Ramón Escobar" }] },
        },
      },
    ],
    "Hola",
  );
  assert.equal(
    pendingPerson(finished, conversationHistory(finished, "Hola"), projects),
    null,
  );
});

test("el contexto de obra completa una acción sin elegir obras ambiguas ni cambiar de chat", () => {
  const input = { tipo: "registrar_pago", monto: 150000 };
  assert.equal(
    scopeProjectActions(input, "bath", projects)[0].proyecto_id,
    "bath",
  );
  assert.equal(
    scopeProjectActions(input, undefined, projects)[0].proyecto_id,
    undefined,
  );
  assert.equal(
    scopeProjectActions(input, "foreign", projects)[0].proyecto_id,
    undefined,
  );
  assert.throws(
    () =>
      scopeProjectActions(
        { ...input, proyecto_id: "terrace" },
        "bath",
        projects,
        "bath",
      ),
    /otra obra/,
  );
});

test("crear trabajadores y editar contactos ignora los campos de planificación ajenos y conserva validaciones de seguridad", () => {
  const worker = validateAction({
    tipo: "agregar_trabajador",
    nombre: "Ramón Escobar",
    rol: "terreno",
    dias: 0,
    partidas: [],
    materiales: [],
    monto: 0,
    porcentaje_avance: 0,
    fecha_inicio: "",
  });
  for (const key of [
    "dias",
    "partidas",
    "materiales",
    "monto",
    "porcentaje_avance",
    "fecha_inicio",
  ])
    assert.equal(worker[key], undefined, key);
  assert.equal(
    validateAction({
      tipo: "actualizar_trabajador",
      usuario_id: "worker",
      telefono: "67345678",
      dias: 0,
      partidas: [],
    }).telefono,
    "+56967345678",
  );
  assert.throws(
    () =>
      validateAction({ tipo: "crear_actividad", nombre: "Radier", dias: 0 }),
    /duración/,
  );
  assert.throws(
    () =>
      validateAction({
        tipo: "actualizar_trabajador",
        usuario_id: "worker",
        telefono: "67345678",
        is_dev: true,
      }),
    /roles ni credenciales/,
  );
});

test("todas las operaciones del catálogo aceptan sus campos propios sin exigir duración a operaciones ajenas", () => {
  const worker = {
    nombre: "Ramón Escobar",
    rol: "terreno",
    rut: "12345678-5",
    email: "ramon@example.test",
    telefono: "67345678",
  };
  const samples = {
    crear_proyecto: { nombre: "Baño", monto_cotizado: 100000 },
    crear_proyecto_completo: { nombre: "Baño", monto_cotizado: 100000 },
    actualizar_proyecto: { estado: "cancelada" },
    eliminar_proyecto: {},
    crear_cliente: { nombre: "Cliente Sur" },
    actualizar_cliente: {
      cliente_id: "client",
      email: "contacto@example.test",
    },
    actualizar_trabajador: { usuario_id: "worker", telefono: "67345678" },
    agregar_trabajador: worker,
    agregar_trabajadores: { trabajadores: [worker] },
    asignar_trabajador: { trabajador_nombre: worker.nombre },
    asignar_trabajadores: { trabajadores_nombres: [worker.nombre] },
    desasignar_trabajador: { trabajador_nombre: worker.nombre },
    crear_actividad: { partidas: [{ nombre: "Radier", dias: 5 }] },
    actualizar_avance: { nombre: "Radier", porcentaje_avance: 50 },
    agregar_material: { nombre: "Cemento", cantidad: 3, precio_unitario: 5990 },
    agregar_materiales: {
      materiales: [{ nombre: "Cemento", cantidad: 3, precio_unitario: 5990 }],
    },
    registrar_imprevisto: { descripcion: "Reparación", monto: 15000 },
    registrar_pago: { monto: 10000 },
    crear_bitacora: { titulo: "Avance", nota: "Estructura instalada" },
    generar_reporte: {},
    agendar_visita: { titulo: "Visita", fecha: "2026-11-12", hora: "10:00" },
    agendar_evento: { titulo: "Visita", fecha: "2026-11-12", hora: "10:00" },
    generar_mensaje_whatsapp: { mensaje: "Revisar entrega" },
    enviar_mensaje_equipo: {
      mensaje: "Reunión en obra",
      roles_destino: ["terreno"],
    },
    crear_solicitud_cambio: {
      titulo: "Cambio",
      descripcion: "Cambiar terminación",
      dias: 0,
      monto: 0,
    },
    registrar_asistencia: {
      trabajador_nombre: worker.nombre,
      estado: "presente",
    },
    registrar_documento: { nombre: "Boleta", categoria: "factura_boleta" },
  };
  for (const tipo of ACTION_TYPES) {
    assert.ok(Object.hasOwn(samples, tipo), tipo);
    const fields = samples[tipo];
    const duration = [
      "crear_proyecto",
      "crear_proyecto_completo",
      "crear_actividad",
      "crear_solicitud_cambio",
    ].includes(tipo);
    assert.equal(
      validateAction({ tipo, ...(!duration ? { dias: 0 } : {}), ...fields })
        .tipo,
      tipo,
    );
  }
});

test("una ficha ya registrada se reutiliza para asignar sin crear duplicados ni cambiar sus datos", () => {
  const user = {
    id: "worker",
    nombre: "Ramón Escobar",
    rol: "terreno",
    rut: "12345678-5",
    email: "ramon@example.test",
    telefono_whatsapp: "+56967345678",
  };
  const text =
    "Agrega al trabajador Ramón Escobar, terreno, rut 12345678-5, correo ramon@example.test, teléfono 67345678, asígnalo a la obra Baño";
  const step = personIntake([], null, null, text, projects, undefined, [user]);
  assert.equal(step.actions.length, 1);
  assert.equal(step.actions[0].tipo, "asignar_trabajador");
  const conflicting = personIntake(
    [],
    null,
    null,
    text.replace("ramon@example.test", "otro@example.test"),
    projects,
    undefined,
    [user],
  );
  assert.equal(conflicting.actions.length, 0);
  assert.match(conflicting.question, /ya está registrado/);
});

test("un borrador completo pendiente de guardado permite corregir el teléfono sin iniciar otra ficha", () => {
  const draft = {
    items: [
      {
        tipo: "trabajador",
        nombre: "Ramón Escobar",
        rol: "terreno",
        rut: "12345678-5",
        email: "ramon@example.test",
        telefono: "+56911112222",
        proyecto_id: "bath",
        proyecto_nombre: "Baño",
      },
    ],
  };
  const step = personIntake(
    [],
    null,
    draft,
    "Corrige el teléfono a 67345678",
    projects,
  );
  assert.equal(
    step.actions.filter((action) => action.tipo === "agregar_trabajador")
      .length,
    1,
  );
  assert.equal(step.actions[0].telefono, "+56967345678");
});

test("una gestión de obra o la edición del teléfono propio no completa por error el registro de otra persona", () => {
  const draft = {
    items: [
      {
        tipo: "trabajador",
        nombre: "Ramón Escobar",
        rol: "terreno",
        proyecto_id: "bath",
        rut: "12345678-5",
      },
    ],
  };
  for (const message of [
    "Crea una obra llamada Terraza, correo cliente@example.test, teléfono 67345678",
    "Actualiza mi teléfono a 67345678",
  ]) {
    const step = personIntake([], null, draft, message, projects);
    assert.deepEqual(step.draft, draft);
    assert.equal(step.question, null);
    assert.equal(step.actions.length, 0);
  }
  assert.deepEqual(
    phonesInText("Presupuesto 12000000, RUT 200635468, teléfono 67345678"),
    ["56967345678"],
  );
});

test("una conversación web anterior a la actualización recupera los datos tras el antiguo error de duración", () => {
  const messages = [
    { remitente: "usuario", texto: "Necesito agregar un trabajador" },
    {
      remitente: "agente",
      texto: "Indica nombre, rol, RUT, teléfono, correo y obra.",
    },
    {
      remitente: "usuario",
      texto:
        "Ramón Escobar, terreno, 67345678, rut 200635468, correo ramon@example.test, asignalo a la obra Baño",
    },
    {
      remitente: "agente",
      texto: "Revisa la duración: debe ser un número mayor a cero.",
    },
  ];
  const request = conversationRequest(messages, "12.345.678-5");
  const draft = pendingPerson(
    request,
    conversationHistory(request, "12.345.678-5"),
    projects,
  );
  assert.equal(draft.items[0].nombre, "Ramón Escobar");
  const completed = personIntake([], null, draft, "12.345.678-5", projects);
  assert.equal(completed.question, null);
  assert.equal(completed.actions[0].telefono, "+56967345678");
});
