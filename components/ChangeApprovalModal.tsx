"use client";
import { useState } from "react";
import { X } from "lucide-react";
import ModalOverlay from "@/components/ModalOverlay";
import { crewPrimary, crewSecondary } from "@/components/CrewAttendanceEditor";
import { dataService } from "@/lib/data-service";
import { addWorkingDays } from "@/lib/work-calendar";
import { formatCLP, formatDate } from "@/lib/utils";
import type { Proyecto, ReclamoCambioObra } from "@/types/database";
export default function ChangeApprovalModal({
  item,
  project,
  onClose,
  onSaved,
}: {
  item: ReclamoCambioObra;
  project: Proyecto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [respaldo, setRespaldo] = useState("");
  const [budget, setBudget] = useState(false);
  const [dates, setDates] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const additional = item.tipo === "solicitud_cambio";
  const next = dates
    ? addWorkingDays(
        project.fecha_termino_estimada,
        item.impacto_dias,
        project.dias_laborales,
        project.fechas_no_laborales,
      )
    : project.fecha_termino_estimada;
  const tasks = dataService
    .getActividades(project.id)
    .filter((row) => row.estado !== "terminada");
  return (
    <ModalOverlay
      aria-label="Revisar resolución"
      onClose={() => {
        if (!busy) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
    >
      <form
        className="w-full max-w-lg space-y-5 rounded-2xl bg-[#FAF8F5] p-5 dark:bg-[#0B0F14]"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await dataService.gestionarObra(
              project.id,
              `cambios/${encodeURIComponent(item.id)}/aprobar`,
              {
                ajustar_presupuesto: additional && budget,
                ajustar_plazo: additional && dates,
                reprogramar: additional && dates && schedule,
                respaldo_mandante: respaldo,
              },
            );
            onSaved();
            onClose();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "No se pudo confirmar la resolución.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">
              {additional ? "Aprobar adicional" : "Resolver incidencia"}
            </h2>
            <p className="mt-1 break-words text-sm text-gray-500">
              {item.titulo}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar resolución"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {additional ? (
          <div className="space-y-3 text-sm">
            {item.impacto_monto > 0 && (
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={budget}
                  onChange={(event) => setBudget(event.target.checked)}
                  className="mt-1 accent-[#FF6A00]"
                />
                <span>
                  Cobrar al mandante el adicional aprobado de{" "}
                  <strong>{formatCLP(item.impacto_monto)}</strong>
                </span>
              </label>
            )}
            {item.impacto_dias > 0 && (
              <>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={dates}
                    onChange={(event) => setDates(event.target.checked)}
                    className="mt-1 accent-[#FF6A00]"
                  />
                  <span>
                    Ampliar el plazo en {item.impacto_dias} días de trabajo
                    según el calendario de la obra.
                  </span>
                </label>
                {dates && (
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={schedule}
                      onChange={(event) => setSchedule(event.target.checked)}
                      className="mt-1 accent-[#FF6A00]"
                    />
                    <span>
                      Reprogramar {tasks.length} partidas sin terminar. Las
                      partidas terminadas conservan sus fechas.
                    </span>
                  </label>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-kraft-100 p-3 text-sm dark:bg-gray-900">
            Los materiales y el costo interno quedarán registrados en Finanzas.
            Resolver esta incidencia no aumenta el contrato ni el saldo por
            cobrar.
          </p>
        )}
        <div className="space-y-2 rounded-xl border border-kraft-200 p-3 text-sm dark:border-gray-700">
          <p>
            Contrato resultante:{" "}
            <strong>
              {formatCLP(
                project.monto_cotizado +
                  (budget && additional ? item.impacto_monto : 0),
              )}
            </strong>
          </p>
          <p>
            Entrega: <strong>{formatDate(next)}</strong>
          </p>
          <p>
            {item.materiales_requeridos.length} materiales por incorporar a la
            obra.
          </p>
        </div>
        {additional && (budget || dates) && (
          <label className="block text-sm font-semibold">
            Respaldo de aprobación del mandante
            <textarea
              required
              minLength={3}
              maxLength={2000}
              value={respaldo}
              disabled={busy}
              onChange={(e) => setRespaldo(e.target.value)}
              placeholder="Nombre de quien aprobó, fecha y referencia a correo, WhatsApp o documento"
              className="mt-1 w-full rounded-xl border border-kraft-200 bg-white p-3 text-sm dark:bg-gray-900"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={crewSecondary}
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button type="submit" className={crewPrimary} disabled={busy}>
            {busy ? "Guardando…" : "Confirmar resolución"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
