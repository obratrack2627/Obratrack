"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOperaciones } from "@/lib/operaciones/use-operaciones";
import {
  gestionVacia,
  resumenObra,
  totalesCotizacion,
} from "@/lib/operaciones/calculos";
import { ErrorCarga, Indicador, Vacio } from "@/components/operaciones/UI";
import { formatCLP } from "@/lib/utils";

export default function ClientePage() {
  const { id } = useParams<{ id: string }>();
  const d = useOperaciones();
  const cliente = d.clientes.find((c) => c.id === id);
  const obras = d.proyectos
    .filter((p) => p.cliente_id === id)
    .map((p) => ({
      p,
      g:
        d.obras.find((g) => g.proyecto_id === p.id) ||
        gestionVacia(p.id, p.empresa_id),
    }));
  const cotizaciones = d.cotizaciones.filter((c) => c.cliente_id === id);
  return (
    <div className="op-page">
      <Link href="/clientes" className="op-muted text-sm">
        ← Clientes
      </Link>
      {d.loading ? (
        <p role="status">Cargando cliente…</p>
      ) : d.error ? (
        <ErrorCarga error={d.error} retry={d.cargar} />
      ) : !cliente ? (
        <p>Cliente no encontrado.</p>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{cliente.nombre}</h1>
            <p className="op-muted text-sm mt-2">{cliente.direccion}</p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm">
              {cliente.telefono && (
                <a href={`tel:${cliente.telefono}`} className="text-orange-600">
                  {cliente.telefono}
                </a>
              )}
              {cliente.email && (
                <a href={`mailto:${cliente.email}`}>{cliente.email}</a>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Indicador label="Obras" value={obras.length} />
            <Indicador label="Cotizaciones" value={cotizaciones.length} />
            <Indicador
              label="Pagos recibidos"
              value={obras.reduce(
                (s, { p, g }) => s + resumenObra(p, g).recibido,
                0,
              )}
              money
            />
            <Indicador
              label="Saldo pendiente"
              value={obras.reduce(
                (s, { p, g }) => s + resumenObra(p, g).saldo,
                0,
              )}
              money
            />
          </div>
          <section className="op-card">
            <h2 className="font-semibold">Historial de obras</h2>
            {obras.map(({ p, g }) => (
              <Link
                key={p.id}
                href={`/proyectos/${p.id}`}
                className="op-row text-sm"
              >
                <div>
                  <p>{p.nombre}</p>
                  <p className="text-xs op-muted mt-1">
                    {p.estado === "terminado" ? "Finalizada" : g.etapa}
                  </p>
                </div>
                <div className="text-right">
                  <p>{formatCLP(resumenObra(p, g).valor)}</p>
                  <p className="op-muted text-xs">
                    Saldo {formatCLP(resumenObra(p, g).saldo)}
                  </p>
                </div>
              </Link>
            ))}
            {!obras.length && <Vacio>No hay obras asociadas.</Vacio>}
          </section>
          <section className="op-card">
            <h2 className="font-semibold">Cotizaciones</h2>
            {cotizaciones.map((c) => (
              <Link key={c.id} href="/cotizaciones" className="op-row text-sm">
                <div>
                  {c.titulo}
                  <span className="op-badge ml-2">{c.estado}</span>
                </div>
                <strong>{formatCLP(totalesCotizacion(c).total)}</strong>
              </Link>
            ))}
            {!cotizaciones.length && (
              <Vacio>No hay cotizaciones asociadas.</Vacio>
            )}
          </section>
          <section className="op-card">
            <h2 className="font-semibold">Pagos realizados</h2>
            {obras
              .flatMap(({ p, g }) => [
                ...g.estados_pago
                  .filter((x) => x.estado === "Pagado")
                  .map((x) => ({
                    id: x.id,
                    nombre: p.nombre,
                    fecha: x.fecha_pago || x.fecha,
                    monto: x.monto,
                  })),
                ...(p.pagos || [])
                  .filter((x) => !x.estado || x.estado === "completado")
                  .map((x) => ({
                    id: x.id,
                    nombre: p.nombre,
                    fecha: x.fecha,
                    monto: x.monto,
                  })),
              ])
              .sort((a, b) => b.fecha.localeCompare(a.fecha))
              .map((x) => (
                <div key={x.id} className="op-row text-sm">
                  <div>
                    {x.nombre}
                    <p className="text-xs op-muted">{x.fecha}</p>
                  </div>
                  <strong>{formatCLP(x.monto)}</strong>
                </div>
              ))}
          </section>
        </>
      )}
    </div>
  );
}
