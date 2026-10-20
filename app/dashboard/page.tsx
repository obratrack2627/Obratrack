"use client";
import Link from "next/link";
import { useOperaciones } from "@/lib/operaciones/use-operaciones";
import {
  resumenObra,
  gestionVacia,
  estadoPago,
} from "@/lib/operaciones/calculos";
import { ErrorCarga, Indicador, Vacio } from "@/components/operaciones/UI";
import { formatCLP } from "@/lib/utils";
import { ArrowRight, Plus } from "lucide-react";

export default function DashboardPage() {
  const datos = useOperaciones();
  const hoy = new Date().toLocaleDateString("en-CA");
  const obras = datos.proyectos.map((p) => {
    const g =
      datos.obras.find((g) => g.proyecto_id === p.id) ||
      gestionVacia(p.id, p.empresa_id);
    return { p, g, r: resumenObra(p, g) };
  });
  const activas = obras.filter(
    ({ p, g }) => p.estado === "activo" && g.etapa !== "Finalizada",
  );
  const pendientes = datos.cotizaciones.filter((c) =>
    ["Borrador", "Enviada", "Modificada"].includes(c.estado),
  );
  const suma = (
    key: "valor" | "recibido" | "saldo" | "gastos" | "utilidadProyectada",
  ) => obras.reduce((s, o) => s + o.r[key], 0);
  const alertas = activas.flatMap(({ p, g, r }) =>
    [
      ...(p.fecha_termino_estimada < hoy
        ? [`${p.nombre}: plazo de obra vencido.`]
        : []),
      ...(r.desfase
        ? [`${p.nombre}: el avance supera lo cobrado en 20 puntos o más.`]
        : []),
      ...g.estados_pago
        .filter((x) => estadoPago(x, hoy) === "Vencido")
        .map((x) => `${p.nombre}: estado de pago N.º ${x.numero} vencido.`),
      ...g.actividades
        .filter((a) => a.termino < hoy && a.estado !== "Terminada")
        .map((a) => `${p.nombre}: ${a.nombre} está atrasada.`),
      ...(datos.cotizaciones.find((c) => c.proyecto_id === p.id)?.lineas.length
        ? (() => {
            const presupuesto = datos.cotizaciones
              .find((c) => c.proyecto_id === p.id)!
              .lineas.filter((l) => l.categoria === "Materiales")
              .reduce((s, l) => s + Math.round(l.cantidad * l.precio), 0);
            const costo =
              g.gastos
                .filter((x) => x.categoria === "Materiales")
                .reduce((s, x) => s + x.monto, 0) +
              (p.materiales || [])
                .filter((m) => m.comprado)
                .reduce((s, m) => s + Number(m.subtotal), 0);
            return costo > presupuesto
              ? [`${p.nombre}: materiales sobre el presupuesto original.`]
              : [];
          })()
        : []),
    ].map((texto) => ({ texto, href: `/proyectos/${p.id}` })),
  );
  datos.cotizaciones
    .filter(
      (c) =>
        ["Enviada", "Modificada"].includes(c.estado) &&
        c.updated_at.slice(0, 10) <
          new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA"),
    )
    .forEach((c) =>
      alertas.push({
        texto: `${c.titulo}: cotización sin respuesta por más de 7 días.`,
        href: "/cotizaciones",
      }),
    );
  return (
    <div className="op-page">
      <div className="flex justify-between gap-4 items-center">
        <div>
          <h1 className="text-2xl font-semibold">Resumen</h1>
          <p className="op-muted text-sm mt-1">
            Tus obras, cobros y próximos pasos.
          </p>
        </div>
        <Link className="op-primary" href="/cotizaciones">
          <Plus size={18} />
          Cotización
        </Link>
      </div>
      {datos.loading ? (
        <p role="status">Cargando resumen…</p>
      ) : datos.error ? (
        <ErrorCarga error={datos.error} retry={datos.cargar} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Indicador label="Obras activas" value={activas.length} />
            <Indicador
              label="Cotizaciones pendientes"
              value={pendientes.length}
            />
            <Indicador label="Valor contratado" value={suma("valor")} money />
            <Indicador label="Total cobrado" value={suma("recibido")} money />
            <Indicador label="Por cobrar" value={suma("saldo")} money />
            <Indicador label="Costos acumulados" value={suma("gastos")} money />
            <Indicador
              label="Utilidad proyectada"
              value={suma("utilidadProyectada")}
              money
            />
            <Indicador
              label="Obras atrasadas"
              value={
                activas.filter((o) => o.p.fecha_termino_estimada < hoy).length
              }
            />
          </div>
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
            <section className="op-card">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold">Obras en curso</h2>
                <Link className="op-secondary" href="/proyectos">
                  Ver todas
                </Link>
              </div>
              {activas.map(({ p, g, r }) => (
                <Link key={p.id} href={`/proyectos/${p.id}`} className="op-row">
                  <div>
                    <p className="font-medium text-sm">{p.nombre}</p>
                    <p className="text-xs op-muted mt-1">
                      {p.cliente?.nombre} · {g.etapa}
                    </p>
                    <p className="text-xs op-muted mt-1">
                      Físico {r.avance} % · Cobrado {r.avanceFinanciero} %
                    </p>
                  </div>
                  <div className="flex gap-3 items-center">
                    <span className="text-sm">
                      {formatCLP(r.saldo)}
                      <span className="block text-xs op-muted">por cobrar</span>
                    </span>
                    <ArrowRight size={16} />
                  </div>
                </Link>
              ))}
              {!activas.length && (
                <Vacio>Aprueba una cotización para comenzar una obra.</Vacio>
              )}
            </section>
            <section className="op-card">
              <h2 className="font-semibold">
                Requiere atención{" "}
                <span className="op-muted font-normal">({alertas.length})</span>
              </h2>
              {alertas.map((a, i) => (
                <Link key={i} href={a.href} className="op-row text-sm">
                  <span>{a.texto}</span>
                  <ArrowRight size={16} className="shrink-0" />
                </Link>
              ))}
              {!alertas.length && <Vacio>No hay alertas pendientes.</Vacio>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
