"use client";
import { useState } from "react";
import type { Proyecto, Usuario } from "@/types/database";
import { CATEGORIAS, type GestionObra } from "@/types/operaciones";
import { Campo, Modal, Monto } from "./UI";
import { Adjuntos } from "./Adjuntos";
import { validarCierre } from "@/lib/operaciones/calculos";

export type Accion =
  | "gasto"
  | "jornada"
  | "pago"
  | "adicional"
  | "actividad"
  | "registro"
  | "cierre";
const titulos: Record<Accion, string> = {
  gasto: "Registrar gasto",
  jornada: "Registrar jornada",
  pago: "Estado de pago",
  adicional: "Trabajo adicional",
  actividad: "Actividad",
  registro: "Registro de terreno",
  cierre: "Cerrar obra",
};
type Field = {
  key: string;
  label: string;
  type?: "date" | "number" | "money" | "textarea";
  options?: { value: string; label: string }[];
  optional?: boolean;
  min?: number;
  max?: number;
  step?: number;
};
const opciones = (items: readonly string[]) =>
  items.map((s) => ({ value: s, label: s }));
export function RegistroForm({
  tipo,
  inicial,
  proyecto: p,
  gestion: g,
  usuarios,
  close,
  save,
}: {
  tipo: Accion;
  inicial?: Record<string, any>;
  proyecto: Proyecto;
  gestion: GestionObra;
  usuarios: Usuario[];
  close: () => void;
  save: (g: GestionObra) => Promise<void>;
}) {
  const fecha = new Date().toLocaleDateString("en-CA");
  const defaults: Record<Accion, Record<string, any>> = {
    gasto: {
      fecha,
      proveedor: "",
      monto: 0,
      categoria: "Materiales",
      partida: "",
      descripcion: "",
      metodo: "transferencia",
    },
    jornada: {
      fecha,
      trabajador_id: "",
      jornadas: 1,
      valor_diario: 0,
      actividad: "",
    },
    pago: {
      numero: Math.max(0, ...g.estados_pago.map((x) => x.numero)) + 1,
      fecha,
      vencimiento: fecha,
      monto: 0,
      motivo: "",
      avance: 0,
      estado: "Pendiente",
      fecha_pago: fecha,
    },
    adicional: {
      descripcion: "",
      materiales: 0,
      mano_obra: 0,
      fecha,
      estado: "Borrador",
      aprobacion: "",
    },
    actividad: {
      partida: "",
      nombre: "",
      responsable_id: "",
      inicio: p.fecha_inicio,
      termino: p.fecha_termino_estimada,
      avance: 0,
      costo: 0,
      observaciones: "",
      estado: "Pendiente",
    },
    registro: {
      fecha,
      partida: "",
      actividad_id: "",
      descripcion: "",
      observaciones: "",
    },
    cierre: { fecha, observaciones: "" },
  };
  const [v, setV] = useState<Record<string, any>>({
    ...defaults[tipo],
    ...inicial,
  });
  const [archivos, setArchivos] = useState<string[]>(
    inicial?.fotos || (inicial?.comprobante ? [inicial.comprobante] : []),
  );
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState("");
  const campos: Record<Accion, Field[]> = {
    gasto: [
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "proveedor", label: "Proveedor" },
      { key: "monto", label: "Monto (CLP)", type: "money" },
      { key: "categoria", label: "Categoría", options: opciones(CATEGORIAS) },
      { key: "partida", label: "Partida", optional: true },
      { key: "descripcion", label: "Descripción" },
      {
        key: "metodo",
        label: "Forma de pago",
        options: [
          { value: "transferencia", label: "Transferencia" },
          { value: "efectivo", label: "Efectivo" },
          { value: "debito", label: "Débito" },
        ],
      },
    ],
    jornada: [
      {
        key: "trabajador_id",
        label: "Trabajador",
        options: [
          { value: "", label: "Seleccionar" },
          ...usuarios.map((u) => ({ value: u.id, label: u.nombre })),
        ],
      },
      { key: "fecha", label: "Día trabajado", type: "date" },
      {
        key: "jornadas",
        label: "Jornadas",
        type: "number",
        min: 0.125,
        max: 1,
        step: 0.125,
      },
      { key: "valor_diario", label: "Valor diario (CLP)", type: "money" },
      { key: "actividad", label: "Actividad realizada" },
    ],
    pago: [
      { key: "numero", label: "Número", type: "number", min: 1 },
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "vencimiento", label: "Vencimiento", type: "date" },
      { key: "monto", label: "Monto (CLP)", type: "money" },
      { key: "motivo", label: "Motivo" },
      {
        key: "avance",
        label: "Avance acordado (%)",
        type: "number",
        min: 0,
        max: 100,
      },
      {
        key: "estado",
        label: "Estado",
        options: opciones(["Pendiente", "Solicitado", "Pagado"]),
      },
      ...(v.estado === "Pagado"
        ? [{ key: "fecha_pago", label: "Fecha de pago", type: "date" as const }]
        : []),
    ],
    adicional: [
      { key: "descripcion", label: "Descripción" },
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "materiales", label: "Materiales (CLP)", type: "money" },
      { key: "mano_obra", label: "Mano de obra (CLP)", type: "money" },
      {
        key: "estado",
        label: "Estado",
        options: opciones([
          "Borrador",
          "Enviado",
          "Aprobado",
          "Ejecutado",
          "Cobrado",
        ]),
      },
      {
        key: "aprobacion",
        label: "Aprobación del cliente",
        optional: !["Aprobado", "Ejecutado", "Cobrado"].includes(v.estado),
      },
    ],
    actividad: [
      { key: "partida", label: "Partida" },
      { key: "nombre", label: "Actividad" },
      {
        key: "responsable_id",
        label: "Responsable",
        optional: true,
        options: [
          { value: "", label: "Sin asignar" },
          ...usuarios.map((u) => ({ value: u.id, label: u.nombre })),
        ],
      },
      { key: "inicio", label: "Inicio", type: "date" },
      { key: "termino", label: "Término", type: "date" },
      {
        key: "estado",
        label: "Estado",
        options: opciones([
          "Pendiente",
          "En ejecución",
          "Terminada",
          "Bloqueada",
        ]),
      },
      {
        key: "avance",
        label: "Avance físico (%)",
        type: "number",
        min: 0,
        max: 100,
      },
      { key: "costo", label: "Costo previsto (CLP)", type: "money" },
      {
        key: "observaciones",
        label: "Observaciones",
        type: "textarea",
        optional: true,
      },
    ],
    registro: [
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "partida", label: "Sector o partida" },
      {
        key: "actividad_id",
        label: "Actividad",
        optional: true,
        options: [
          { value: "", label: "Sin actividad" },
          ...g.actividades.map((a) => ({
            value: a.id,
            label: `${a.partida} · ${a.nombre}`,
          })),
        ],
      },
      { key: "descripcion", label: "Descripción", type: "textarea" },
      {
        key: "observaciones",
        label: "Observaciones",
        type: "textarea",
        optional: true,
      },
    ],
    cierre: [
      { key: "fecha", label: "Fecha final", type: "date" },
      {
        key: "observaciones",
        label: "Observaciones",
        type: "textarea",
        optional: true,
      },
    ],
  };
  return (
    <Modal
      title={titulos[tipo]}
      close={() => {
        if (!busy && !uploadBusy) close();
      }}
    >
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (uploadBusy) return;
          setError("");
          setBusy(true);
          try {
            const next = structuredClone(g);
            const row: Record<string, any> & { id: string } = {
              ...v,
              id: inicial?.id || crypto.randomUUID(),
            };
            if (tipo === "actividad") {
              if (v.inicio > v.termino)
                throw new Error("El término debe ser posterior al inicio.");
              if (v.estado === "Terminada") row.avance = 100;
              if (v.estado === "Pendiente" && Number(v.avance) !== 0)
                throw new Error(
                  "Una actividad pendiente debe tener avance 0 %.",
                );
              if (v.estado !== "Terminada" && Number(row.avance) === 100)
                row.estado = "Terminada";
            }
            if (tipo === "gasto" || tipo === "pago") {
              if (!(Number(v.monto) > 0))
                throw new Error("Ingresa un monto mayor a cero.");
              row.comprobante = archivos[0] || "";
            }
            if (tipo === "pago") {
              if (
                g.estados_pago.some(
                  (x) => x.numero === Number(v.numero) && x.id !== row.id,
                )
              )
                throw new Error("Ese número de estado de pago ya existe.");
              if (v.vencimiento < v.fecha)
                throw new Error("Revisa la fecha de vencimiento.");
              if (v.estado !== "Pagado") {
                delete row.fecha_pago;
                delete row.comprobante;
              }
            }
            if (tipo === "adicional") {
              if (Number(v.materiales) + Number(v.mano_obra) <= 0)
                throw new Error("Ingresa el valor del adicional.");
              if (
                ["Aprobado", "Ejecutado", "Cobrado"].includes(v.estado) &&
                !v.aprobacion.trim()
              )
                throw new Error("Registra quién aprobó y cuándo.");
              if (
                inicial &&
                ["Aprobado", "Ejecutado", "Cobrado"].includes(inicial.estado) &&
                (v.materiales !== inicial.materiales ||
                  v.mano_obra !== inicial.mano_obra ||
                  v.descripcion !== inicial.descripcion)
              )
                throw new Error(
                  "Un adicional aprobado conserva su alcance y monto. Crea uno nuevo para otros trabajos.",
                );
            }
            if (tipo === "jornada") {
              if (
                g.jornadas.some(
                  (j) =>
                    j.id !== row.id &&
                    j.trabajador_id === v.trabajador_id &&
                    j.fecha === v.fecha,
                )
              )
                throw new Error(
                  "Este trabajador ya tiene una jornada en esa fecha. Edita el registro existente.",
                );
              if (!(Number(v.valor_diario) > 0))
                throw new Error("Ingresa el valor diario.");
              row.trabajador =
                usuarios.find((u) => u.id === v.trabajador_id)?.nombre || "";
            }
            if (tipo === "registro") row.fotos = archivos;
            if (tipo === "cierre") {
              validarCierre(p, g);
              next.etapa = "Finalizada";
              next.cierre = {
                fecha: v.fecha,
                observaciones: v.observaciones,
                documentos: archivos,
              };
            } else {
              const key = {
                gasto: "gastos",
                jornada: "jornadas",
                pago: "estados_pago",
                adicional: "adicionales",
                actividad: "actividades",
                registro: "bitacora",
              }[tipo] as "gastos";
              next[key] = [
                ...next[key].filter((x) => x.id !== row.id),
                row,
              ] as GestionObra["gastos"];
            }
            await save(next);
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="grid sm:grid-cols-2 gap-4">
          {campos[tipo].map((f) => (
            <Campo key={f.key} label={f.label}>
              {f.type === "money" ? (
                <Monto
                  value={Number(v[f.key])}
                  onChange={(n) => setV({ ...v, [f.key]: n })}
                />
              ) : f.options ? (
                <select
                  required={!f.optional}
                  value={v[f.key]}
                  onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  required={!f.optional}
                  value={v[f.key]}
                  onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  required={!f.optional}
                  type={f.type || "text"}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={v[f.key]}
                  onChange={(e) =>
                    setV({
                      ...v,
                      [f.key]:
                        f.type === "number"
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              )}
            </Campo>
          ))}
          {["gasto", "pago", "registro", "cierre"].includes(tipo) && (
            <div className="sm:col-span-2 space-y-2">
              <p className="text-sm font-medium">
                {tipo === "registro"
                  ? "Fotografías"
                  : tipo === "cierre"
                    ? "Documentos finales"
                    : "Comprobante"}
              </p>
              <Adjuntos
                value={archivos}
                onChange={setArchivos}
                multiple={tipo === "registro" || tipo === "cierre"}
                images={tipo === "registro"}
                onBusyChange={setUploadBusy}
              />
            </div>
          )}
          {tipo === "cierre" && (
            <p className="text-sm op-muted sm:col-span-2">
              La obra quedará en el historial y sus registros no podrán
              editarse.
            </p>
          )}
          {tipo === "jornada" && (
            <p className="text-sm op-muted sm:col-span-2">
              1 jornada = día completo · 0,5 = medio día.
            </p>
          )}
          {tipo === "adicional" && (
            <p className="text-sm op-muted sm:col-span-2">
              El cobro se registra en Estados de pago. Los costos se registran
              en Gastos o Jornadas.
            </p>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            className="op-secondary"
            type="button"
            disabled={busy || uploadBusy}
            onClick={close}
          >
            Cancelar
          </button>
          <button className="op-primary" disabled={busy || uploadBusy}>
            {busy
              ? "Guardando…"
              : tipo === "cierre"
                ? "Confirmar cierre"
                : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
