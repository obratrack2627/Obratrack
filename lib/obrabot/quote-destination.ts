import { quoteSessionMs } from '@/lib/whatsapp/quote-context';
import { requestsQuotedProject } from '@/lib/whatsapp/quote-intake';
import { recallsContact } from '@/lib/whatsapp/conversation-progress';
import { askPhone, phoneChoices, clientInputLines } from '@/lib/whatsapp/client-input';
import { canonicalPhone } from '@/lib/phone';
import { AIError } from '@/lib/ai/errors';
import { completeRows } from '@/lib/supabase/pagination';
import type { Actor, Channel, QuoteReply } from './quotes';

export type LinkMode = 'principal' | 'adjuntar' | 'reemplazar' | 'adicional';
export type QuoteDestination = {
  proyecto_id: string;
  obra: string;
  modo: 'crear' | LinkMode;
  monto_anterior: number;
  monto_nuevo: number;
  monto_cotizacion: number;
  equipo: string[];
  equipo_pendiente: string[];
  ya_vinculada?: true;
};
export type LinkPreview = {
  proyecto_id: string;
  obra: string;
  version: string;
  cabecera: string | null;
  monto_cotizacion: number;
  monto_anterior: number;
  tiene_presupuesto: boolean;
  monto_reemplazo: number | null;
  monto_adicional: number;
};
export type CreateFields = { nombre?: string; direccion?: string; cliente?: string; telefono?: string; correo?: string; equipo?: string[] };
const quoteUuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
export const validQuoteId = (id: string) => new RegExp(`^${quoteUuid}$`, 'i').test(id);
export const isLinkMode = (mode: string): mode is LinkMode => ['principal', 'adjuntar', 'reemplazar', 'adicional'].includes(mode);
const money = (amount: number) => `$${amount.toLocaleString('es-CL')}`;

const destinationErrors: Record<string, [number, string]> = {
  OBRABOT_FORBIDDEN: [403, 'Para crear o vincular una obra en ObraBot debes ser administrador y tener el plan Pro IA.'],
  OBRABOT_NOT_FOUND: [404, 'No encontré esa cotización en tu empresa.'],
  OBRABOT_NOT_APPROVED: [409, 'Aprueba la cotización antes de usarla en una obra.'],
  OBRABOT_ALREADY_LINKED: [409, 'Esta cotización ya está vinculada a una obra.'],
  OBRABOT_DESTINATION_LOCKED: [409, 'La cotización aprobada ya tiene cambios o vínculos en Presupuestos. Revisa su registro.'],
  OBRABOT_PROJECT_MISSING: [404, 'No encontré esa obra en tu empresa.'],
  OBRABOT_PROJECT_CLOSED: [409, 'La obra está cancelada. Elige otra obra.'],
  OBRABOT_DESTINATION_STALE: [409, 'La obra cambió desde la vista previa. Revísala de nuevo antes de confirmar.'],
  OBRABOT_DESTINATION_CHOICE: [422, 'Elige una de las opciones que corresponde al presupuesto actual de la obra.'],
  OBRABOT_AMOUNT_INVALID: [422, 'El monto queda fuera del rango permitido o no coincide con los adicionales registrados. Revisa el presupuesto de la obra.'],
  OBRABOT_PROJECT_REQUIRED: [422, 'Indica el nombre de la obra, su dirección y el cliente.'],
  OBRABOT_CLIENT_AMBIGUOUS: [422, 'Hay más de un cliente con ese nombre. Selecciona el cliente exacto en la bandeja web o envía su código.'],
  OBRABOT_CLIENT_REQUIRED: [422, 'Para registrar un cliente nuevo, indica su teléfono y correo electrónico válidos.'],
  OBRABOT_CLIENT_CONTACT_EXISTS: [422, 'Ese teléfono o correo ya está registrado. Indica el nombre o código del cliente existente.'],
  OBRABOT_TEAM_INVALID: [422, 'Indica hasta 20 nombres o códigos de integrantes.'],
  OBRABOT_DESTINATION_INVALID: [422, 'Revisa la acción y los datos de la cotización.'],
};

function failed(error?: { message?: string } | null): never {
  const code = error?.message ?? '';
  const match = destinationErrors[code];
  if (match) throw new AIError(code, match[1], match[0]);
  throw new AIError('OBRABOT_DESTINATION_DB', 'No pude confirmar el vínculo de la cotización. Intenta nuevamente.', 503);
}

export async function quoteDestination(
  db: any, actor: Actor, channel: Channel, id: string, mode: 'estado' | 'vista' | 'crear' | LinkMode,
  fields: CreateFields | { proyecto: string; version?: string; cabecera?: string | null } = {},
) {
  if (actor.rol !== 'admin') failed({ message: 'OBRABOT_FORBIDDEN' });
  if (!validQuoteId(id)) failed({ message: 'OBRABOT_NOT_FOUND' });
  const { data, error } = await db.rpc('obrabot_destinar_cotizacion', {
    p_empresa: actor.empresa_id, p_actor: actor.id, p_canal: channel, p_id: id, p_modo: mode, p_datos: fields,
  });
  if (error || !data) failed(error);
  return data as QuoteDestination | LinkPreview | { cotizacion: string; monto_cotizacion: number };
}

function teamReply(team: Pick<QuoteDestination, 'equipo' | 'equipo_pendiente'>) {
  return [
    team.equipo.length ? `Equipo asignado: ${team.equipo.join(', ')}.` : '',
    team.equipo_pendiente.length ? `Por aclarar: ${team.equipo_pendiente.join(', ')}. Envía su nombre completo o código.` : '',
  ].filter(Boolean);
}

function destinationReply(result: QuoteDestination, teamRequested = false) {
  const summary = result.ya_vinculada ? `La cotización ya está vinculada a *${result.obra}*.` :
    result.modo === 'crear' ? `Creé la obra *${result.obra}* con esta cotización como presupuesto principal. La obra quedó pendiente de programar.` :
    result.modo === 'adjuntar' ? `Adjunté la cotización a *${result.obra}*. Su presupuesto sigue en ${money(result.monto_nuevo)}.` :
    result.modo === 'principal' ? `Dejé la cotización como presupuesto principal de *${result.obra}*.` :
    result.modo === 'reemplazar' ? `Reemplacé el presupuesto principal de *${result.obra}* y guardé el anterior en el historial.` :
    `Sumé la cotización como adicional a *${result.obra}*.`;
  return [
    summary,
    !result.ya_vinculada && result.modo !== 'adjuntar' ? `Presupuesto de la obra: *${money(result.monto_nuevo)}* (IVA incluido).` : '',
    ...(!result.ya_vinculada && result.modo === 'crear' ? teamReply(result) : []),
    !result.ya_vinculada && result.modo === 'crear' && !teamRequested
      ? '¿Quieres asignar trabajadores o un jefe de obra? Escribe «Equipo: Nombre Apellido».' : '',
  ].filter(Boolean).join('\n');
}

type Session =
  | { paso: 'opciones'; id: string }
  | { paso: 'crear'; id: string; datos: CreateFields; telefonos?: string[] }
  | { paso: 'vincular'; id: string }
  | { paso: 'confirmar'; id: string; vista: LinkPreview }
  | { paso: 'equipo'; proyecto: string };

async function loadSession(db: any, actor: Actor, channel: Channel) {
  const { data, error } = await db.from('obrabot_destino_conversacion').select('estado,actualizado_at')
    .eq('empresa_id', actor.empresa_id).eq('actor_id', actor.id).eq('canal', channel).maybeSingle();
  if (error) failed(error);
  if (!data) return null;
  if (Date.now() - Date.parse(data.actualizado_at) <= quoteSessionMs) return data.estado as Session;
  return null;
}

async function saveSession(db: any, actor: Actor, channel: Channel, state: Session | null) {
  const result = state ? await db.from('obrabot_destino_conversacion').upsert({
    empresa_id: actor.empresa_id, actor_id: actor.id, canal: channel, estado: state, actualizado_at: new Date().toISOString(),
  }) : await db.from('obrabot_destino_conversacion').delete().eq('empresa_id', actor.empresa_id).eq('actor_id', actor.id).eq('canal', channel);
  if (result.error) failed(result.error);
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export async function rememberQuoteDestination(db: any, actor: Actor, channel: Channel, id: string) {
  await saveSession(db, actor, channel, { paso: 'opciones', id });
}

const startCreate = /^(?:(?:quiero|necesito|por favor) )?(?:crea(?:r|me)?|convierte|convertir) (?:(?:una|la) )?obra (?:a partir de|con|desde) (?:(?:esta|esa|la|una) )?cotizacion\b/;
const startLink = /^(?:(?:quiero|necesito|por favor) )?(?:vincula(?:r)?|adjunta(?:r)?|asigna(?:r)?) (?:(?:esta|esa|la|una) )?cotizacion(?: [a-f0-9-]{36})?(?: a (?:(?:una|la|esta|esa) )?obra\b|$)/;
const askOptions = /^(?:usa(?:r)?|que hago con|que puedo hacer con) (?:(?:esta|esa|la) )?cotizacion\b/;
const field = /^(nombre(?: de la obra)?|direccion|cliente(?: existente)?|telefono|correo(?: electronico)?|email|equipo|obra) ?:/;
const projectReference = /^(?:a )?(?:la )?obra (.+)$/i;
const assignment = /^(?:asigna(?:r)?|a[nñ]ade|agrega|incorpora) (?:(?:a|al|la|el) )?(?:(?:trabajador(?:a|es)?|jefe(?:s)? de obra|supervisor(?:a|es)?) )?(.+)$/i;
const yes = /^(?:si|si por favor|si hazlo|dale|ok)$/;
const cancel = /^(?:cancelar|cancela|no gracias|no)$/;

function withoutEndPunctuation(text: string) {
  let end = text.length;
  while (end > 0 && '.!?'.includes(text[end - 1])) end--;
  return text.slice(0, end).trimEnd();
}

function commandText(text: string) {
  return withoutEndPunctuation(fold(text.trimStart().split(/\r?\n/, 1)[0]).replace(/\s+/g, ' '));
}

function conversationalMode(text: string) {
  const clean = commandText(text);
  if (startCreate.test(clean) || requestsQuotedProject(clean)) return 'crear';
  if (startLink.test(clean)) return 'vincular';
  if (askOptions.test(clean)) return 'opciones';
  return null;
}

export function isDestinationCommand(text: string) {
  return conversationalMode(text) !== null;
}

const emailAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isBarePhone = (value: string) => /^\+?[\d ()-]+$/.test(value) && !!canonicalPhone(value);

export function isDestinationContinuation(text: string) {
  const clean = commandText(text);
  const firstField = clientInputLines(text)[0] || '';
  return recallsContact(clean) || /^(?:retom(?:a|ar|emos)|continu(?:a|ar|emos))$/.test(clean) || field.test(fold(firstField)) || isBarePhone(firstField) || emailAddress.test(firstField) || projectReference.test(clean) || !!parseLinkChoice(clean) || yes.test(clean) || cancel.test(clean) ||
    /^(?:crear (?:una |la )?obra|vincular a (?:una |la )?obra|asignar equipo)$/.test(clean) || assignment.test(clean);
}

function parseLinkChoice(text: string): LinkMode | null {
  const choice = text.replace(/^(?:confirmo?|elige|aplica)\s+/, '');
  if (/^(?:principal|presupuesto principal|como principal)$/.test(choice)) return 'principal';
  if (/^(?:adjuntar|adjunta|solo adjuntar|solo adjunta)$/.test(choice)) return 'adjuntar';
  if (/^(?:reemplazar|reemplaza)(?: el (?:presupuesto )?principal)?$/.test(choice)) return 'reemplazar';
  if (/^(?:adicional|sumar|suma)(?: como adicional)?$/.test(choice)) return 'adicional';
  return null;
}

const splitTeam = (s: string) => s.replace(/\s+/g, ' ').split(/[,;]| y /i).map(item => withoutEndPunctuation(item.trim())).filter(Boolean);

function fieldsFrom(lines: string[]): CreateFields {
  const result: CreateFields = {};
  for (const line of clientInputLines(lines.join('\n'))) {
    const colon = line.indexOf(':');
    if (colon < 0) {
      if (emailAddress.test(line)) result.correo = line;
      if (isBarePhone(line)) result.telefono = line;
      continue;
    }
    const label = fold(line.slice(0, colon)).split(/\s+/)[0];
    const value = line.slice(colon + 1).trim();
    if (!value) continue;
    if (label === 'equipo') result.equipo = splitTeam(value);
    if (label === 'email') result.correo = value;
    if (label === 'nombre' || label === 'direccion' || label === 'cliente' || label === 'telefono' || label === 'correo') result[label] = value;
  }
  return result;
}

async function findProject(db: any, actor: Actor, reference: string) {
  const result = await completeRows(() => db.from('proyectos').select('id,nombre').eq('empresa_id', actor.empresa_id).neq('estado', 'cancelada'));
  if (result.error) failed(result.error);
  return (result.data || []).filter((row: { id: string; nombre: string }) => row.id === reference || fold(row.nombre).replace(/\s+/g, ' ') === fold(reference).replace(/\s+/g, ' ')) as { id: string; nombre: string }[];
}

function previewText(vista: LinkPreview) {
  const header = `*${vista.obra}*\nCotización aprobada: ${money(vista.monto_cotizacion)} con IVA.`;
  if (!vista.tiene_presupuesto) return `${header}\nEscribe «Confirmo principal» para usarla como presupuesto principal.`;
  return [
    header,
    `Presupuesto actual: ${money(vista.monto_anterior)}.`,
    `• *Adjuntar* · mantiene ${money(vista.monto_anterior)}.`,
    vista.monto_reemplazo === null ? '' : `• *Reemplazar* · el nuevo total sería ${money(vista.monto_reemplazo)}, manteniendo los adicionales.`,
    `• *Adicional* · el nuevo total sería ${money(vista.monto_adicional)}.`,
    'Responde con la opción que quieres aplicar.',
  ].filter(Boolean).join('\n');
}

const chooseDestination = '¿Quieres crear una obra con esta cotización o vincularla a una obra existente? Responde «Crear obra» o «Vincular a obra».';
function createHelp(datos: CreateFields) {
  const missing = [!datos.direccion && 'la dirección', !datos.cliente && 'el cliente'].filter(Boolean).join(' y ');
  return `Para crear la obra, indica ${missing}.\n` + [
    !datos.direccion && 'Dirección: calle, número y comuna.',
    !datos.cliente && 'Cliente: nombre o razón social. Si ya está registrado, usaré su ficha. Si es nuevo, agrega su teléfono y correo para registrarlo.',
  ].filter(Boolean).join('\n');
}

export async function handleDestinationTurn(db: any, actor: Actor, channel: Channel, message: string, quotedId?: string | null): Promise<QuoteReply | null> {
  const start = conversationalMode(message);
  if (!start && (actor.rol !== 'admin' || !isDestinationContinuation(message))) return null;
  if (actor.rol !== 'admin') {
    if (!start || !new RegExp(quoteUuid, 'i').test(message)) return null;
    failed({ message: 'OBRABOT_FORBIDDEN' });
  }
  const [firstLine, ...lines] = message.trim().split(/\r?\n/);
  const first = firstLine.replace(/\s+/g, ' ');
  const clean = commandText(first);
  let state = await loadSession(db, actor, channel);
  if (!start && state?.paso !== 'crear' && (emailAddress.test(first) || isBarePhone(first))) return null;
  const previous = state;
  if (start) {
    const explicitId = first.match(new RegExp(`cotizaci[oó]n\\s+(${quoteUuid})\\b`, 'i'))?.[1].toLowerCase();
    const id = explicitId || (quotedId === undefined ? (state && 'id' in state ? state.id : undefined) : quotedId);
    if (!id) return null;
    if (state?.paso === 'crear' && start === 'crear' && state.id !== id && Object.keys(state.datos).length) {
      return { respuesta: 'Tienes una obra en preparación con otra cotización. Puedes completarla o escribir «Cancelar» antes de elegir la nueva cotización.' };
    }
    if (state?.paso === 'crear' && state.id === id && start === 'crear') {
      state = { ...state };
    } else {
      state = start === 'crear' ? { paso: 'crear', id, datos: {} } : { paso: start, id };
    }
    const available = await quoteDestination(db, actor, channel, id, 'estado');
    if ('modo' in available) return { respuesta: destinationReply(available), obra: available.proyecto_id };
  }
  if (!state) return null;
  if (!start && cancel.test(clean)) {
    await saveSession(db, actor, channel, null);
    return { respuesta: 'Cerré esta gestión de la cotización.' };
  }
  if (state.paso === 'opciones' && !start) {
    if (/^crear (?:una |la )?obra$/.test(clean)) state = { paso: 'crear', id: state.id, datos: {} };
    if (/^vincular a (?:una |la )?obra$/.test(clean)) state = { paso: 'vincular', id: state.id };
    if (state.paso === 'opciones' && !yes.test(clean)) return null;
  }
  if (state.paso === 'opciones') {
    if (start) await saveSession(db, actor, channel, state);
    return { respuesta: chooseDestination };
  }
  if (state.paso === 'crear') {
    const params = fieldsFrom(start ? lines : [first, ...lines]);
    if (!start && state === previous && !Object.keys(params).length && !recallsContact(message) && !/^(?:retomar|retoma|retomemos|continua|continuar|continuemos)$/.test(clean)) return null;
    const datos = { ...state.datos, ...params };
    if (params.cliente && state.datos.cliente && fold(params.cliente) !== fold(state.datos.cliente)) {
      datos.telefono = params.telefono;
      datos.correo = params.correo;
    }
    const phones = phoneChoices(message, params.cliente && state.datos.cliente !== params.cliente ? [] : state.telefonos);
    const waiting = async (question: string) => {
      await saveSession(db, actor, channel, { ...state, paso: 'crear', id: state.id, datos, telefonos: phones.options });
      const pasoPendiente = channel === 'whatsapp'
        ? { id: state.id, datos: { ...datos, telefonos: phones.options } }
        : undefined;
      return { respuesta: question, pasoPendiente };
    };
    if (phones.options.length > 1) {
      delete datos.telefono;
      return waiting(askPhone(phones.options));
    }
    if (!datos.direccion || !datos.cliente) {
      return waiting(createHelp(datos));
    }
    try {
      const output = await quoteDestination(db, actor, channel, state.id, 'crear', datos) as QuoteDestination;
      await saveSession(db, actor, channel, !datos.equipo?.length || output.equipo_pendiente.length
        ? { paso: 'equipo', proyecto: output.proyecto_id } : null);
      return { respuesta: destinationReply(output, !!datos.equipo?.length), obra: output.proyecto_id };
    } catch (error) {
      if (!(error instanceof AIError) || !['OBRABOT_CLIENT_REQUIRED', 'OBRABOT_CLIENT_AMBIGUOUS', 'OBRABOT_CLIENT_CONTACT_EXISTS'].includes(error.code)) throw error;
      if (error.code !== 'OBRABOT_CLIENT_REQUIRED') return waiting(error.message);
      const missing = [
        !canonicalPhone(datos.telefono || '') && 'Teléfono: número de contacto',
        !emailAddress.test(datos.correo || '') && 'Correo: correo electrónico del cliente',
      ].filter(Boolean);
      return waiting(missing.length
        ? `Para registrar a ${datos.cliente} como cliente nuevo, falta:\n${missing.join('\n')}`
        : error.message);
    }
  }
  if (state.paso === 'vincular' || state.paso === 'confirmar') {
    const projectLine = (start ? lines : [first, ...lines]).find(line => /^obra\s*:/.test(fold(line)));
    const marker = start === 'vincular' ? /\ba (?:la |esta |esa |una )?obra\b/i.exec(first) : null;
    const inline = marker ? first.slice(marker.index + marker[0].length).trim().replace(/^:/, '') : '';
    const reference = withoutEndPunctuation((projectLine?.slice(projectLine.indexOf(':') + 1) || inline || first.match(projectReference)?.[1] || '').trim());
    if (reference) {
      const matches = await findProject(db, actor, reference);
      if (matches.length !== 1) {
        await saveSession(db, actor, channel, { paso: 'vincular', id: state.id });
        return { respuesta: matches.length ? `Hay varias obras con ese nombre. Responde «Obra: código» usando una de estas opciones.\n${matches.slice(0, 8).map(row => `• ${row.nombre} · ${row.id}`).join('\n')}` : 'No encontré esa obra. Responde «Obra: nombre completo» o «Obra: código».' };
      }
      const output = await quoteDestination(db, actor, channel, state.id, 'vista', { proyecto: matches[0].id });
      if ('modo' in output) return { respuesta: destinationReply(output), obra: output.proyecto_id };
      const vista = output as LinkPreview;
      await saveSession(db, actor, channel, { paso: 'confirmar', id: state.id, vista });
      return { respuesta: previewText(vista) };
    }
    if (state.paso === 'vincular') {
      if (!start && state === previous) return null;
      await saveSession(db, actor, channel, state);
      return { respuesta: '¿A qué obra quieres vincularla? Responde «Obra: nombre completo» o «Obra: código».' };
    }
    const mode = parseLinkChoice(clean);
    if (!mode) return yes.test(clean) ? { respuesta: previewText(state.vista) } : null;
    const { proyecto_id, version, cabecera } = state.vista;
    try {
      const output = await quoteDestination(db, actor, channel, state.id, mode, { proyecto: proyecto_id, version, cabecera }) as QuoteDestination;
      await saveSession(db, actor, channel, null);
      return { respuesta: destinationReply(output), obra: output.proyecto_id };
    } catch (error) {
      if (!(error instanceof AIError) || error.code !== 'OBRABOT_DESTINATION_STALE') throw error;
      const output = await quoteDestination(db, actor, channel, state.id, 'vista', { proyecto: proyecto_id });
      if ('modo' in output) return { respuesta: destinationReply(output), obra: output.proyecto_id };
      const vista = output as LinkPreview;
      await saveSession(db, actor, channel, { ...state, vista });
      return { respuesta: `${error.message}\n\n${previewText(vista)}` };
    }
  }
  const names = fieldsFrom([first, ...lines]).equipo || splitTeam(first.match(assignment)?.[1] || '');
  if (!names.length) return yes.test(clean) || clean === 'asignar equipo'
    ? { respuesta: 'Envía los nombres completos separados por comas. Ejemplo: «Equipo: Ana Pérez, Juan Soto».' } : null;
  const { data, error } = await db.rpc('obrabot_equipo_cotizacion', {
    p_empresa: actor.empresa_id, p_actor: actor.id, p_proyecto: state.proyecto, p_equipo: names,
  });
  if (error || !data) failed(error);
  if (!data.equipo_pendiente.length) await saveSession(db, actor, channel, null);
  return { respuesta: teamReply(data).join('\n'), obra: state.proyecto };
}
