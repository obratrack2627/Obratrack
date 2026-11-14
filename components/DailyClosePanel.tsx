"use client";
import { useState, useRef, type ReactNode } from "react";
import {
  ClipboardCheck,
  Download,
  X,
  Users,
  Clock3,
  TrendingUp,
  Wallet,
  CalendarDays,
  Camera,
  Package,
  ListChecks,
  CheckCircle2,
} from "lucide-react";
import { createDailyClosePDF, dailyCloseFilename } from "@/lib/daily-close-pdf";
import ModalOverlay from "@/components/ModalOverlay";
import { dataService } from "@/lib/data-service";
import { dailySummary, type DailyClose } from "@/lib/daily-close";
import { chileToday } from "@/lib/work-calendar";
import { formatCLP, formatDate } from "@/lib/utils";
import type { Proyecto } from "@/types/database";
import {
  crewInput,
  crewPrimary,
  crewSecondary,
} from "@/components/CrewAttendanceEditor";
export function DailyCloseSummary({ summary }: { summary: DailyClose }) {
  const section = (
    title: string,
    Icon: typeof Users,
    rows: ReactNode[],
  ) => (
    <section className="min-w-0 rounded-xl border border-kraft-200 bg-white p-4 dark:border-[#263040] dark:bg-[#141A23]">
      <h4 className="flex items-center gap-2 text-sm font-bold">
        <Icon size={17} className="shrink-0 text-[#FF6A00]" />
        {title}
        <span className="ml-auto rounded-md bg-kraft-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">
          {rows.length}
        </span>
      </h4>
      {rows.length ? (
        <ul className="mt-3 divide-y divide-kraft-100 dark:divide-[#263040]">
          {rows.map((row, index) => (
            <li
              key={index}
              className="break-words py-2.5 text-sm first:pt-0 last:pb-0"
            >
              {row}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-gray-500">
          Sin registros para esta jornada.
        </p>
      )}
    </section>
  );
  return (
    <div
      className="min-w-0 space-y-4"
      aria-label="Resumen del cierre de jornada"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[#141A23] p-4 text-white">
        <div className="min-w-0">
          <p className="text-xs text-orange-300">CIERRE DE JORNADA</p>
          <h3 className="mt-1 break-words text-lg font-bold">
            {summary.proyecto_nombre}
          </h3>
          <p className="mt-2 flex items-center gap-2 text-xs text-gray-300">
            <CalendarDays size={14} />
            {formatDate(summary.fecha)}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${summary.confirmado_por ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-gray-200"}`}
        >
          {summary.confirmado_por
            ? `Confirmado · revisión ${summary.version}`
            : "Vista previa"}
        </span>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Presentes", value: summary.presentes, Icon: Users },
          { label: "Horas-hombre", value: summary.horas, Icon: Clock3 },
          {
            label: "Ingresos",
            value: formatCLP(summary.ingresos),
            Icon: TrendingUp,
          },
          {
            label: "Gastos del día",
            value: formatCLP(summary.gastos),
            Icon: Wallet,
          },
        ].map(({ label, value, Icon }) => (
          <div
            key={label}
            className="min-w-0 rounded-xl border border-kraft-200 bg-white p-3 dark:border-[#263040] dark:bg-[#141A23]"
          >
            <Icon size={17} className="mb-2 text-[#FF6A00]" />
            <p className="text-xs text-gray-500">{label}</p>
            <strong className="mt-1 block break-words text-base">
              {value}
            </strong>
          </div>
        ))}
      </div>
      {section(
        "Asistencia confirmada",
        Users,
        summary.personas.map((row) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{row.nombre}</span>
            <span className="rounded-md bg-kraft-50 px-2 py-1 text-xs capitalize text-gray-500 dark:bg-gray-900">
              {row.estado} · {row.horas} h
            </span>
          </div>
        )),
      )}
      {section(
        "Avances y evidencias",
        Camera,
        summary.avances.map((row) => (
          <div>
            <p className="font-semibold">{row.titulo}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {row.nota}
            </p>
            {row.foto_url && (
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-[#6B8F72]">
                <Camera size={13} />
                Fotografía en bitácora
              </span>
            )}
          </div>
        )),
      )}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {section(
          "Materiales recibidos",
          Package,
          summary.recepciones.map((row) => (
            <span>
              {row.material}
              <strong className="ml-2">
                {row.cantidad} {row.unidad}
              </strong>
            </span>
          )),
        )}
        {section("Pendientes e incidentes", ListChecks, summary.pendientes)}
      </div>
      {section("Próxima jornada", CalendarDays, summary.tareas_manana)}
      {summary.nota && (
        <section className="rounded-xl bg-orange-50 p-4 dark:bg-orange-950/20">
          <h4 className="text-sm font-bold">Observación de jefatura</h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">
            {summary.nota}
          </p>
        </section>
      )}
      {summary.confirmado_por && (
        <p className="flex items-start gap-2 text-xs text-gray-500">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          Confirmado por {summary.confirmado_por} · revisión {summary.version}
        </p>
      )}
    </div>
  );
}
export async function downloadDailyClose(summary: DailyClose) {
  const pdf = await createDailyClosePDF(summary);
  pdf.save(dailyCloseFilename(summary));
}
export default function DailyClosePanel({ proyecto }: { proyecto: Proyecto }) {
  const [date, setDate] = useState(chileToday());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<DailyClose | null>(null);
  const id = useRef("");
  const report = useRef<HTMLDivElement>(null);
  const summary =
    saved ||
    dailySummary(
      proyecto,
      date,
      dataService.getUsuarios(),
      dataService.getAsistencias(proyecto.id),
      dataService.getBitacora(proyecto.id),
      dataService.getMaterialesProyecto(proyecto.id),
      dataService.getImprevistos(proyecto.id),
      dataService.getPagos(proyecto.id),
      dataService.getReclamosCambios(proyecto.id),
      dataService.getActividades(proyecto.id),
    );
  const previous = dataService
    .getDocumentosObra(proyecto.id)
    .filter(
      (row) =>
        row.categoria === "cierre_diario" && row.fecha_documento === date,
    );
  return (
    <section className="rounded-2xl border border-kraft-200 bg-white p-5 dark:border-gray-700 dark:bg-[#141A23]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <ClipboardCheck className="h-5 w-5 text-[#FF6A00]" />
            Cierre de jornada
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Revisa asistencia, avances, entregas y pendientes antes de
            confirmar.
          </p>
        </div>
        <button
          type="button"
          className={crewSecondary}
          onClick={() => {
            setSaved(null);
            setError("");
            setNote("");
            id.current = "cierre-" + crypto.randomUUID();
            setOpen(true);
          }}
        >
          Revisar jornada
        </button>
      </div>
      <label className="mt-4 inline-flex max-w-full items-center gap-2 text-sm">
        Fecha
        <input
          aria-label="Fecha del cierre"
          type="date"
          max={chileToday()}
          value={date}
          onChange={(event) => {
            if (event.target.value) {
              setDate(event.target.value);
              setSaved(null);
            }
          }}
          className="min-w-0 rounded-lg border border-kraft-200 bg-transparent p-2"
        />
      </label>
      {previous.length > 0 && (
        <p className="mt-2 text-xs text-green-700 dark:text-green-300">
          {previous.length}{" "}
          {previous.length === 1
            ? "cierre confirmado"
            : "revisiones confirmadas"}{" "}
          para esta fecha. Disponibles en Documentos.
        </p>
      )}
      {previous.some((row) => row.cierre_resumen) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={crewSecondary}
            onClick={() => {
              const last = previous
                .filter((row) => row.cierre_resumen)
                .sort(
                  (a, b) =>
                    (b.cierre_resumen?.version || 0) -
                    (a.cierre_resumen?.version || 0),
                )[0];
              setSaved(last.cierre_resumen!);
              setError("");
              setOpen(true);
            }}
          >
            Ver último cierre
          </button>
          <button
            type="button"
            className={crewPrimary}
            onClick={() => {
              const last = previous
                .filter((row) => row.cierre_resumen)
                .sort(
                  (a, b) =>
                    (b.cierre_resumen?.version || 0) -
                    (a.cierre_resumen?.version || 0),
                )[0];
              void downloadDailyClose(last.cierre_resumen!).catch(() =>
                setError("No se pudo descargar el resumen."),
              );
            }}
          >
            <Download size={16} />
            Descargar último PDF
          </button>
        </div>
      )}
      {error && !open && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {open && (
        <ModalOverlay
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          aria-label="Cierre de jornada"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        >
          <div
            ref={report}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl space-y-5 overflow-y-auto rounded-2xl bg-[#FAF8F5] p-4 sm:p-6 dark:bg-[#0B0F14]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">
                  Jornada del {formatDate(date)}
                </h2>
                <p className="text-sm text-gray-500">
                  {saved
                    ? "Cierre guardado en Documentos."
                    : "Vista previa; se confirmará con los datos guardados de la obra."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Cerrar jornada"
              >
                <X size={20} />
              </button>
            </div>
            <DailyCloseSummary summary={summary} />
            {!saved && (
              <label className="block text-sm font-semibold">
                Observación de jefatura (opcional)
                <textarea
                  className={`${crewInput} mt-1`}
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="sticky -bottom-4 sm:-bottom-6 flex flex-wrap justify-end gap-2 border-t border-kraft-200 bg-[#FAF8F5] py-4 dark:border-[#263040] dark:bg-[#0B0F14]">
              <button
                type="button"
                className={crewSecondary}
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cerrar
              </button>
              {saved ? (
                <button
                  type="button"
                  className={crewPrimary}
                  onClick={() =>
                    void downloadDailyClose(saved).catch(() =>
                      setError("No se pudo descargar el resumen."),
                    )
                  }
                >
                  <Download size={16} />
                  Descargar PDF
                </button>
              ) : (
                <button
                  type="button"
                  className={crewPrimary}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const result = await dataService.gestionarObra(
                        proyecto.id,
                        "cierre",
                        { id: id.current, fecha: date, nota: note },
                      );
                      setSaved(result.documento.cierre_resumen);
                      report.current?.scrollTo({ top: 0, behavior: "instant" });
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "No se pudo confirmar la jornada.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Guardando…" : "Confirmar cierre"}
                </button>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}
    </section>
  );
}
