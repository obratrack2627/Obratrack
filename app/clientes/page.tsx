"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useOperaciones } from "@/lib/operaciones/use-operaciones";
import { dataService } from "@/lib/data-service";
import { supabaseService } from "@/lib/supabase/supabase-service";
import { gestionVacia, resumenObra } from "@/lib/operaciones/calculos";
import { Campo, Modal, ErrorCarga, Vacio } from "@/components/operaciones/UI";
import { formatCLP, formatRUT } from "@/lib/utils";
import type { Cliente } from "@/types/database";

export default function ClientesPage() {
  const d = useOperaciones();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<Cliente | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="op-page">
      <div className="flex justify-between gap-4 items-center">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <button
          className="op-primary"
          disabled={d.loading || !!d.error}
          onClick={() => {
            setError("");
            setEdit({
              id: crypto.randomUUID(),
              empresa_id: dataService.getActiveUser()?.empresa_id,
              nombre: "",
              telefono: "",
              email: "",
              direccion: "",
              rut: "",
            });
          }}
        >
          <Plus size={18} />
          Nuevo cliente
        </button>
      </div>
      <input
        className="op-input sm:!w-80"
        aria-label="Buscar cliente"
        placeholder="Buscar cliente"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {d.loading ? (
        <p role="status">Cargando clientes…</p>
      ) : d.error ? (
        <ErrorCarga error={d.error} retry={d.cargar} />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {d.clientes
            .filter((c) =>
              `${c.nombre} ${c.rut || ""} ${c.telefono || ""}`
                .toLocaleLowerCase("es")
                .includes(search.toLocaleLowerCase("es")),
            )
            .map((c) => {
              const obras = d.proyectos.filter((p) => p.cliente_id === c.id);
              const saldo = obras.reduce(
                (s, p) =>
                  s +
                  resumenObra(
                    p,
                    d.obras.find((g) => g.proyecto_id === p.id) ||
                      gestionVacia(p.id, p.empresa_id),
                  ).saldo,
                0,
              );
              return (
                <article className="op-card space-y-3" key={c.id}>
                  <h2 className="font-semibold text-lg">
                    <Link href={`/clientes/${c.id}`}>{c.nombre}</Link>
                  </h2>
                  <div className="text-sm op-muted space-y-1">
                    {c.telefono && (
                      <p>
                        <a href={`tel:${c.telefono}`}>{c.telefono}</a>
                      </p>
                    )}
                    {c.email && <p className="break-all">{c.email}</p>}
                    {c.direccion && <p>{c.direccion}</p>}
                  </div>
                  <div className="text-xs op-muted border-t pt-3 flex flex-wrap gap-3">
                    <span>{obras.length} obras</span>
                    <span>
                      {
                        d.cotizaciones.filter((q) => q.cliente_id === c.id)
                          .length
                      }{" "}
                      cotizaciones
                    </span>
                  </div>
                  <p className="text-sm">
                    Por cobrar <strong>{formatCLP(saldo)}</strong>
                  </p>
                  <div className="flex gap-2">
                    <Link className="op-primary" href={`/clientes/${c.id}`}>
                      Ver historial
                    </Link>
                    <button
                      className="op-secondary"
                      onClick={() => {
                        setError("");
                        setEdit({ ...c });
                      }}
                    >
                      Editar
                    </button>
                  </div>
                </article>
              );
            })}
          {!d.clientes.length && (
            <Vacio>Agrega tu primer cliente para crear una cotización.</Vacio>
          )}
        </div>
      )}
      {edit && (
        <Modal
          title={
            d.clientes.some((c) => c.id === edit.id)
              ? "Editar cliente"
              : "Nuevo cliente"
          }
          close={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (!edit.nombre.trim())
                  throw new Error("Ingresa el nombre del cliente.");
                await supabaseService.saveCliente(edit);
                setEdit(null);
                await d.cargar();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <Campo label="Nombre o razón social">
                <input
                  required
                  value={edit.nombre}
                  onChange={(e) => setEdit({ ...edit, nombre: e.target.value })}
                />
              </Campo>
              <div className="grid sm:grid-cols-2 gap-4">
                <Campo label="Teléfono">
                  <input
                    type="tel"
                    value={edit.telefono || ""}
                    onChange={(e) =>
                      setEdit({ ...edit, telefono: e.target.value })
                    }
                  />
                </Campo>
                <Campo label="RUT">
                  <input
                    value={edit.rut || ""}
                    onChange={(e) =>
                      setEdit({ ...edit, rut: formatRUT(e.target.value) })
                    }
                  />
                </Campo>
              </div>
              <Campo label="Correo">
                <input
                  type="email"
                  value={edit.email || ""}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                />
              </Campo>
              <Campo label="Dirección">
                <input
                  value={edit.direccion || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, direccion: e.target.value })
                  }
                />
              </Campo>
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="op-secondary"
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                Cancelar
              </button>
              <button className="op-primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar cliente"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
