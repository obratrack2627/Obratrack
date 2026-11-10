import type { ConversationTurn } from './conversation';

export interface ProjectReference { id: string; nombre: string; estado?: string }
export const referenceText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(' ');

// Coincidir por palabras evita confundir «Río» con «Frío». Una mención de
// «Radier Norte» no implica también «Radier», salvo que aparezca por separado.
export function projectMentions<T extends ProjectReference>(projects: T[], message: string): T[] {
  const text = ` ${referenceText(message)} `;
  const hits = projects.flatMap(project => {
    const name = referenceText(project.nombre);
    if (!name) return [];
    const needle = ` ${name} `;
    const spans: { project: T; start: number; end: number }[] = [];
    let start = text.indexOf(needle);
    while (start !== -1) {
      spans.push({ project, start, end: start + needle.length });
      start = text.indexOf(needle, start + 1);
    }
    return spans;
  });
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const found = new Set<string>();
  let coveringStart = -1, coveringEnd = -1;
  for (const hit of hits) {
    if (hit.end > coveringEnd) { coveringStart = hit.start; coveringEnd = hit.end; found.add(hit.project.id); }
    else if (hit.start === coveringStart && hit.end === coveringEnd) found.add(hit.project.id);
  }
  if (!found.size) {
    const baseMatches = projects.filter(project => {
      if (!/[—–]/.test(project.nombre)) return false;
      const base = referenceText(project.nombre.split(/\s*[—–]\s*/)[0] || '');
      return base.split(' ').filter(Boolean).length >= 2 && text.includes(` ${base} `);
    });
    if (baseMatches.length === 1) found.add(baseMatches[0].id);
  }
  return projects.filter(project => found.has(project.id));
}

export function conversationProjectId(projects: ProjectReference[], message: string, history: ConversationTurn[], selectedId?: string | null): string | undefined {
  const mentioned = projectMentions(projects, message);
  if (mentioned.length) return mentioned.length === 1 ? mentioned[0].id : undefined;
  if (selectedId && projects.some(project => project.id === selectedId)) return selectedId;
  const lastModel = history.findLast(turn => turn.rol === 'model');
  const replyMentions = projectMentions(projects, lastModel?.texto || '');
  const lastUser = history.findLast(turn => turn.rol === 'user');
  const userMentions = projectMentions(projects, lastUser?.texto || '');
  if (replyMentions.length > 1 || userMentions.length > 1) return undefined;
  if (replyMentions.length && userMentions.length && replyMentions[0].id !== userMentions[0].id) return undefined;
  if (replyMentions.length) return replyMentions[0].id;
  if (userMentions.length) return userMentions[0].id;
  // Recuperar el antecedente que el antiguo error genérico ocultó no repite la
  // orden: la acción sigue requiriendo una instrucción nueva del usuario.
  if (lastModel && referenceText(lastModel.texto).startsWith('indica que dato de la obra quieres actualizar') && history.length > 2) {
    return conversationProjectId(projects, message, history.slice(-8, -2));
  }
  return projects.length === 1 ? projects[0].id : undefined;
}
