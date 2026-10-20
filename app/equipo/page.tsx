"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useOperaciones } from "@/lib/operaciones/use-operaciones";
import { dataService } from "@/lib/data-service";
import { supabaseService } from "@/lib/supabase/supabase-service";
import { Campo, Modal, ErrorCarga, Vacio } from "@/components/operaciones/UI";
import { formatCLP, formatRUT, validarRutChileno } from "@/lib/utils";
import type { Usuario } from "@/types/database";

export default function EquipoPage() {
  const d = useOperaciones();
  const [edit, setEdit] = useState<Usuario | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="op-page">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Equipo</h1>
          <p className="text-sm op-muted mt-1">Trabajadores y mano de obra.</p>
        </div>
        <button
          className="op-primary"
          disabled={d.loading || !!d.error}
          onClick={() => {
            setError("");
            setEdit({
              id: crypto.randomUUID(),
              empresa_id: dataService.getActiveUser()?.empresa_id || "",
              nombre: "",
              email: "",
              telefono_whatsapp: "",
              rol: "terreno",
            });
          }}
        >
          <Plus size={18} />
          Trabajador
        </button>
      </div>
      <input
        className="op-input sm:!w-80"
        aria-label="Buscar trabajador"
        placeholder="Buscar trabajador"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {d.loading ? (
        <p role="status">Cargando equipo…</p>
      ) : d.error ? (
        <ErrorCarga error={d.error} retry={d.cargar} />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {d.usuarios
            .filter((u) =>
              `${u.nombre} ${u.rut || ""}`
                .toLocaleLowerCase("es")
                .includes(search.toLocaleLowerCase("es")),
            )
            .map((u) => {
              const jornadas = d.obras.flatMap((g) =>
                g.jornadas.filter((j) => j.trabajador_id === u.id),
              );
              return (
                <article className="op-card space-y-3" key={u.id}>
                  <h2 className="font-semibold text-lg">{u.nombre}</h2>
                  <p className="text-xs op-muted">
                    {u.rol === "admin"
                      ? "Administrador"
                      : u.rol === "supervisor"
                        ? "Supervisor"
                        : "Trabajador"}
                  </p>
                  {u.telefono_whatsapp && (
                    <a
                      href={`tel:${u.telefono_whatsapp}`}
                      className="text-sm block"
                    >
                      {u.telefono_whatsapp}
                    </a>
                  )}
                  {u.rut && <p className="text-sm op-muted">{u.rut}</p>}
                  <div className="grid grid-cols-2 gap-3 border-t pt-3">
                    <div>
                      <p className="text-xs op-muted">Jornadas</p>
                      <strong>
                        {jornadas.reduce((s, j) => s + j.jornadas, 0)}
                      </strong>
                    </div>
                    <div>
                      <p className="text-xs op-muted">Costo registrado</p>
                      <strong>
                        {formatCLP(
                          jornadas.reduce(
                            (s, j) =>
                              s + Math.round(j.jornadas * j.valor_diario),
                            0,
                          ),
                        )}
                      </strong>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="op-secondary"
                      onClick={() => {
                        setError("");
                        setEdit({ ...u });
                      }}
                    >
                      Editar
                    </button>
                    {u.telefono_whatsapp && (
                      <a
                        className="op-secondary"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://wa.me/${u.telefono_whatsapp.replace(/\D/g, "")}`}
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          {!d.usuarios.length && (
            <Vacio>Agrega un trabajador para registrar sus jornadas.</Vacio>
          )}
        </div>
      )}
      {edit && (
        <Modal
          title={
            d.usuarios.some((u) => u.id === edit.id)
              ? "Editar trabajador"
              : "Nuevo trabajador"
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
                if (!edit.nombre.trim()) throw new Error("Ingresa el nombre.");
                if (edit.rut && !validarRutChileno(edit.rut))
                  throw new Error("Revisa el RUT.");
                await supabaseService.saveUsuario({
                  ...edit,
                  nombre: edit.nombre.trim(),
                });
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
              <Campo label="Nombre completo">
                <input
                  required
                  value={edit.nombre}
                  onChange={(e) => setEdit({ ...edit, nombre: e.target.value })}
                />
              </Campo>
              <Campo label="Teléfono">
                <input
                  type="tel"
                  value={edit.telefono_whatsapp || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, telefono_whatsapp: e.target.value })
                  }
                />
              </Campo>
              <details>
                <summary className="cursor-pointer text-sm">
                  Datos adicionales
                </summary>
                <div className="space-y-4 mt-4">
                  <Campo label="RUT">
                    <input
                      value={edit.rut || ""}
                      onChange={(e) =>
                        setEdit({ ...edit, rut: formatRUT(e.target.value) })
                      }
                    />
                  </Campo>
                  <Campo label="Correo de contacto">
                    <input
                      type="email"
                      disabled={!!edit.auth_user_id}
                      value={edit.email || ""}
                      onChange={(e) =>
                        setEdit({ ...edit, email: e.target.value })
                      }
                    />
                  </Campo>
                </div>
              </details>
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
                {busy ? "Guardando…" : "Guardar trabajador"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
