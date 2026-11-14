"use client";

import { useState } from "react";
import { X } from "lucide-react";
import ModalOverlay from "@/components/ModalOverlay";
import { attendanceDuration } from "@/lib/crew";
import type { AsistenciaObrero, EstadoAsistencia } from "@/types/database";

export const attendanceLabels: Record<EstadoAsistencia, string> = {
  presente: "Presente",
  atraso: "Atraso",
  ausente: "Ausente",
  licencia: "Licencia",
  permiso: "Permiso",
};
export const crewInput =
  "w-full min-w-0 rounded-xl border border-kraft-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-[#141A23]";
export const crewPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50";
export const crewSecondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-kraft-200 px-4 py-2.5 text-sm font-semibold dark:border-gray-700 disabled:opacity-50";

export default function CrewAttendanceEditor({
  name,
  date,
  record,
  initialStatus,
  bulk = false,
  onClose,
  onSave,
}: {
  name: string;
  date: string;
  record?: AsistenciaObrero;
  initialStatus?: EstadoAsistencia;
  bulk?: boolean;
  onClose: () => void;
  onSave: (
    fields: Pick<
      AsistenciaObrero,
      | "estado"
      | "hora_entrada"
      | "hora_salida"
      | "horas_trabajadas"
      | "observacion"
    >,
  ) => Promise<void>;
}) {
  const [status, setStatus] = useState<EstadoAsistencia>(
    initialStatus || record?.estado || "presente",
  );
  const [start, setStart] = useState(record?.hora_entrada?.slice(0, 5) || "");
  const [end, setEnd] = useState(record?.hora_salida?.slice(0, 5) || "");
  const [breakMinutes, setBreakMinutes] = useState(() => {
    if (
      !record?.hora_entrada ||
      !record.hora_salida ||
      record.horas_trabajadas === undefined
    )
      return 0;
    try {
      return Math.max(
        0,
        Math.round(
          (attendanceDuration(
            record.hora_entrada.slice(0, 5),
            record.hora_salida.slice(0, 5),
          ) -
            record.horas_trabajadas) *
            60,
        ),
      );
    } catch {
      return 0;
    }
  });
  const [note, setNote] = useState(record?.observacion || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = status === "presente" || status === "atraso";
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <ModalOverlay
      onClose={close}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <form
        className="w-full max-w-lg space-y-5 rounded-2xl bg-[#FAF8F5] p-5 text-navy-900 shadow-xl dark:bg-[#0B0F14] dark:text-white"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            if (working && end && !start)
              throw new Error(
                "Indica la entrada antes de registrar la salida.",
              );
            const hours = working
              ? attendanceDuration(start, end, breakMinutes)
              : 0;
            if (working && breakMinutes && (!start || !end))
              throw new Error(
                "Completa entrada y salida para descontar la colación.",
              );
            setBusy(true);
            await onSave({
              estado: status,
              hora_entrada: working ? start : "",
              hora_salida: working ? end : "",
              horas_trabajadas: hours,
              observacion: note.trim(),
            });
            onClose();
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "No se pudo guardar la asistencia.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">
              {bulk ? "Marcar cuadrilla" : "Registrar asistencia"}
            </h2>
            <p className="mt-1 break-words text-sm text-gray-500">
              {name} · {date.split("-").reverse().join("/")}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar ventana"
            onClick={close}
            disabled={busy}
            className="rounded-lg p-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {bulk ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Solo se marcarán presentes las personas sin registro para esta
            fecha. Se conservan licencias, permisos y registros existentes.
          </p>
        ) : (
          <label className="block text-sm font-semibold">
            Estado
            <select
              aria-label="Estado"
              className={`${crewInput} mt-1`}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as EstadoAsistencia)
              }
            >
              {Object.entries(attendanceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {working && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="min-w-0 text-sm font-semibold">
                Entrada
                <input
                  aria-label={bulk ? "Entrada de cuadrilla" : "Entrada"}
                  className={`${crewInput} mt-1`}
                  type="time"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label className="min-w-0 text-sm font-semibold">
                Salida
                <input
                  aria-label={bulk ? "Salida de cuadrilla" : "Salida"}
                  className={`${crewInput} mt-1`}
                  type="time"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Colación (minutos)
              <input
                className={`${crewInput} mt-1`}
                type="number"
                min="0"
                max="1440"
                step="1"
                value={breakMinutes}
                onChange={(event) =>
                  setBreakMinutes(Number(event.target.value))
                }
              />
            </label>
            <p className="text-xs text-gray-500">
              Horarios opcionales. Las horas se calculan cuando confirmas
              entrada y salida, descontando la colación indicada.
            </p>
          </div>
        )}
        <label className="block text-sm font-semibold">
          Observación (opcional)
          <textarea
            className={`${crewInput} mt-1`}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={crewSecondary}
            onClick={close}
            disabled={busy}
          >
            Cancelar
          </button>
          <button type="submit" className={crewPrimary} disabled={busy}>
            {busy
              ? "Guardando…"
              : bulk
                ? "Confirmar presencia"
                : "Guardar asistencia"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
