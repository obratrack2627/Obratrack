"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Plus,
  X,
  Search,
  Download,
  UserMinus,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleX,
  Clock3,
  CalendarDays,
  History,
  Lightbulb,
  ChartNoAxesColumnIncreasing,
  FileText,
} from "lucide-react";
import ProjectTabsHeader from "@/components/ProjectTabsHeader";
import GoogleMapsProjectViewer from "@/components/GoogleMapsProjectViewer";
import ModalOverlay from "@/components/ModalOverlay";
import CrewAttendanceEditor, {
  attendanceLabels,
  crewInput,
  crewPrimary,
  crewSecondary,
} from "@/components/CrewAttendanceEditor";
import { dataService } from "@/lib/data-service";
import {
  assignedCrew,
  crewAttendance,
  crewSuggestions,
  crewText,
} from "@/lib/crew";
import { chileToday } from "@/lib/ai/project-deadlines";
import { formatDate } from "@/lib/utils";
import type {
  Proyecto,
  Usuario,
  AsistenciaObrero,
  EstadoAsistencia,
} from "@/types/database";

type View = "crew" | "daily" | "history";
type Editor = {
  name: string;
  user?: Usuario;
  record?: AsistenciaObrero;
  bulk?: boolean;
  date: string;
  initialStatus?: EstadoAsistencia;
};
const panel =
  "rounded-2xl border border-kraft-200 bg-white shadow-[0_4px_18px_rgba(30,30,30,0.035)] dark:border-[#263040] dark:bg-[#141A23]";
const statusStyle: Record<string, string> = {
  presente:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  atraso:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  ausente: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  licencia: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  permiso:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};
function Status({ record }: { record?: AsistenciaObrero }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${record ? statusStyle[record.estado] : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
    >
      {!record ? (
        <Clock3 size={14} />
      ) : record.estado === "ausente" ? (
        <CircleX size={14} />
      ) : ["presente", "atraso"].includes(record.estado) ? (
        <CheckCircle2 size={14} />
      ) : (
        <FileText size={14} />
      )}
      {record ? attendanceLabels[record.estado] : "Sin registro"}
    </span>
  );
}

export default function ProjectCrewPage() {
  const params = useParams();
  const projectId = params?.id as string;
  const [project, setProject] = useState<Proyecto | null>(null);
  const [users, setUsers] = useState<Usuario[]>([]);
  const [records, setRecords] = useState<AsistenciaObrero[]>([]);
  const [revision, setRevision] = useState(0);
  const [date, setDate] = useState(chileToday());
  const [view, setView] = useState<View>("crew");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [historyDate, setHistoryDate] = useState("");
  const [maps, setMaps] = useState(false);
  const [notice, setNotice] = useState("");
  const attempted = useRef<{
    editor: Editor;
    rows: { user?: Usuario; record?: AsistenciaObrero; name: string }[];
  } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [remove, setRemove] = useState<Usuario | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    setProject(dataService.getProyectoById(projectId) || null);
    setUsers(dataService.getUsuarios());
    setRecords(dataService.getAsistencias(projectId));
    setRevision((value) => value + 1);
  }, [projectId]);
  useEffect(() => {
    refresh();
    window.addEventListener("obratrack_cloud_synced", refresh);
    return () => window.removeEventListener("obratrack_cloud_synced", refresh);
  }, [refresh]);
  if (!project) return <div className="p-6">Cargando cuadrilla…</div>;
  const crew = assignedCrew(project, users);
  const daily = records.filter((row) => row.fecha === date);
  const attendance = (user: Usuario) => crewAttendance(user, daily, users);
  const present = crew.filter((user) =>
    ["presente", "atraso"].includes(attendance(user)?.estado || ""),
  ).length;
  const pending = crew.filter((user) => !attendance(user)).length;
  const absent = crew.filter(
    (user) => attendance(user)?.estado === "ausente",
  ).length;
  const query = crewText(search);
  const matches = (user: Usuario) =>
    crewText(
      [user.nombre, user.rol, ...(user.especialidades || [])].join(" "),
    ).includes(query);
  const visibleCrew = crew.filter(
    (user) =>
      matches(user) &&
      (filter === "all" || (attendance(user)?.estado || "none") === filter),
  );
  const candidates = users.filter(
    (user) =>
      user.empresa_id === project.empresa_id &&
      ["terreno", "supervisor"].includes(user.rol) &&
      !crew.some((member) => member.id === user.id),
  );
  // Se recalcula con el mismo snapshot que la cuadrilla después de cada sincronización.
  const suggestions = crewSuggestions(
    project,
    users,
    dataService.getProyectos(),
    dataService.getActividades(projectId),
    dataService.getAsistencias(),
    date,
  );
  const history = records
    .filter(
      (row) =>
        (!historyDate || row.fecha === historyDate) &&
        (filter === "all" || row.estado === filter) &&
        crewText(
          [
            row.trabajador_nombre,
            row.trabajador_rol || "",
            row.observacion || "",
            ...(users.find((user) => user.id === row.usuario_id)
              ?.especialidades || []),
          ].join(" "),
        ).includes(query),
    )
    .sort(
      (a, b) =>
        b.fecha.localeCompare(a.fecha) ||
        a.trabajador_nombre.localeCompare(b.trabajador_nombre, "es"),
    );
  const role = (user: Usuario) =>
    user.rol === "supervisor"
      ? "Supervisor"
      : user.rol === "admin"
        ? "Jefe de obra"
        : "Terreno";
  const openAssign = (userId?: string) => {
    setSelected(userId ? [userId] : []);
    setAssignSearch("");
    setError("");
    setAssignOpen(true);
  };
  const saveAttendance = async (
    fields: Parameters<
      ComponentProps<typeof CrewAttendanceEditor>["onSave"]
    >[0],
  ) => {
    if (!editor) return;
    const existing = dataService.getAsistencias(projectId, editor.date);
    const targets =
      attempted.current?.editor === editor
        ? attempted.current.rows
        : editor.bulk
          ? crew
              .filter((user) => !crewAttendance(user, existing, users))
              .map((user) => ({
                user,
                record: undefined as AsistenciaObrero | undefined,
                name: user.nombre,
              }))
          : [{ user: editor.user, record: editor.record, name: editor.name }];
    attempted.current = { editor, rows: targets };
    if (!targets.length)
      throw new Error(
        "Todas las personas de la cuadrilla ya tienen registro para esta fecha.",
      );
    targets.forEach((target) =>
      dataService.upsertAsistenciaObrero({
        ...target.record,
        ...fields,
        proyecto_id: projectId,
        fecha: editor.date,
        usuario_id: target.user?.id || target.record?.usuario_id,
        trabajador_nombre: target.name,
        trabajador_rol:
          target.user?.rol || target.record?.trabajador_rol || "terreno",
        origen: target.record?.origen || "web",
      }),
    );
    refresh();
    const result = await dataService.pushToCloudServer();
    if (!result.success)
      throw new Error(
        "El registro está pendiente de sincronización en este dispositivo. Reintenta guardar cuando tengas conexión.",
      );
    setNotice(
      `Asistencia guardada para ${targets.length} ${targets.length === 1 ? "persona" : "personas"}.`,
    );
  };
  const exportHistory = () => {
    const csv = (value: unknown) => {
      const text = String(value ?? "");
      return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
    };
    const rows = [
      [
        "Fecha",
        "Trabajador",
        "Rol",
        "Estado",
        "Entrada",
        "Salida",
        "Horas",
        "Origen",
        "Registrado por",
        "Observación",
      ],
      ...history.map((row) => [
        row.fecha,
        row.trabajador_nombre,
        row.trabajador_rol,
        attendanceLabels[row.estado],
        row.hora_entrada,
        row.hora_salida,
        row.horas_trabajadas,
        row.origen,
        row.registrado_por,
        row.observacion,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(csv).join(",")).join("\n")],
        { type: "text/csv;charset=utf-8;" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `Asistencia_${projectId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div
      className="min-w-0 text-navy-900 dark:text-gray-100"
      data-crew-revision={revision}
    >
      <ProjectTabsHeader
        proyecto={project}
        cliente={
          project.cliente_id
            ? dataService.getClienteById(project.cliente_id)
            : null
        }
        onOpenMaps={() => setMaps(true)}
      />
      <div className="mx-auto max-w-7xl space-y-5 p-4 pb-28 sm:p-6 sm:pb-28">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Cuadrilla de la obra</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Equipo asignado y asistencia confirmada por jefatura.
            </p>
          </div>
          <button
            type="button"
            className={crewPrimary}
            onClick={() => openAssign()}
          >
            <Plus size={17} />
            Asignar trabajadores
          </button>
        </div>
        {notice && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200"
          >
            {notice}
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Cerrar aviso"
            >
              <X size={17} />
            </button>
          </div>
        )}
        <section
          aria-label="Resumen de cuadrilla"
          className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              {
                label: "Asignados",
                value: crew.length,
                Icon: Users,
                color: "text-[#FF6A00] bg-orange-50 dark:bg-orange-950/30",
              },
              {
                label: "Presentes",
                value: present,
                Icon: Check,
                color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
              },
              {
                label: "Sin registro",
                value: pending,
                Icon: Clock3,
                color: "text-slate-500 bg-slate-100 dark:bg-slate-800",
              },
              {
                label: "Ausentes",
                value: absent,
                Icon: CircleX,
                color: "text-red-500 bg-red-50 dark:bg-red-950/30",
              },
            ].map(({ label, value, Icon, color }) => (
              <div
                key={label}
                className={`${panel} flex min-w-0 items-center gap-3 p-3 sm:p-4`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}
                >
                  <Icon size={21} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-none">
                    {value}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3 xl:border-l xl:border-kraft-200 xl:pl-4 dark:xl:border-[#263040]">
            <label className="min-w-0 space-y-1.5 text-xs text-gray-500">
              Fecha de referencia
              <input
                aria-label="Fecha de asistencia"
                type="date"
                className={`${crewInput} mt-1.5 !p-2.5 !text-xs`}
                value={date}
                max={chileToday()}
                onChange={(event) => {
                  if (event.target.value) setDate(event.target.value);
                }}
              />
            </label>
            <label className="min-w-0 space-y-1.5 text-xs text-gray-500">
              Filtrar por estado
              <select
                aria-label="Filtrar asistencia"
                className={`${crewInput} mt-1.5 !p-2.5 !text-xs`}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">Todos los estados</option>
                <option value="none">Sin registro</option>
                {Object.entries(attendanceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <div
          role="tablist"
          aria-label="Gestión de cuadrilla"
          className="flex gap-1 border-b border-kraft-200 dark:border-[#263040]"
        >
          {(
            [
              ["crew", "Cuadrilla"],
              ["daily", "Asistencia diaria"],
              ["history", "Historial"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-t-xl border-b-2 px-2 py-3 text-xs font-semibold sm:flex-none sm:px-6 sm:text-sm ${view === id ? "border-[#FF6A00] bg-orange-50 text-[#FF6A00] dark:bg-orange-950/20" : "border-transparent text-gray-500 dark:text-gray-400"}`}
              onClick={() => {
                setView(id);
                setSearch("");
                setFilter("all");
              }}
            >
              {id === "crew" ? (
                <Users size={18} className="shrink-0" />
              ) : id === "daily" ? (
                <CalendarDays size={18} className="shrink-0" />
              ) : (
                <History size={18} className="shrink-0" />
              )}
              {label}
            </button>
          ))}
        </div>
        <div
          className={`grid items-start gap-5 ${view !== "history" ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}
        >
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-0 flex-1 basis-52">
                <span className="sr-only">
                  Buscar trabajador o especialidad
                </span>
                <Search
                  size={17}
                  className="absolute left-3 top-3.5 text-gray-400"
                />
                <input
                  className={`${crewInput} pl-9`}
                  placeholder="Nombre o especialidad"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {view === "daily" && (
                <>
                  <button
                    type="button"
                    className={crewSecondary}
                    disabled={!pending}
                    onClick={() =>
                      setEditor({
                        name: `${pending} ${pending === 1 ? "persona sin registro" : "personas sin registro"}`,
                        date,
                        bulk: true,
                      })
                    }
                  >
                    Marcar cuadrilla
                  </button>
                </>
              )}
              {view === "history" && (
                <>
                  <label className="text-xs text-gray-500">
                    Filtrar fecha
                    <input
                      aria-label="Fecha del historial"
                      type="date"
                      className={`${crewInput} mt-1`}
                      value={historyDate}
                      onChange={(event) => setHistoryDate(event.target.value)}
                    />
                  </label>
                  {historyDate && (
                    <button
                      type="button"
                      className={crewSecondary}
                      onClick={() => setHistoryDate("")}
                    >
                      Ver todas
                    </button>
                  )}
                  <button
                    type="button"
                    className={crewSecondary}
                    onClick={exportHistory}
                    disabled={!history.length}
                  >
                    <Download size={16} />
                    Exportar historial
                  </button>
                </>
              )}
            </div>
            {view !== "history" && (
              <>
                {!crew.length ? (
                  <section className={`${panel} py-10 px-5 text-center`}>
                    <Users className="mx-auto mb-3 h-9 w-9 text-[#FF6A00]" />
                    <h3 className="text-lg font-bold">
                      Esta obra todavía no tiene cuadrilla
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                      Asigna personas de tu equipo para gestionar su asistencia
                      en esta obra.
                    </p>
                    <button
                      type="button"
                      className={`${crewSecondary} mt-5`}
                      onClick={() => openAssign()}
                    >
                      Asignar trabajadores
                    </button>
                    <p className="mt-4 text-xs text-gray-500">
                      ¿Es una persona nueva?{" "}
                      <Link
                        href="/equipo"
                        className="font-semibold text-[#FF6A00] underline"
                      >
                        Registrar en Equipo
                      </Link>
                    </p>
                  </section>
                ) : !visibleCrew.length ? (
                  <p className={`${panel} p-6 text-sm text-gray-500`}>
                    No hay personas que coincidan con la búsqueda.
                  </p>
                ) : (
                  <section
                    className={`${panel} min-w-0 space-y-4 p-3 sm:p-5 xl:min-h-[360px]`}
                  >
                    <h3 className="px-1 text-base font-bold">
                      Trabajadores asignados ({visibleCrew.length})
                    </h3>
                    <div className="grid min-w-0 gap-3">
                      {visibleCrew.map((user) => {
                        const record = attendance(user);
                        return (
                          <article
                            key={user.id}
                            data-crew-member={user.id}
                            className={`${panel} min-w-0 p-4 sm:p-5`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-1 basis-40 items-start gap-3">
                                <span
                                  aria-hidden="true"
                                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-50 font-bold text-[#FF6A00] dark:bg-orange-950/30"
                                >
                                  {user.nombre
                                    .split(/\s+/)
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((part) => part[0])
                                    .join("")}
                                </span>
                                <div className="min-w-0">
                                  <h3 className="break-words font-bold">
                                    {user.nombre}
                                  </h3>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {role(user)}
                                  </p>
                                </div>
                              </div>
                              <Status record={record} />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {user.especialidades?.length ? (
                                user.especialidades.map((skill) => (
                                  <span
                                    key={skill}
                                    className="max-w-full break-words rounded-md bg-kraft-100 px-2 py-1 text-xs dark:bg-gray-800"
                                  >
                                    {skill}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-gray-400">
                                  Sin especialidad registrada
                                </span>
                              )}
                            </div>
                            {view === "daily" && (
                              <div className="mt-4 rounded-xl bg-kraft-50 p-3 text-sm dark:bg-gray-900">
                                <div className="flex flex-wrap gap-x-5 gap-y-1">
                                  <span>
                                    Entrada:{" "}
                                    {record?.hora_entrada?.slice(0, 5) || "—"}
                                  </span>
                                  <span>
                                    Salida:{" "}
                                    {record?.hora_salida?.slice(0, 5) || "—"}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                  {record?.hora_entrada && record?.hora_salida
                                    ? `${record.horas_trabajadas ?? 0} h registradas`
                                    : "Horas pendientes de confirmar"}
                                </p>
                                {record?.observacion && (
                                  <p className="mt-2 break-words text-xs">
                                    {record.observacion}
                                  </p>
                                )}
                              </div>
                            )}
                            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-kraft-100 pt-4 dark:border-[#263040]">
                              <button
                                type="button"
                                className={`${crewPrimary} w-full sm:w-auto`}
                                onClick={() =>
                                  setEditor({
                                    name: user.nombre,
                                    user,
                                    record,
                                    date,
                                  })
                                }
                              >
                                <CalendarDays size={17} />
                                {record
                                  ? "Editar asistencia"
                                  : "Registrar asistencia"}
                              </button>
                              {view === "crew" &&
                                (
                                  [
                                    {
                                      status: "presente",
                                      label: "Presente",
                                      Icon: Check,
                                      color: "text-emerald-600",
                                    },
                                    {
                                      status: "ausente",
                                      label: "Ausente",
                                      Icon: X,
                                      color: "text-red-500",
                                    },
                                    {
                                      status: "licencia",
                                      label: "Licencia",
                                      Icon: FileText,
                                      color: "text-slate-500",
                                    },
                                  ] as const
                                ).map(({ status, label, Icon, color }) => (
                                  <button
                                    key={status}
                                    type="button"
                                    aria-label={`${label}: ${user.nombre}`}
                                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-kraft-200 px-2 text-xs dark:border-[#263040] sm:flex-none sm:px-3"
                                    onClick={() =>
                                      setEditor({
                                        name: user.nombre,
                                        user,
                                        record,
                                        date,
                                        initialStatus: status,
                                      })
                                    }
                                  >
                                    <Icon size={16} className={color} />
                                    {label}
                                  </button>
                                ))}
                              {view === "crew" && (
                                <button
                                  type="button"
                                  aria-label={`Retirar a ${user.nombre}`}
                                  className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 py-2 text-xs text-gray-500 hover:text-red-600 sm:ml-auto sm:border-l sm:border-kraft-200 sm:pl-4 dark:sm:border-[#263040]"
                                  onClick={() => {
                                    setError("");
                                    setRemove(user);
                                  }}
                                >
                                  <UserMinus size={15} />
                                  Retirar
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
            {view === "history" && (
              <section className="space-y-3">
                <p className="text-sm text-gray-500">
                  {history.length} registros. Incluye personas que ya no están
                  asignadas a esta obra.
                </p>
                {!history.length && (
                  <p className={`${panel} p-6 text-sm text-gray-500`}>
                    No hay registros para estos filtros.
                  </p>
                )}
                {history.map((record) => {
                  const member = crew.some((user) =>
                    crewAttendance(user, [record], users),
                  );
                  return (
                    <article
                      key={record.id}
                      className={`${panel} flex min-w-0 flex-wrap items-start justify-between gap-3 p-4`}
                    >
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="text-xs text-gray-500">
                          {formatDate(record.fecha)}
                        </p>
                        <h3 className="mt-1 break-words font-bold">
                          {record.trabajador_nombre}
                        </h3>
                        {!member && (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            {record.usuario_id
                              ? "Fuera de la cuadrilla actual"
                              : "Registro anterior sin ficha vinculada"}
                          </p>
                        )}
                        <p className="mt-2 text-sm">
                          {record.hora_entrada?.slice(0, 5) || "—"} →{" "}
                          {record.hora_salida?.slice(0, 5) || "—"} ·{" "}
                          {record.horas_trabajadas ?? 0} h
                        </p>
                        {record.observacion && (
                          <p className="mt-1 break-words text-sm text-gray-500">
                            {record.observacion}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                          Registrado por {record.registrado_por || "jefatura"} ·{" "}
                          {record.origen === "web" ? "Web" : "WhatsApp"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Status record={record} />
                        <button
                          type="button"
                          className={crewSecondary}
                          aria-label={`Editar registro de ${record.trabajador_nombre} del ${record.fecha}`}
                          onClick={() =>
                            setEditor({
                              name: record.trabajador_nombre,
                              record,
                              date: record.fecha,
                            })
                          }
                        >
                          Editar
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </div>
          {view !== "history" && (
            <aside
              aria-label="Información de la cuadrilla"
              className="min-w-0 space-y-3"
            >
              <section className={`${panel} space-y-3 p-4`}>
                <h3 className="flex items-center gap-2 font-bold">
                  <ChartNoAxesColumnIncreasing
                    size={20}
                    className="text-[#FF6A00]"
                  />
                  Resumen del día
                </h3>
                {[
                  {
                    Icon: CheckCircle2,
                    count: present,
                    label: "presentes",
                    color: "text-emerald-600",
                  },
                  {
                    Icon: Clock3,
                    count: pending,
                    label: pending === 1 ? "pendiente" : "pendientes",
                    color: "text-slate-500",
                  },
                  {
                    Icon: CircleX,
                    count: absent,
                    label: "ausentes",
                    color: "text-red-500",
                  },
                ].map(({ Icon, count, label, color }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-lg bg-kraft-50 px-3 py-2 text-sm dark:bg-[#0F141C]"
                  >
                    <Icon size={17} className={color} />
                    <span>
                      <strong>{count}</strong> {label}
                    </span>
                  </div>
                ))}
              </section>
              {view === "crew" && (
                <section className={`${panel} space-y-3 p-4`}>
                  <div>
                    <h3 className="flex items-center gap-2 font-bold">
                      <Lightbulb
                        size={20}
                        className="shrink-0 text-[#FF6A00]"
                      />
                      Sugerencias para esta obra
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Por especialidades registradas y próximas faenas. La
                      disponibilidad se confirma con cada persona.
                    </p>
                  </div>
                  {suggestions.length ? (
                    <div className="grid gap-3">
                      {suggestions.map(
                        ({ user, matched, reason, otherProjects }) => (
                          <article
                            key={user.id}
                            className={`${panel} min-w-0 p-4`}
                          >
                            <h4 className="break-words font-bold">
                              {user.nombre}
                            </h4>
                            <p className="mt-1 break-words text-xs text-[#FF6A00]">
                              {matched.join(" · ")}
                            </p>
                            <p className="mt-3 break-words text-sm">{reason}</p>
                            <p className="mt-2 break-words text-xs text-gray-500">
                              {otherProjects.length
                                ? `También asignado a: ${otherProjects.map((row) => row.nombre).join(", ")}.`
                                : "Sin otras obras en curso o pausadas registradas."}
                            </p>
                            <button
                              type="button"
                              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#FF6A00]"
                              onClick={() => openAssign(user.id)}
                            >
                              Revisar asignación
                              <ArrowRight size={15} />
                            </button>
                          </article>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="rounded-xl bg-orange-50/70 p-3 text-xs leading-relaxed text-gray-500 dark:bg-orange-950/20">
                      No hay coincidencias suficientes para sugerir personas.
                      Puedes asignar desde el equipo o completar sus
                      especialidades.
                    </p>
                  )}
                </section>
              )}
              <section className={`${panel} space-y-3 p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-bold">
                    <Clock3 size={20} className="text-[#FF6A00]" />
                    Últimos registros
                  </h3>
                  <button
                    type="button"
                    className="flex min-h-10 items-center gap-1 text-xs font-medium text-[#FF6A00]"
                    onClick={() => {
                      setView("history");
                      setSearch("");
                      setHistoryDate(date);
                    }}
                  >
                    Ver historial <ArrowRight size={14} />
                  </button>
                </div>
                {daily.length ? (
                  daily
                    .slice(-3)
                    .reverse()
                    .map((record) => (
                      <div
                        key={record.id}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-kraft-50 p-3 dark:bg-[#0F141C]"
                      >
                        <p className="min-w-0 break-words text-xs font-medium">
                          {record.trabajador_nombre}
                        </p>
                        <Status record={record} />
                      </div>
                    ))
                ) : (
                  <p className="flex items-start gap-3 rounded-xl bg-kraft-50 p-3 text-xs leading-relaxed text-gray-500 dark:bg-[#0F141C]">
                    <CalendarDays size={22} className="shrink-0" />
                    Aún no hay registros de asistencia para la fecha{" "}
                    {formatDate(date)}.
                  </p>
                )}
              </section>
            </aside>
          )}
        </div>
      </div>
      {editor && (
        <CrewAttendanceEditor
          key={`${editor.record?.id || editor.user?.id || "bulk"}:${editor.date}`}
          {...editor}
          onClose={() => setEditor(null)}
          onSave={saveAttendance}
        />
      )}
      {assignOpen && (
        <ModalOverlay
          onClose={() => {
            if (!busy) setAssignOpen(false);
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-xl space-y-4 rounded-2xl bg-[#FAF8F5] p-5 dark:bg-[#0B0F14]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Asignar trabajadores</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Selecciona integrantes de tu equipo. Confirma su
                  disponibilidad antes de asignarlos.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar ventana"
                disabled={busy}
                onClick={() => setAssignOpen(false)}
                className="p-2"
              >
                <X size={20} />
              </button>
            </div>
            <label className="block">
              <span className="sr-only">Buscar en el equipo</span>
              <input
                className={crewInput}
                placeholder="Nombre o especialidad"
                value={assignSearch}
                onChange={(event) => setAssignSearch(event.target.value)}
              />
            </label>
            <div className="max-h-[40dvh] space-y-2 overflow-y-auto">
              {candidates
                .filter((user) =>
                  crewText(
                    [user.nombre, ...(user.especialidades || [])].join(" "),
                  ).includes(crewText(assignSearch)),
                )
                .map((user) => {
                  const other = dataService
                    .getProyectos()
                    .filter(
                      (row) =>
                        row.id !== projectId &&
                        row.trabajadores_ids?.includes(user.id) &&
                        ["activo", "pausado"].includes(row.estado),
                    );
                  const leave = dataService
                    .getAsistencias()
                    .find(
                      (row) =>
                        row.usuario_id === user.id &&
                        row.fecha === date &&
                        ["licencia", "permiso"].includes(row.estado),
                    );
                  return (
                    <label
                      key={user.id}
                      className={`${panel} flex cursor-pointer items-start gap-3 p-3`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(user.id)}
                        disabled={busy}
                        onChange={(event) =>
                          setSelected((ids) =>
                            event.target.checked
                              ? [...ids, user.id]
                              : ids.filter((id) => id !== user.id),
                          )
                        }
                        className="mt-1 accent-[#FF6A00]"
                      />
                      <span className="min-w-0 break-words text-sm">
                        <strong>{user.nombre}</strong>
                        <span className="mt-1 block text-xs text-gray-500">
                          {role(user)} ·{" "}
                          {user.especialidades?.join(" · ") ||
                            "Sin especialidad registrada"}
                        </span>
                        {other.length > 0 && (
                          <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                            También en:{" "}
                            {other.map((row) => row.nombre).join(", ")}
                          </span>
                        )}
                        {leave && (
                          <span className="mt-1 block text-xs text-red-600">
                            {attendanceLabels[leave.estado]} registrada para
                            esta fecha
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              {!candidates.length && (
                <p className="py-5 text-sm text-gray-500">
                  No hay personas pendientes de asignar.{" "}
                  <Link href="/equipo" className="text-[#FF6A00] underline">
                    Registrar en Equipo
                  </Link>
                </p>
              )}
            </div>
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
                onClick={() => setAssignOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={crewPrimary}
                disabled={busy || !selected.length}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  let count = 0;
                  try {
                    for (const id of selected) {
                      await dataService.cambiarAsignacionProyecto(
                        projectId,
                        id,
                        true,
                      );
                      count++;
                      setSelected((ids) => ids.filter((value) => value !== id));
                    }
                    setAssignOpen(false);
                    setNotice(
                      `${count} ${count === 1 ? "persona asignada" : "personas asignadas"} a la obra.`,
                    );
                  } catch (err) {
                    setError(
                      `${count ? `${count} asignaciones guardadas. ` : ""}${err instanceof Error ? err.message : "No se pudo confirmar la asignación."}`,
                    );
                  } finally {
                    refresh();
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Asignando…"
                  : `Asignar seleccionados (${selected.length})`}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
      {remove && (
        <ModalOverlay
          onClose={() => {
            if (!busy) setRemove(null);
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-[#FAF8F5] p-5 dark:bg-[#0B0F14]">
            <h2 className="text-xl font-bold">Retirar de la cuadrilla</h2>
            <p className="break-words text-sm">
              ¿Retirar a {remove.nombre} de esta obra? Su historial de
              asistencia se conservará.
            </p>
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
                onClick={() => setRemove(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={crewPrimary}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await dataService.cambiarAsignacionProyecto(
                      projectId,
                      remove.id,
                      false,
                    );
                    setRemove(null);
                    setNotice("Persona retirada. Su historial se conserva.");
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "No se pudo retirar a la persona.",
                    );
                  } finally {
                    refresh();
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Guardando…" : "Confirmar retiro"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
      <GoogleMapsProjectViewer
        proyecto={project}
        isOpen={maps}
        onClose={() => setMaps(false)}
      />
    </div>
  );
}
