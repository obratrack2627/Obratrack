import { resolveEntity } from './actions';
import { projectMentions } from './project-reference';

export type TeamAssignmentDraft = {
  nombres: string[];
  proyecto_id?: string;
  rol?: 'terreno' | 'supervisor';
};
const norm = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const command = /^(?:por favor[, ]+)?(?:(?:quiero|necesito|puedes)\s+)?(?:asigna(?:r|le|los|las|lo|la)?|agrega(?:r)?|añade|añadir|anade|anadir|incorpora(?:r)?)\s+(?:(?:a|al|el|la|los|las|un|una)\s+)*/i;
const personPrefix = /^(?:(?:a|al|el|la|los|las|un|una)\s+)*(?:(?:trabajador(?:es)?|maestr[oa]s?|supervisor(?:es|a|as)?|jef[ea]s?\s+de\s+obra)\s+)?/i;
export function isCompoundTeamInstruction(message: string) {
  const mixedRoles = /\b(?:trabajador(?:es)?|maestr[oa]s?)\b/i.test(message) && /\b(?:jef[ea]s? de obra|supervisor(?:es|a|as)?)\b/i.test(message);
  return command.test(message.trim()) && (mixedRoles || /(?:[;\n]\s*|\by\s+)(?:registra|crea|cambia|actualiza|asigna|agrega|añade|envia|envía|marca|cotiza|pausa|elimina)\b/i.test(message));
}
// Keep the project complement out of the person's name, including old broken drafts.
export function assignmentPersonName(text: string) {
  return text.replace(personPrefix, '').split(/\s+(?:a|al|en|para)\s+(?:(?:la|el|esta|este|esa|ese|misma|mismo)\s+)*(?:obra|proyecto)\b/i)[0].trim().replace(/[.!]+$/, '');
}

export function readTeamAssignment(value: any): TeamAssignmentDraft | undefined {
  if (!value || !Array.isArray(value.nombres) || value.nombres.length > 30 || value.nombres.some((name: any) => typeof name !== 'string' || !name.trim() || name.length > 200)) return;
  return {
    nombres: value.nombres.map((name: string) => name.trim()),
    ...(typeof value.proyecto_id === 'string' && value.proyecto_id.length <= 200 ? { proyecto_id: value.proyecto_id } : {}),
    ...(['terreno', 'supervisor'].includes(value.rol) ? { rol: value.rol } : {}),
  };
}

const projectComplement = /\s+(?:a|al|en|para)\s+(?:(?:la|el|esta|este|esa|ese|misma|mismo)\s+)*(?:obra|proyecto)\b/i;
const projectReply = /^(?:(?:la|el)\s+)?(?:obra|proyecto)\s+/i;
const correctionReply = /^(?:ya existe|ya esta (?:registrado|registrada)|(?:el trabajador|el supervisor|la persona) ya existe)(?:[,. ]+.*)?$/;
const choiceReply = /^(?:si|si quiero|si por favor|quiero|trabajador(?:es)?|jef[ea]s? de obra|supervisores?|ambos|a ambos)$/;
const cleanRut = (value: string) => value.replace(/^rut\s*[:=]?\s*/i, '').replace(/[.\s-]/g, '').toUpperCase();

function assignmentNames(text: string, starts: boolean, correction: boolean, projects: any[], pending?: TeamAssignmentDraft, previousName?: string) {
  if (correction) return previousName ? [assignmentPersonName(previousName)] : pending?.nombres || [];
  if (!starts && pending) {
    if (choiceReply.test(norm(text))) return pending.nombres;
    if (pending.nombres.length && (projectReply.test(text) || projectMentions(projects, text).length || projects.some(project => project.id === text))) return pending.nombres;
  }
  const body = starts ? text.replace(command, '') : text;
  const names = assignmentPersonName(body).split(/\s+y\s+|\s*[,;\n]\s*/i).map(assignmentPersonName).filter(Boolean);
  return names.filter(name => !/^(?:trabajador(?:es)?|jefes? de obra|supervisores?)$/i.test(name));
}

function resolveTeamMember(users: any[], ident: string) {
  const rutMatches = users.filter(user => user.rut && cleanRut(user.rut) === cleanRut(ident));
  if (rutMatches.length === 1) return rutMatches[0];
  return resolveEntity(users, ident);
}

type TeamMatch = { name: string; user: any; error: string };
function matchTeam(users: any[], names: string[]): TeamMatch[] {
  return names.map(name => {
    try { return { name, user: resolveTeamMember(users, name), error: '' }; }
    catch (error) { return { name, user: null, error: (error as Error).message }; }
  });
}

function matchQuestion(matches: TeamMatch[], role?: string) {
  const unknown = matches.find(match => !match.user);
  if (unknown) return unknown.error.startsWith('Hay más')
    ? `${unknown.error} También puedes indicar su RUT para distinguir las fichas.`
    : `No encontré a ${unknown.name} en el equipo de tu empresa. Revisa su nombre; si es una persona nueva, pide «registra un nuevo trabajador» e indica sus datos.`;
  const wrongRole = role && matches.find(match => match.user.rol !== role);
  if (wrongRole) return `${wrongRole.user.nombre} no figura como jefe de obra. Indica un supervisor del equipo; asignar una obra no cambia el rol de una persona.`;
  return null;
}

function assignmentProject(text: string, projects: any[], currentId?: string) {
  const mentions = projectMentions(projects, text);
  if (mentions.length > 1) throw new Error('Mencionaste más de una obra. Indica a cuál quieres asignar estas personas.');
  const suffix = text.match(projectComplement);
  let explicitName = suffix ? text.slice(suffix.index! + suffix[0].length).trim().replace(/[.!]+$/, '') : '';
  if (projectReply.test(text)) explicitName = text.replace(projectReply, '');
  if (projects.some(project => project.id === text)) explicitName = text;
  return resolveEntity(projects, explicitName || mentions[0]?.id, currentId);
}

function acceptsTeamReply(text: string, plain: string, projects: any[], users: any[]) {
  const identifier = [...projects, ...users].some(row => row.id === text) || users.some(user => user.rut && cleanRut(user.rut) === cleanRut(text));
  if (identifier) return true;
  return /^[\p{L}\p{M}'’., -]+$/u.test(text) && !/\b(?:que|cual|cuanto|como|cuando|dime|muestra|lista|consulta|pago|saldo|avance|cotiza|busca|gracias|registra|registrar|crea|crear|nuevo|nueva|cambia|actualiza|termina|pausa|elimina|envia|marca|saber|revisa)\b/.test(plain);
}

function needsRegistrationOrAgent(text: string, plain: string, starts: boolean) {
  return isCompoundTeamInstruction(text) || starts && (
    /\b(?:nuevo|nueva)\s+(?:trabajador|maestro|supervisor|jefe|jefa)\b/.test(plain)
    || /@|\b(?:rut|correo|telefono)\b/.test(plain)
  );
}

/** Only a single, explicit team instruction is handled here. Compound tasks stay with the agent. */
export function teamAssignmentIntake(
  message: string, projects: any[], users: any[], selectedId?: string,
  pending?: TeamAssignmentDraft, previousName?: string,
) {
  const text = message.trim(), plain = norm(text).replace(/[.!]+$/, '');
  const starts = command.test(text), correction = correctionReply.test(plain);
  if (needsRegistrationOrAgent(text, plain, starts)) return null;
  if (!starts && !correction && !pending) return null;
  if (pending && /^(?:no|ahora no|por ahora no|mas tarde|despues|cancelar?|olvida(?:r)?)(?: la asignacion| eso)?$/.test(plain))
    return { actions: [], draft: null, question: 'De acuerdo. No añadí personas a la obra.' };
  if (!starts && !correction && !acceptsTeamReply(text, plain, projects, users)) return null;
  const names = assignmentNames(text, starts, correction, projects, pending, previousName);
  const matches = matchTeam(users, names);
  const explicit = /^(?:(?:quiero|necesito|puedes|por favor)\s+)?asigna/.test(plain) || projectComplement.test(text);
  // Adding an unknown person without an assignment request remains the registration flow.
  if (!pending && !correction && !explicit && !matches.some(match => match.user)) return null;
  const role = /\b(?:jef[ea]s? de obra|supervisor(?:es|a|as)?)\b/.test(plain) ? 'supervisor' : pending?.rol;
  const draft: TeamAssignmentDraft = { ...pending, nombres: names, ...(role ? { rol: role } : {}) };
  const ask = (question: string) => ({ actions: [], draft, question });
  if (!names.length) return ask('¿A quiénes quieres añadir? Indica los nombres de los trabajadores o jefes de obra que ya están en tu equipo.');
  const question = matchQuestion(matches, role);
  if (question) return ask(question);
  try {
    const project = assignmentProject(text, projects, draft.proyecto_id || selectedId);
    return {
      actions: [...new Set(matches.map(match => match.user.id))].map(id => ({ tipo: 'asignar_trabajador', proyecto_id: project.id, trabajador_nombre: id })),
      draft: null,
      question: null,
    };
  } catch (error) { return ask((error as Error).message); }
}

/** Only an executed creation result can start the optional team follow-up. */
export function createdProjectTeamDraft(result: any): TeamAssignmentDraft | undefined {
  const results = result?.tipo === 'lote_acciones' ? result.detalles?.acciones || [] : [result];
  const creations = results.filter((item: any) => item?.tipo === 'crear_proyecto' && item.detalles?.id);
  if (creations.length === 1) return { nombres: [], proyecto_id: creations[0].detalles.id };
}

export const TEAM_FOLLOW_UP = '¿Quieres añadir trabajadores o jefes de obra a esta obra? Indica sus nombres o responde «ahora no».';
