import { assertAttendanceManager } from '@/lib/attendance-access';
import { checkChileanAmounts } from './chilean-context';
import { AIError } from "./errors";
import { flattenActions, validateAction } from "./protocol";

const workerActions = new Set([
  "actualizar_avance",
  "crear_bitacora",
  "crear_solicitud_cambio",
  "registrar_documento",
  "generar_reporte",
]);
// «No cambies el presupuesto» menciona el campo, pero no autoriza editarlo.
function negatesFieldChange(message: string, field: RegExp) {
  const words = message.split(/[^a-z0-9]+/);
  const verbs = new Set(['cambies', 'cambiar', 'modifiques', 'modificar', 'actualices', 'actualizar', 'toques', 'tocar', 'alteres', 'alterar']);
  return words.some((word, index) => ['no', 'sin'].includes(word) && words.slice(index + 1, index + 7).some((verb, offset) => verbs.has(verb) && words.slice(index + offset + 2, index + offset + 7).some(next => field.test(next))));
}
export function checkActionPermissions(
  user: { rol: string; id: string; nombre?: string },
  input: unknown,
  message: string,
) {
  const actions = flattenActions(input);
  checkChileanAmounts(actions, message);
  if(actions.some(action=>action.tipo==='registrar_documento'&&['cierre_diario','acta_recepcion'].includes(action.categoria))) {
    assertAttendanceManager(user);
    if(actions.length!==1)throw new AIError('CLOSE_SEPARATE','Solicita el cierre de jornada después de guardar los demás registros.',422);
  }
  if (actions.some(action => action.tipo==='registrar_imprevisto'&&action.asistencia_id))assertAttendanceManager(user);
  if (actions.some(action => action.tipo === "registrar_asistencia")) assertAttendanceManager(user);
  if (!['admin', 'supervisor', 'terreno'].includes(user.rol))
    throw new AIError('ACTION_FORBIDDEN', 'Tu cuenta no tiene permisos para gestionar obras.', 403);
  const current = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/^[¿?¡!]+/, '');
  const readOnlyText = current.replace(/\bno solo\b/g, 'ademas');
  if (actions.length && /\b(?:solo (?:quiero |necesito )?(?:de )?(?:consultar?|saber|ver|revisar)|no registres ni cambies nada|sin (?:guardar|hacer) cambios|no ejecutes acciones|no (?:hagas cambios|cambies nada))\b/.test(readOnlyText))
    throw new AIError('READ_ONLY_REQUEST', 'La solicitud es solo de consulta; no se ejecutaron cambios.', 422);
  for (const action of actions) {
    if (action.tipo === 'actualizar_proyecto' && action.estado) {
      const words = current.split(/\s+/);
      const negated = words.some((word, index) => word === 'no' && words[index + 1] !== 'solo' && words.slice(index + 1, index + 8).some(next => /^(?:cancel|termin|finaliz|cerr|paus|suspend|activ|reactiv|reabr|pendiente)/.test(next)));
      const question = /^(?:esta|estan|sigue|siguen|cuando|como|por que|que obras|cuales obras|hay obras|en que estado|que estado|cual es el estado)\b/.test(current);
      if (negated || question || negatesFieldChange(current, /^estado$/)) throw new AIError('STATUS_NOT_REQUESTED', 'No cambié el estado de la obra. Para hacerlo, indica el estado que quieres asignarle.', 422);
    }
    const explicitBroadcast =
      /(?:^|(?:,|;|\by\b|\bluego\b|\bademas\b|\btambien\b)\s*)(?:por favor\s+)?(?:envi(?:a|ar|ales|ale|en|emos)?|manda(?:r|les|le|n|mos)?|avisa(?:r|les|le|n)?|notifica(?:r|les|le|n)?)\b/.test(current) &&
      !/\b(?:prepara|redacta|escribe|borrador|sin enviar|no envies|no mandar)\b/.test(current);
    if (action.tipo === 'generar_mensaje_whatsapp' && explicitBroadcast) {
      action.tipo = 'enviar_mensaje_equipo';
      if (typeof action.trabajador_nombre === 'string' && action.trabajador_nombre.trim() && !action.trabajadores_nombres?.length) {
        const target = action.trabajador_nombre.trim();
        if (/^(?:equipo|cuadrilla|todos|trabajadores)$/i.test(target)) {
          if (!action.roles_destino?.length) action.roles_destino = ['terreno', 'supervisor'];
        } else {
          action.trabajadores_nombres = [target];
        }
      }
      if (!action.roles_destino?.length && !action.trabajadores_nombres?.length && (action.proyecto_id || action.proyecto_nombre)) {
        action.roles_destino = ['terreno', 'supervisor'];
      }
    }
    if (action.tipo === 'actualizar_proyecto' && (!/\b(presupuestos?|montos?|cotizad[oa]s?|precios?|valor(?:es)?|costos?)\b/.test(current) || negatesFieldChange(current, /^(?:presupuesto|monto|valor|precio|costo)$/))) {
      delete action.monto;
      delete action.monto_cotizado;
      validateAction(action);
    }
  }
  if (actions.some((a) => a.tipo === "enviar_mensaje_equipo")) {
    const command = message
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (
      !/\b(envi\w*|manda\w*|avisa\w*|notifica\w*|comunica\w*|diles)\b/.test(
        command,
      ) ||
      /\b(no|sin)\s+(?:\w+\s+){0,2}(envi\w*|manda\w*|avisa\w*|notifica\w*|comunica\w*)\b/.test(
        command,
      )
    )
      throw new AIError(
        "SEND_NOT_REQUESTED",
        "Para enviar el aviso, indica expresamente que quieres enviarlo y a quiénes.",
        422,
      );
  }
  if (
    actions.some((a) => a.tipo === "eliminar_proyecto") &&
    !/\b(elimina|eliminar|borra|borrar)\b/i.test(message)
  )
    throw new AIError(
      "ACTION_FORBIDDEN",
      "La eliminación debe solicitarse expresamente.",
      403,
    );
  if (user.rol === "terreno" && actions.some((a) => !workerActions.has(a.tipo)))
    throw new AIError(
      "ACTION_FORBIDDEN",
      "Tu perfil de terreno puede registrar avances, bitácora y solicitudes de cambio en sus obras asignadas.",
      403,
    );
  return actions;
}
