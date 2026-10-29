import { AIError } from "@/lib/ai/errors";
import { resolveEntity } from "@/lib/ai/actions";
import { canonicalPhone } from "./meta";
import type { AccionAsistenteIA } from "@/types/database";

export function prepareCampaign(
  user: any,
  action: any,
  users: any[],
  projects: any[],
  currentId?: string,
) {
  if (!["admin", "supervisor"].includes(user.rol))
    throw new AIError(
      "BROADCAST_FORBIDDEN",
      "Tu perfil no puede enviar avisos al equipo.",
      403,
    );
  let project: any;
  if (action.proyecto_id || action.proyecto_nombre || currentId)
    project = resolveEntity(
      projects,
      action.proyecto_id || action.proyecto_nombre,
      currentId,
    );
  const named = new Set<string>();
  for (const ident of action.trabajadores_nombres || [])
    named.add(resolveEntity(users, ident).id);
  const roles = new Set(action.roles_destino || []);
  const selected = users.filter(
    (u) =>
      u.empresa_id === user.empresa_id &&
      (named.has(u.id) || (roles.has(u.rol) && u.id !== user.id)) &&
      (!project || (project.trabajadores_ids || []).includes(u.id)),
  );
  if (!selected.length)
    throw new AIError(
      "BROADCAST_EMPTY",
      "No hay destinatarios con esos roles o asignaciones. Revisa el equipo de la obra.",
      422,
    );
  if (selected.length > 200)
    throw new AIError(
      "BROADCAST_LIMIT",
      "Selecciona hasta 200 personas por aviso, por ejemplo por obra.",
      422,
    );
  const valid = selected.filter((u) =>
    canonicalPhone(u.telefono_whatsapp || ""),
  );
  const phones = new Set(valid.map((u) => canonicalPhone(u.telefono_whatsapp)));
  const summary = `Aviso registrado para ${phones.size} teléfono(s)${selected.length - valid.length ? `; ${selected.length - valid.length} persona(s) sin teléfono válido` : ""}. Los envíos se procesan automáticamente. Revisa la entrega en WhatsApp y reportes.`;
  const result: AccionAsistenteIA = {
    tipo: "enviar_mensaje_equipo",
    titulo: "Aviso al equipo en cola",
    detalles: {
      mensaje: action.mensaje,
      destinatarios: selected.map(({ id, nombre, rol }) => ({
        id,
        nombre,
        rol,
      })),
      proyecto_id: project?.id || null,
    },
    resultado_texto: summary,
    link_destino: "/reportes?tab=envios",
    link_texto: "Ver estado de los envíos",
  };
  return {
    mensaje: action.mensaje,
    destinatarios: selected.map((u) => u.id),
    proyecto_id: project?.id || null,
    result,
  };
}
export async function enqueueCampaign(
  client: any,
  user: any,
  plan: ReturnType<typeof prepareCampaign>,
  key: string,
  source: "whatsapp" | "plataforma",
) {
  const { data, error } = await client.rpc("encolar_aviso_equipo", {
    p_empresa: user.empresa_id,
    p_actor: user.id,
    p_key: key,
    p_mensaje: plan.mensaje,
    p_destinatarios: plan.destinatarios,
    p_proyecto: plan.proyecto_id,
    p_origen: source,
  });
  if (error || !data?.id)
    throw new AIError(
      "BROADCAST_SAVE",
      "No se pudo registrar el envío. Intenta nuevamente.",
      503,
    );
  return {
    ...plan.result,
    detalles: { ...plan.result.detalles, aviso_id: data.id },
  };
}
