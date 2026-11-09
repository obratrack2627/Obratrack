import type { ProjectStatus } from '@/types/database';
import { projectStatusLabel } from '@/lib/project-status';
const normal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function projectStatusCommand(message: string, projects: any[], currentId?: string | null) {
  const text = normal(message).trim();
  if (!/^(?:por favor )?(pon|ponme|coloca|marca|marcar|cambia|cambiar|actualiza|actualizar|deja|dejar|da|dar|finaliza|finalizar|termina|terminar|cierra|cerrar|pausa|pausar|cancela|cancelar|reactiva|reactivar|reabre|reabrir|quiero|necesito|puedes|podrias)\b/.test(text)) return null;
  const named = projects.filter(p => text.includes(normal(p.nombre)));
  const intent = named.reduce((value, p) => value.replaceAll(normal(p.nombre), ''), text);
  if (/\b(no|sin|antes|saber|consulta|consultar|si|borrador|partida|actividad|tarea|pago|presupuesto|monto|fecha|cliente|materiales|correo|telefono)\b/.test(intent) || /\d/.test(intent)) return null;
  const choices: [ProjectStatus, RegExp][] = [
    ['terminado', /\b(terminad[oa]|finalizad[oa]|cerrad[oa]|termina|terminar|finaliza|finalizar|cierra|cerrar)\b/],
    ['cancelada', /\b(cancelad[oa]|cancela|cancelar)\b/],
    ['pausado', /\b(pausad[oa]|pausa|pausar)\b/],
    ['pendiente', /\bpendiente\b/],
    ['activo', /\b(activ[oa]|reactiva|reactivar|reabre|reabrir)\b|\ben curso\b/],
  ];
  const states = choices.filter(([, pattern]) => pattern.test(intent));
  if (states.length !== 1) return null;
  if (!/\b(obra|proyecto)\b/.test(text) && !named.length) return null;
  const project = named.length === 1 ? named[0] : named.length > 1 ? null : projects.find(p => p.id === currentId) || (projects.length === 1 ? projects[0] : null);
  const estado = states[0][0];
  return {
    respuesta: project ? `Voy a marcar ${project.nombre} como ${projectStatusLabel(estado).toLowerCase()}.` : `¿Qué obra quieres marcar como ${projectStatusLabel(estado).toLowerCase()}? Indícame su nombre.`,
    accion: project ? { tipo: 'actualizar_proyecto', proyecto_id: project.id, estado } : null,
    cotizacion: null, sugerencias: [], obra_propuesta: null,
  };
}
