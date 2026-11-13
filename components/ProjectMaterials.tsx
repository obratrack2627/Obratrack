"use client";
import { useState, useRef } from "react";
import { PackageCheck, X, Edit3, Trash2 } from "lucide-react";
import ModalOverlay from "@/components/ModalOverlay";
import {
  crewInput,
  crewPrimary,
  crewSecondary,
} from "@/components/CrewAttendanceEditor";
import { dataService } from "@/lib/data-service";
import { chileToday } from "@/lib/work-calendar";
import { materialNeeds } from "@/lib/construction-workflow";
import { formatCLP } from "@/lib/utils";
import type { MaterialProyecto } from "@/types/database";
export default function ProjectMaterials({
  materials,
  onEdit,
  onDelete,
  onChanged,
}: {
  materials: MaterialProyecto[];
  onEdit: (material: MaterialProyecto) => void;
  onDelete: (material: MaterialProyecto) => void;
  onChanged: () => void;
}) {
  const [receiving, setReceiving] = useState<MaterialProyecto | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(chileToday());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const operation = useRef("");
  const received = (material: MaterialProyecto) =>
    dataService
      .getBitacora(material.proyecto_id)
      .filter((row) => row.material_id === material.id)
      .reduce((sum, row) => sum + Number(row.cantidad_recibida || 0), 0);
  const toggle = async (
    material: MaterialProyecto,
    key: "comprado" | "pagado",
    value: boolean,
  ) => {
    setBusy(true);
    setError("");
    try {
      dataService.updateMaterialProyecto(material.id, { [key]: value });
      onChanged();
      await dataService.confirmarCambios();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Cambio pendiente de sincronización.",
      );
    } finally {
      setBusy(false);
    }
  };
  const needs = materialNeeds(
    materials,
    dataService.getActividades(),
    dataService.getBitacora(),
  );
  return (
    <>
      {needs.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Faltan entregas para {needs.length} materiales asociados a faenas
          próximas. Revisa las cantidades antes de iniciar.
        </p>
      )}
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {materials.map((material) => {
          const delivered = received(material);
          const pending = Math.max(0, material.cantidad - delivered);
          return (
            <article
              key={material.id}
              className="min-w-0 space-y-3 rounded-xl border border-kraft-200 p-4 dark:border-gray-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="break-words font-bold">{material.nombre}</h4>
                  <p className="mt-1 text-xs text-gray-500">
                    {material.proveedor || "Proveedor por definir"}
                  </p>
                </div>
                <div className="flex">
                  <button
                    type="button"
                    title="Editar material"
                    onClick={() => onEdit(material)}
                    className="p-2 text-gray-500"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    type="button"
                    title="Eliminar material"
                    onClick={() => onDelete(material)}
                    className="p-2 text-gray-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  {material.cantidad} {material.unidad} ×{" "}
                  {formatCLP(material.precio_unitario)}
                </span>
                <strong>{formatCLP(material.subtotal)}</strong>
              </div>
              <div className="rounded-lg bg-kraft-100 p-3 text-sm dark:bg-gray-900">
                <span className="font-semibold">
                  {pending <= 0
                    ? "Recibido completo"
                    : delivered > 0
                      ? "Entrega parcial"
                      : "Por recibir"}
                </span>
                <p className="mt-1 text-xs text-gray-500">
                  Recibido: {delivered} / {material.cantidad} {material.unidad}
                </p>
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-[#FF6A00]"
                    disabled={busy}
                    checked={material.comprado}
                    onChange={(event) =>
                      void toggle(material, "comprado", event.target.checked)
                    }
                  />
                  Compra registrada
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-[#FF6A00]"
                    disabled={busy}
                    checked={material.pagado === true}
                    onChange={(event) =>
                      void toggle(material, "pagado", event.target.checked)
                    }
                  />
                  Pago confirmado
                </label>
              </div>
              <button
                type="button"
                className={`${crewSecondary} w-full`}
                disabled={busy || pending <= 0}
                onClick={() => {
                  setReceiving(material);
                  setAmount(String(Number(pending.toFixed(6))));
                  setDate(chileToday());
                  setNote("");
                  setError("");
                  operation.current = "";
                }}
              >
                <PackageCheck size={16} />
                Registrar recepción
              </button>
            </article>
          );
        })}
      </div>
      {error && !receiving && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {receiving && (
        <ModalOverlay
          onClose={() => {
            if (!busy) setReceiving(null);
          }}
          aria-label="Recepción de material"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        >
          <form
            className="w-full max-w-md space-y-4 rounded-2xl bg-[#FAF8F5] p-5 dark:bg-[#0B0F14]"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                const actor = dataService.getActiveUser();
                const fields = {
                  proyecto_id: receiving.proyecto_id,
                  usuario_id: actor?.id,
                  autor_nombre: actor?.nombre || "Jefatura",
                  titulo: "Recepción: " + receiving.nombre,
                  nota: note,
                  fecha: date,
                  tipo: "entrega_material" as const,
                  material_id: receiving.id,
                  cantidad_recibida: Number(amount),
                };
                if (operation.current)
                  dataService.updateBitacoraEntrada(operation.current, fields);
                else
                  operation.current =
                    dataService.createBitacoraEntrada(fields).id;
                await dataService.confirmarCambios();
                onChanged();
                setReceiving(null);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Recepción pendiente de guardar.",
                );
                onChanged();
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold">Recibir material</h2>
              <button
                type="button"
                disabled={busy}
                aria-label="Cerrar recepción"
                onClick={() => setReceiving(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="break-words text-sm">{receiving.nombre}</p>
            <label className="block text-sm font-semibold">
              Cantidad que llegó ({receiving.unidad})
              <input
                aria-label="Cantidad recibida"
                type="number"
                min="0.000001"
                step="any"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={`${crewInput} mt-1`}
              />
            </label>
            <label className="block text-sm font-semibold">
              Fecha de entrega
              <input
                type="date"
                required
                max={chileToday()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={`${crewInput} mt-1`}
              />
            </label>
            <label className="block text-sm font-semibold">
              Observación o número de guía
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={`${crewInput} mt-1`}
                rows={2}
              />
            </label>
            <p className="text-xs text-gray-500">
              La recepción queda en Bitácora. No cambia el estado de pago.
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className={`${crewPrimary} w-full`}
            >
              {busy ? "Guardando…" : "Confirmar recepción"}
            </button>
          </form>
        </ModalOverlay>
      )}
    </>
  );
}
