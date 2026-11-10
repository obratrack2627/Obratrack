"use client";
import ModalOverlay from '@/components/ModalOverlay';
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Camera,
  ClipboardList,
  FileText,
  MessageCircle,
  Send,
  ChevronDown,
  X,
} from "lucide-react";
import { aiHeaders } from "@/lib/ai/client";
import { dataService } from "@/lib/data-service";
import AIMessageTools from "./AIMessageTools";
import EvidenceLink from './EvidenceLink';
import EvidenceImage from "./EvidenceImage";
import ChatMessageFormatter from "./ChatMessageFormatter";
import WhatsAppAvisosPanel from "./WhatsAppAvisosPanel";
const labels: Record<string, string> = {
  consulta: "Consulta",
  registro: "Registro de obra",
  fotografia: "Evidencia",
  cotizacion: "Cotización",
  datos_obra: "Datos pendientes",
  aviso: "Aviso al equipo",
};
const dates = (value?: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Fecha no disponible";
export default function WhatsAppJefePanel() {
  const [tab, setTab] = useState<"registros" | "envios">("registros");
  const [connection, setConnection] = useState<any>(null);
  const [canActivate, setCanActivate] = useState(false),
    [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState("");
  const [status, setStatus] = useState<any>(null),
    [phone, setPhone] = useState(""),
    [staff, setStaff] = useState(false);
  const [messages, setMessages] = useState<any[]>([]),
    [authors, setAuthors] = useState<any[]>([]),
    [projects, setProjects] = useState<any[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(0);
  const [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [author, setAuthor] = useState(""),
    [project, setProject] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "envios")
      setTab("envios");
    const user = dataService.getActiveUser();
    setCanActivate(user?.rol === "admin");
    setPhone(user?.telefono_whatsapp || "");
    setStaff(["admin", "supervisor"].includes(user?.rol || ""));
    if (["admin", "supervisor"].includes(user?.rol || "")) {
      void aiHeaders()
        .then((headers) => fetch("/api/whatsapp/estado", { headers }))
        .then((r) => (r.ok ? r.json() : null))
        .then(setConnection)
        .catch(() => {});
    }
    void fetch("/api/webhook/whatsapp")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, []);
  async function refresh(signal?: AbortSignal) {
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (page) query.set("pagina", String(page));
      if (search.trim()) query.set("buscar", search.trim());
      if (type) query.set("tipo", type);
      if (author) query.set("autor", author);
      if (project) query.set("obra", project);
      const res = await fetch(
        "/api/whatsapp/mensajes" + (query.size ? "?" + query.toString() : ""),
        { headers: await aiHeaders(), signal },
      );
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error || "No se pudieron cargar los registros.");
      if (signal?.aborted) return;
      setMessages(body.mensajes || []);
      setTotal(body.total ?? body.mensajes?.length ?? 0);
      setAuthors(body.autores || []);
      setProjects(body.obras || []);
      if (typeof body.gestion === "boolean") setStaff(body.gestion);
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (tab !== "registros") return;
    const abort = new AbortController();
    const timer = setTimeout(
      () => void refresh(abort.signal),
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [page, search, type, author, project, tab]);
  const change = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(0);
  };
  async function activateReception() {
    setActivating(true);
    setActivationError("");
    try {
      const response = await fetch("/api/whatsapp/estado", { method: "POST", headers: await aiHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo activar la recepción.");
      setConnection(body);
    } catch (e) {
      setActivationError((e as Error).message);
    } finally {
      setActivating(false);
    }
  }
  return (
    <div className="whatsapp-workspace space-y-5">
      <section className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading font-bold">
            Canal de WhatsApp
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Tu teléfono: {phone || "Pendiente en tu ficha"} ·{" "}
            <span>
              {connection?.estado === "permisos_pendientes"
                ? "Permisos de Meta pendientes"
                : connection?.estado === "renovar_conexion"
                  ? "Renovar conexión con Meta"
                  : connection?.estado === "numero_desactualizado"
                    ? "Actualizar número de WhatsApp"
                    : connection && connection.estado !== "disponible"
                      ? "Revisar conexión con Meta"
                  : status
                    ? status.cloud_api_configurada
                      ? "Canal configurado"
                      : "Conexión con Meta pendiente"
                    : "Comprobando conexión…"}
            </span>
          </p>
          {connection && connection.estado !== "disponible" && (
            <p className="text-sm text-amber-800 mt-2 max-w-xl" role="status">
              {connection.mensaje}
            </p>
          )}
          {canActivate && connection?.estado === "webhook_pendiente" && (
            <button disabled={activating} onClick={() => void activateReception()}
              className="mt-3 rounded-xl bg-green-700 text-white px-4 py-2 text-sm disabled:opacity-50">
              {activating ? "Activando recepción…" : "Activar recepción de mensajes"}
            </button>
          )}
          {activationError && <p role="alert" className="text-sm text-red-700 mt-2">{activationError}</p>}
        </div>
        {status?.cloud_api_configurada && status.numero &&
          (!connection || connection.estado === "disponible") && (
          <a
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-green-700 text-white px-4 py-2.5 text-sm font-semibold"
            href={`https://wa.me/${status.numero.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="w-4 h-4" />
            Abrir WhatsApp de ObraTrack
          </a>
        )}
      </section>
      <div
        className="flex min-w-0 gap-1 rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-100 dark:bg-[#0B0F14] p-1"
        role="tablist"
        aria-label="Actividad de WhatsApp"
      >
        <button
          role="tab"
          aria-selected={tab === "registros"}
          onClick={() => setTab("registros")}
          className={`flex-1 sm:flex-none rounded-lg px-4 py-2.5 text-sm font-semibold ${tab === "registros" ? "bg-white dark:bg-[#1E2530] text-obra-orange shadow-sm" : "text-gray-500"}`}
        >
          Registros
        </button>
        {staff && (
          <button
            role="tab"
            aria-selected={tab === "envios"}
            onClick={() => setTab("envios")}
            className={`flex-1 sm:flex-none rounded-lg px-4 py-2.5 text-sm font-semibold ${tab === "envios" ? "bg-white dark:bg-[#1E2530] text-obra-orange shadow-sm" : "text-gray-500"}`}
          >
            Avisos enviados
          </button>
        )}
      </div>
      {tab === "envios" && staff ? (
        <WhatsAppAvisosPanel />
      ) : (
        <section className="space-y-4" aria-label="Registros de WhatsApp">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold">
              Registros de WhatsApp{" "}
              <span className="text-sm font-normal text-gray-500">
                ({total})
              </span>
            </h3>
            <button
              disabled={busy}
              onClick={() => void refresh()}
              className="text-sm underline"
            >
              {busy ? "Actualizando…" : "Actualizar registros"}
            </button>
          </div>
          <div className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-3 sm:p-4 space-y-3">
            <div className="grid min-w-0 grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="col-span-2 lg:col-span-1 min-w-0 space-y-1.5 text-xs font-medium text-gray-500">
                Buscar
                <input aria-label="Buscar registro" placeholder="Mensaje, autor o detalle…" value={search} onChange={e => change(setSearch)(e.target.value)} className="block w-full min-w-0 rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] px-3 py-2.5 text-sm text-navy-900 dark:text-gray-100" />
              </label>
              <label className="min-w-0 space-y-1.5 text-xs font-medium text-gray-500">
                Tipo de registro
                <select aria-label="Tipo de registro" value={type} onChange={e => change(setType)(e.target.value)} className="block w-full min-w-0 rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] px-3 py-2.5 text-sm text-navy-900 dark:text-gray-100 truncate">
                  <option value="">Todos los tipos</option>{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="min-w-0 space-y-1.5 text-xs font-medium text-gray-500">
                Obra
                <select aria-label="Filtrar registros por obra" value={project} onChange={e => change(setProject)(e.target.value)} className="block w-full min-w-0 rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] px-3 py-2.5 text-sm text-navy-900 dark:text-gray-100 truncate">
                  <option value="">Todas las obras</option>{projects.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
              {staff && <label className="col-span-2 lg:col-span-1 min-w-0 space-y-1.5 text-xs font-medium text-gray-500">
                Autor
                <select aria-label="Autor del registro" value={author} onChange={e => change(setAuthor)(e.target.value)} className="block w-full min-w-0 rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] px-3 py-2.5 text-sm text-navy-900 dark:text-gray-100 truncate">
                  <option value="">Todos los autores</option>{authors.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </label>}
            </div>
            {(search || type || project || author) && <button type="button" onClick={() => {setSearch('');setType('');setProject('');setAuthor('');setPage(0);}} className="text-xs font-semibold text-obra-orange hover:underline">Limpiar filtros</button>}
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-300 p-3 text-sm"
            >
              {error}
            </p>
          )}
          {!busy && !error && !messages.length && (
            <div className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">
              No hay registros con estos filtros.
            </div>
          )}
          <div className="space-y-3">
            {messages.map((m) => {
              const category =
                m.categoria ||
                (m.adjunto
                  ? "fotografia"
                  : m.cotizacion
                    ? "cotizacion"
                    : m.acciones
                      ? "registro"
                      : "consulta");
              const Icon =
                category === "fotografia"
                  ? Camera
                  : category === "cotizacion"
                    ? FileText
                    : category === "aviso"
                      ? Send
                      : ClipboardList;
              const title =
                m.cotizacion?.titulo_proyecto ||
                m.acciones?.titulo ||
                labels[category] ||
                "Registro de WhatsApp";
              const actions =
                m.acciones?.detalles?.acciones ||
                (m.acciones ? [m.acciones] : []);
              return (
                <article
                  key={m.message_id}
                  className="min-w-0 rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 sm:p-5 space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 rounded-xl bg-obra-orange/10 p-2.5 text-obra-orange">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-semibold break-words">{title}</h4>
                        <span className="rounded-full bg-kraft-100 text-gray-600 px-2 py-1 text-xs">
                          {labels[category] || "Registro"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {m.autor?.nombre || "Mi cuenta"}
                        {m.autor?.rol
                          ? " · " +
                            ({
                              admin: "Administración",
                              supervisor: "Supervisión",
                              terreno: "Terreno",
                            }[m.autor.rol as "admin"] || m.autor.rol)
                          : ""}{" "}
                        · {dates(m.created_at)}
                      </p>
                    </div>
                  </div>
                  <p className="rounded-xl bg-kraft-50 dark:bg-[#0B0F14] p-3 text-sm text-gray-700 dark:text-gray-300 break-words">
                    {String(m.texto || "").slice(0, 220)}
                    {m.texto?.length > 220 ? "…" : ""}
                  </p>
                  {m.obras?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.obras.map((p: any) => (
                        <Link
                          key={p.id}
                          className="max-w-full rounded-lg border border-obra-orange/20 px-2 py-1 text-xs font-medium text-obra-orange hover:underline"
                          href={`/proyectos/${p.id}/gantt`}
                        >
                          {p.nombre}
                        </Link>
                      ))}
                    </div>
                  )}
                  {m.adjunto?.path && (!m.adjunto.mime_type || m.adjunto.mime_type.startsWith('image/')) && (
                    <button
                      type="button"
                      onClick={() =>
                        setPhoto("whatsapp-evidencias:" + m.adjunto.path)
                      }
                      aria-label="Ampliar foto"
                      className="block"
                    >
                      <EvidenceImage
                        src={"whatsapp-evidencias:" + m.adjunto.path}
                        alt="Foto enviada por WhatsApp"
                        className="max-h-44 max-w-full rounded-xl object-contain"
                      />
                    </button>
                  )}
                  {m.adjunto?.path && m.adjunto.mime_type && !m.adjunto.mime_type.startsWith('image/') && <EvidenceLink path={m.adjunto.path} name={m.adjunto.archivo_nombre || 'Archivo de obra'} />}
                  <div className="flex flex-wrap gap-2 items-center text-xs">
                    {category === "datos_obra" ? (
                      <span className="text-amber-700 font-medium">
                        Datos pendientes para crear obra
                      </span>
                    ) : m.adjunto?.path && !m.adjunto?.proyecto_id && !m.obras?.length ? (
                      <span className="text-amber-700 font-medium">
                        Pendiente de asociar a una obra
                      </span>
                    ) : (
                      <span className="text-green-700 font-medium">
                        {m.adjunto?.path ? "Guardado en bitácora" : "Registrado"}
                      </span>
                    )}
                    {!m.sent_at && (
                      <span className="text-amber-700">
                        Respuesta pendiente
                      </span>
                    )}
                    {m.aviso_id && (
                      <button
                        className="text-obra-orange underline"
                        onClick={() => setTab("envios")}
                      >
                        Ver destinatarios y entrega
                      </button>
                    )}
                  </div>
                  <AIMessageTools compact
                    message={{ cotizacion_generada: m.cotizacion || undefined }}
                  />
                  <details className="min-w-0 border-t border-kraft-200 dark:border-[#263040] pt-3">
                    <summary className="cursor-pointer text-sm font-medium flex items-center gap-1">
                      Ver detalle <ChevronDown className="h-4 w-4" />
                    </summary>
                    <div className="min-w-0 mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="min-w-0 rounded-xl bg-kraft-50 dark:bg-[#0B0F14] p-3">
                        <p className="text-xs text-gray-500 mb-2">
                          Mensaje recibido
                        </p>
                        <ChatMessageFormatter className="message-content" content={m.texto || ""} />
                      </div>
                      <div className="min-w-0 rounded-xl bg-kraft-50 dark:bg-[#0B0F14] p-3">
                        <p className="text-xs text-gray-500 mb-2">
                          Respuesta de ObraTrack
                        </p>
                        <ChatMessageFormatter className="message-content" content={m.respuesta || ""} />
                      </div>
                    </div>
                    {actions.length > 0 && (
                      <ul className="mt-3 space-y-2 text-sm">
                        {actions.map((a: any, i: number) => (
                          <li key={i} className="rounded-xl border p-3">
                            <p className="font-medium">{a.titulo}</p>
                            <p className="text-gray-600 dark:text-gray-300 mt-1 break-words">
                              {a.resultado_texto}
                            </p>
                            {a.link_destino &&
                              /^\/proyectos\//.test(a.link_destino) && (
                                <Link
                                  className="text-obra-orange text-xs underline"
                                  href={a.link_destino}
                                >
                                  Abrir registro en la obra
                                </Link>
                              )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </article>
              );
            })}
          </div>
          {total > 20 && (
            <div className="flex justify-between items-center text-sm">
              <button
                disabled={page === 0 || busy}
                onClick={() => setPage((p) => p - 1)}
                className="border rounded-lg px-3 py-2 disabled:opacity-40"
              >
                Anterior
              </button>
              <span>
                Página {page + 1} de {Math.ceil(total / 20)}
              </span>
              <button
                disabled={(page + 1) * 20 >= total || busy}
                onClick={() => setPage((p) => p + 1)}
                className="border rounded-lg px-3 py-2 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </section>
      )}
      {photo && (
        <ModalOverlay
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          role="dialog"
          aria-label="Evidencia fotográfica"
        >
          <button
            aria-label="Cerrar foto"
            onClick={() => setPhoto(null)}
            className="absolute top-5 right-5 text-white"
          >
            <X />
          </button>
          <EvidenceImage
            src={photo}
            alt="Evidencia fotográfica ampliada"
            className="max-h-[85vh] max-w-full rounded-xl object-contain"
          />
        </ModalOverlay>
      )}
    </div>
  );
}
