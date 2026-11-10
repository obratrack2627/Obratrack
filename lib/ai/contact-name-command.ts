import { explicitPersonName, isPersonName } from "./person-name";
import { validarRutChileno } from "@/lib/utils";

export interface NameEdit {
  nuevo_nombre: string;
  usuario_id?: string;
}
export interface ContactTurn {
  rol: "user" | "model";
  texto: string;
  action?: any;
  contactIds?: string[];
  pendingNameEdit?: NameEdit | null;
}
const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const rutKey = (value: string) => value.replace(/[.\s-]/g, "").toUpperCase();
function identifierRut(message: string) {
  const value =
    message.match(/\brut\s*(?:es\s*)?[:=]?\s*([\d.kK-]{7,14})/i)?.[1] ||
    message.match(/\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/)?.[0] ||
    (/^[\d.kK-]{7,14}$/.test(message.trim()) ? message.trim() : undefined);
  return value && validarRutChileno(value) ? rutKey(value) : undefined;
}
export function actionContacts(action: any): string[] {
  if (!action) return [];
  if (action.tipo === "lote_acciones")
    return (action.detalles?.acciones || []).flatMap(actionContacts);
  if (
    [
      "actualizar_trabajador",
      "agregar_trabajador",
      "agregar_trabajadores",
    ].includes(action.tipo)
  )
    return [
      action.detalles?.id,
      ...(action.detalles?.trabajadores || []).map((u: any) => u.id),
    ].filter(Boolean);
  return [];
}
function userMentions(users: any[], text: string, exceptName?: string) {
  const words = ` ${norm(text).replace(/[^a-z0-9]+/g, " ")} `;
  return users.filter(
    (user) =>
      norm(user.nombre) !== norm(exceptName || "") &&
      words.includes(` ${norm(user.nombre).replace(/[^a-z0-9]+/g, " ")} `),
  );
}
function otherSubject(message: string) {
  const text = norm(message);
  if (
    /\bnombre (?:de la|del|de el|de) (?:obra|proyecto|cliente|mandante|empresa|actividad|partida|material|documento)\b/.test(
      text,
    )
  )
    return true;
  return (
    /\b(?:obra|proyecto|cliente|mandante|empresa|actividad|partida|material|documento)\b/.test(
      text,
    ) &&
    !/\b(?:trabajador|maestro|supervisor|integrante|persona)\b/.test(text) &&
    !/\bmi nombre\b/.test(text)
  );
}
function renameRequested(message: string) {
  const text = norm(message).replace(/^[¿\s]+/, "");
  return (
    !otherSubject(message) &&
    /\bnombre\b|\bse llama\b/.test(text) &&
    /\b(?:cambia\w*|cambie\w*|corrig\w*|actualiza\w*|modifica\w*|renombra\w*|correccion)\b/.test(
      text,
    ) &&
    !/^(?:no\b|como\b|que\b|cual\b)/.test(text) &&
    !/\b(?:no|sin)\s+(?:cambiar|cambies|modificar|modifiques|actualizar|actualices)\b/.test(
      text,
    )
  );
}
/** Solo cambios de nombre: un RUT posterior identifica la ficha y nunca se escribe como dato nuevo. */
export function contactNameCommand(
  message: string,
  users: any[],
  history: ContactTurn[],
  actorId: string,
  stored?: NameEdit | null,
) {
  const nowRequested = renameRequested(message);
  const explicitName = nowRequested ? explicitPersonName(message) : undefined;
  const lastState = history.findLast(
    (turn) => turn.rol === "model" && Object.hasOwn(turn, "pendingNameEdit"),
  );
  const state = stored !== undefined ? stored : lastState?.pendingNameEdit;
  const knownState = stored !== undefined || !!lastState;
  let pending =
    state &&
    typeof state.nuevo_nombre === "string" &&
    isPersonName(state.nuevo_nombre)
      ? { ...state }
      : null;
  if (otherSubject(message)) return { handled: false, pending };
  // Recuperar la intención anterior cuando el bot antiguo confundió el RUT con el dato a modificar.
  if (!knownState)
    for (const turn of history.slice(-16).reverse()) {
      if (
        turn.rol !== "user" ||
        !renameRequested(turn.texto) ||
        /\b(?:telefono|correo|email)\b/.test(norm(turn.texto))
      )
        continue;
      const name = explicitPersonName(turn.texto);
      if (name) {
        pending = { nuevo_nombre: name };
        break;
      }
    }
  if (
    nowRequested &&
    !explicitName &&
    /\b(?:se llama|su nombre es|nombre(?: completo)? (?:a|por|es))\b/.test(
      norm(message),
    )
  )
    return {
      handled: true,
      pending: null,
      action: null,
      question:
        "Indica el nombre completo que debe quedar en la ficha; esa frase no parece un nombre.",
    };
  if (explicitName)
    pending = { ...(pending || {}), nuevo_nombre: explicitName };
  if (
    pending &&
    /^(?:(?:cancela|olvida|descarta)(?: el cambio| la correccion| eso)?|no cambies el nombre|no lo cambies)[.!]?$/i.test(
      norm(message),
    )
  )
    return {
      handled: true,
      pending: null,
      action: null,
      question: "Cambio de nombre cancelado. La ficha se conserva.",
    };
  const rut = identifierRut(message);
  if (
    pending &&
    !rut &&
    (/\brut\b/i.test(message) || /^[\d.kK-]{7,14}$/.test(message.trim()))
  )
    return {
      handled: true,
      pending,
      action: null,
      question:
        "Ese RUT no pasa la validación. Revisa el dígito verificador; conservo el nombre que quieres dejar.",
    };
  const targetAnswer = !!pending && !!rut;
  if (!nowRequested && !targetAnswer) return { handled: false, pending };
  if (nowRequested && !explicitName && !pending)
    return {
      handled: true,
      pending: null,
      question: "¿Cuál es el nombre completo que debe quedar en la ficha?",
      action: null,
    };
  if (!pending) return { handled: false, pending: null };
  // Una solicitud que cambia varios campos conserva el flujo general del agente.
  if (nowRequested && /\b(?:telefono|correo|email)\b/.test(norm(message)))
    return { handled: false, pending: null, clear: true };
  let matches: any[] = [];
  if (rut)
    matches = users.filter((user) => user.rut && rutKey(user.rut) === rut);
  else if (/\bmi nombre\b/.test(norm(message)))
    matches = users.filter((user) => user.id === actorId);
  else {
    const targetLabel = message
      .match(/\bnombre\s+(?:de|del)\s+(.+?)(?:\s+(?:a|por)\s+|[,;]|$)/i)?.[1]
      ?.trim();
    if (targetLabel) {
      matches = users.filter((user) => norm(user.nombre) === norm(targetLabel));
      if (matches.length !== 1)
        return {
          handled: true,
          pending,
          action: null,
          question: `No identifiqué una ficha única de ${targetLabel}. Indica su RUT; conservo el cambio a ${pending.nuevo_nombre}.`,
        };
    }
    if (!matches.length)
      matches = userMentions(users, message, pending.nuevo_nombre);
    if (!matches.length && pending.usuario_id)
      matches = users.filter((user) => user.id === pending!.usuario_id);
    if (!matches.length) {
      for (const turn of history.slice(-12).reverse()) {
        const ids = turn.contactIds || actionContacts(turn.action);
        if (ids.length) {
          matches = users.filter((user) => ids.includes(user.id));
          break;
        }
        const previousRut =
          turn.rol === "user" ? identifierRut(turn.texto) : undefined;
        if (previousRut) {
          matches = users.filter(
            (user) => user.rut && rutKey(user.rut) === previousRut,
          );
          break;
        }
        const mentioned = userMentions(users, turn.texto, pending.nuevo_nombre);
        if (mentioned.length) {
          matches = mentioned;
          break;
        }
      }
    }
  }
  if (matches.length !== 1)
    return {
      handled: true,
      pending,
      action: null,
      question: rut
        ? "No encontré una ficha única con ese RUT en tu equipo. Revisa el RUT; conservo el cambio de nombre."
        : "¿A qué trabajador le cambio el nombre? Indica su RUT o nombre completo; ya tengo el nombre que quieres dejar.",
    };
  const target = matches[0];
  if (norm(target.nombre) === norm(pending.nuevo_nombre))
    return {
      handled: true,
      pending: null,
      action: null,
      question: `La ficha ya figura como ${target.nombre}. No hace falta volver a cambiarla.`,
    };
  return {
    handled: true,
    pending: null,
    action: {
      tipo: "actualizar_trabajador",
      usuario_id: target.id,
      nuevo_nombre: pending.nuevo_nombre,
    },
    question: null,
  };
}

export function contactTurns(input: unknown): ContactTurn[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((row) => {
    const rol =
      row?.rol === "user" || row?.remitente === "usuario"
        ? "user"
        : row?.rol === "model" || row?.remitente === "agente"
          ? "model"
          : null;
    if (!rol || typeof row.texto !== "string") return [];
    const turn: ContactTurn = { rol, texto: row.texto };
    if (Array.isArray(row.referencias_contacto))
      turn.contactIds = row.referencias_contacto
        .filter((id: unknown) => typeof id === "string")
        .slice(0, 30);
    if (Object.hasOwn(row, "edicion_nombre_pendiente"))
      turn.pendingNameEdit = row.edicion_nombre_pendiente;
    return [turn];
  });
}
export function withNameEditContext(
  result: any,
  pending: NameEdit | null,
  clear = false,
) {
  if (!pending && !clear) return result;
  return {
    ...result,
    accion_ejecutada: {
      ...(result.accion_ejecutada || {}),
      tipo: result.accion_ejecutada?.tipo || "solicitar_datos_persona",
      titulo: result.accion_ejecutada?.titulo || "Datos para la edición",
      resultado_texto:
        result.accion_ejecutada?.resultado_texto || result.respuesta,
      detalles: {
        ...(result.accion_ejecutada?.detalles || {}),
        edicion_nombre_pendiente: pending,
      },
    },
  };
}
