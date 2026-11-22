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

export function computeOperationalAlerts(
  input: ComputeOperationalAlertsInput,
): OperationalAlert[] {
  const today = input.today || chileToday();
  const alerts: OperationalAlert[] = [];
  const activeProjects = input.proyectos.filter((p) => p.estado === 'activo');
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
  for (const proj of activeProjects) {
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
  for (const proj of activeProjects) {
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
  for (const proj of activeProjects) {
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

  // 6. Hitos de Agenda para hoy o vencidos
  for (const evt of input.agenda) {
    if (evt.completado || !evt.fecha || evt.fecha > today) continue;
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
