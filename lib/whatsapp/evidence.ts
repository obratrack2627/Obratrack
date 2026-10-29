import { createHash } from "node:crypto";
import { AIError } from "@/lib/ai/errors";
import { resolveEntity } from "@/lib/ai/actions";

export const evidenceBucket = "whatsapp-evidencias";
export const evidencePrefix = "whatsapp-evidencias:";
export async function storeEvidence(
  sb: any,
  user: any,
  messageId: string,
  media: { mimeType: string; data: string },
) {
  const ext: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!ext[media.mimeType])
    throw new AIError("IMAGE_FORMAT", "Envía una foto JPG, PNG o WebP.", 422);
  const buffer = Buffer.from(media.data, "base64");
  if (!buffer.length || buffer.length > 10 * 1024 * 1024)
    throw new AIError("IMAGE_SIZE", "La foto debe ocupar hasta 10 MB.", 422);
  const hash = createHash("sha256").update(messageId).digest("hex");
  const path = `${user.empresa_id}/${user.id}/${hash}.${ext[media.mimeType]}`;
  const { error } = await sb.storage
    .from(evidenceBucket)
    .upload(path, buffer, { contentType: media.mimeType, upsert: true });
  if (error)
    throw new AIError(
      "IMAGE_SAVE",
      "No se pudo guardar la foto. Se reintentará.",
      503,
    );
  return {
    path,
    mime_type: media.mimeType,
    origen_message_id: messageId,
    proyecto_id: null as string | null,
    descripcion: "",
  };
}

// La asociación se resuelve con las obras autorizadas. Nunca se elige la primera de varias obras.
export function evidenceActions(
  actions: any[],
  attachment: any,
  projects: any[],
  text: string,
) {
  let project: any;
  const refs = actions
    .map((a) => a.proyecto_id || a.proyecto_nombre)
    .filter(Boolean);
  if (new Set(refs).size === 1)
    try {
      project = resolveEntity(projects, refs[0]);
    } catch {}
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  if (!project) {
    const matches = projects.filter((p) => norm(text).includes(norm(p.nombre)));
    if (matches.length === 1) project = matches[0];
  }
  if (!project && projects.length === 1) project = projects[0];
  if (!project)
    return {
      actions,
      attachment: { ...attachment, proyecto_id: null },
      linked: false,
    };
  const photoUrl = evidencePrefix + attachment.path;
  let used = false;
  const updated = actions.map((a) => {
    if (
      a.tipo === "crear_bitacora" &&
      !used &&
      (a.proyecto_id === project.id || a.proyecto_nombre === project.nombre)
    ) {
      used = true;
      return { ...a, foto_url: photoUrl };
    }
    return a;
  });
  if (!used)
    updated.push({
      tipo: "crear_bitacora",
      proyecto_id: project.id,
      titulo: /incidente|inconveniente|problema|accidente/i.test(text)
        ? "Inconveniente en obra"
        : "Registro fotográfico de obra",
      nota: `${text}\n${attachment.descripcion}`.trim().slice(0, 6000),
      tipo_bitacora: /incidente|inconveniente|problema|accidente/i.test(text)
        ? "incidente"
        : "avance",
      foto_url: photoUrl,
    });
  return {
    actions: updated,
    attachment: { ...attachment, proyecto_id: project.id },
    linked: true,
  };
}
