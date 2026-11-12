import { literalSpecialties } from '@/lib/team-specialties';
import { isConversationalName, isPersonName, explicitPersonName } from './person-name';
import type { PersonDraft } from "@/lib/registrations";
import { phonesInText } from "@/lib/phone";
import { projectMentions } from "./project-reference";

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export const personStart = (message: string) =>
  /^(?:por favor[, ]+)?(?:quiero |necesito |puedes |puedes ayudarme a )?(?:agregar?|registrar?|anadir|anade|crear?|ingresar?|incorporar?)(?:me)?\s+(?:a\s+)?(?:(?:un|una|al|el|la|nuevo|nueva)\s+)*(?:trabajador|maestro|supervisor|cliente)\b/.test(
    norm(message),
  );

export function anotherTask(message: string, pendingName?: string) {
  const text = norm(message);
  if (message.split(/[;\n]|\by\b/i).some(personStart)) return false;
  if (
    /^(?:(?:quiero|necesito|puedes)\s+)?(?:crea|crear|registra|registrar|agrega|agregar|agenda|agendar|cotiza|cotizar|envia|enviar)\b/.test(
      text,
    ) &&
    /\b(?:obra|proyecto|pago|abono|material|partida|actividad|bitacora|asistencia|documento|evento|visita|reporte|cotizacion|presupuesto|imprevisto|reclamo|mensaje)\b/.test(
      text,
    )
  )
    return true;
  return (
    /\b(?:cambia|actualiza|modifica|corrige)\b/.test(text) &&
    /\b(?:mi|mis)\b/.test(text) &&
    !(pendingName && text.includes(norm(pendingName)))
  );
}

export function personLiterals(
  message: string,
  previous: PersonDraft | undefined,
  projects: any[],
  selectedId?: string,
): Partial<PersonDraft> | null {
  const plain = norm(message);
  if (anotherTask(message, previous?.nombre)) return null;
  if (
    /^[¿?]|^(?:que |cual |cuant[oa]s? |muestra|lista|consulta|revisa|como )/.test(
      plain,
    )
  )
    return null;
  const starts = personStart(message);
  if (!previous && !starts) return null;
  const tipo = starts
    ? /\bcliente\b/.test(plain)
      ? "cliente"
      : "trabajador"
    : previous!.tipo;
  const draft: Partial<PersonDraft> = { tipo };
  const specialties = tipo === "trabajador" ? literalSpecialties(message) : undefined;
  if (specialties !== undefined) draft.especialidades = specialties;
  const email = message.match(/[^\s,;<>]+@[^\s,;<>]+\.[a-zA-Z]{2,}/)?.[0];
  if (email) draft.email = email.replace(/[.!?]+$/, "").toLowerCase();
  const rut =
    message.match(/\brut\s*[:=]?\s*([\d.kK-]{7,14})/i)?.[1] ||
    message.match(/\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/)?.[0];
  if (rut) draft.rut = rut;
  const phones = phonesInText(message);
  if (phones.length === 1) draft.telefono = "+" + phones[0];
  if (/\bsupervisor(?:a)?\b/.test(plain)) draft.rol = "supervisor";
  else if (/\b(?:terreno|maestro|maestra)\b/.test(plain)) draft.rol = "terreno";
  const explicit = explicitPersonName(message);
  const leading = message
    .split(/[,;\n]/)[0]
    .replace(
      /^(?:por favor[, ]+)?(?:(?:quiero|necesito|puedes)\s+)?(?:agregar?|registrar?|añadir|añade|crear?|ingresar?|incorporar?)\s+(?:a\s+)?(?:(?:un|una|al|el|la|nuevo|nueva)\s+)*(?:trabajador|maestro|maestra|supervisor|cliente)\s*(?:llamado|llamada)?\s*/i,
      "",
    )
    .split(
      /\s+(?:rut|correo|email|tel[eé]fono|terreno|supervisor|as[ií]gnalo|asignalo)\b/i,
    )[0]
    .trim();
  const name = (explicit || leading)
    .replace(/^(?:es|su nombre es)\s+/i, "")
    .trim();
  if (
    (starts || !previous?.nombre || explicit) &&
    name &&
    !isConversationalName(name) &&
    (tipo === "cliente" || isPersonName(name)) &&
    !/@|\d|[?!¿]/.test(name) &&
    !/\b(?:agrega|agregar|registra|registrar|trabajador|cliente|maestro|terreno|supervisor|obra|falta|corrige|cambia)\b/.test(
      norm(name),
    ) &&
    (tipo === "cliente" || name.split(/\s+/).length >= 2)
  )
    draft.nombre = name;
  const mentions = projectMentions(projects, message);
  if (
    mentions.length === 1 &&
    (/\b(?:obra|proyecto|asigna\w*|en)\b/.test(plain) ||
      norm(message) === norm(mentions[0].nombre))
  ) {
    draft.proyecto_id = mentions[0].id;
    draft.proyecto_nombre = mentions[0].nombre;
  } else if (
    selectedId &&
    /\b(?:esta obra|esta misma obra|este proyecto|obra actual)\b/.test(plain)
  ) {
    const selected = projects.find((project) => project.id === selectedId);
    if (selected) {
      draft.proyecto_id = selected.id;
      draft.proyecto_nombre = selected.nombre;
    }
  }
  return Object.keys(draft).length > 1 || starts ? draft : null;
}
