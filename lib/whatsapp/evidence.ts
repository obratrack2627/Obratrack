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
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  if (!ext[media.mimeType])
    throw new AIError(
      "IMAGE_FORMAT",
      "Envía JPG, PNG, WebP, PDF, Word o Excel.",
      422,
    );
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
    archivo_tamano: buffer.length,
    archivo_nombre: `evidencia.${ext[media.mimeType]}`,
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
  if (attachment.proyecto_id)
    project = projects.find((p) => p.id === attachment.proyecto_id);
  const refs = actions
    .map((a) => a.proyecto_id || a.proyecto_nombre)
    .filter(Boolean);
  if (!project && new Set(refs).size === 1)
    try {
      project = resolveEntity(projects, refs[0]);
    } catch {}
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  if (!project) {
    const normText = norm(text);
    let matches = projects.filter((p) => normText.includes(norm(p.nombre)));
    if (matches.length === 0) {
      matches = projects.filter((p) => {
        const base =
          norm(p.nombre)
            .split(/\s*[—–-]\s*/)[0]
            ?.trim() || "";
        return base.length >= 4 && normText.includes(base);
      });
    }
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
  const isPhoto = attachment.mime_type?.startsWith("image/") !== false;
  if (
    isPhoto &&
    actions.length === 1 &&
    actions[0].tipo === "registrar_documento" &&
    actions[0].categoria === "acta_recepcion" &&
    (actions[0].proyecto_id === project.id ||
      actions[0].proyecto_nombre === project.nombre)
  )
    return {
      actions: [{ ...actions[0], proyecto_id: project.id, fotos: [photoUrl] }],
      attachment: { ...attachment, proyecto_id: project.id },
      linked: true,
    };

  const isReceipt = /boleta|factura|comprobante|gasto/i.test(
    text + " " + (attachment.descripcion || ""),
  );
  let used = false;
  const updated = actions.map((a) => {
    if (
      a.tipo === "crear_bitacora" &&
      !used &&
      (a.proyecto_id === project.id || a.proyecto_nombre === project.nombre)
    ) {
      used = true;
      return { ...a, ...(isPhoto ? { foto_url: photoUrl } : {}) };
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
      ...(isPhoto ? { foto_url: photoUrl } : {}),
    });
  if (!isPhoto || isReceipt) {
    const file = {
      archivo_url: photoUrl,
      archivo_nombre: attachment.archivo_nombre || "Documento de obra",
      archivo_tamano: attachment.archivo_tamano,
      mime_type: attachment.mime_type,
    };
    const existing = updated.find(
      (a) =>
        a.tipo === "registrar_documento" &&
        (a.proyecto_id === project.id || a.proyecto_nombre === project.nombre),
    );
    if (existing) Object.assign(existing, file);
    else
      updated.push({
        tipo: "registrar_documento",
        proyecto_id: project.id,
        nombre:
          attachment.archivo_nombre ||
          (isReceipt
            ? "Comprobante de gasto"
            : "Documento recibido por WhatsApp"),
        categoria: isReceipt ? "factura_boleta" : "otro",
        descripcion: text.slice(0, 1000),
        ...file,
      });
  }
  return {
    actions: updated,
    attachment: { ...attachment, proyecto_id: project.id },
    linked: true,
  };
}
