"use client";
import { formatThousands, parseThousands } from '@/lib/utils';
import { useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Actividad, Usuario } from "@/types/database";
import { activityDates, progressValue } from "@/lib/gantt/timeline";
import ModalOverlay from "./ModalOverlay";

export default function ActivityEditor({
  activity,
  usuarios,
  assignedWorkerIds,
  onSave,
  onClose,
  onDelete,
}: {
  activity: Actividad;
  usuarios: Usuario[];
  assignedWorkerIds?: string[];
  onSave: (id: string, updates: Partial<Actividad>) => void;
  onClose: () => void;
  onDelete?: (activity: Actividad) => void;
}) {
  const [draft, setDraft] = useState({ ...activity });
  const [error, setError] = useState("");
  const field =
    "block w-full min-w-0 max-w-full rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] px-3 py-2.5 text-base text-navy-900 dark:text-gray-100 focus:border-obra-orange focus:outline-none";
  const assigned = usuarios.filter(
    (user) => !assignedWorkerIds?.length || assignedWorkerIds.includes(user.id),
  );
  const others = usuarios.filter(
    (user) =>
      !!assignedWorkerIds?.length && !assignedWorkerIds.includes(user.id),
  );
  const option = (user: Usuario) => (
    <option key={user.id} value={user.id}>
      {user.nombre} (
      {user.rol === "admin"
        ? "Administrador"
        : user.rol === "supervisor"
          ? "Supervisor"
          : "Terreno"}
      )
    </option>
  );
  const progress = (value: number) => {
    const next = progressValue(value);
    setDraft({
      ...draft,
      porcentaje_avance: next,
      estado: next === 100 ? "terminada" : next > 0 ? "en_curso" : "pendiente",
    });
  };
  return (
    <ModalOverlay
      onClose={onClose}
      aria-label="Editar Partida de Faena"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          if (!draft.nombre.trim()) {
            setError("Escribe el nombre de la partida.");
            return;
          }
          if (!activityDates(draft)) {
            setError(
              "La fecha de término debe ser igual o posterior al inicio.",
            );
            return;
          }
          if (draft.estado === "en_curso" && draft.porcentaje_avance === 100) {
            setError(
              "Ajusta el avance a menos de 100% para dejar la partida en curso.",
            );
            return;
          }
          try {
            onSave(draft.id, {
              nombre: draft.nombre.trim(),
              monto_contratado: draft.monto_contratado || null,
              fecha_inicio: draft.fecha_inicio,
              fecha_termino: draft.fecha_termino,
              responsable_id: draft.responsable_id || undefined,
              estado: draft.estado,
              porcentaje_avance: draft.porcentaje_avance,
            });
            onClose();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "No se pudo actualizar la partida.",
            );
          }
        }}
        className="w-full max-w-lg min-w-0 max-h-[calc(var(--modal-viewport-height,100dvh)-2rem)] overflow-y-auto space-y-4 rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-5 sm:p-6 shadow-xl"
      >
        <header className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Editar partida</h3>
            <p className="text-xs text-gray-500 mt-1">
              Planificación y avance de terreno
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar editor de partida"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500"
          >
            <X size={20} />
          </button>
        </header>
        <label className="block space-y-1.5 text-xs font-semibold text-gray-500">
          Nombre de la actividad
          <input
            className={field}
            required
            value={draft.nombre}
            onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
          />
        </label>
        <label className="block space-y-1.5 text-xs font-semibold text-gray-500">Monto contratado de esta partida (opcional)
          <input className={field} inputMode="numeric" placeholder="Sin ponderación" value={draft.monto_contratado ? formatThousands(draft.monto_contratado) : ''} onChange={event=>setDraft({...draft,monto_contratado:parseThousands(event.target.value)||null})}/>
          <span className="block font-normal">Completa los montos de todas las partidas para ponderar el avance y el estado de pago.</span>
        </label>
        <div className="space-y-2 rounded-xl border border-kraft-200 dark:border-[#263040] p-3">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="activity-progress"
              className="text-sm font-semibold"
            >
              Avance
            </label>
            <label className="flex items-center gap-1">
              <input
                aria-label="Avance de la partida (%)"
                type="number"
                min={0}
                max={100}
                required
                value={draft.porcentaje_avance}
                onChange={(e) => progress(Number(e.target.value))}
                className="w-20 min-h-10 rounded-lg border border-kraft-200 dark:border-[#263040] bg-transparent px-2 text-right text-base font-bold"
              />
              <span>%</span>
            </label>
          </div>
          <input
            id="activity-progress"
            type="range"
            min={0}
            max={100}
            step={5}
            value={draft.porcentaje_avance}
            onChange={(e) => progress(Number(e.target.value))}
            className="w-full accent-obra-orange"
          />
        </div>
        <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block min-w-0 space-y-1.5 text-xs font-semibold text-gray-500">
            Estado
            <select
              className={field}
              value={draft.estado}
              onChange={(e) => {
                const estado = e.target.value as Actividad["estado"];
                setDraft({
                  ...draft,
                  estado,
                  porcentaje_avance:
                    estado === "terminada"
                      ? 100
                      : estado === "pendiente"
                        ? 0
                        : draft.porcentaje_avance,
                });
              }}
            >
              <option value="pendiente">Pendiente</option>
              <option value="en_curso">En curso</option>
              <option value="terminada">Terminada</option>
            </select>
          </label>
          <label className="block min-w-0 space-y-1.5 text-xs font-semibold text-gray-500">
            Responsable
            <select
              className={field}
              value={draft.responsable_id || ""}
              onChange={(e) =>
                setDraft({ ...draft, responsable_id: e.target.value })
              }
            >
              <option value="">Sin asignar</option>
              {assigned.map(option)}
              {others.length > 0 && (
                <optgroup label="Otros integrantes">
                  {others.map(option)}
                </optgroup>
              )}
            </select>
          </label>
        </div>
        <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block min-w-0 space-y-1.5 text-xs font-semibold text-gray-500">
            Fecha de inicio
            <input
              className={field}
              type="date"
              required
              value={draft.fecha_inicio}
              onChange={(e) =>
                setDraft({ ...draft, fecha_inicio: e.target.value })
              }
            />
          </label>
          <label className="block min-w-0 space-y-1.5 text-xs font-semibold text-gray-500">
            Fecha de término
            <input
              className={field}
              type="date"
              required
              min={draft.fecha_inicio}
              value={draft.fecha_termino}
              onChange={(e) =>
                setDraft({ ...draft, fecha_termino: e.target.value })
              }
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <footer className="flex flex-wrap justify-between gap-2 border-t border-kraft-200 dark:border-[#263040] pt-4">
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(activity)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-red-600"
            >
              <Trash2 size={15} />
              Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl px-3 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-obra-orange px-4 text-sm font-semibold text-white"
            >
              Guardar cambios
            </button>
          </div>
        </footer>
      </form>
    </ModalOverlay>
  );
}
