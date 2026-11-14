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

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const INCIDENT_RE =
  /\b(incidenc\w*|incident\w*|inconvenient\w*|problem\w*|accident\w*|imprevist\w*|dan[oa]\w*|averi\w*|falla\w*|rotur\w*|agriet\w*|griet\w*|fisur\w*|filtracion\w*|fuga\w*|gotera\w*|humedad\w*|inund\w*|desprend\w*|emergenc\w*|peligr\w*|riesg\w*|reclam\w*)\b/i;

function isIncidentText(value: string): boolean {
  return INCIDENT_RE.test(norm(value || ""));
}

function cleanAttachmentDescription(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const chunks = raw
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      if (part.endsWith("?")) return false;
      const plain = norm(part).replace(/[.!]+$/, "").trim();
      return ![
        "foto original recibida",
        "analisis automatico no disponible",
        "foto recibida",
        "recibida",
        "recibido",
        "recibi la foto",
        "foto de obra adjunta",
        "documento de obra adjunto",
        "el analisis de la imagen no estuvo disponible",
        "la foto quedo conservada; puedes reenviarla para volver a analizarla",
      ].includes(plain);
    });
  return chunks.join(" ").trim();
}

function deriveEvidenceTitle(primary: string, secondary: string, isIncident: boolean): string {
  const source = (primary || secondary || "").trim().replace(/\s+/g, " ");
  if (!source) {
    return isIncident ? "Inconveniente en obra" : "Registro fotográfico de obra";
  }
  const firstClause = source.split(/[\n.;]/)[0]?.trim() || source;
  return firstClause.length > 70
    ? `${firstClause.slice(0, 67).trimEnd()}...`
    : firstClause;
}

// La asociación se resuelve con las obras autorizadas. Nunca se elige la primera de varias obras.
export function evidenceActions(
  actions: any[],
  attachment: any,
  projects: any[],
  text: string,
  history: any[] = [],
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
  if (!project) {
    const normText = norm(text);
    let matches = projects.filter((p) => normText.includes(norm(p.nombre)));
    if (matches.length === 0) {
      matches = projects.filter((p) => {
        const base =
          norm(p.nombre)
            .split(/[—–-]/)[0]
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

  const trimmedText = (text || "").trim();
  const isGenericPlaceholder = [
    "Foto de obra adjunta.",
    "Documento de obra adjunto.",
  ].includes(trimmedText);
  const userNote = isGenericPlaceholder ? "" : trimmedText;
  const visualDesc = cleanAttachmentDescription(attachment.descripcion);
  const recentTurn = history[0];
  const recentUnresolvedIncident = Boolean(
    recentTurn &&
      !recentTurn.acciones?.tipo &&
      (isIncidentText(recentTurn.texto || "") ||
        isIncidentText(recentTurn.respuesta || "")),
  );
  const isIncident =
    isIncidentText(userNote) ||
    isIncidentText(visualDesc) ||
    recentUnresolvedIncident;

  const isReceipt = /boleta|factura|comprobante|gasto/i.test(
    `${userNote} ${visualDesc}`,
  );
  const historyNote =
    !userNote && !visualDesc && recentUnresolvedIncident && recentTurn?.texto
      ? String(recentTurn.texto).trim()
      : "";
  const combinedNote = [
    userNote || historyNote,
    visualDesc &&
    (!userNote || !norm(visualDesc).includes(norm(userNote)))
      ? userNote
        ? `Observación visual: ${visualDesc}`
        : visualDesc
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim()
    .slice(0, 6000);

  let used = false;
  const updated = actions.map((a) => {
    if (
      a.tipo === "crear_bitacora" &&
      !used &&
      (a.proyecto_id === project.id ||
        a.proyecto_nombre === project.nombre ||
        (!a.proyecto_id && !a.proyecto_nombre))
    ) {
      used = true;
      const existingNota = cleanAttachmentDescription(a.nota || a.descripcion || "");
      const normExisting = norm(existingNota);
      const extraParts = [
        userNote && !normExisting.includes(norm(userNote)) ? userNote : "",
        visualDesc &&
        !normExisting.includes(norm(visualDesc)) &&
        (!userNote || !norm(visualDesc).includes(norm(userNote)))
          ? `Observación visual: ${visualDesc}`
          : "",
      ].filter(Boolean);
      const finalNota = [existingNota, ...extraParts]
        .filter(Boolean)
        .join("\n")
        .trim()
        .slice(0, 6000);
      const genericTitle =
        !a.titulo ||
        /^(registro fotográfico( de obra)?|avance|incidente|foto)$/i.test(
          String(a.titulo).trim(),
        );
      return {
        ...a,
        proyecto_id: a.proyecto_id || project.id,
        ...(isIncident && !a.material_id && a.tipo_bitacora !== "clima"
          ? {
              tipo_bitacora: "incidente",
              ...(a.subtipo && a.subtipo !== "entrega_material"
                ? { subtipo: "incidente" }
                : {}),
            }
          : {}),
        ...(finalNota ? { nota: finalNota } : {}),
        ...(genericTitle
          ? { titulo: deriveEvidenceTitle(userNote, visualDesc || finalNota, isIncident) }
          : {}),
        ...(isPhoto ? { foto_url: photoUrl } : {}),
      };
    }
    return a;
  });
  if (!used)
    updated.push({
      tipo: "crear_bitacora",
      proyecto_id: project.id,
      titulo: deriveEvidenceTitle(userNote, visualDesc || historyNote, isIncident),
      nota: (
        combinedNote ||
        (isIncident
          ? "Incidencia reportada con respaldo fotográfico."
          : "Registro fotográfico de obra.")
      ).slice(0, 6000),
      tipo_bitacora: isIncident ? "incidente" : "avance",
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
