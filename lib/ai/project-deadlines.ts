// Fechas civiles de Chile: comparar días de calendario evita errores por hora o cambio de horario.
export function chileToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function day(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}
export function projectDeadlines(projects: any[], projectId?: string, now = new Date()) {
  const today = chileToday(now), todayTime = day(today)!;
  const open = projects.filter(p => (!projectId || p.id === projectId) && ['activo', 'pendiente', 'pausado'].includes(p.estado));
  const overdue = open.flatMap(p => {
    const due = day(p.fecha_termino_estimada);
    return due !== null && due < todayTime ? [{ id: p.id, nombre: p.nombre, estado: p.estado, fecha_termino: p.fecha_termino_estimada, dias_vencida: Math.round((todayTime - due) / 86400000) }] : [];
  }).sort((a, b) => b.dias_vencida - a.dias_vencida || a.nombre.localeCompare(b.nombre));
  return { fecha_chile: today, criterio: 'Obras abiertas con fecha de término anterior a hoy; terminadas y canceladas excluidas. Una obra que vence hoy todavía no está vencida.', obras_evaluadas: open.length, vencidas: overdue, sin_fecha_valida: open.filter(p => day(p.fecha_termino_estimada) === null).length };
}
const queryWords = new Set('hola buen buenos dia dias buenas tardes noches que cuales cuantas cuantos obras proyectos obra proyecto tengo tenemos alguna algunas algun algunos hay estan esta vencidas vencidos vencida vencido atrasadas atrasados atrasada atrasado retrasadas retrasados ya hoy actualmente son listado dame un saber mis las los el la me puedes mostrar mostrarme dime listar listame muestra muestrame por favor revisar revisa consulta consultar entrega de plazo con tenemos al a fecha'.split(' '));
export function isProjectDeadlineQuestion(message: string) {
  if (/\d/.test(message)) return false;
  const words = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.some((word, index) => word === 'por' && words[index + 1] === 'que')) return false;
  return words.length > 0 && words.length <= 35 && words.some(w => ['vencidas','vencidos','vencida','vencido','atrasadas','atrasados','atrasada','atrasado','retrasadas','retrasados'].includes(w)) && words.some(w => ['obras','proyectos','obra','proyecto'].includes(w)) && words.every(w => queryWords.has(w));
}
export function projectDeadlineAnswer(message: string, projects: any[], projectId?: string, now = new Date()) {
  if (!isProjectDeadlineQuestion(message)) return null;
  // Una pregunta por «mis obras» sigue siendo global aunque se haga dentro de una obra.
  const singular = /\b(obra|proyecto)\b/i.test(message) && !/\b(obras|proyectos)\b/i.test(message);
  const report = projectDeadlines(projects, singular ? projectId : undefined, now);
  const count = report.vencidas.length;
  const date = (value: string) => value.split('-').reverse().join('/');
  let respuesta = count ? `Tienes ${count === 1 ? '1 obra con el plazo vencido' : `${count} obras con el plazo vencido`}:\n\n` + report.vencidas.map(p => `• ${p.nombre}: entrega prevista para el ${date(p.fecha_termino)}, hace ${p.dias_vencida} ${p.dias_vencida === 1 ? 'día' : 'días'}.`).join('\n') : 'No hay obras abiertas con fecha de entrega vencida.';

  if (report.sin_fecha_valida) respuesta += ` ${report.sin_fecha_valida === 1 ? 'Hay una obra sin fecha válida de término que conviene completar.' : `Hay ${report.sin_fecha_valida} obras sin fecha válida de término que conviene completar.`}`;
  return { respuesta, accion: null, cotizacion: null, obra_propuesta: null, sugerencias: count ? ['Revisar avances de las obras vencidas'] : [] };
}
