"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, MapPin, ArrowRight } from "lucide-react";
import { useOperaciones } from "@/lib/operaciones/use-operaciones";
import { gestionVacia, resumenObra } from "@/lib/operaciones/calculos";
import { ErrorCarga, Vacio } from "@/components/operaciones/UI";
import { formatCLP, formatDate } from "@/lib/utils";

export default function ProyectosPage() {
  const d = useOperaciones();
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("En curso");
  const obras = d.proyectos
    .map((p) => ({
      p,
      g:
        d.obras.find((g) => g.proyecto_id === p.id) ||
        gestionVacia(p.id, p.empresa_id),
    }))
    .filter(({ p, g }) => {
      const cerrada = p.estado === "terminado" || g.etapa === "Finalizada";
      return (
        (filtro === "Todas" ||
          (filtro === "Finalizadas" ? cerrada : !cerrada)) &&
        `${p.nombre} ${p.cliente?.nombre || ""}`
          .toLocaleLowerCase("es")
          .includes(search.toLocaleLowerCase("es"))
      );
    });
  return (
    <div className="op-page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Obras</h1>
          <p className="text-sm op-muted mt-1">
            Planifica, registra y controla cada trabajo.
          </p>
        </div>
        <Link href="/cotizaciones" className="op-primary">
          <Plus size={18} />
          Desde cotización
        </Link>
      </div>
      <div className="flex gap-2 flex-wrap">
        <input
          className="op-input sm:!w-72"
          aria-label="Buscar obra o cliente"
          placeholder="Buscar obra o cliente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {["En curso", "Finalizadas", "Todas"].map((x) => (
          <button
            aria-pressed={filtro === x}
            key={x}
            className={filtro === x ? "op-primary" : "op-secondary"}
            onClick={() => setFiltro(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {d.loading ? (
        <p role="status">Cargando obras…</p>
      ) : d.error ? (
        <ErrorCarga error={d.error} retry={d.cargar} />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {obras.map(({ p, g }) => {
            const r = resumenObra(p, g);
            const cerrada =
              p.estado === "terminado" || g.etapa === "Finalizada";
            return (
              <article key={p.id} className="op-card space-y-4">
                <div className="flex justify-between gap-4">
                  <div>
                    <Link
                      href={`/proyectos/${p.id}`}
                      className="font-semibold text-lg"
                    >
                      {p.nombre}
                    </Link>
                    <p className="text-sm op-muted mt-1">
                      {p.cliente?.nombre || "Sin cliente"}
                    </p>
                  </div>
                  <span className="op-badge self-start">
                    {cerrada
                      ? "Finalizada"
                      : p.estado === "pausado"
                        ? "Pausada"
                        : g.etapa}
                  </span>
                </div>
                <p className="text-xs op-muted">
                  {formatDate(p.fecha_inicio)} —{" "}
                  {formatDate(p.fecha_termino_estimada)}
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="op-muted text-xs">Avance físico</p>
                    <p className="font-semibold mt-1">{r.avance} %</p>
                  </div>
                  <div>
                    <p className="op-muted text-xs">Por cobrar</p>
                    <p className="font-semibold mt-1">{formatCLP(r.saldo)}</p>
                  </div>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="bg-[#6B8F72] h-full"
                    style={{ width: `${r.avance}%` }}
                  />
                </div>
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <Link className="op-primary" href={`/proyectos/${p.id}`}>
                    Abrir obra
                    <ArrowRight size={16} />
                  </Link>
                  {p.direccion && (
                    <a
                      className="op-secondary"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.direccion, p.comuna, p.region].filter(Boolean).join(", "))}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin size={16} />
                      Ubicación
                    </a>
                  )}
                </div>
              </article>
            );
          })}
          {!obras.length && (
            <div className="op-card lg:col-span-2">
              <Vacio>
                {search
                  ? "No hay coincidencias."
                  : "No hay obras en esta vista. Convierte una cotización aprobada para comenzar."}
              </Vacio>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
