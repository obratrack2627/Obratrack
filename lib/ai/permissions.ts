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
    const targetsClient =
      Boolean(action.telefono || action.cliente_id || action.cliente_nombre) ||
      (/\b(?:al|a la|para el|para la|del)?\s*(?:clientes?|mandantes?|propietari[oa]s?|duen[oa]s?)\b/.test(current) &&
        !/\b(?:equipo|cuadrilla|trabajadores|maestros?|supervisores?|jefes? de obra|terreno)\b/.test(current));
    const explicitBroadcast =
      !targetsClient &&
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
    if (action.tipo === 'actualizar_proyecto') {
      const hasOtherUpdate = Boolean(
        action.fecha_inicio ||
          action.fecha_termino_estimada ||
          action.reprogramar_gantt ||
          action.monto !== undefined ||
          action.monto_cotizado !== undefined,
      );
      if (
        action.nuevo_nombre !== undefined &&
        hasOtherUpdate &&
        !/\b(?:renombr\w*|llamar\w*|llamad[oa]|cambia\w*\s+el\s+nombre|nuevo\s+nombre)\b/.test(current)
      ) {
        delete action.nuevo_nombre;
      }
      if (
        action.descripcion !== undefined &&
        hasOtherUpdate &&
        !/\b(?:descripcion|alcance|detalle|resumen)\b/.test(current)
      ) {
        delete action.descripcion;
      }
      if (
        action.estado !== undefined &&
        hasOtherUpdate &&
        !/\b(?:estado|activ[oa]|en curso|pausad[oa]|terminad[oa]|finalizad[oa]|cancelad[oa]|pendiente|reanuda\w*|reactiva\w*|pausa\w*|termina\w*|cancela\w*)\b/.test(
          current,
        )
      ) {
        delete action.estado;
      }
      if (
        (action.fecha_inicio || action.fecha_termino_estimada || action.reprogramar_gantt) &&
        !/\b(?:sin|no)\s+(?:cambiar|mover|ajustar|modificar|tocar)\s+(?:el\s+|la\s+|las\s+)?(?:gantt|carta\s+gant+|partidas?|actividades?|tareas?)\b/.test(
          current,
        )
      ) {
        action.reprogramar_gantt = true;
      }
    }
    if (
      action.tipo === 'actualizar_avance' &&
      (action.responsable_id ||
        action.responsable_nombre ||
        action.fecha_inicio ||
        action.fecha_termino ||
        action.dias !== undefined ||
        action.nuevo_nombre) &&
      !/\b(?:\d+\s*%|porcentaje|avance|terminad[oa]s?|completad[oa]s?|al\s+\d+)\b/.test(current)
    ) {
      delete action.porcentaje_avance;
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
  if (
    user.rol === "terreno" &&
    actions.some((a) => !workerActions.has(a.tipo) || (a.tipo === "actualizar_avance" && (a.responsable_id || a.responsable_nombre)))
  )
    throw new AIError(
      "ACTION_FORBIDDEN",
      "Tu perfil de terreno puede registrar avances, bitácora y solicitudes de cambio en sus obras asignadas.",
      403,
    );
  return actions;
}
