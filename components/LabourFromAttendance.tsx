"use client";
import { useState, useRef } from "react";
import { dataService } from "@/lib/data-service";
import { labourAmount } from "@/lib/construction-workflow";
import { chileToday } from "@/lib/work-calendar";
import { formatThousands, parseThousands, formatCLP } from "@/lib/utils";
import { crewInput, crewPrimary } from "./CrewAttendanceEditor";
import type { AsistenciaObrero } from "@/types/database";
export default function LabourFromAttendance({
  projectId,
  onChanged,
}: {
  projectId: string;
  onChanged: () => void;
}) {
  const [date, setDate] = useState(chileToday()),
    [selected, setSelected] = useState(""),
    [rate, setRate] = useState(""),
    [portion, setPortion] = useState(1),
    [extra, setExtra] = useState("0"),
    [hourly, setHourly] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const operation = useRef("");
  const expenses = dataService.getImprevistos(projectId);
  const attendance = dataService
    .getAsistencias(projectId, date)
    .filter((row) => ["presente", "atraso"].includes(row.estado));
  const candidates = attendance.filter(
    (row) => !expenses.some((cost) => cost.asistencia_id === row.id),
  );
  const record = candidates.find((row) => row.id === selected);
  const changed = expenses
    .filter((row) => row.jornal_resumen)
    .filter((row) => {
      const current = dataService
        .getAsistencias(projectId)
        .find((item) => item.id === row.asistencia_id);
      return (
        !current ||
        current.estado !== row.jornal_resumen!.asistencia_estado ||
        Number(current.horas_trabajadas || 0) !==
          row.jornal_resumen!.asistencia_horas
      );
    });
  let amount = 0;
  try {
    if (record)
      amount = labourAmount(
        record,
        parseThousands(rate),
        portion,
        Number(extra),
        parseThousands(hourly),
      );
  } catch {
    /* El formulario explica errores al confirmar. */
  }
  return (
    <details className="min-w-0 rounded-2xl border border-kraft-200 bg-white p-4 dark:border-gray-700 dark:bg-[#141A23]">
      <summary className="cursor-pointer text-sm font-bold">
        Jornales desde asistencia
      </summary>
      <p className="mt-3 text-sm text-gray-500">
        Selecciona una asistencia confirmada por jefatura. Revisa jornada y
        tarifa; no se descuentan atrasos ni se calculan recargos legales
        automáticamente.
      </p>
      {changed.length > 0 && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
        >
          {changed.length} jornales requieren revisión porque cambió o se
          eliminó la asistencia de origen. El costo registrado se conserva.
        </p>
      )}
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (!record)
              throw new Error(
                "Selecciona una asistencia sin jornal registrado.",
              );
            labourAmount(
              record,
              parseThousands(rate),
              portion,
              Number(extra),
              parseThousands(hourly),
            );
            operation.current ||= "jornal-" + crypto.randomUUID();
            await dataService.gestionarObra(projectId, "gestion", {
              operacion: "jornal",
              id: operation.current,
              asistencia_id: record.id,
              valor_diario: parseThousands(rate),
              jornada: portion,
              horas_extra: Number(extra),
              valor_hora_extra: parseThousands(hourly),
            });
            operation.current = "";
            setSelected("");
            onChanged();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "No se pudo guardar el jornal.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm font-semibold">
          Fecha
          <input
            type="date"
            value={date}
            max={chileToday()}
            disabled={busy}
            onChange={(e) => {
              setDate(e.target.value);
              setSelected("");
              operation.current = "";
            }}
            className={`${crewInput} mt-1`}
          />
        </label>
        <label className="block text-sm font-semibold">
          Asistencia
          <select
            required
            disabled={busy}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              const hours = Number(
                candidates.find((row) => row.id === e.target.value)
                  ?.horas_trabajadas || 0,
              );
              setPortion(hours > 0 && hours <= 4 ? 0.5 : 1);
              operation.current = "";
            }}
            className={`${crewInput} mt-1`}
          >
            <option value="">Seleccionar trabajador</option>
            {candidates.map((row) => (
              <option key={row.id} value={row.id}>
                {row.trabajador_nombre} · {Number(row.horas_trabajadas || 0)} h
                registradas
              </option>
            ))}
          </select>
        </label>
        {!candidates.length && (
          <p className="text-sm text-gray-500">
            No hay asistencias presentes o con atraso sin jornal para esta
            fecha.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Valor del jornal diario
            <input
              inputMode="numeric"
              required
              disabled={busy}
              value={rate}
              onChange={(e) => setRate(formatThousands(e.target.value))}
              className={`${crewInput} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Jornada a pagar
            <select
              disabled={busy}
              value={portion}
              onChange={(e) => setPortion(Number(e.target.value))}
              className={`${crewInput} mt-1`}
            >
              <option value={1}>Día completo</option>
              <option value={0.5}>Medio día</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Horas extra autorizadas
            <input
              type="number"
              min={0}
              max={12}
              step={0.25}
              value={extra}
              disabled={busy}
              onChange={(e) => setExtra(e.target.value)}
              className={`${crewInput} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Valor acordado por hora extra
            <input
              inputMode="numeric"
              required={Number(extra) > 0}
              value={hourly}
              disabled={busy}
              onChange={(e) => setHourly(formatThousands(e.target.value))}
              className={`${crewInput} mt-1`}
            />
          </label>
        </div>
        <p className="text-sm">
          Costo propuesto: <strong>{formatCLP(amount)}</strong> · queda por
          pagar.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !candidates.length}
          className={crewPrimary}
        >
          {busy ? "Guardando…" : "Registrar jornal por pagar"}
        </button>
      </form>
    </details>
  );
}
