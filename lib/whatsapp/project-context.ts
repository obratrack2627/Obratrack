const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function activeWhatsAppProject(projects: any[], text: string, history: any[]) {
  const mentions = projects.filter(project => norm(text).includes(norm(project.nombre)));
  if (mentions.length === 1) return mentions[0].id as string;
  if (mentions.length > 1) return null;
  if (projects.length === 1) return projects[0].id as string;
  const previous = history[0]?.acciones?.proyecto_contexto_id;
  return projects.some(project => project.id === previous) ? previous as string : null;
}
export function workerHistory(rows: any[], projectIds: Set<string>) {
  // Un cambio de rol o de asignación nunca recupera conversaciones financieras anteriores.
  return rows.filter(row => row.acciones?.rol_actor === 'terreno' && (projectIds.has(row.acciones?.proyecto_contexto_id)
    || (!row.acciones?.proyecto_contexto_id && row.adjunto?.path && !row.adjunto.proyecto_id)));
}
export function projectContextForRole(projects: any[], role: string) {
  if (role !== 'terreno') return projects;
  const fields = ['id','nombre','estado','descripcion','direccion','comuna','region','fecha_inicio','fecha_termino_estimada','porcentaje_avance','actividades'];
  return projects.map(project => Object.fromEntries(fields.filter(field => project[field] !== undefined).map(field => [field, project[field]])));
}
