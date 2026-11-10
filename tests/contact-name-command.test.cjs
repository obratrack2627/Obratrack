require("./helpers/typescript.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { personIntake } = require("../lib/whatsapp/person-intake.ts");
const { registrationFields } = require("../lib/registrations.ts");
const { contactNameCommand } = require("../lib/ai/contact-name-command.ts");
const users = [
  {
    id: "wrong-name",
    empresa_id: "company",
    nombre: "Ya te di todos los datos",
    rut: "12345678-5",
  },
  {
    id: "other",
    empresa_id: "company",
    nombre: "Carlos Soto",
    rut: "11111111-1",
  },
];
const rename = "Ok pero cámbiale el nombre, se llama Felipe melo";

test("una frase de conversación no completa un nombre faltante ni reemplaza uno conocido", () => {
  const data = {
    tipo: "trabajador",
    rol: "terreno",
    telefono: "+56967345678",
    email: "worker@example.test",
    proyecto_id: "bath",
    rut: "12345678-5",
  };
  for (const name of [
    "Ya te di todos los datos",
    "Ya te pasé los datos",
    "No me acuerdo",
    "Todos los datos están bien",
  ]) {
    const checked = registrationFields({ ...data, nombre: name });
    assert.ok(checked.missing.includes("Nombre completo"));
    assert.equal(checked.draft.nombre, undefined);
    const result = personIntake([], null, { items: [data] }, name, [
      { id: "bath", nombre: "Baño" },
    ]);
    assert.equal(result.actions.length, 0);
    assert.equal(result.draft?.items[0].nombre, undefined);
  }
  const result = personIntake(
    [],
    { tipo: "trabajador", nombre: "Ya te di todos los datos" },
    { items: [{ ...data, nombre: "Ramón Escobar", rut: undefined }] },
    "Ya te di todos los datos",
    [{ id: "bath", nombre: "Baño" }],
  );
  assert.equal(result.draft.items[0].nombre, "Ramón Escobar");
});

test("un borrador viejo con un nombre de conversación se sanea sin perder teléfono, correo ni obra", () => {
  const draft = {
    items: [
      {
        tipo: "trabajador",
        nombre: "Ya te di todos los datos",
        rol: "terreno",
        telefono: "+56967345678",
        email: "worker@example.test",
        proyecto_id: "bath",
      },
    ],
  };
  const result = personIntake([], null, draft, "12345678-5", [
    { id: "bath", nombre: "Baño" },
  ]);
  assert.equal(result.actions.length, 0);
  assert.match(result.question, /Nombre completo/);
  assert.doesNotMatch(result.question, /registrar Ya te/);
  assert.equal(result.draft.items[0].telefono, "+56967345678");
  assert.equal(result.draft.items[0].proyecto_id, "bath");
});

test("la ficha recién creada identifica el pronombre y cambia solo el nombre, sin volver a pedir el RUT", () => {
  const history = [
    {
      rol: "model",
      texto: "Registré el trabajador Ya te di todos los datos.",
      action: {
        tipo: "agregar_trabajador",
        detalles: { trabajadores: [users[0]] },
      },
    },
  ];
  const result = contactNameCommand(rename, users, history, "admin");
  assert.equal(result.handled, true);
  assert.equal(result.question, null);
  assert.deepEqual(result.action, {
    tipo: "actualizar_trabajador",
    usuario_id: "wrong-name",
    nuevo_nombre: "Felipe melo",
  });
});

test("el RUT de seguimiento resuelve la identificación y ejecuta el nombre pendiente, sin cambiar el RUT", () => {
  const first = contactNameCommand(rename, users, [], "admin");
  assert.equal(first.action, null);
  assert.equal(first.pending.nuevo_nombre, "Felipe melo");
  const next = contactNameCommand(
    "Su rut es 123456785",
    users,
    [],
    "admin",
    first.pending,
  );
  assert.deepEqual(next.action, {
    tipo: "actualizar_trabajador",
    usuario_id: "wrong-name",
    nuevo_nombre: "Felipe melo",
  });
  assert.equal(next.action.rut, undefined);
  assert.equal(next.pending, null);
});

test("se recupera el cambio de nombre anterior aunque el bot viejo solo haya actualizado el RUT", () => {
  const history = [
    { rol: "user", texto: rename },
    { rol: "model", texto: "Indícame su RUT." },
    { rol: "user", texto: "Su rut es 123456785" },
    {
      rol: "model",
      texto: "Actualicé el RUT.",
      action: { tipo: "actualizar_trabajador", detalles: users[0] },
    },
  ];
  const result = contactNameCommand(
    "Cámbiale el nombre a Felipe melo",
    users,
    history,
    "admin",
  );
  assert.equal(result.action.usuario_id, "wrong-name");
  assert.equal(result.action.nuevo_nombre, "Felipe melo");
  assert.equal(result.action.rut, undefined);
});

test("RUT ajeno, inválido, homónimos y nombres desconocidos nunca seleccionan la primera ficha", () => {
  const pending = { nuevo_nombre: "Felipe Melo" };
  assert.equal(
    contactNameCommand("Su rut es 12345678-9", users, [], "admin", pending)
      .action,
    null,
  );
  assert.equal(
    contactNameCommand("Su rut es 22222222-2", users, [], "admin", pending)
      .action,
    null,
  );
  const history = [
    {
      rol: "model",
      texto: "Carlos Soto",
      action: { tipo: "actualizar_trabajador", detalles: users[1] },
    },
  ];
  const unknown = contactNameCommand(
    "Cambia el nombre de Pedro Pérez a Felipe Melo",
    users,
    history,
    "admin",
  );
  assert.equal(unknown.action, null);
  const ambiguous = contactNameCommand(
    "Cambia el nombre de Carlos Soto a Felipe Melo",
    [...users, { ...users[1], id: "duplicate" }],
    [],
    "admin",
  );
  assert.equal(ambiguous.action, null);
});

test("no repite ediciones completadas, no escribe en consultas y permite cancelar", () => {
  const pending = { nuevo_nombre: "Felipe Melo" };
  const done = contactNameCommand(
    "Su rut es 123456785",
    [{ ...users[0], nombre: "Felipe Melo" }],
    [],
    "admin",
    pending,
  );
  assert.equal(done.action, null);
  assert.equal(done.pending, null);
  assert.equal(
    contactNameCommand("¿Qué obras tengo?", users, [], "admin", pending)
      .handled,
    false,
  );
  assert.equal(
    contactNameCommand("No cambies el nombre", users, [], "admin").handled,
    false,
  );
  assert.equal(
    contactNameCommand("Cancela el cambio", users, [], "admin", pending)
      .pending,
    null,
  );
});

test("la reparación explícita por RUT funciona sin depender del nombre erróneo ni de la conversación anterior", () => {
  const result = contactNameCommand(
    "Cambia el nombre del trabajador con RUT 12345678-5 a Felipe Melo",
    users,
    [],
    "admin",
  );
  assert.deepEqual(result.action, {
    tipo: "actualizar_trabajador",
    usuario_id: "wrong-name",
    nuevo_nombre: "Felipe Melo",
  });
});

test("una corrección inválida no ejecuta el nombre anterior y los cambios de varios campos siguen completos en el flujo general", () => {
  const invalid = contactNameCommand(
    "Cambia su nombre a Ya te di todos los datos",
    users,
    [],
    "admin",
    { nuevo_nombre: "Felipe Melo", usuario_id: "wrong-name" },
  );
  assert.equal(invalid.action, null);
  assert.equal(invalid.pending, null);
  const multiple = contactNameCommand(
    "Cambia el nombre a Felipe Melo y el correo a felipe@example.test",
    users,
    [],
    "admin",
  );
  assert.equal(multiple.handled, false);
  assert.equal(multiple.pending, null);
});

test("renombrar una obra o un cliente no cambia a la persona de la conversación anterior", () => {
  const history = [
    {
      rol: "model",
      texto: "Carlos Soto",
      action: { tipo: "actualizar_trabajador", detalles: users[1] },
    },
  ];
  for (const message of [
    "Cambia el nombre de la obra Baño a Baño ampliado",
    "Cambia el nombre del cliente a Constructora Sur",
    "El cliente tiene RUT 11111111-1",
  ]) {
    const result = contactNameCommand(message, users, history, "admin", {
      nuevo_nombre: "Felipe Melo",
    });
    assert.equal(result.handled, false);
    assert.equal(result.action, undefined);
  }
});
