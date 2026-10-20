"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, FileText } from "lucide-react";
import { useOperaciones } from "@/lib/operaciones/use-operaciones";
import { operacionesService } from "@/lib/operaciones/service";
import {
  totalesCotizacion,
  costoLinea,
  ventaLinea,
} from "@/lib/operaciones/calculos";
import { dataService } from "@/lib/data-service";
import { formatCLP } from "@/lib/utils";
import {
  CATEGORIAS,
  ESTADOS_COTIZACION,
  type CotizacionObra,
  type LineaCotizacion,
} from "@/types/operaciones";
import {
  Campo,
  Monto,
  Modal,
  Vacio,
  ErrorCarga,
} from "@/components/operaciones/UI";

const hoy = () => new Date().toLocaleDateString("en-CA");
const linea = (): LineaCotizacion => ({
  id: crypto.randomUUID(),
  partida: "",
  descripcion: "",
  categoria: "Materiales",
  cantidad: 1,
  unidad: "unidad",
  precio: 0,
});
export default function CotizacionesPage() {
  const datos = useOperaciones();
  const [edit, setEdit] = useState<CotizacionObra | null>(null);
  const [ver, setVer] = useState<CotizacionObra | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("Todas");
  const nueva = () => {
    setError("");
    setEdit({
      id: crypto.randomUUID(),
      empresa_id: dataService.getActiveUser()?.empresa_id || "",
      cliente_id: "",
      titulo: "",
      direccion: "",
      fecha: hoy(),
      visita: "",
      observaciones: "",
      estado: "Borrador",
      lineas: [linea()],
      margen: 0,
      iva: true,
      condiciones_pago: "",
      fecha_inicio: hoy(),
      fecha_termino: hoy(),
      revision: 0,
      updated_at: "",
    });
  };
  const guardar = async () => {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      await operacionesService.guardarCotizacion(edit);
      setEdit(null);
      await datos.cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const convertir = async (c: CotizacionObra) => {
    setBusy(true);
    setError("");
    try {
      const id = await operacionesService.convertir(c);
      window.location.href = `/proyectos/${id}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const updateLinea = (id: string, patch: Partial<LineaCotizacion>) =>
    setEdit(
      (c) =>
        c && {
          ...c,
          lineas: c.lineas.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        },
    );
  return (
    <div className="op-page">
      <div className="op-no-print flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cotizaciones</h1>
          <p className="op-muted text-sm mt-1">
            Del primer contacto a la obra.
          </p>
        </div>
        <button
          className="op-primary"
          onClick={nueva}
          disabled={datos.loading || !!datos.error}
        >
          <Plus size={18} />
          Nueva
        </button>
      </div>
      <div className="op-no-print flex flex-wrap gap-2">
        {["Todas", ...ESTADOS_COTIZACION].map((s) => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            aria-pressed={s === filtro}
            className={s === filtro ? "op-primary" : "op-secondary"}
          >
            {s}
          </button>
        ))}
        <Link href="/cotizador" className="op-secondary">
          Asistente IA
        </Link>
      </div>
      {datos.error && <ErrorCarga error={datos.error} retry={datos.cargar} />}
      {error && !edit && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {datos.loading ? (
        <p role="status">Cargando cotizaciones…</p>
      ) : (
        !datos.error && (
          <div className="op-card op-no-print">
            {datos.cotizaciones
              .filter((c) => filtro === "Todas" || c.estado === filtro)
              .map((c) => (
                <div className="op-row" key={c.id}>
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{c.titulo}</p>
                    <p className="op-muted text-sm">
                      {
                        datos.clientes.find((x) => x.id === c.cliente_id)
                          ?.nombre
                      }{" "}
                      · {c.fecha}
                    </p>
                    <span className="op-badge mt-2">{c.estado}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="mr-2">
                      {formatCLP(totalesCotizacion(c).total)}
                    </strong>
                    <button
                      className="op-secondary"
                      onClick={() => {
                        setError("");
                        setVer(c);
                      }}
                    >
                      Ver
                    </button>
                    {!c.proyecto_id && (
                      <button
                        className="op-secondary"
                        onClick={() => {
                          setError("");
                          setEdit(structuredClone(c));
                        }}
                      >
                        Editar
                      </button>
                    )}
                    {c.proyecto_id ? (
                      <Link
                        className="op-primary"
                        href={`/proyectos/${c.proyecto_id}`}
                      >
                        Ver obra
                      </Link>
                    ) : (
                      c.estado === "Aprobada" && (
                        <button
                          className="op-primary"
                          disabled={busy}
                          onClick={() => convertir(c)}
                        >
                          Convertir en obra
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            {!datos.cotizaciones.filter(
              (c) => filtro === "Todas" || c.estado === filtro,
            ).length && <Vacio>No hay cotizaciones en este estado.</Vacio>}
          </div>
        )
      )}
      {edit && (
        <Modal
          title={edit.revision ? "Editar cotización" : "Nueva cotización"}
          close={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void guardar();
            }}
            className="space-y-5"
          >
            <fieldset disabled={busy} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <Campo label="Nombre del trabajo">
                  <input
                    required
                    value={edit.titulo}
                    onChange={(e) =>
                      setEdit({ ...edit, titulo: e.target.value })
                    }
                  />
                </Campo>
                <Campo label="Cliente">
                  <select
                    required
                    value={edit.cliente_id}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        cliente_id: e.target.value,
                        direccion:
                          datos.clientes.find((c) => c.id === e.target.value)
                            ?.direccion || edit.direccion,
                      })
                    }
                  >
                    <option value="">Seleccionar</option>
                    {datos.clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Dirección">
                  <input
                    required
                    value={edit.direccion}
                    onChange={(e) =>
                      setEdit({ ...edit, direccion: e.target.value })
                    }
                  />
                </Campo>
                <Campo label="Visita a terreno">
                  <input
                    type="date"
                    value={edit.visita}
                    onChange={(e) =>
                      setEdit({ ...edit, visita: e.target.value })
                    }
                  />
                </Campo>
                <Campo label="Inicio estimado">
                  <input
                    required
                    type="date"
                    value={edit.fecha_inicio}
                    onChange={(e) =>
                      setEdit({ ...edit, fecha_inicio: e.target.value })
                    }
                  />
                </Campo>
                <Campo label="Término estimado">
                  <input
                    required
                    type="date"
                    min={edit.fecha_inicio}
                    value={edit.fecha_termino}
                    onChange={(e) =>
                      setEdit({ ...edit, fecha_termino: e.target.value })
                    }
                  />
                </Campo>
                <Campo label="Estado">
                  <select
                    value={edit.estado}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        estado: e.target.value as CotizacionObra["estado"],
                      })
                    }
                  >
                    {ESTADOS_COTIZACION.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Campo>
              </div>
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Partidas y costos</h3>
                <button
                  type="button"
                  className="op-secondary"
                  onClick={() =>
                    setEdit({ ...edit, lineas: [...edit.lineas, linea()] })
                  }
                >
                  <Plus size={16} />
                  Agregar
                </button>
              </div>
              {edit.lineas.map((l, i) => (
                <div key={l.id} className="op-card space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="op-muted text-sm">Ítem {i + 1}</span>
                    <button
                      type="button"
                      aria-label={`Eliminar ítem ${i + 1}`}
                      disabled={edit.lineas.length === 1}
                      className="op-icon"
                      onClick={() =>
                        setEdit({
                          ...edit,
                          lineas: edit.lineas.filter((x) => x.id !== l.id),
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Campo label="Partida">
                      <input
                        required
                        placeholder="Terraza"
                        value={l.partida}
                        onChange={(e) =>
                          updateLinea(l.id, { partida: e.target.value })
                        }
                      />
                    </Campo>
                    <Campo label="Categoría">
                      <select
                        value={l.categoria}
                        onChange={(e) =>
                          updateLinea(l.id, {
                            categoria: e.target
                              .value as LineaCotizacion["categoria"],
                          })
                        }
                      >
                        {CATEGORIAS.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </Campo>
                    <Campo label="Descripción">
                      <input
                        required
                        placeholder="Estructura metálica"
                        value={l.descripcion}
                        onChange={(e) =>
                          updateLinea(l.id, { descripcion: e.target.value })
                        }
                      />
                    </Campo>
                    <Campo label="Unidad">
                      <input
                        required
                        value={l.unidad}
                        onChange={(e) =>
                          updateLinea(l.id, { unidad: e.target.value })
                        }
                      />
                    </Campo>
                    <Campo label="Cantidad">
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={l.cantidad}
                        onChange={(e) =>
                          updateLinea(l.id, {
                            cantidad: Number(e.target.value),
                          })
                        }
                      />
                    </Campo>
                    <Campo label="Costo unitario (CLP)">
                      <Monto
                        value={l.precio}
                        onChange={(precio) => updateLinea(l.id, { precio })}
                      />
                    </Campo>
                  </div>
                  <p className="text-right font-semibold">
                    {formatCLP(costoLinea(l))}
                  </p>
                </div>
              ))}
              <div className="grid sm:grid-cols-2 gap-4">
                <Campo label="Recargo sobre costos (%)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={edit.margen}
                    onChange={(e) =>
                      setEdit({ ...edit, margen: Number(e.target.value) })
                    }
                  />
                </Campo>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={edit.iva}
                    onChange={(e) =>
                      setEdit({ ...edit, iva: e.target.checked })
                    }
                  />
                  Incluir IVA (19 %)
                </label>
              </div>
              <Campo label="Forma de pago acordada">
                <textarea
                  placeholder="Anticipo y pagos según avance"
                  value={edit.condiciones_pago}
                  onChange={(e) =>
                    setEdit({ ...edit, condiciones_pago: e.target.value })
                  }
                />
              </Campo>
              <details>
                <summary className="cursor-pointer text-sm">
                  Observaciones
                </summary>
                <Campo label="Alcance y condiciones">
                  <textarea
                    value={edit.observaciones}
                    onChange={(e) =>
                      setEdit({ ...edit, observaciones: e.target.value })
                    }
                  />
                </Campo>
              </details>
              <div className="op-card space-y-2">
                <p className="flex justify-between">
                  <span>Costo</span>
                  <span>{formatCLP(totalesCotizacion(edit).costo)}</span>
                </p>
                <p className="flex justify-between">
                  <span>Neto</span>
                  <span>{formatCLP(totalesCotizacion(edit).neto)}</span>
                </p>
                <p className="flex justify-between">
                  <span>IVA</span>
                  <span>{formatCLP(totalesCotizacion(edit).iva)}</span>
                </p>
                <p className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span>{formatCLP(totalesCotizacion(edit).total)}</span>
                </p>
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="text-red-600 text-sm">
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
              <button disabled={busy} className="op-primary">
                {busy ? "Guardando…" : "Guardar cotización"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {ver && (
        <Modal title="Cotización" close={() => setVer(null)}>
          <div className="op-print space-y-5">
            <div className="flex justify-between gap-4 border-b pb-4">
              <div>
                <h2 className="text-2xl font-semibold">
                  {dataService.getActiveUser()?.empresa_nombre || "ObraTrack"}
                </h2>
                <p className="text-sm">Cotización · {ver.fecha}</p>
              </div>
              <span className="op-badge self-start">{ver.estado}</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold">{ver.titulo}</h3>
              <p>
                {datos.clientes.find((c) => c.id === ver.cliente_id)?.nombre}
              </p>
              <p className="op-muted text-sm">{ver.direccion}</p>
              <p className="op-muted text-sm">
                {ver.fecha_inicio} al {ver.fecha_termino}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-3">Partida / descripción</th>
                    <th>Cantidad</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ver.lineas.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="py-3 pr-3">
                        <strong>{l.partida}</strong>
                        <br />
                        {l.descripcion}
                        <br />
                        <span className="op-muted text-xs">{l.categoria}</span>
                      </td>
                      <td className="pr-3">
                        {l.cantidad} {l.unidad}
                      </td>
                      <td>{formatCLP(ventaLinea(l, ver.margen))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right space-y-1">
              <p>Neto: {formatCLP(totalesCotizacion(ver).neto)}</p>
              <p>IVA: {formatCLP(totalesCotizacion(ver).iva)}</p>
              <p className="text-xl font-semibold">
                Total: {formatCLP(totalesCotizacion(ver).total)}
              </p>
            </div>
            <p className="whitespace-pre-wrap">{ver.condiciones_pago}</p>
            <p className="whitespace-pre-wrap text-sm">{ver.observaciones}</p>
            <div className="flex flex-wrap gap-2 op-no-print">
              <button className="op-primary" onClick={() => window.print()}>
                <FileText size={16} />
                Imprimir / Guardar PDF
              </button>
              <a
                className="op-secondary"
                target="_blank"
                rel="noreferrer"
                href={`https://wa.me/${(datos.clientes.find((c) => c.id === ver.cliente_id)?.telefono || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, te comparto la cotización de ${ver.titulo} por ${formatCLP(totalesCotizacion(ver).total)}. ${ver.condiciones_pago}`)}`}
              >
                Mensaje de WhatsApp
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
