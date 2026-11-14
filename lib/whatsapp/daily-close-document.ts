import { AIError } from "@/lib/ai/errors";
import { createDailyClosePDF, dailyCloseFilename } from "@/lib/daily-close-pdf";
import { canonicalPhone } from "@/lib/phone";

/** Siempre lee el cierre nativo guardado, no un resumen propuesto por el modelo. */
export async function dailyCloseDocument(sb: any, receipt: any, to: string) {
  const action = receipt.acciones;
  if (
    !receipt.persistido ||
    action?.tipo !== "registrar_documento" ||
    action.detalles?.categoria !== "cierre_diario"
  )
    return null;
  const [actorResult, docResult] = await Promise.all([
    sb
      .from("usuarios")
      .select("id,empresa_id,rol,telefono_whatsapp")
      .eq("id", receipt.actor_id)
      .eq("empresa_id", receipt.empresa_id)
      .maybeSingle(),
    sb
      .from("documentos_obra")
      .select("id,empresa_id,proyecto_id,categoria,cierre_resumen")
      .eq("id", action.detalles.id)
      .eq("empresa_id", receipt.empresa_id)
      .maybeSingle(),
  ]);
  const actor = actorResult.data,
    doc = docResult.data;
  if (actorResult.error || docResult.error)
    throw new AIError(
      "DAILY_CLOSE_READ",
      "No se pudo preparar el PDF del cierre.",
      503,
    );
  if (
    !actor ||
    !["admin", "supervisor"].includes(actor.rol) ||
    !canonicalPhone(to) ||
    canonicalPhone(actor.telefono_whatsapp || "") !== canonicalPhone(to)
  )
    throw new AIError(
      "DAILY_CLOSE_FORBIDDEN",
      "El cierre solo está disponible para la jefatura autorizada.",
      403,
    );
  if (!doc || doc.categoria !== "cierre_diario" || !doc.cierre_resumen)
    return null;
  if (actor.rol === "supervisor") {
    const assignment = await sb
      .from("proyecto_trabajadores")
      .select("proyecto_id")
      .eq("proyecto_id", doc.proyecto_id)
      .eq("usuario_id", actor.id)
      .maybeSingle();
    if (assignment.error || !assignment.data)
      throw new AIError(
        "DAILY_CLOSE_FORBIDDEN",
        "El jefe no está asignado a esta obra.",
        403,
      );
  }
  const pdf = await createDailyClosePDF(doc.cierre_resumen);
  return {
    bytes: pdf.output("arraybuffer"),
    filename: dailyCloseFilename(doc.cierre_resumen),
    caption: `Cierre de jornada · ${doc.cierre_resumen.proyecto_nombre} · ${doc.cierre_resumen.fecha}`,
  };
}
