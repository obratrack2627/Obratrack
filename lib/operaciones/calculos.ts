import type { Proyecto } from "../../types/database";
import type {
  CotizacionObra,
  GestionObra,
  EstadoPagoObra,
  LineaCotizacion,
} from "../../types/operaciones";

// Cantidades con dos decimales y precios enteros: evita errores binarios
// como 0,58 × 25 = 14,499999... al redondear pesos.
export function costoLinea(l: Pick<LineaCotizacion, "cantidad" | "precio">) {
  return Math.round((Math.round(l.cantidad * 100) * l.precio) / 100);
}
export function ventaLinea(
  l: Pick<LineaCotizacion, "cantidad" | "precio">,
  recargo: number,
) {
  return Math.round(
    (costoLinea(l) * (10000 + Math.round(recargo * 100))) / 10000,
  );
}

export function totalesCotizacion(
  c: Pick<CotizacionObra, "lineas" | "margen" | "iva">,
) {
  const costo = c.lineas.reduce((s, l) => s + costoLinea(l), 0);
  const neto = c.lineas.reduce((s, l) => s + ventaLinea(l, c.margen), 0);
  const iva = c.iva ? Math.round((neto * 19) / 100) : 0;
  return { costo, neto, iva, total: neto + iva };
}

export function gestionVacia(
  proyecto_id: string,
  empresa_id: string,
): GestionObra {
  return {
    proyecto_id,
    empresa_id,
    etapa: "Planificación",
    gastos: [],
    jornadas: [],
    adicionales: [],
    estados_pago: [],
    actividades: [],
    bitacora: [],
    revision: 0,
    updated_at: "",
  };
}

export function estadoPago(p: EstadoPagoObra, hoy: string): string {
  return p.estado !== "Pagado" && p.vencimiento < hoy ? "Vencido" : p.estado;
}

// El contrato es ingreso devengado; el cobro es caja. Nunca se suman entre sí.
// Materiales del módulo anterior son presupuesto hasta marcarse comprados.
export function resumenObra(p: Proyecto, g: GestionObra) {
  if (g.etapa === "Finalizada" && g.cierre?.resumen) return g.cierre.resumen;
  const adicionales = g.adicionales
    .filter((a) => ["Aprobado", "Ejecutado", "Cobrado"].includes(a.estado))
    .reduce((s, a) => s + a.materiales + a.mano_obra, 0);
  const contrato = Number(p.monto_cotizado || 0);
  const valor = contrato + adicionales;
  const pagosAnteriores = (p.pagos || [])
    .filter((x) => !x.estado || x.estado === "completado")
    .reduce((s, x) => s + Number(x.monto), 0);
  const recibido =
    pagosAnteriores +
    g.estados_pago
      .filter((x) => x.estado === "Pagado")
      .reduce((s, x) => s + x.monto, 0);
  const materialesAnteriores = (p.materiales || [])
    .filter((x) => x.comprado)
    .reduce((s, x) => s + Number(x.subtotal), 0);
  const imprevistosAnteriores = (p.imprevistos || [])
    .filter((x) => x.estado === "aprobado")
    .reduce((s, x) => s + Number(x.monto), 0);
  const manoObra = g.jornadas.reduce(
    (s, x) => s + Math.round(x.jornadas * x.valor_diario),
    0,
  );
  const gastos =
    g.gastos.reduce((s, x) => s + x.monto, 0) +
    manoObra +
    materialesAnteriores +
    imprevistosAnteriores;
  // Igual peso a cada actividad; el dinero no altera el avance físico.
  const avance = g.actividades.length
    ? Math.round(
        g.actividades.reduce((s, x) => s + x.avance, 0) / g.actividades.length,
      )
    : p.actividades?.length
      ? Math.round(
          p.actividades.reduce((s, x) => s + Number(x.porcentaje_avance), 0) /
            p.actividades.length,
        )
      : p.porcentaje_avance_ponderado || 0;
  const avanceFinanciero = valor > 0 ? Math.round((recibido / valor) * 100) : 0;
  const costoPlanificado = g.actividades.reduce((s, a) => s + a.costo, 0);
  return {
    contrato,
    adicionales,
    valor,
    recibido,
    saldo: Math.max(0, valor - recibido),
    credito: Math.max(0, recibido - valor),
    gastos,
    manoObra,
    avance,
    avanceFinanciero,
    caja: recibido - gastos,
    utilidad: valor - gastos,
    utilidadProyectada: valor - Math.max(gastos, costoPlanificado),
    desfase: avance - avanceFinanciero >= 20,
  };
}

export function validarCotizacion(c: CotizacionObra) {
  if (!c.titulo.trim() || !c.cliente_id || !c.direccion.trim())
    throw new Error("Completa nombre, cliente y dirección.");
  if (
    !c.lineas.length ||
    c.lineas.some(
      (l) =>
        !l.partida.trim() ||
        !l.descripcion.trim() ||
        !Number.isFinite(l.cantidad) ||
        l.cantidad <= 0 ||
        Number(l.cantidad.toFixed(2)) !== l.cantidad ||
        !Number.isFinite(l.precio) ||
        !Number.isInteger(l.precio) ||
        l.precio < 0,
    )
  )
    throw new Error("Revisa las partidas y sus montos.");
  if (
    !Number.isFinite(c.margen) ||
    c.margen < 0 ||
    c.margen > 100 ||
    Number(c.margen.toFixed(2)) !== c.margen
  )
    throw new Error("El recargo debe estar entre 0 y 100 %.");
  if (!c.fecha_inicio || !c.fecha_termino || c.fecha_inicio > c.fecha_termino)
    throw new Error("Revisa las fechas de la obra.");
}

export function validarCierre(p: Proyecto, g: GestionObra) {
  const r = resumenObra(p, g);
  if (r.avance !== 100)
    throw new Error("Completa el avance físico al 100 % antes de cerrar.");
  if (r.saldo > 0) throw new Error("Aún queda saldo por cobrar.");
  if (g.estados_pago.some((x) => x.estado !== "Pagado"))
    throw new Error("Revisa los estados de pago pendientes.");
  if (g.adicionales.some((x) => ["Aprobado", "Ejecutado"].includes(x.estado)))
    throw new Error("Completa y cobra los adicionales aprobados.");
  if (g.adicionales.some((x) => ["Borrador", "Enviado"].includes(x.estado)))
    throw new Error(
      "Resuelve o elimina los adicionales sin aprobar antes de cerrar.",
    );
}
