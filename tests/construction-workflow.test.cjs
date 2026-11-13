require("./helpers/typescript.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isolatedState,
  planWhatsAppActions,
} = require("../lib/whatsapp/state.ts");
const {
  materialNeeds,
  recordedFlow,
  labourAmount,
  validateReception,
  rescheduleSuggestion,
} = require("../lib/construction-workflow.ts");
const { projectProgress } = require("../lib/work-calendar.ts");
const { checkActionPermissions } = require("../lib/ai/permissions.ts");
const user = { id: "boss", empresa_id: "co", nombre: "Jefe", rol: "admin" };
const project = {
  id: "p",
  empresa_id: "co",
  nombre: "Quincho",
  estado: "activo",
  monto_cotizado: 1000000,
  fecha_inicio: "2026-11-02",
  fecha_termino_estimada: "2026-11-13",
};
const task = (id, percentage = 0) => ({
  id,
  proyecto_id: "p",
  nombre: id,
  fecha_inicio: "2026-11-09",
  fecha_termino: "2026-11-13",
  porcentaje_avance: percentage,
  estado:
    percentage === 100 ? "terminada" : percentage ? "en_curso" : "pendiente",
  orden: 1,
});
const attendance = {
  id: "as",
  proyecto_id: "p",
  trabajador_nombre: "Maestro",
  estado: "presente",
  fecha: "2026-11-13",
  horas_trabajadas: 4,
};
test("corregir un cierre automático restaura En curso aunque antes estuviera pausada y deja recepción pendiente", () => {
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
          recepcion_estado: "conforme",
        },
      ],
      actividades: [task("a", 100)],
    },
    "pro_ia",
  );
  const result = planWhatsAppActions(service, {
    tipo: "actualizar_avance",
    proyecto_id: "p",
    actividad_id: "a",
    porcentaje_avance: 80,
  });
  assert.equal(service.getProyectoById("p").estado, "activo");
  assert.equal(service.getProyectoById("p").recepcion_estado, "pendiente");
  assert.match(result.result.resultado_texto, /volvió a En curso/);
  assert.equal(result.changed.proyectos.length, 0);
});
test("el redondeo del avance no declara 100% cuando aún quedan faenas", () => {
  assert.equal(
    projectProgress([
      { porcentaje_avance: 100, monto_contratado: 999999 },
      { porcentaje_avance: 0, monto_contratado: 1 },
    ]).percentage,
    99,
  );
});
test("recepción exige faenas completas, resultado y mandante, y observaciones cuando corresponde", () => {
  const input = {
    estado: "conforme",
    fecha: "2026-11-13",
    recibido_por: "Juan Pérez",
    observaciones: "",
    fotos: [],
  };
  assert.throws(() => validateReception(project, [task("a", 100)], input));
  assert.throws(() =>
    validateReception({ ...project, estado: "terminado" }, [], input),
  );
  assert.throws(() =>
    validateReception({ ...project, estado: "terminado" }, [task("a", 100)], {
      ...input,
      estado: "observaciones",
    }),
  );
  assert.equal(
    validateReception(
      { ...project, estado: "terminado" },
      [task("a", 100)],
      input,
    ),
    input,
  );
});
test("ObraBot prepara un acta sin simular pagos ni cambiar contrato y terreno no puede recibir la obra", () => {
  const service = isolatedState(
    user,
    { usuarios: [user], proyectos: [project], actividades: [task("a", 100)] },
    "pro_ia",
  );
  const action = {
    tipo: "registrar_documento",
    categoria: "acta_recepcion",
    proyecto_id: "p",
    recepcion_estado: "conforme",
    recibido_por: "Juan Pérez",
    fecha_documento: "2026-11-13",
  };
  const plan = planWhatsAppActions(service, action);
  assert.equal(plan.changed.documentos_obra.length, 1);
  assert.equal(
    plan.changed.documentos_obra[0].recepcion_resumen.recibido_por,
    "Juan Pérez",
  );
  assert.equal(plan.changed.pagos.length, 0);
  assert.equal(plan.changed.proyectos.length, 0);
  assert.throws(() =>
    checkActionPermissions(
      { id: "w", rol: "terreno" },
      action,
      "Recibe conforme la obra",
    ),
  );
  assert.throws(() =>
    checkActionPermissions(
      user,
      [action, { tipo: "registrar_pago", monto: 1 }],
      "Recibe y paga",
    ),
  );
});
test("jornal confirmado calcula medio día y extras, no paga automáticamente ni duplica una asistencia", () => {
  assert.equal(labourAmount(attendance, 45000, 0.5, 1, 5000), 27500);
  assert.throws(() =>
    labourAmount({ ...attendance, estado: "ausente" }, 45000, 1),
  );
  assert.throws(() => labourAmount(attendance, 45000, 0.5, 1, 0));
  const service = isolatedState(
    user,
    {
      usuarios: [user],
      proyectos: [project],
      asistencia_obreros: [attendance],
    },
    "pro_ia",
  );
  const action = {
    tipo: "registrar_imprevisto",
    proyecto_id: "p",
    descripcion: "Jornal del maestro",
    asistencia_id: "as",
    valor_diario: 45000,
    jornada: 0.5,
    horas_extra: 1,
    valor_hora_extra: 5000,
  };
  const plan = planWhatsAppActions(service, action);
  const expense = plan.changed.imprevistos[0];
  assert.equal(expense.monto_adicional, 27500);
  assert.equal(expense.pagado, false);
  assert.equal(expense.asistencia_id, "as");
  assert.equal(expense.jornal_resumen.jornada, 0.5);
  assert.equal(plan.changed.asistencia_obreros.length, 0);
  assert.throws(
    () => planWhatsAppActions(service, action),
    /ya tiene un jornal/,
  );
});
test("saldos distinguen por pagar, desconocidos y pendiente de cobro aunque la obra esté terminada", () => {
  const result = recordedFlow(
    { ...project, estado: "terminado" },
    [
      { subtotal: 10000, pagado: false },
      { subtotal: 5000, pagado: true },
      { subtotal: 500 },
    ],
    [
      { monto: 45000, categoria_gasto: "mano_obra", pagado: false },
      { monto: 1000, pagado: true },
    ],
    [
      { monto: 400000, estado: "completado" },
      { monto: 600000, estado: "pendiente" },
    ],
  );
  assert.deepEqual(result, {
    income: 400000,
    paid: 6000,
    flow: 394000,
    clientDue: 600000,
    unpaidMaterials: 10000,
    unpaidLabour: 45000,
    unpaidOther: 0,
    unknown: 1,
  });
});
test("faltantes consideran solo materiales vinculados a faenas próximas, con recepciones acumuladas", () => {
  const materials = [
    {
      id: "m",
      actividad_id: "a",
      nombre: "Cemento",
      cantidad: 10,
      unidad: "sacos",
    },
    { id: "m2", nombre: "Sin vínculo", cantidad: 100 },
  ];
  assert.deepEqual(
    materialNeeds(
      materials,
      [task("a")],
      [{ material_id: "m", cantidad_recibida: 6 }],
      "2026-11-13",
    ),
    [
      {
        material: "Cemento",
        actividad: "a",
        fecha: "2026-11-09",
        pendiente: 4,
        unidad: "sacos",
      },
    ],
  );
  assert.equal(
    materialNeeds(materials, [task("a", 100)], [], "2026-11-13").length,
    0,
  );
});
test("propuesta de reprogramación conserva terminadas y comienzo de faena en curso, ajusta día laboral", () => {
  const tasks = [
    task("a", 100),
    task("b", 50),
    { ...task("c"), fecha_inicio: "2026-11-13" },
  ];
  const before = JSON.stringify(tasks);
  const proposal = rescheduleSuggestion(
    { ...project, fechas_no_laborales: ["2026-11-16"] },
    tasks,
    "2026-11-14",
  );
  assert.equal(proposal.length, 2);
  assert.equal(
    proposal.find((row) => row.id === "b").fecha_inicio,
    "2026-11-09",
  );
  assert.equal(
    proposal.find((row) => row.id === "c").fecha_inicio,
    "2026-11-17",
  );
  assert.equal(JSON.stringify(tasks), before);
});
test("corregir recepción parcial mantiene el límite acumulado y permite reintentar el mismo evento", () => {
  const service = isolatedState(
    user,
    {
      usuarios: [user],
      proyectos: [project],
      materiales_proyecto: [{ id: "m", proyecto_id: "p", cantidad: 2.5 }],
    },
    "pro_ia",
  );
  const first = service.createBitacoraEntrada({
    proyecto_id: "p",
    titulo: "Hormigón",
    nota: "Guía",
    material_id: "m",
    cantidad_recibida: 1.5,
    tipo: "entrega_material",
  });
  const second = service.createBitacoraEntrada({
    proyecto_id: "p",
    titulo: "Hormigón",
    nota: "Guía",
    material_id: "m",
    cantidad_recibida: 1,
    tipo: "entrega_material",
  });
  assert.doesNotThrow(() =>
    service.updateBitacoraEntrada(first.id, { cantidad_recibida: 1.5 }),
  );
  assert.throws(() =>
    service.updateBitacoraEntrada(second.id, { cantidad_recibida: 2 }),
  );
  assert.equal(
    service.getBitacora().find((row) => row.id === second.id).cantidad_recibida,
    1,
  );
});

test("estado de pago solo desglosa adicionales efectivamente incorporados al contrato", () => {
  const { calcularEstadoPago } = require("../lib/edp-calculator.ts");
  const change = {
    proyecto_id: "p",
    tipo: "solicitud_cambio",
    estado: "aprobado",
    impacto_monto: 150000,
  };
  const first = calcularEstadoPago({
    proyecto: project,
    pagos: [],
    cambios: [{ ...change, ajuste_presupuesto_aplicado: false }],
    actividades: [],
  });
  assert.equal(first.adicionalesAprobadosMonto, 0);
  const second = calcularEstadoPago({
    proyecto: project,
    pagos: [],
    cambios: [{ ...change, ajuste_presupuesto_aplicado: true }],
    actividades: [],
  });
  assert.equal(second.adicionalesAprobadosMonto, 150000);
});

test("validación de lucas compara tarifa diaria, no el total derivado de medio día", () => {
  const action = {
    tipo: "registrar_imprevisto",
    proyecto_id: "p",
    descripcion: "Jornal",
    asistencia_id: "as",
    valor_diario: 45000,
    jornada: 0.5,
  };
  assert.doesNotThrow(() =>
    checkActionPermissions(
      user,
      action,
      "Registra el jornal de Pedro a 45 lucas diarias, medio día",
    ),
  );
  assert.throws(
    () =>
      checkActionPermissions(
        user,
        { ...action, valor_diario: 45 },
        "Registra el jornal de Pedro a 45 lucas diarias, medio día",
      ),
    (e) => e.code === "AMOUNT_MISMATCH",
  );
});

test("foto de recepción en WhatsApp se adjunta al acta como una operación y conserva el contexto de obra", () => {
  const { evidenceActions } = require("../lib/whatsapp/evidence.ts");
  const action = {
    tipo: "registrar_documento",
    categoria: "acta_recepcion",
    proyecto_id: "p",
    recibido_por: "Mandante",
    recepcion_estado: "conforme",
  };
  const result = evidenceActions(
    [action],
    { path: "co/boss/photo.jpg", mime_type: "image/jpeg", proyecto_id: "p" },
    [project],
    "Recibió conforme",
  );
  assert.equal(result.actions.length, 1);
  assert.deepEqual(result.actions[0].fotos, [
    "whatsapp-evidencias:co/boss/photo.jpg",
  ]);
  assert.equal(result.attachment.proyecto_id, "p");
  assert.doesNotThrow(() =>
    checkActionPermissions(user, result.actions, "Recibió conforme"),
  );
});
