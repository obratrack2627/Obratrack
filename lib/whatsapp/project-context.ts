import { projectMentions, conversationProjectId } from '@/lib/ai/project-reference';
export function activeWhatsAppProject(projects: any[], text: string, history: any[]) {
  const turns = history.slice(0, 4).reverse().flatMap(row => [
    { rol: 'user' as const, texto: row.texto || '' },
    { rol: 'model' as const, texto: row.respuesta || '' },
  ]);
  const inferred = conversationProjectId(projects, text, turns);
  if (inferred) return inferred;
  // No recurrir a metadatos viejos si hay una lista ambigua o antecedentes en conflicto.
  if ([text, history[0]?.respuesta || '', history[0]?.texto || ''].some(value => projectMentions(projects, value).length)) return null;
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
