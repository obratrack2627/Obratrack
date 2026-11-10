import type { PersonIntakeDraft } from "@/lib/whatsapp/person-intake";
import { personIntake } from "@/lib/whatsapp/person-intake";
import type { ConversationTurn } from "./conversation";

/** Borrador, nunca prueba de un alta. Las entidades y permisos se validan al ejecutar. */
export function pendingPerson(
  input: unknown,
  history: ConversationTurn[],
  projects: any[],
  selectedId?: string,
): PersonIntakeDraft | null {
  if (!Array.isArray(input)) return null;
  const last = input.findLast(
    (row) => row?.rol === "model" || row?.remitente === "agente",
  );
  if (last && Object.hasOwn(last, "registro_pendiente")) {
    const value = last.registro_pendiente;
    if (!value || !Array.isArray(value.items) || value.items.length > 30)
      return null;
    const items = value.items
      .filter(
        (item: any) => item && ["cliente", "trabajador"].includes(item.tipo),
      )
      .map((item: any) =>
        Object.fromEntries(
          [
            "tipo",
            "nombre",
            "rut",
            "telefono",
            "email",
            "rol",
            "proyecto_id",
            "proyecto_nombre",
            "direccion",
            "comuna",
          ]
            .filter(
              (key) => typeof item[key] === "string" && item[key].length <= 200,
            )
            .map((key) => [key, item[key]]),
        ),
      );
    return items.length ? ({ items } as PersonIntakeDraft) : null;
  }
  // Recuperar conversaciones anteriores al borrador web sin repetir un alta ya confirmada.
  if (!/registr|trabajador|cliente|rut|duraci[oó]n/i.test(last?.texto || ""))
    return null;
  let draft: PersonIntakeDraft | null = null;
  for (const turn of history.slice(-30))
    if (turn.rol === "user") {
      const step = personIntake(
        [],
        null,
        draft,
        turn.texto,
        projects,
        selectedId,
      );
      draft = step.draft;
    }
  return draft;
}
export function withPersonContext(
  result: any,
  draft: PersonIntakeDraft | null,
) {
  if (!draft) return result;
  return {
    ...result,
    accion_ejecutada: {
      ...(result.accion_ejecutada || {}),
      tipo: result.accion_ejecutada?.tipo || "solicitar_datos_persona",
      titulo: result.accion_ejecutada?.titulo || "Datos para el registro",
      resultado_texto:
        result.accion_ejecutada?.resultado_texto || result.respuesta,
      detalles: {
        ...(result.accion_ejecutada?.detalles || {}),
        borrador_registro: draft,
      },
    },
  };
}
