"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Camera,
  Plus,
  Receipt,
  Users,
  Wallet,
  CheckCircle2,
  ArrowLeft,
  ClipboardList,
} from "lucide-react";
import { useOperaciones } from "@/lib/operaciones/use-operaciones";
import { operacionesService } from "@/lib/operaciones/service";
import {
  estadoPago,
  gestionVacia,
  resumenObra,
} from "@/lib/operaciones/calculos";
import { ETAPAS_OBRA, type GestionObra } from "@/types/operaciones";
import { formatCLP, formatDate } from "@/lib/utils";
import { ErrorCarga, Indicador, Vacio } from "@/components/operaciones/UI";
import {
  RegistroForm,
  type Accion,
} from "@/components/operaciones/RegistroForm";
import { Archivo } from "@/components/operaciones/Adjuntos";
import { Cronograma } from "@/components/operaciones/Cronograma";

const TABS = [
  "Resumen",
  "Actividades",
  "Gastos",
  "Jornadas",
  "Estados de pago",
  "Adicionales",
  "Bitácora",
] as const;
export default function ObraPage() {
  const { id } = useParams<{ id: string }>();
  const datos = useOperaciones();
  const [g, setG] = useState<GestionObra | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resumen");
  const [form, setForm] = useState<{
    tipo: Accion;
    inicial?: Record<string, any>;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const p = datos.proyectos.find((x) => x.id === id);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("vista");
    if (TABS.includes(requested as (typeof TABS)[number]))
      setTab(requested as (typeof TABS)[number]);
  }, []);
  useEffect(() => {
    if (!p) return;
    const actual = datos.obras.find((x) => x.proyecto_id === id);
    if (actual) {
      setG(actual);
      return;
    }
    const initial = gestionVacia(id, p.empresa_id);
    if (p.estado === "terminado") initial.etapa = "Finalizada";
    initial.actividades = (p.actividades || []).map((a) => ({
      id: a.id,
      partida: a.nombre,
      nombre: a.nombre,
      responsable_id: a.responsable_id || "",
      inicio: a.fecha_inicio,
      termino: a.fecha_termino,
      avance: Number(a.porcentaje_avance),
      costo: 0,
      observaciones: "",
      estado:
        a.estado === "terminada"
          ? "Terminada"
          : a.estado === "en_curso"
            ? "En ejecución"
            : "Pendiente",
    }));
    setG(initial);
  }, [p, id, datos.obras]);
  const save = async (next: GestionObra) => {
    const saved = await operacionesService.guardarGestion(next);
    setG(saved);
  };
  if (datos.loading)
    return (
      <div className="op-page" role="status">
        Cargando obra…
      </div>
    );
  if (datos.error)
    return (
      <div className="op-page">
        <ErrorCarga error={datos.error} retry={datos.cargar} />
      </div>
    );
  if (!p || !g)
    return (
      <div className="op-page">
        <h1>Obra no encontrada</h1>
        <Link href="/proyectos" className="op-secondary">
          Volver a obras
        </Link>
      </div>
    );
  const r = resumenObra(p, g);
  const cerrada = g.etapa === "Finalizada";
  const fecha = new Date().toLocaleDateString("en-CA");
  const cotizacion = datos.cotizaciones.find((c) => c.proyecto_id === id);
  const editar = (tipo: Accion, inicial?: Record<string, any>) => {
    setError("");
    setForm({ tipo, inicial });
  };
  const mensaje = (text: string) =>
    `https://wa.me/${(p.cliente?.telefono || "").replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
  const botonEditar = (tipo: Accion, row: Record<string, any>) =>
    !cerrada && (
      <button className="op-secondary" onClick={() => editar(tipo, row)}>
        Editar
      </button>
    );
  return (
    <div className="op-page">
      <Link
        href="/proyectos"
        className="flex gap-2 items-center op-muted text-sm"
      >
        <ArrowLeft size={16} />
        Obras
      </Link>
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{p.nombre}</h1>
          <p className="op-muted text-sm mt-1">
            {p.cliente?.nombre || "Sin cliente"} ·{" "}
            {p.direccion || "Sin dirección"}
          </p>
          <p className="op-muted text-xs mt-2">
            {formatDate(p.fecha_inicio)} —{" "}
            {formatDate(p.fecha_termino_estimada)}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <span className="op-badge">{cerrada ? "Finalizada" : g.etapa}</span>
          {!cerrada && (
            <select
              className="op-input !w-auto"
              aria-label="Etapa de la obra"
              disabled={busy}
              value={g.etapa}
              onChange={async (e) => {
                const etapa = e.target.value as GestionObra["etapa"];
                if (etapa === "Finalizada") {
                  editar("cierre");
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  await save({ ...g, etapa });
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {ETAPAS_OBRA.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!cerrada && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {(
            [
              { tipo: "gasto", label: "Gasto", Icon: Receipt },
              { tipo: "registro", label: "Fotografías", Icon: Camera },
              { tipo: "actividad", label: "Actividad", Icon: ClipboardList },
              { tipo: "jornada", label: "Jornada", Icon: Users },
              { tipo: "adicional", label: "Adicional", Icon: Plus },
              { tipo: "pago", label: "Pago", Icon: Wallet },
            ] as const
          ).map((a) => (
            <button
              key={a.tipo}
              className="op-secondary"
              onClick={() => editar(a.tipo)}
            >
              <a.Icon size={17} />
              {a.label}
            </button>
          ))}
        </div>
      )}
      <nav
        aria-label="Secciones de la obra"
        className="flex gap-2 overflow-x-auto pb-2"
      >
        {TABS.map((t) => (
          <button
            key={t}
            className={`shrink-0 ${tab === t ? "op-primary" : "op-secondary"}`}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "Resumen" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Indicador label="Valor actualizado" value={r.valor} money />
            <Indicador label="Recibido" value={r.recibido} money />
            <Indicador label="Por cobrar" value={r.saldo} money />
            <Indicador label="Costos reales" value={r.gastos} money />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { label: "Avance físico", value: r.avance, color: "#6B8F72" },
              {
                label: "Avance financiero cobrado",
                value: r.avanceFinanciero,
                color: "#FF6A00",
              },
            ].map((a) => (
              <div className="op-card" key={a.label}>
                <div className="flex justify-between text-sm mb-3">
                  <span>{a.label}</span>
                  <strong>{a.value} %</strong>
                </div>
                <div
                  role="progressbar"
                  aria-label={a.label}
                  aria-valuenow={Math.min(100, a.value)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 rounded-full bg-gray-200 overflow-hidden"
                >
                  <div
                    style={{
                      width: `${Math.min(100, a.value)}%`,
                      background: a.color,
                    }}
                    className="h-full rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
          {r.desfase && !cerrada && (
            <div role="status" className="op-card !border-orange-400 text-sm">
              El avance físico supera en 20 puntos o más lo cobrado. Revisa el
              próximo estado de pago.
            </div>
          )}
          {r.credito > 0 && (
            <div className="op-card text-sm">
              Saldo a favor del cliente: {formatCLP(r.credito)}.
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <section className="op-card">
              <h2 className="font-semibold mb-2">Contrato y rentabilidad</h2>
              {[
                ["Contrato original", r.contrato],
                ["Adicionales aprobados", r.adicionales],
                ["Valor actualizado", r.valor],
                [
                  cerrada ? "Utilidad final" : "Utilidad proyectada",
                  cerrada ? r.utilidad : r.utilidadProyectada,
                ],
                ["Flujo de caja", r.caja],
              ].map(([label, value]) => (
                <div className="op-row text-sm" key={label}>
                  <span>{label}</span>
                  <strong>{formatCLP(Number(value))}</strong>
                </div>
              ))}
              <details className="text-xs op-muted mt-4">
                <summary className="cursor-pointer">Cómo se calcula</summary>
                <p className="mt-2">
                  {cerrada
                    ? "Utilidad: valor contratado menos costos registrados."
                    : "Proyección: valor actualizado menos el mayor entre costos registrados y presupuesto de actividades."}{" "}
                  Caja: cobros menos costos registrados.
                </p>
              </details>
              {cotizacion?.condiciones_pago && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer">
                    Condiciones de pago
                  </summary>
                  <p className="op-muted whitespace-pre-wrap mt-2">
                    {cotizacion.condiciones_pago}
                  </p>
                </details>
              )}
            </section>
            <section className="op-card">
              <h2 className="font-semibold mb-3">Próximas actividades</h2>
              {g.actividades
                .filter((a) => a.estado !== "Terminada")
                .slice(0, 5)
                .map((a) => (
                  <div className="op-row text-sm" key={a.id}>
                    <div>
                      <p>
                        {a.partida} · {a.nombre}
                      </p>
                      <p
                        className={`text-xs mt-1 ${a.termino < fecha ? "text-red-600" : "op-muted"}`}
                      >
                        {formatDate(a.termino)} · {a.estado}
                      </p>
                    </div>
                    <span>{a.avance} %</span>
                  </div>
                ))}
              {g.actividades.every((a) => a.estado === "Terminada") && (
                <Vacio>No hay actividades pendientes.</Vacio>
              )}
            </section>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className="op-secondary"
              href={mensaje(
                `${p.nombre}: avance físico ${r.avance} %. Recibido ${formatCLP(r.recibido)}. Saldo pendiente ${formatCLP(r.saldo)}.`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Compartir avance
            </a>
            {!cerrada && (
              <button className="op-secondary" onClick={() => editar("cierre")}>
                <CheckCircle2 size={17} />
                Cerrar obra
              </button>
            )}
            <Link className="op-secondary" href={`/proyectos/${id}/ia`}>
              Consultar asistente IA
            </Link>
          </div>
          {g.cierre && (
            <section className="op-card space-y-3">
              <h2 className="font-semibold">
                Cierre · {formatDate(g.cierre.fecha)}
              </h2>
              <p className="text-sm whitespace-pre-wrap">
                {g.cierre.observaciones}
              </p>
              {g.cierre.documentos.map((path, i) => (
                <Archivo
                  key={path}
                  path={path}
                  label={`Documento final ${i + 1}`}
                />
              ))}
            </section>
          )}
        </>
      )}
      {tab === "Actividades" && (
        <section className="op-card">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Partidas y actividades</h2>
            {!cerrada && (
              <button
                className="op-secondary"
                onClick={() => editar("actividad")}
              >
                <Plus size={16} />
                Agregar
              </button>
            )}
          </div>
          <Cronograma actividades={g.actividades} />
          {Array.from(new Set(g.actividades.map((a) => a.partida))).map(
            (partida) => {
              const acts = g.actividades.filter((a) => a.partida === partida);
              return (
                <div key={partida} className="mt-6">
                  <h3 className="font-semibold text-sm border-b pb-2">
                    {partida}{" "}
                    <span className="op-muted font-normal">
                      ·{" "}
                      {Math.round(
                        acts.reduce((s, a) => s + a.avance, 0) / acts.length,
                      )}{" "}
                      %
                    </span>
                  </h3>
                  {acts.map((a) => (
                    <div className="op-row" key={a.id}>
                      <div>
                        <p className="text-sm font-medium">{a.nombre}</p>
                        <p className="text-xs op-muted mt-1">
                          {datos.usuarios.find((u) => u.id === a.responsable_id)
                            ?.nombre || "Sin responsable"}{" "}
                          · {formatDate(a.inicio)} — {formatDate(a.termino)}
                        </p>
                        <p className="text-xs mt-1">
                          {a.estado} · {a.avance} % · {formatCLP(a.costo)}
                        </p>
                        {a.observaciones && (
                          <p className="op-muted text-xs mt-1">
                            {a.observaciones}
                          </p>
                        )}
                      </div>
                      {botonEditar("actividad", a)}
                    </div>
                  ))}
                </div>
              );
            },
          )}
          {!g.actividades.length && (
            <Vacio>Agrega la primera actividad de la obra.</Vacio>
          )}
          <p className="op-muted text-xs mt-5">
            Cada actividad tiene el mismo peso en el avance total.
          </p>
        </section>
      )}
      {tab === "Gastos" && (
        <section className="op-card">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Gastos de la obra</h2>
            {!cerrada && (
              <button className="op-secondary" onClick={() => editar("gasto")}>
                <Plus size={16} />
                Registrar
              </button>
            )}
          </div>
          <p className="text-xs op-muted mt-3">
            Registra aquí las compras pagadas. Las jornadas se suman
            automáticamente; no las ingreses otra vez como gasto.
          </p>
          {[...g.gastos]
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .map((x) => (
              <div className="op-row" key={x.id}>
                <div>
                  <p className="font-medium text-sm">{x.descripcion}</p>
                  <p className="text-xs op-muted mt-1">
                    {x.proveedor} · {x.categoria} · {formatDate(x.fecha)}
                    {x.partida && ` · ${x.partida}`}
                  </p>
                  {x.comprobante && <Archivo path={x.comprobante} />}
                </div>
                <div className="flex items-center gap-3">
                  <strong className="text-sm">{formatCLP(x.monto)}</strong>
                  {botonEditar("gasto", x)}
                </div>
              </div>
            ))}
          {(p.materiales || [])
            .filter((m) => m.comprado)
            .map((m) => (
              <div className="op-row text-sm" key={m.id}>
                <span>
                  {m.nombre}{" "}
                  <span className="op-muted text-xs">· Compra anterior</span>
                </span>
                <strong>{formatCLP(m.subtotal)}</strong>
              </div>
            ))}
          {(p.imprevistos || [])
            .filter((x) => x.estado === "aprobado")
            .map((x) => (
              <div className="op-row text-sm" key={x.id}>
                <span>
                  {x.descripcion}{" "}
                  <span className="op-muted text-xs">
                    · Imprevisto anterior aprobado
                  </span>
                </span>
                <strong>{formatCLP(x.monto)}</strong>
              </div>
            ))}
          {!g.gastos.length && (
            <Vacio>Aún no hay gastos nuevos registrados.</Vacio>
          )}
          <details className="text-sm mt-4">
            <summary className="cursor-pointer">
              Materiales presupuestados
            </summary>
            {(p.materiales || [])
              .filter((m) => !m.comprado)
              .map((m) => (
                <div key={m.id} className="op-row">
                  <span>{m.nombre}</span>
                  <span>{formatCLP(m.subtotal)}</span>
                </div>
              ))}
            <p className="op-muted text-xs mt-2">
              El presupuesto no es un gasto. Registra la compra al realizarla.
            </p>
          </details>
        </section>
      )}
      {tab === "Jornadas" && (
        <section className="op-card">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">
              Mano de obra · {formatCLP(r.manoObra)}
            </h2>
            {!cerrada && (
              <button
                className="op-secondary"
                onClick={() => editar("jornada")}
              >
                <Plus size={16} />
                Registrar
              </button>
            )}
          </div>
          {[...g.jornadas]
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .map((j) => (
              <div className="op-row" key={j.id}>
                <div>
                  <p className="text-sm font-medium">{j.trabajador}</p>
                  <p className="text-xs op-muted mt-1">
                    {formatDate(j.fecha)} · {j.jornadas} jornada · {j.actividad}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <strong className="text-sm">
                    {formatCLP(Math.round(j.jornadas * j.valor_diario))}
                  </strong>
                  {botonEditar("jornada", j)}
                </div>
              </div>
            ))}
          {!g.jornadas.length && (
            <Vacio>Registra los días trabajados de tu equipo.</Vacio>
          )}
        </section>
      )}
      {tab === "Estados de pago" && (
        <section className="op-card">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Cobros y anticipos</h2>
            {!cerrada && (
              <button className="op-secondary" onClick={() => editar("pago")}>
                <Plus size={16} />
                Crear
              </button>
            )}
          </div>
          {[...g.estados_pago]
            .sort((a, b) => a.numero - b.numero)
            .map((x) => (
              <div className="op-row" key={x.id}>
                <div>
                  <p className="font-medium text-sm">
                    N.º {x.numero} · {x.motivo}
                  </p>
                  <p className="text-xs op-muted mt-1">
                    {formatDate(x.fecha)} · Vence {formatDate(x.vencimiento)} ·
                    Avance acordado {x.avance} %
                  </p>
                  <span className="op-badge mt-2">{estadoPago(x, fecha)}</span>
                  {x.estado === "Pagado" && (
                    <p className="text-xs op-muted mt-1">
                      Pagado {formatDate(x.fecha_pago || x.fecha)}
                    </p>
                  )}
                  {x.comprobante && (
                    <div>
                      <Archivo path={x.comprobante} />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <strong className="text-sm mr-2">{formatCLP(x.monto)}</strong>
                  {botonEditar("pago", x)}
                  {x.estado !== "Pagado" && (
                    <a
                      className="op-secondary"
                      target="_blank"
                      rel="noreferrer"
                      href={mensaje(
                        `Hola, solicitamos el estado de pago N.º ${x.numero} por ${formatCLP(x.monto)} de ${p.nombre}. Motivo: ${x.motivo}. Vencimiento: ${formatDate(x.vencimiento)}.`,
                      )}
                    >
                      Solicitar por WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ))}
          {(p.pagos || []).map((x) => (
            <div key={x.id} className="op-row text-sm">
              <div>
                <p>{x.notas || x.nota || "Pago anterior"}</p>
                <span className="op-muted text-xs">
                  {formatDate(x.fecha)} · {x.estado || "completado"}
                </span>
              </div>
              <strong>{formatCLP(x.monto)}</strong>
            </div>
          ))}
          {!g.estados_pago.length && !(p.pagos || []).length && (
            <Vacio>
              Define el anticipo o el próximo cobro. El monto y el avance los
              acuerdas con el cliente.
            </Vacio>
          )}
        </section>
      )}
      {tab === "Adicionales" && (
        <section className="op-card">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Trabajos adicionales</h2>
            {!cerrada && (
              <button
                className="op-secondary"
                onClick={() => editar("adicional")}
              >
                <Plus size={16} />
                Crear
              </button>
            )}
          </div>
          <p className="text-xs op-muted mt-3">
            Contrato original {formatCLP(r.contrato)} + aprobados{" "}
            {formatCLP(r.adicionales)} = {formatCLP(r.valor)}
          </p>
          {g.adicionales.map((a) => (
            <div className="op-row" key={a.id}>
              <div>
                <p className="font-medium text-sm">{a.descripcion}</p>
                <p className="text-xs op-muted mt-1">
                  {formatDate(a.fecha)} · Materiales {formatCLP(a.materiales)} ·
                  Mano de obra {formatCLP(a.mano_obra)}
                </p>
                <span className="op-badge mt-2">{a.estado}</span>
                {a.aprobacion && (
                  <p className="text-xs op-muted mt-1">{a.aprobacion}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm mr-2">
                  {formatCLP(a.materiales + a.mano_obra)}
                </strong>
                {botonEditar("adicional", a)}
                <a
                  className="op-secondary"
                  target="_blank"
                  rel="noreferrer"
                  href={mensaje(
                    `Solicitamos aprobación del adicional para ${p.nombre}: ${a.descripcion}. Total ${formatCLP(a.materiales + a.mano_obra)}.`,
                  )}
                >
                  Compartir
                </a>
                {!cerrada && ["Borrador", "Enviado"].includes(a.estado) && (
                  <button
                    className="op-secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await save({
                          ...g,
                          adicionales: g.adicionales.filter(
                            (x) => x.id !== a.id,
                          ),
                        });
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
          {!g.adicionales.length && (
            <Vacio>Los trabajos fuera de contrato se registran aquí.</Vacio>
          )}
        </section>
      )}
      {tab === "Bitácora" && (
        <section className="op-card">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Registro de terreno</h2>
            {!cerrada && (
              <button
                className="op-secondary"
                onClick={() => editar("registro")}
              >
                <Camera size={16} />
                Registrar
              </button>
            )}
          </div>
          {[...g.bitacora]
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .map((b) => (
              <article className="border-b py-5 space-y-3" key={b.id}>
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="text-xs op-muted">
                      {formatDate(b.fecha)} · {b.partida}
                    </p>
                    <p className="font-medium text-sm mt-1">{b.descripcion}</p>
                    <p className="text-xs op-muted mt-1">
                      {
                        g.actividades.find((a) => a.id === b.actividad_id)
                          ?.nombre
                      }
                    </p>
                  </div>
                  {botonEditar("registro", b)}
                </div>
                {b.observaciones && (
                  <p className="text-sm op-muted">{b.observaciones}</p>
                )}
                <div className="flex flex-wrap gap-3">
                  {b.fotos.map((path, i) => (
                    <Archivo
                      photo
                      key={path}
                      path={path}
                      label={`${b.descripcion} · foto ${i + 1}`}
                    />
                  ))}
                </div>
              </article>
            ))}
          {(p.bitacora || []).map((b) => (
            <article key={b.id} className="border-b py-4 text-sm space-y-2">
              <p className="op-muted text-xs">
                {formatDate(b.fecha)} · Registro anterior
              </p>
              <p>{b.titulo}</p>
              <p>{b.nota}</p>
              {b.foto_url && (
                <Archivo path={b.foto_url} photo label={b.titulo} />
              )}
            </article>
          ))}
          {!g.bitacora.length && !(p.bitacora || []).length && (
            <Vacio>Agrega fotografías y una descripción del avance.</Vacio>
          )}
        </section>
      )}
      {form && (
        <RegistroForm
          tipo={form.tipo}
          inicial={form.inicial}
          proyecto={p}
          gestion={g}
          usuarios={datos.usuarios}
          close={() => setForm(null)}
          save={save}
        />
      )}
    </div>
  );
}
