import { waitUntil } from "@vercel/functions";
import { chileToday } from "@/lib/ai/project-deadlines";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  sendPushToUsers,
  sendPushIdempotent,
  type PushCategory,
} from "./server";

export function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function extractAgendaDateAndTime(ev: {
  fecha_inicio?: string | null;
  fecha?: string | null;
  hora?: string | null;
}): { fecha: string | null; hora: string } {
  const raw = typeof ev.fecha_inicio === "string" ? ev.fecha_inicio.trim() : "";
  if (raw) {
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Santiago",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(parsed);
        const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
        const hour = get("hour") === "24" ? "00" : get("hour");
        return {
          fecha: `${get("year")}-${get("month")}-${get("day")}`,
          hora: `${hour}:${get("minute")}`,
        };
      }
    }
    const localMatch = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(raw);
    if (localMatch) {
      return { fecha: localMatch[1], hora: localMatch[2] || "08:30" };
    }
  }
  return {
    fecha: typeof ev.fecha === "string" && ev.fecha ? ev.fecha.slice(0, 10) : null,
    hora: typeof ev.hora === "string" && ev.hora ? ev.hora.slice(0, 5) : "08:30",
  };
}

function projectName(projects: any[], projectId?: string | null): string {
  if (!projectId) return "Obra en ObraTrack";
  const match = (projects || []).find((p) => p.id === projectId);
  return match?.nombre || "Obra en ObraTrack";
}

function backgroundPush(task: Promise<unknown>) {
  const safe = task.catch(() => {});
  try {
    waitUntil(safe);
  } catch {
    // Fuera de Vercel no bloquea el flujo principal.
  }
}

function flattenLeaves(action: any): any[] {
  if (!action) return [];
  if (action.tipo === "lote_acciones" && Array.isArray(action.detalles?.acciones)) {
    return action.detalles.acciones.flatMap(flattenLeaves);
  }
  return [action];
}

export function notifyPushOnWhatsAppChanges(
  sb: any,
  params: {
    empresaId: string;
    actor: { id: string; nombre?: string; rol: string };
    result: any;
    changed?: Record<string, any[]>;
    projects?: any[];
    campaign?: { mensaje: string; destinatarios: Array<{ id: string }>; proyecto_id?: string | null };
  },
) {
  const admin = (() => {
    try {
      return getSupabaseAdmin() || sb;
    } catch {
      return sb;
    }
  })();
  if (!admin || !params.empresaId) return;

  const task = (async () => {
    const actorName = params.actor?.nombre || "Equipo";
    const leaves = flattenLeaves(params.result);

    for (const act of leaves) {
      const pid = act?.detalles?.proyecto_id || act?.proyecto_id;
      const obra = projectName(params.projects || [], pid);

      if (act?.tipo === "crear_bitacora") {
        const subtipo = act.detalles?.tipo || "avance";
        const titulo = act.detalles?.titulo || act.titulo || "Nuevo reporte de terreno";
        if (subtipo === "incidente") {
          await sendPushToUsers(admin, {
            empresaId: params.empresaId,
            roles: ["admin", "supervisor"],
            excludeUserIds: [params.actor.id],
            categoria: "incidentes_bitacora",
            payload: {
              title: `Incidente · ${obra}`,
              body: `${actorName}: ${titulo}`,
              url: pid ? `/proyectos/${pid}` : "/reportes",
              tag: `incidente-${pid || "general"}`,
              requireInteraction: true,
            },
          });
        } else if (subtipo === "entrega_material") {
          await sendPushToUsers(admin, {
            empresaId: params.empresaId,
            roles: ["admin", "supervisor"],
            excludeUserIds: [params.actor.id],
            categoria: "materiales",
            payload: {
              title: `Material recibido · ${obra}`,
              body: `${actorName}: ${titulo}`,
              url: pid ? `/proyectos/${pid}/finanzas` : "/reportes",
              tag: `material-recibido-${pid || "general"}`,
            },
          });
        }
      } else if (act?.tipo === "crear_solicitud_cambio") {
        const titulo = act.detalles?.titulo || "Solicitud / cambio en obra";
        await sendPushToUsers(admin, {
          empresaId: params.empresaId,
          roles: ["admin", "supervisor"],
          excludeUserIds: [params.actor.id],
          categoria: "incidentes_bitacora",
          payload: {
            title: `Cambio o reclamo · ${obra}`,
            body: `${actorName}: ${titulo}`,
            url: pid ? `/proyectos/${pid}/cambios` : "/reportes",
            tag: `cambio-${pid || "general"}`,
          },
        });
      } else if (act?.tipo === "registrar_documento" && act.detalles?.categoria === "cierre_diario") {
        await sendPushToUsers(admin, {
          empresaId: params.empresaId,
          roles: ["admin", "supervisor"],
          excludeUserIds: [params.actor.id],
          categoria: "cierre_diario",
          payload: {
            title: `Cierre de jornada · ${obra}`,
            body: `${actorName} confirmó el cierre diario.`,
            url: pid ? `/proyectos/${pid}/documentos` : "/reportes",
            tag: `cierre-${pid || "general"}`,
          },
        });
      } else if (act?.tipo === "actualizar_material") {
        const mat = act.detalles?.nombre || "Material actualizado";
        if (act.detalles?.comprado === true) {
          await sendPushToUsers(admin, {
            empresaId: params.empresaId,
            roles: ["terreno", "supervisor"],
            excludeUserIds: [params.actor.id],
            categoria: "materiales",
            payload: {
              title: `Compra confirmada · ${obra}`,
              body: `${mat} ya fue comprado para obra.`,
              url: pid ? `/proyectos/${pid}/finanzas` : "/proyectos",
              tag: `material-compra-${pid || "general"}`,
            },
          });
        }
      } else if (act?.tipo === "asignar_trabajador" || act?.tipo === "asignar_trabajadores") {
        const ids = Array.isArray(act.detalles?.trabajadores_ids)
          ? act.detalles.trabajadores_ids
          : act.detalles?.trabajador_id
            ? [act.detalles.trabajador_id]
            : [];
        if (ids.length) {
          await sendPushToUsers(admin, {
            empresaId: params.empresaId,
            userIds: ids,
            excludeUserIds: [params.actor.id],
            categoria: "asignaciones_tareas",
            payload: {
              title: `Nueva obra asignada · ${obra}`,
              body: `${actorName} te asignó a esta obra.`,
              url: pid ? `/proyectos/${pid}` : "/proyectos",
              tag: `asignacion-${pid || "general"}`,
            },
          });
        }
      }
    }

    if (params.campaign?.destinatarios?.length) {
      const targetIds = params.campaign.destinatarios.map((d) => d.id).filter(Boolean);
      if (targetIds.length) {
        const obra = projectName(params.projects || [], params.campaign.proyecto_id);
        await sendPushToUsers(admin, {
          empresaId: params.empresaId,
          userIds: targetIds,
          excludeUserIds: [params.actor.id],
          categoria: "seguridad_clima",
          payload: {
            title: `Aviso de equipo · ${obra}`,
            body: params.campaign.mensaje.slice(0, 220),
            url: params.campaign.proyecto_id ? `/proyectos/${params.campaign.proyecto_id}` : "/reportes",
            tag: `aviso-equipo-${params.campaign.proyecto_id || "general"}`,
          },
        });
      }
    }
  })();

  backgroundPush(task);
}

export function notifyPushOnCrewChange(
  sb: any,
  params: { empresaId: string; projectId: string; projectName?: string; assignedUserId: string; actorId?: string },
) {
  const admin = (() => {
    try {
      return getSupabaseAdmin() || sb;
    } catch {
      return sb;
    }
  })();
  if (!admin || !params.assignedUserId) return;
  backgroundPush(
    sendPushToUsers(admin, {
      empresaId: params.empresaId,
      userIds: [params.assignedUserId],
      excludeUserIds: params.actorId ? [params.actorId] : [],
      categoria: "asignaciones_tareas",
      payload: {
        title: `Obra asignada · ${params.projectName || "Nueva faena"}`,
        body: "Tienes una obra asignada. Toca para revisar partidas y detalles.",
        url: `/proyectos/${params.projectId}`,
        tag: `crew-${params.projectId}-${params.assignedUserId}`,
      },
    }),
  );
}

export function notifyPushOnScheduleChange(
  sb: any,
  params: { empresaId: string; projectId: string; projectName?: string; motivo?: string; actorId?: string },
) {
  const admin = (() => {
    try {
      return getSupabaseAdmin() || sb;
    } catch {
      return sb;
    }
  })();
  if (!admin) return;
  backgroundPush(
    sendPushToUsers(admin, {
      empresaId: params.empresaId,
      roles: ["supervisor", "terreno"],
      excludeUserIds: params.actorId ? [params.actorId] : [],
      categoria: "inicio_plazos",
      payload: {
        title: `Cronograma actualizado · ${params.projectName || "Obra"}`,
        body: params.motivo ? `Se ajustaron fechas: ${params.motivo}` : "Revisa los nuevos plazos en Carta Gantt.",
        url: `/proyectos/${params.projectId}/gantt`,
        tag: `gantt-${params.projectId}`,
      },
    }),
  );
}

export function notifyPushOnChangeApproval(
  sb: any,
  params: { empresaId: string; projectId: string; projectName?: string; titulo?: string; actorId?: string },
) {
  const admin = (() => {
    try {
      return getSupabaseAdmin() || sb;
    } catch {
      return sb;
    }
  })();
  if (!admin) return;
  backgroundPush(
    sendPushToUsers(admin, {
      empresaId: params.empresaId,
      roles: ["admin", "supervisor", "terreno"],
      excludeUserIds: params.actorId ? [params.actorId] : [],
      categoria: "asignaciones_tareas",
      payload: {
        title: `Cambio aprobado · ${params.projectName || "Obra"}`,
        body: params.titulo || "Se aprobó una actualización en la obra.",
        url: `/proyectos/${params.projectId}/cambios`,
        tag: `cambio-ok-${params.projectId}`,
      },
    }),
  );
}

export function notifyPushOnSyncChanges(
  sb: any,
  params: {
    empresaId: string;
    user: { id: string; nombre?: string; rol: string };
    body: Record<string, any[]>;
    previousTables: Record<string, any[]>;
  },
) {
  const admin = (() => {
    try {
      return getSupabaseAdmin() || sb;
    } catch {
      return sb;
    }
  })();
  if (!admin) return;

  const prevIds = (table: string) =>
    new Set((params.previousTables[table] || []).map((r: any) => r.id));

  const newLogs = (params.body.bitacora || []).filter(
    (b: any) => !prevIds("bitacora_entradas").has(b.id),
  );
  const newClaims = (params.body.reclamos_cambios || []).filter(
    (rc: any) => !prevIds("reclamos_cambios_obra").has(rc.id),
  );
  const newProjects = (params.body.proyectos || []).filter(
    (p: any) => !prevIds("proyectos").has(p.id),
  );
  const projects = [...(params.previousTables.proyectos || []), ...(params.body.proyectos || [])];

  if (!newLogs.length && !newClaims.length && !newProjects.length) return;

  const task = (async () => {
    for (const log of newLogs.slice(0, 3)) {
      if (log.tipo !== "incidente" && log.tipo !== "entrega_material") continue;
      const obra = projectName(projects, log.proyecto_id);
      const categoria: PushCategory =
        log.tipo === "incidente" ? "incidentes_bitacora" : "materiales";
      await sendPushToUsers(admin, {
        empresaId: params.empresaId,
        roles: ["admin", "supervisor"],
        excludeUserIds: [params.user.id],
        categoria,
        payload: {
          title: `${log.tipo === "incidente" ? "Incidente" : "Entrega de material"} · ${obra}`,
          body: log.titulo || log.nota || "Nuevo registro en bitácora.",
          url: log.proyecto_id ? `/proyectos/${log.proyecto_id}` : "/dashboard",
          tag: `sync-${log.tipo}-${log.id}`,
        },
      });
    }

    for (const claim of newClaims.slice(0, 2)) {
      const obra = projectName(projects, claim.proyecto_id);
      await sendPushToUsers(admin, {
        empresaId: params.empresaId,
        roles: ["admin", "supervisor"],
        excludeUserIds: [params.user.id],
        categoria: "incidentes_bitacora",
        payload: {
          title: `Nuevo cambio/reclamo · ${obra}`,
          body: claim.titulo || "Revisa la solicitud en obra.",
          url: claim.proyecto_id ? `/proyectos/${claim.proyecto_id}/cambios` : "/proyectos",
          tag: `sync-cambio-${claim.id}`,
        },
      });
    }

    for (const proj of newProjects.slice(0, 2)) {
      await sendPushToUsers(admin, {
        empresaId: params.empresaId,
        roles: ["admin", "supervisor"],
        excludeUserIds: [params.user.id],
        categoria: "inicio_plazos",
        payload: {
          title: `Nueva obra creada · ${proj.nombre}`,
          body: proj.fecha_inicio ? `Inicio programado: ${proj.fecha_inicio}` : "Ya está disponible en ObraTrack.",
          url: `/proyectos/${proj.id}`,
          tag: `new-project-${proj.id}`,
        },
      });
    }
  })();

  backgroundPush(task);
}

/** Cron matinal (Chile): recuerda obras/eventos que comienzan mañana o hoy y alerta plazos vencidos. */
export async function runScheduledPushReminders(
  sb: any,
  now: Date = new Date(),
  sender?: Parameters<typeof sendPushToUsers>[2],
) {
  const admin = sb || getSupabaseAdmin();
  if (!admin) return { companies: 0, sent: 0, skipped: 0 };

  const today = chileToday(now);
  const tomorrow = addDaysISO(today, 1);

  const { data: activeSubs, error: subErr } = await admin
    .from("push_suscripciones")
    .select("empresa_id,usuario_id,rol")
    .eq("activo", true);

  if (subErr || !Array.isArray(activeSubs) || !activeSubs.length) {
    return { companies: 0, sent: 0, skipped: 0 };
  }

  const companyIds = Array.from(new Set<string>(activeSubs.map((s: any) => s.empresa_id)));
  let totalSent = 0;
  let totalSkipped = 0;

  for (const empresaId of companyIds) {
    const [projRes, agendaRes] = await Promise.all([
      admin
        .from("proyectos")
        .select("id,nombre,estado,fecha_inicio,fecha_termino_estimada")
        .eq("empresa_id", empresaId)
        .in("estado", ["activo", "pendiente"]),
      admin
        .from("agenda_eventos")
        .select("id,titulo,fecha_inicio,fecha_fin,tipo,proyecto_id")
        .eq("empresa_id", empresaId),
    ]);

    if (agendaRes?.error) {
      console.warn("push_cron_agenda_query_error", { empresa_id: empresaId, code: agendaRes.error.code });
    }
    const projects = projRes?.data || [];
    const events = agendaRes?.data || [];
    const projectIds = projects.map((p: any) => p.id);

    const [actRes, crewRes] = projectIds.length
      ? await Promise.all([
          admin
            .from("actividades")
            .select("id,proyecto_id,nombre,porcentaje_avance,fecha_termino")
            .in("proyecto_id", projectIds),
          admin
            .from("proyecto_trabajadores")
            .select("proyecto_id,usuario_id")
            .in("proyecto_id", projectIds),
        ])
      : [{ data: [] }, { data: [] }];

    const activities = actRes?.data || [];
    const crewRows = crewRes?.data || [];
    const companySubs = activeSubs.filter((s: any) => s.empresa_id === empresaId);
    const adminIds = companySubs.filter((s: any) => s.rol === "admin").map((s: any) => s.usuario_id);

    const supervisorsForProject = (projectId: string) => {
      const assigned = new Set(
        crewRows.filter((r: any) => r.proyecto_id === projectId).map((r: any) => r.usuario_id),
      );
      return Array.from(
        new Set([
          ...adminIds,
          ...companySubs
            .filter((s: any) => s.rol === "supervisor" && assigned.has(s.usuario_id))
            .map((s: any) => s.usuario_id),
        ]),
      );
    };

    const workersForProject = (projectId: string) => {
      const assigned = new Set(
        crewRows.filter((r: any) => r.proyecto_id === projectId).map((r: any) => r.usuario_id),
      );
      return companySubs
        .filter((s: any) => s.rol === "terreno" && assigned.has(s.usuario_id))
        .map((s: any) => s.usuario_id);
    };

    const dispatch = async (
      dedupKey: string,
      params: Parameters<typeof sendPushToUsers>[1],
    ) => {
      if (params.userIds && !params.userIds.length) return;
      const res = await sendPushIdempotent(admin, dedupKey, params, sender);
      if (res.skipped) totalSkipped++;
      else totalSent += res.sent;
    };

    for (const p of projects) {
      const chiefs = supervisorsForProject(p.id);
      const workers = workersForProject(p.id);

      // Recordatorio 1 día antes del inicio (ej. día 19 para el 20)
      if (p.fecha_inicio === tomorrow) {
        await dispatch(`proj-start-prev:${p.id}:${today}`, {
          empresaId,
          userIds: chiefs,
          categoria: "inicio_plazos",
          payload: {
            title: `Inicio mañana · ${p.nombre}`,
            body: "Tu obra comienza mañana. Verifica cuadrilla, accesos y materiales.",
            url: `/proyectos/${p.id}`,
            tag: `start-prev-${p.id}`,
          },
        });
        await dispatch(`proj-start-prev-worker:${p.id}:${today}`, {
          empresaId,
          userIds: workers,
          categoria: "asignaciones_tareas",
          payload: {
            title: `Mañana inicias en ${p.nombre}`,
            body: "Recuerda tu horario de llegada y elementos de protección personal (EPP).",
            url: `/proyectos/${p.id}`,
            tag: `start-prev-w-${p.id}`,
          },
        });
      }

      // Recordatorio el mismo día en la mañana (ej. día 20)
      if (p.fecha_inicio === today) {
        await dispatch(`proj-start-today:${p.id}:${today}`, {
          empresaId,
          userIds: chiefs,
          categoria: "inicio_plazos",
          payload: {
            title: `Inicio hoy · ${p.nombre}`,
            body: "La obra comienza hoy. Revisa asistencia inicial y Carta Gantt.",
            url: `/proyectos/${p.id}/gantt`,
            tag: `start-today-${p.id}`,
            requireInteraction: true,
          },
        });
        await dispatch(`proj-start-today-worker:${p.id}:${today}`, {
          empresaId,
          userIds: workers,
          categoria: "asignaciones_tareas",
          payload: {
            title: `Hoy comienzas en ${p.nombre}`,
            body: "Buen inicio de jornada. Reporta tus avances y novedades por ObraBot.",
            url: `/proyectos/${p.id}`,
            tag: `start-today-w-${p.id}`,
          },
        });
      }

      // Alertas de vencimiento de obra
      if (p.fecha_termino_estimada === today) {
        await dispatch(`proj-due-today:${p.id}:${today}`, {
          empresaId,
          userIds: chiefs,
          categoria: "inicio_plazos",
          payload: {
            title: `Plazo vence hoy · ${p.nombre}`,
            body: "Fecha de término estimada hoy. Revisa partidas pendientes o reprogramación.",
            url: `/proyectos/${p.id}/gantt`,
            tag: `due-today-${p.id}`,
          },
        });
      } else if (p.fecha_termino_estimada && p.fecha_termino_estimada < today && p.estado === "activo") {
        await dispatch(`proj-overdue:${p.id}:${today}`, {
          empresaId,
          userIds: chiefs,
          categoria: "inicio_plazos",
          payload: {
            title: `Plazo vencido · ${p.nombre}`,
            body: `Venció el ${p.fecha_termino_estimada}. Evalúa avances y ajuste de entrega.`,
            url: `/proyectos/${p.id}/gantt`,
            tag: `overdue-${p.id}`,
          },
        });
      }

      // Partidas críticas que vencen hoy
      const dueActs = activities.filter(
        (a: any) =>
          a.proyecto_id === p.id &&
          Number(a.porcentaje_avance || 0) < 100 &&
          a.fecha_termino === today,
      );
      if (dueActs.length) {
        await dispatch(`act-due-today:${p.id}:${today}`, {
          empresaId,
          userIds: [...chiefs, ...workers],
          categoria: "inicio_plazos",
          payload: {
            title: `Partida vence hoy · ${p.nombre}`,
            body: `${dueActs[0].nombre}${dueActs.length > 1 ? ` y ${dueActs.length - 1} más` : ""} vence hoy.`,
            url: `/proyectos/${p.id}/gantt`,
            tag: `act-due-${p.id}`,
          },
        });
      }
    }

    // Agenda / Visitas: día antes y mismo día en la mañana
    for (const ev of events) {
      const { fecha: evDate, hora: evTime } = extractAgendaDateAndTime(ev);
      if (!evDate) continue;
      const targetChiefs = ev.proyecto_id ? supervisorsForProject(ev.proyecto_id) : adminIds;
      const targetUrl = ev.proyecto_id ? `/proyectos/${ev.proyecto_id}` : "/dashboard";
      const relatedProject = ev.proyecto_id
        ? projects.find((p: any) => p.id === ev.proyecto_id)?.nombre
        : null;
      const bodyText = `${ev.titulo}${relatedProject ? ` · ${relatedProject}` : ""}`;
      if (evDate === tomorrow) {
        await dispatch(`agenda-prev:${ev.id}:${today}`, {
          empresaId,
          userIds: targetChiefs,
          categoria: "inicio_plazos",
          payload: {
            title: `Agenda mañana · ${evTime}`,
            body: bodyText,
            url: targetUrl,
            tag: `agenda-prev-${ev.id}`,
          },
        });
      } else if (evDate === today) {
        await dispatch(`agenda-today:${ev.id}:${today}`, {
          empresaId,
          userIds: targetChiefs,
          categoria: "inicio_plazos",
          payload: {
            title: `Hoy en tu agenda · ${evTime}`,
            body: bodyText,
            url: targetUrl,
            tag: `agenda-today-${ev.id}`,
            requireInteraction: true,
          },
        });
      }
    }
  }

  return { companies: companyIds.length, sent: totalSent, skipped: totalSkipped };
}
