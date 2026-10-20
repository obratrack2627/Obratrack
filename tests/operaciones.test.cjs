const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
const compiled = ts.transpileModule(
  fs.readFileSync(
    require("node:path").join(__dirname, "../lib/operaciones/calculos.ts"),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  },
).outputText;
const mod = new Module("calculos");
mod._compile(compiled, "calculos.cjs");
const {
  totalesCotizacion,
  gestionVacia,
  resumenObra,
  validarCotizacion,
  validarCierre,
  estadoPago,
} = mod.exports;
const proyecto = () => ({
  id: "p",
  empresa_id: "e",
  monto_cotizado: 20000000,
  pagos: [],
  actividades: [],
  materiales: [],
  imprevistos: [],
});
const gestion = () => gestionVacia("p", "e");

test("cotización: costos, recargo e IVA redondeados en CLP", () => {
  assert.deepEqual(
    totalesCotizacion({
      lineas: [
        { cantidad: 2, precio: 1000 },
        { cantidad: 0.5, precio: 1001 },
      ],
      margen: 20,
      iva: true,
    }),
    { costo: 2501, neto: 3001, iva: 570, total: 3571 },
  );
});
test("solo los adicionales aprobados modifican el valor del contrato", () => {
  const p = proyecto(),
    g = gestion();
  g.adicionales = [
    { materiales: 1000000, mano_obra: 500000, estado: "Aprobado" },
    { materiales: 9000000, mano_obra: 0, estado: "Borrador" },
  ];
  const r = resumenObra(p, g);
  assert.equal(r.valor, 21500000);
  assert.equal(r.contrato, 20000000);
  assert.equal(p.monto_cotizado, 20000000);
});
test("cobros completados, anticipos y saldo se separan del avance físico", () => {
  const p = proyecto(),
    g = gestion();
  p.pagos = [
    { monto: 5000000, estado: "completado" },
    { monto: 99999999, estado: "anulado" },
    { monto: 99999999, estado: "pendiente" },
  ];
  g.estados_pago = [
    { monto: 7000000, estado: "Pagado" },
    { monto: 8000000, estado: "Solicitado" },
  ];
  g.actividades = [
    { avance: 75, costo: 0 },
    { avance: 75, costo: 0 },
  ];
  const r = resumenObra(p, g);
  assert.equal(r.recibido, 12000000);
  assert.equal(r.saldo, 8000000);
  assert.equal(r.avance, 75);
  assert.equal(r.avanceFinanciero, 60);
  assert.equal(r.desfase, false);
});
test("materiales presupuestados no son costo real, jornadas se calculan una sola vez", () => {
  const p = proyecto(),
    g = gestion();
  p.materiales = [
    { comprado: false, subtotal: 9000000 },
    { comprado: true, subtotal: 1000000 },
  ];
  p.imprevistos = [
    { estado: "pendiente", monto: 99999 },
    { estado: "aprobado", monto: 100000 },
  ];
  g.gastos = [{ monto: 200000 }];
  g.jornadas = [{ jornadas: 0.5, valor_diario: 40000 }];
  g.actividades = [{ avance: 50, costo: 15000000 }];
  const r = resumenObra(p, g);
  assert.equal(r.gastos, 1320000);
  assert.equal(r.manoObra, 20000);
  assert.equal(r.utilidadProyectada, 5000000);
  assert.equal(r.caja, -1320000);
  assert.equal(r.desfase, true);
});
test("pagos mayores al contrato muestran crédito, no deuda negativa", () => {
  const p = proyecto(),
    g = gestion();
  g.estados_pago = [{ estado: "Pagado", monto: 21000000 }];
  const r = resumenObra(p, g);
  assert.equal(r.saldo, 0);
  assert.equal(r.credito, 1000000);
});
test("obras anteriores conservan su avance y cobros legacy sin estado", () => {
  const p = proyecto();
  p.actividades = [{ porcentaje_avance: 40 }, { porcentaje_avance: 80 }];
  p.pagos = [{ monto: 1000000 }];
  const r = resumenObra(p, gestion());
  assert.equal(r.avance, 60);
  assert.equal(r.recibido, 1000000);
});
test("cierre exige avance completo, saldo cero, estados pagados y adicionales resueltos", () => {
  const p = proyecto(),
    g = gestion();
  assert.throws(() => validarCierre(p, g), /100/);
  g.actividades = [{ avance: 100, costo: 0 }];
  assert.throws(() => validarCierre(p, g), /saldo/);
  g.estados_pago = [{ estado: "Pagado", monto: 20000000 }];
  assert.doesNotThrow(() => validarCierre(p, g));
  g.adicionales = [{ estado: "Enviado", materiales: 100000, mano_obra: 0 }];
  assert.throws(() => validarCierre(p, g), /sin aprobar/);
});
test("vencimientos no convierten pagos recibidos en deuda", () => {
  assert.equal(
    estadoPago(
      { estado: "Solicitado", vencimiento: "2026-01-01" },
      "2026-01-02",
    ),
    "Vencido",
  );
  assert.equal(
    estadoPago({ estado: "Pagado", vencimiento: "2026-01-01" }, "2026-01-02"),
    "Pagado",
  );
  assert.equal(
    estadoPago(
      { estado: "Pendiente", vencimiento: "2026-01-02" },
      "2026-01-02",
    ),
    "Pendiente",
  );
});
test("cotización rechaza fechas invertidas, líneas incompletas y montos inválidos", () => {
  const c = {
    titulo: "Terraza",
    cliente_id: "c",
    direccion: "Santiago",
    fecha_inicio: "2026-01-01",
    fecha_termino: "2026-01-05",
    margen: 0,
    lineas: [
      { partida: "Terraza", descripcion: "Radier", cantidad: 1, precio: 100 },
    ],
  };
  assert.doesNotThrow(() => validarCotizacion(c));
  assert.throws(
    () => validarCotizacion({ ...c, fecha_termino: "2025-01-01" }),
    /fechas/,
  );
  assert.throws(
    () => validarCotizacion({ ...c, lineas: [{ ...c.lineas[0], precio: -1 }] }),
    /montos/,
  );
  assert.throws(() => validarCotizacion({ ...c, margen: NaN }), /recargo/);
});

test("cantidades decimales no pierden pesos por precisión binaria", () => {
  assert.equal(
    totalesCotizacion({
      lineas: [{ cantidad: 0.58, precio: 25 }],
      margen: 0,
      iva: false,
    }).total,
    15,
  );
  assert.equal(
    totalesCotizacion({
      lineas: [
        { cantidad: 1, precio: 1 },
        { cantidad: 1, precio: 1 },
      ],
      margen: 50,
      iva: false,
    }).neto,
    4,
  );
});
