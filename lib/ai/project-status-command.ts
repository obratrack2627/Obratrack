import type { ProjectStatus } from '@/types/database';
import { projectStatusLabel } from '@/lib/project-status';
import type { ConversationTurn } from './conversation';
import { projectMentions, referenceText, type ProjectReference } from './project-reference';

const choices: [ProjectStatus, RegExp][] = [
  ['terminado', /\b(terminad[oa]|finalizad[oa]|cerrad[oa]|termina(?:la|lo|r)?|finaliza(?:la|lo|r)?|cierra(?:la|lo)?|cerrar)\b/],
  ['cancelada', /\b(cancelad[oa]|cancela(?:la|lo|r)?)\b/],
  ['pausado', /\b(pausad[oa]|pausa(?:la|lo|r)?|suspendid[oa]|suspende(?:la|lo|r)?)\b/],
  ['pendiente', /\bpendiente\b/],
  ['activo', /\b(activ[oa]|activa(?:la|lo|r)?|reactiva(?:la|lo|r)?|reabre(?:la|lo)?|reabrir|reanuda(?:la|lo|r)?)\b|\ben curso\b/],
];
const mutation = /\b(pon(?:la|lo|me)?|poner(?:la|lo)?|pongas|coloca(?:la|lo|r)?|coloques|marca(?:la|lo|r)?|marques|cambia(?:la|lo|r)?|cambies|actualiza(?:la|lo|r)?|actualices|deja(?:la|lo|r)?|dejes|da(?:la|lo)?|dar|quede|quedar|termina(?:la|lo|r)?|finaliza(?:la|lo|r)?|cierra(?:la|lo)?|cerrar|pausa(?:la|lo|r)?|cancela(?:la|lo|r)?|activa(?:la|lo|r)?|suspende(?:la|lo|r)?|reactiva(?:la|lo|r)?|reabre(?:la|lo)?|reabrir|reanuda(?:la|lo|r)?)\b/;
const otherTask = /\b(no|sin|antes|saber|ver|consulta|consultar|preguntar|cuando|explica|explicar|si|borrador|partida|actividad|tarea|pago|presupuesto|monto|fecha|cliente|materiales|correo|telefono|gasto|documento|solicitud)\b/;
const commandWords = new Set('por favor hola quiero necesito puedes podrias que la lo le me el a al esa ese esta este misma mismo obra proyecto estado como en de por quede quedar quedes y dar da'.split(' '));

function parseStatus(message: string, projects: ProjectReference[]) {
  const text = referenceText(message);
  const named = projectMentions(projects, message);
  let intent = ` ${text} `;
  for (const project of named) intent = intent.replaceAll(` ${referenceText(project.nombre)} `, ' ');
  if (otherTask.test(intent) || /\d/.test(intent)) return null;
  const first = text.split(' ')[0];
  if (!['por', 'hola', 'quiero', 'necesito', 'puedes', 'podrias', 'la', 'lo', 'le', 'que'].includes(first) && !mutation.test(first)) return null;
  if (!mutation.test(intent)) return null;
  const states = choices.filter(([, pattern]) => pattern.test(intent));
  if (states.length !== 1) return null;
  const implicit = /\b(la|lo|le|esa|ese|esta|este|misma|mismo)\b/.test(intent) || /\b(?:pon|marca|deja|da|cancela|pausa|activa|reactiva|reabre|reanuda|suspende|termina|finaliza|cierra)(?:la|lo)\b/.test(intent);
  const subject = named.length > 0 || /\b(obra|proyecto)\b/.test(intent) || implicit;
  if (!subject) return null;
  const remainder = intent.replace(mutation, ' ').replace(states[0][1], ' ').split(' ').filter(Boolean);
  const unknownSubject = remainder.some(word => !commandWords.has(word));
  return { estado: states[0][0], named, unknownSubject };
}

function resultFor(projects: ProjectReference[], estado: ProjectStatus, project?: ProjectReference) {
  const label = projectStatusLabel(estado).toLowerCase();
  const same = project?.estado === estado;
  return {
    respuesta: project ? same ? `${project.nombre} ya figura como ${label}.` : `Voy a marcar ${project.nombre} como ${label}.` : `¿Qué obra quieres marcar como ${label}? Indícame su nombre.`,
    accion: project && !same ? { tipo: 'actualizar_proyecto' as const, proyecto_id: project.id, estado } : null,
    cotizacion: null, sugerencias: project ? [] : projects.slice(0, 5).map(item => item.nombre), obra_propuesta: null,
  };
}

// Solo completa la aclaración inmediatamente anterior. Un nombre por sí solo
// nunca repite una orden antigua ni autoriza una acción después de cambiar de tema.
export function projectStatusCommand(message: string, projects: ProjectReference[], currentId?: string | null, history: ConversationTurn[] = []) {
  const parsed = parseStatus(message, projects);
  if (parsed) {
    const project = parsed.named.length === 1 ? parsed.named[0] : parsed.named.length > 1 || parsed.unknownSubject ? undefined : projects.find(item => item.id === currentId) || (projects.length === 1 ? projects[0] : undefined);
    return resultFor(projects, parsed.estado, project);
  }
  const last = history.at(-1), previous = history.at(-2);
  if (last?.rol !== 'model' || previous?.rol !== 'user') return null;
  const pending = parseStatus(previous.texto, projects);
  if (!pending || !last.texto.startsWith(`¿Qué obra quieres marcar como ${projectStatusLabel(pending.estado).toLowerCase()}?`)) return null;
  const selected = projects.filter(project => [referenceText(project.nombre), `la obra ${referenceText(project.nombre)}`, `el proyecto ${referenceText(project.nombre)}`].includes(referenceText(message)));
  if (!selected.length) return null;
  return resultFor(projects, pending.estado, selected.length === 1 ? selected[0] : undefined);
}
