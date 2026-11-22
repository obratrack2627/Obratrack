import type { AsistenciaObrero, Proyecto } from '@/types/database';

export interface MonthlyAttendanceSummaryRow {
  workerKey: string;
  trabajador: string;
  cargo: string;
  presentes: number;
  atrasos: number;
  ausentes: number;
  licenciasPermisos: number;
  totalDias: number;
  totalHoras: number;
  obras: string[];
}

export function aggregateMonthlyAttendance(
  asistencias: AsistenciaObrero[],
  proyectos: Proyecto[],
  mesYYYYMM: string,
  obraFiltro = 'todas',
): MonthlyAttendanceSummaryRow[] {
  const projectMap = new Map(proyectos.map((p) => [p.id, p.nombre]));
  const map = new Map<string, MonthlyAttendanceSummaryRow & { obraSet: Set<string> }>();

  for (const row of asistencias) {
    if (!row.fecha || !row.fecha.startsWith(mesYYYYMM)) continue;
    if (obraFiltro !== 'todas' && row.proyecto_id !== obraFiltro) continue;

    const cleanName = (row.trabajador_nombre || 'Sin nombre').trim();
    const key = row.usuario_id || cleanName.toLowerCase();
    let entry = map.get(key);
    if (!entry) {
      entry = {
        workerKey: key,
        trabajador: cleanName,
        cargo: row.trabajador_rol || 'Trabajador',
        presentes: 0,
        atrasos: 0,
        ausentes: 0,
        licenciasPermisos: 0,
        totalDias: 0,
        totalHoras: 0,
        obras: [],
        obraSet: new Set<string>(),
      };
      map.set(key, entry);
    }

    if (row.estado === 'presente') entry.presentes += 1;
    else if (row.estado === 'atraso') entry.atrasos += 1;
    else if (row.estado === 'ausente') entry.ausentes += 1;
    else if (row.estado === 'licencia' || row.estado === 'permiso') entry.licenciasPermisos += 1;

    entry.totalDias += 1;
    entry.totalHoras += Number(row.horas_trabajadas) || 0;
    const projectName = projectMap.get(row.proyecto_id) || row.proyecto_id;
    if (projectName) entry.obraSet.add(projectName);
  }

  return Array.from(map.values())
    .map(({ obraSet, totalHoras, ...rest }) => ({
      ...rest,
      totalHoras: Math.round(totalHoras * 10) / 10,
      obras: Array.from(obraSet).sort((a, b) => a.localeCompare(b, 'es')),
    }))
    .sort((a, b) => a.trabajador.localeCompare(b.trabajador, 'es'));
}
