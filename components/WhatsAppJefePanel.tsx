"use client";
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
import EvidenceImage from "./EvidenceImage";
import ChatMessageFormatter from "./ChatMessageFormatter";
import WhatsAppAvisosPanel from "./WhatsAppAvisosPanel";
const labels: Record<string, string> = {
  consulta: "Consulta",
  registro: "Registro de obra",
  fotografia: "Fotografía",
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
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-bold">
            Gestiona tu obra desde tu WhatsApp
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Tu teléfono: {phone || "Pendiente en tu ficha"} ·{" "}
            <span>
              {connection?.estado === "permisos_pendientes"
                ? "Permisos de Meta pendientes"
                : connection?.estado === "renovar_conexion"
                  ? "Renovar conexión con Meta"
                  : status
                    ? status.cloud_api_configurada
                      ? "Canal configurado"
                      : "Conexión con Meta pendiente"
                    : "Comprobando conexión…"}
            </span>
          </p>
        </div>
        {status?.cloud_api_configurada && status.numero && (
          <a
            className="inline-flex items-center gap-2 rounded-xl bg-green-700 text-white px-4 py-2 text-sm"
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
        className="flex gap-2 border-b"
        role="tablist"
        aria-label="Actividad de WhatsApp"
      >
        <button
          role="tab"
          aria-selected={tab === "registros"}
          onClick={() => setTab("registros")}
          className={`px-4 py-3 text-sm font-semibold border-b-2 ${tab === "registros" ? "border-obra-orange text-obra-orange" : "border-transparent"}`}
        >
          Registros
        </button>
        {staff && (
          <button
            role="tab"
            aria-selected={tab === "envios"}
            onClick={() => setTab("envios")}
            className={`px-4 py-3 text-sm font-semibold border-b-2 ${tab === "envios" ? "border-obra-orange text-obra-orange" : "border-transparent"}`}
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              aria-label="Buscar registro"
              placeholder="Buscar registro"
              value={search}
              onChange={(e) => change(setSearch)(e.target.value)}
              className="rounded-xl border bg-white p-2.5 text-sm min-w-0"
            />
            <select
              aria-label="Tipo de registro"
              value={type}
              onChange={(e) => change(setType)(e.target.value)}
              className="rounded-xl border bg-white p-2.5 text-sm"
            >
              <option value="">Todos los tipos</option>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar registros por obra"
              value={project}
              onChange={(e) => change(setProject)(e.target.value)}
              className="rounded-xl border bg-white p-2.5 text-sm"
            >
              <option value="">Todas las obras</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {staff && (
              <select
                aria-label="Autor del registro"
                value={author}
                onChange={(e) => change(setAuthor)(e.target.value)}
                className="rounded-xl border bg-white p-2.5 text-sm"
              >
                <option value="">Todos los autores</option>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 text-red-800 p-3 text-sm"
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
                  className="rounded-2xl border bg-white p-4 sm:p-5 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="rounded-xl bg-obra-orange/10 p-2.5 text-obra-orange">
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
                  <p className="text-sm text-gray-700 break-words">
                    {String(m.texto || "").slice(0, 220)}
                    {m.texto?.length > 220 ? "…" : ""}
                  </p>
                  {m.obras?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.obras.map((p: any) => (
                        <Link
                          key={p.id}
                          className="text-xs text-obra-orange hover:underline"
                          href={`/proyectos/${p.id}/gantt`}
                        >
                          {p.nombre}
                        </Link>
                      ))}
                    </div>
                  )}
                  {m.adjunto?.path && (
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
                  <div className="flex flex-wrap gap-2 items-center text-xs">
                    <span className="text-green-700">
                      {category === "datos_obra"
                        ? "Datos pendientes"
                        : m.adjunto?.analisis_pendiente
                          ? "Análisis pendiente"
                          : "Registrado"}
                    </span>
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
                  <AIMessageTools
                    message={{ cotizacion_generada: m.cotizacion || undefined }}
                  />
                  <details className="border-t pt-3">
                    <summary className="cursor-pointer text-sm font-medium flex items-center gap-1">
                      Ver detalle <ChevronDown className="h-4 w-4" />
                    </summary>
                    <div className="mt-3 grid md:grid-cols-2 gap-4 text-sm">
                      <div className="rounded-xl bg-kraft-50 p-3">
                        <p className="text-xs text-gray-500 mb-2">
                          Mensaje recibido
                        </p>
                        <ChatMessageFormatter content={m.texto || ""} />
                      </div>
                      <div className="rounded-xl bg-gray-50 p-3">
                        <p className="text-xs text-gray-500 mb-2">
                          Respuesta de ObraTrack
                        </p>
                        <ChatMessageFormatter content={m.respuesta || ""} />
                      </div>
                    </div>
                    {actions.length > 0 && (
                      <ul className="mt-3 space-y-2 text-sm">
                        {actions.map((a: any, i: number) => (
                          <li key={i} className="rounded-xl border p-3">
                            <p className="font-medium">{a.titulo}</p>
                            <p className="text-gray-600 mt-1">
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
        <div
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
        </div>
      )}
    </div>
  );
}
