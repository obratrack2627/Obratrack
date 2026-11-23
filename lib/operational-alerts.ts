import type {
  Actividad,
  AsistenciaObrero,
  BitacoraEntrada,
  EventoAgenda,
  Imprevisto,
  MaterialProyecto,
  Proyecto,
  ReclamoCambioObra,
  Usuario,
} from '@/types/database';
import { materialNeeds } from '@/lib/construction-workflow';
import { assignedCrew } from '@/lib/crew';
import { calendarDays, chileToday } from '@/lib/work-calendar';

export type OperationalAlertSeverity = 'critical' | 'warning' | 'info';
export type OperationalAlertCategory =
  | 'finanzas'
  | 'gantt'
  | 'materiales'
  | 'cambios'
  | 'asistencia'
  | 'agenda';

export interface OperationalAlert {
  id: string;
  severity: OperationalAlertSeverity;
  category: OperationalAlertCategory;
  title: string;
  detail: string;
  href: string;
  projectId?: string;
  projectName?: string;
}

export interface ComputeOperationalAlertsInput {
  proyectos: Proyecto[];
  actividades: Actividad[];
  materiales: MaterialProyecto[];
  bitacora: BitacoraEntrada[];
  imprevistos: Imprevisto[];
  reclamos: ReclamoCambioObra[];
  asistencias: AsistenciaObrero[];
  usuarios: Usuario[];
  agenda: EventoAgenda[];
  today?: string;
}

const SEVERITY_WEIGHT: Record<OperationalAlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const CATEGORY_WEIGHT: Record<OperationalAlertCategory, number> = {
  cambios: 0,
  finanzas: 1,
  gantt: 2,
  materiales: 3,
  agenda: 4,
  asistencia: 5,
};

const DISMISSED_ALERTS_EVENT = 'obratrack_alerts_dismissed_changed';

export function dismissedAlertsStorageKey(userId?: string | null): string {
  return `obratrack_dismissed_alerts:${userId || 'anon'}`;
}

export function dismissedDashboardAlertsKey(userId?: string | null): string {
  return `obratrack_dismissed_dashboard_alerts:${userId || 'anon'}`;
}

export function readDismissedIds(storageKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0));
  } catch {
    return new Set();
  }
}

export function persistDismissedIds(storageKey: string, ids: Iterable<string>): Set<string> {
  const next = new Set(Array.from(ids).filter((item) => typeof item === 'string' && item.length > 0));
  if (typeof window !== 'undefined') {
    try {
      if (next.size === 0) {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      }
      window.dispatchEvent(new Event(DISMISSED_ALERTS_EVENT));
    } catch {
      // Ignorar restricciones de almacenamiento en modo privado
    }
  }
  return next;
}

export function filterDismissedAlerts<T extends { id: string }>(
  alerts: T[],
  dismissedIds: Iterable<string>,
): T[] {
  const hidden = dismissedIds instanceof Set ? dismissedIds : new Set(dismissedIds);
  if (hidden.size === 0) return alerts;
  return alerts.filter((alert) => !hidden.has(alert.id));
}

export function isProjectCompletedOrClosed(
  proj: Proyecto | undefined,
  actividades: Actividad[],
): boolean {
  if (!proj) return false;
  if (proj.estado === 'terminado' || proj.estado === 'cancelada') return true;
  const projActs = actividades.filter((a) => a.proyecto_id === proj.id);
  if (projActs.length > 0 && projActs.every((a) => Number(a.porcentaje_avance) >= 100)) {
    return true;
  }
  if (projActs.length === 0 && Number(proj.porcentaje_avance_ponderado) >= 100) {
    return true;
  }
  return false;
}

export function computeOperationalAlerts(
  input: ComputeOperationalAlertsInput,
): OperationalAlert[] {
  const today = input.today || chileToday();
  const alerts: OperationalAlert[] = [];
  const activeProjects = input.proyectos.filter((p) => p.estado === 'activo');
  const openExecutionProjects = activeProjects.filter(
    (p) => !isProjectCompletedOrClosed(p, input.actividades),
  );
  const projectMap = new Map(input.proyectos.map((p) => [p.id, p]));

  // 1. Financieras: costos directos >= 85% o sobrecosto >= 100% del monto contratado
  for (const proj of activeProjects) {
    const budget = Number(proj.monto_cotizado) || 0;
    if (budget <= 0) continue;

    const projMats = input.materiales
      .filter((m) => m.proyecto_id === proj.id)
      .reduce((sum, m) => sum + Number(m.subtotal || m.cantidad * m.precio_unitario || 0), 0);
    const projCosts = input.imprevistos
      .filter((i) => i.proyecto_id === proj.id)
      .reduce((sum, i) => sum + Number(i.monto ?? i.monto_adicional ?? 0), 0);
    const totalCost = projMats + projCosts;
    const ratio = totalCost / budget;

    if (ratio >= 1) {
      const pct = Math.round(ratio * 100);
      alerts.push({
        id: `fin-over-${proj.id}`,
        severity: 'critical',
        category: 'finanzas',
        title: `Sobrecosto en ${proj.nombre}`,
        detail: `Costos directos al ${pct}% del presupuesto contratado.`,
        href: `/proyectos/${proj.id}/finanzas`,
        projectId: proj.id,
        projectName: proj.nombre,
      });
    } else if (ratio >= 0.85) {
      const pct = Math.round(ratio * 100);
      alerts.push({
        id: `fin-warn-${proj.id}`,
        severity: 'warning',
        category: 'finanzas',
        title: `Margen ajustado en ${proj.nombre}`,
        detail: `Costos directos alcanzan el ${pct}% del monto contratado.`,
        href: `/proyectos/${proj.id}/finanzas`,
        projectId: proj.id,
        projectName: proj.nombre,
      });
    }
  }

  // 2. Reclamos, cambios y accidentes pendientes / en revisión
  for (const item of input.reclamos) {
    if (item.estado !== 'pendiente' && item.estado !== 'en_revision') continue;
    const proj = projectMap.get(item.proyecto_id);
    if (proj && proj.estado === 'cancelada') continue;
    const isCritical = item.tipo === 'accidente' || item.prioridad === 'critica';
    alerts.push({
      id: `cambio-${item.id}`,
      severity: isCritical ? 'critical' : 'warning',
      category: 'cambios',
      title: `${item.tipo === 'accidente' ? 'Accidente' : item.tipo === 'reclamo' ? 'Reclamo' : 'Cambio pendiente'}: ${item.titulo}`,
      detail: proj ? `Obra ${proj.nombre} · Prioridad ${item.prioridad}` : `Prioridad ${item.prioridad}`,
      href: `/proyectos/${item.proyecto_id}/cambios`,
      projectId: item.proyecto_id,
      projectName: proj?.nombre,
    });
  }

  // 3. Materiales urgentes faltantes para faenas próximas (7 días)
  for (const proj of openExecutionProjects) {
    const projActs = input.actividades.filter((a) => a.proyecto_id === proj.id);
    const projMats = input.materiales.filter((m) => m.proyecto_id === proj.id);
    const projLogs = input.bitacora.filter((b) => b.proyecto_id === proj.id);
    const missing = materialNeeds(projMats, projActs, projLogs, today);
    if (missing.length > 0) {
      const preview = missing
        .slice(0, 2)
        .map((m) => m.material)
        .join(', ');
      alerts.push({
        id: `mat-${proj.id}`,
        severity: 'warning',
        category: 'materiales',
        title: `${missing.length} ${missing.length === 1 ? 'material urgente' : 'materiales urgentes'} en ${proj.nombre}`,
        detail: `${preview}${missing.length > 2 ? ` y ${missing.length - 2} más` : ''} para faenas en los próximos 7 días.`,
        href: `/proyectos/${proj.id}/finanzas`,
        projectId: proj.id,
        projectName: proj.nombre,
      });
    }
  }

  // 4. Partidas Gantt vencidas (< 100% y fecha_termino < hoy)
  for (const proj of openExecutionProjects) {
    const overdue = input.actividades.filter(
      (a) =>
        a.proyecto_id === proj.id &&
        Number(a.porcentaje_avance) < 100 &&
        a.fecha_termino &&
        a.fecha_termino < today,
    );
    if (!overdue.length) continue;

    let maxOverdueDays = 0;
    for (const act of overdue) {
      try {
        maxOverdueDays = Math.max(maxOverdueDays, calendarDays(act.fecha_termino, today));
      } catch {
        // Ignorar fechas inválidas de fixtures antiguos
      }
    }

    alerts.push({
      id: `gantt-${proj.id}`,
      severity: maxOverdueDays >= 5 ? 'critical' : 'warning',
      category: 'gantt',
      title: `${overdue.length} ${overdue.length === 1 ? 'partida atrasada' : 'partidas atrasadas'} en ${proj.nombre}`,
      detail:
        overdue.length === 1
          ? `"${overdue[0].nombre}" venció hace ${maxOverdueDays} ${maxOverdueDays === 1 ? 'día' : 'días'}.`
          : `Hasta ${maxOverdueDays} días de atraso respecto al plan.`,
      href: `/proyectos/${proj.id}/gantt`,
      projectId: proj.id,
      projectName: proj.nombre,
    });
  }

  // 5. Obras activas con cuadrilla asignada y sin asistencia registrada hoy
  for (const proj of openExecutionProjects) {
    const crew = assignedCrew(proj, input.usuarios);
    if (!crew.length) continue;
    const hasToday = input.asistencias.some(
      (a) => a.proyecto_id === proj.id && a.fecha === today,
    );
    if (!hasToday) {
      alerts.push({
        id: `asist-${proj.id}`,
        severity: 'info',
        category: 'asistencia',
        title: `Sin asistencia hoy en ${proj.nombre}`,
        detail: `${crew.length} ${crew.length === 1 ? 'trabajador asignado' : 'trabajadores asignados'} sin registro para ${today}.`,
        href: `/proyectos/${proj.id}/asistencia`,
        projectId: proj.id,
        projectName: proj.nombre,
      });
    }
  }

  // 6. Hitos de Agenda para hoy o vencidos (excluye obras terminadas, canceladas o con partidas al 100%)
  for (const evt of input.agenda) {
    if (evt.completado || !evt.fecha || evt.fecha > today) continue;
    const relatedProject = evt.proyecto_id
      ? projectMap.get(evt.proyecto_id)
      : evt.proyecto_nombre
        ? input.proyectos.find(
            (p) => p.nombre.trim().toLowerCase() === evt.proyecto_nombre!.trim().toLowerCase(),
          )
        : undefined;
    if (relatedProject && isProjectCompletedOrClosed(relatedProject, input.actividades)) {
      continue;
    }
    const isOverdue = evt.fecha < today;
    alerts.push({
      id: `agenda-${evt.id}`,
      severity: isOverdue ? 'warning' : 'info',
      category: 'agenda',
      title: `${isOverdue ? 'Hito atrasado' : 'Hito para hoy'}: ${evt.titulo}`,
      detail: evt.proyecto_nombre
        ? `${evt.proyecto_nombre} · ${evt.fecha}${evt.hora ? ` ${evt.hora}` : ''}`
        : `${evt.fecha}${evt.hora ? ` ${evt.hora}` : ''}`,
      href: evt.proyecto_id ? `/proyectos/${evt.proyecto_id}/gantt` : '/dashboard#agenda-terreno',
      projectId: evt.proyecto_id,
      projectName: evt.proyecto_nombre,
    });
  }

  return alerts.sort((a, b) => {
    const sevDiff = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return CATEGORY_WEIGHT[a.category] - CATEGORY_WEIGHT[b.category];
  });
}
