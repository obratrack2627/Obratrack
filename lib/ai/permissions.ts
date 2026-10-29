import { AIError } from "./errors";
import { flattenActions } from "./protocol";

const workerActions = new Set([
  "actualizar_avance",
  "crear_bitacora",
  "registrar_asistencia",
  "crear_solicitud_cambio",
  "registrar_documento",
  "generar_reporte",
]);
export function checkActionPermissions(
  user: { rol: string; id: string; nombre?: string },
  input: unknown,
  message: string,
) {
  const actions = flattenActions(input);
  if (actions.some((a) => a.tipo === "enviar_mensaje_equipo")) {
    if (actions.length !== 1)
      throw new AIError(
        "BROADCAST_SEPARATE",
        "Solicita el envío del aviso en un mensaje separado de los cambios de la obra.",
        422,
      );
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
      "Tu perfil de terreno puede registrar avances, bitácora, asistencia y solicitudes de cambio en sus obras asignadas.",
      403,
    );
  if (
    user.rol === "terreno" &&
    actions.some(
      (a) =>
        a.tipo === "registrar_asistencia" &&
        (a.todos_presentes ||
          ![user.id, user.nombre].includes(a.trabajador_nombre)),
    )
  )
    throw new AIError(
      "ACTION_FORBIDDEN",
      "Solo puedes registrar tu propia asistencia.",
      403,
    );
  return actions;
}
