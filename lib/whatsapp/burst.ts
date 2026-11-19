import crypto from "node:crypto";
import { conversationProjectId, projectMentions } from "@/lib/ai/project-reference";

export type WhatsAppBurstConfig = {
  enabled?: boolean;
  standardMs?: number;
  incompleteMs?: number;
  maxWaitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export const DEFAULT_WHATSAPP_BURST: Required<Omit<WhatsAppBurstConfig, "sleep">> = {
  enabled: true,
  standardMs: 2200,
  incompleteMs: 4200,
  maxWaitMs: 9000,
  pollMs: 450,
};

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const INTRO_PHRASES = new Set([
  "hola",
  "holi",
  "buenas",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "oiga",
  "oye",
  "disculpa",
  "disculpe",
  "permiso",
  "consulta",
  "una consulta",
  "mira",
  "mire",
  "espera",
  "espere",
  "un momento",
  "un segundo",
  "dame un segundo",
  "te mando",
  "ahi va",
  "ahora te envio",
  "ahora va",
  "anota esto",
  "anota",
  "registra esto",
]);

const DANGLING_CONNECTORS =
  /\b(?:en|de|del|para|por|con|y|e|o|u|que|al|sobre|el|la|los|las|a)\s*$/i;

const ACTION_OR_QUERY_VERB =
  /\b(?:registra\w*|anota\w*|agrega\w*|crea\w*|actualiza\w*|marca\w*|avanza\w*|termin\w*|pausa\w*|cancela\w*|envia\w*|manda\w*|avisa\w*|cotiza\w*|calcula\w*|cuanto|como|cuando|cual(?:es)?|que|quien(?:es)?|donde|hay|falt\w*|necesit\w*|saldo|estado|avance|pago\w*|gasto\w*|material\w*|foto\w*|asistencia|cierre|bitacora|cambio\w*|reclamo\w*|incidente\w*|problema\w*|grieta\w*|rotur\w*|llov\w*|ayuda|\d+)\b/i;

/**
 * Detecta si un mensaje aislado parece un fragmento inicial porque el trabajador
 * o jefe aún sigue escribiendo o adjuntando el resto en el siguiente mensaje.
 */
export function seemsIncompleteWhatsAppMessage(
  message: any,
  rawText?: string,
): boolean {
  const type = message?.type || "text";
  const text = (
    rawText ??
    message?.text?.body ??
    message?.image?.caption ??
    message?.document?.caption ??
    ""
  ).trim();

  if ((type === "image" || type === "document") && text.length < 4) {
    return true;
  }
  if (!text) return type === "image" || type === "document";

  const clean = norm(text).replace(/[.!?¡¿]+$/g, "").trim();
  if (INTRO_PHRASES.has(clean)) return true;
  if (/[:;,]$/.test(text) || text.endsWith("...")) return true;
  if (DANGLING_CONNECTORS.test(clean) && clean.split(/\s+/).length <= 8) {
    return true;
  }

  // Solo nombró una obra ("en obra Terraza", "obra Baño") sin verbo, monto ni pregunta.
  const words = clean.split(/\s+/).filter(Boolean);
  if (
    words.length <= 5 &&
    /\b(?:obra|proyecto|faena)\b/.test(clean) &&
    !ACTION_OR_QUERY_VERB.test(clean.replace(/\b(?:obra|proyecto|faena)\b/g, ""))
  ) {
    return true;
  }

  return false;
}

/**
 * Si tras esperar la ráfaga completa el usuario únicamente envió un saludo o
 * introducción abierta sin contenido ejecutable ni archivo adjunto, evita invocar
 * al modelo en falso y responde con una invitación breve conservando contexto de obra.
 */
export function isIntroductoryPauseOnly(
  text: string,
  hasAttachment: boolean,
  projects: any[] = [],
): { reply: string; projectId: string | null } | null {
  if (hasAttachment) return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes("?") || trimmed.includes("¿")) return null;

  const clean = norm(trimmed).replace(/[.!?¡¿,:;]+$/g, "").trim();

  if (
    INTRO_PHRASES.has(clean) ||
    /^(?:hol+a+|buena+s?|bueno+s?\s+(?:dia+s?|tarde+s?|noche+s?)|wena+s?)$/.test(clean)
  ) {
    return {
      reply:
        "Aquí estoy. Cuéntame en qué obra quieres registrar el avance, gasto, foto o consulta.",
      projectId: null,
    };
  }

  // Solo si comenzó con marcador explícito ("en obra X", "en la obra Y", "para la obra Z") sin predicado.
  const introProjectMatch =
    /^(?:(?:hola|buenas|mira|oye)[,.\s]+)?(?:en|para|sobre|de)\s+(?:la\s+|el\s+)?(?:obra|proyecto|faena)\s+(.+)$/i.exec(
      clean,
    );
  if (!introProjectMatch) return null;

  const targetName = introProjectMatch[1].trim();
  if (!targetName || ACTION_OR_QUERY_VERB.test(targetName)) return null;

  const mentioned = projectMentions(projects, trimmed);
  const resolvedId =
    mentioned.length === 1
      ? mentioned[0].id
      : conversationProjectId(projects, trimmed, []);

  if (resolvedId) {
    const project = projects.find((p) => p.id === resolvedId);
    return {
      reply: `Aquí estoy, tomando nota para *${project?.nombre || "la obra"}*. Cuéntame qué pasó o envíame el avance, audio o foto.`,
      projectId: resolvedId,
    };
  }

  return null;
}

const NOISE_HALLUCINATIONS = new Set([
  "subtitulos realizados por la comunidad de amara.org",
  "subtitulos por la comunidad de amara.org",
  "amara.org",
  "gracias por ver el video",
  "gracias por ver",
  "suscribete",
  "dale like",
]);

/** Limpia alucinaciones típicas del transcriptor ante ruido de herramientas o silencio. */
export function sanitizeSttNoiseTranscript(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const clean = norm(trimmed)
    .replace(/[.!?,;:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || NOISE_HALLUCINATIONS.has(clean)) return "";
  return trimmed;
}

function isMissingQueueSchema(error: any): boolean {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return (
    ["PGRST202", "42883", "42P01", "NOT_CONFIGURED"].includes(code) ||
    /whatsapp_encolar_mensaje|whatsapp_estado_cola_actor|whatsapp_cola_entrada/i.test(msg)
  );
}

export type BurstCollectionResult =
  | { role: "fallback" }
  | { role: "duplicate" }
  | { role: "queued" }
  | { role: "leader"; batchId: string; items: any[] };

/**
 * Agrupa mensajes enviados en ráfaga por un mismo trabajador/jefe en WhatsApp.
 * Detecta si sigue escribiendo dentro de una ventana deslizante y entrega un lote ordenado.
 */
export async function collectWhatsAppBurst(
  sb: any,
  user: { id: string; empresa_id: string },
  message: any,
  phone: string,
  config?: WhatsAppBurstConfig,
): Promise<BurstCollectionResult> {
  if (!config?.enabled || typeof sb?.rpc !== "function") {
    return { role: "fallback" };
  }

  const standardMs = Math.max(0, config.standardMs ?? DEFAULT_WHATSAPP_BURST.standardMs);
  const incompleteMs = Math.max(
    standardMs,
    config.incompleteMs ?? DEFAULT_WHATSAPP_BURST.incompleteMs,
  );
  const maxWaitMs = Math.max(
    incompleteMs,
    config.maxWaitMs ?? DEFAULT_WHATSAPP_BURST.maxWaitMs,
  );
  const pollMs = Math.max(10, config.pollMs ?? DEFAULT_WHATSAPP_BURST.pollMs);
  const sleep =
    config.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const enqueue = await sb.rpc("whatsapp_encolar_mensaje", {
    p_id: message.id,
    p_empresa: user.empresa_id,
    p_actor: user.id,
    p_phone: phone,
    p_payload: message,
  });

  if (enqueue?.error) {
    if (isMissingQueueSchema(enqueue.error)) return { role: "fallback" };
    throw enqueue.error;
  }

  const status = enqueue?.data?.status;
  if (status === "duplicate") return { role: "duplicate" };
  if (status === "queued_for_leader") return { role: "queued" };
  if (status !== "leader" && status !== "queued_behind_processing") {
    return { role: "fallback" };
  }

  const batchId = `batch-${crypto.randomUUID()}`;
  const startedAt = Date.now();
  let lastWindowMs =
    message?.type === "interactive" || message?.type === "button"
      ? 0
      : seemsIncompleteWhatsAppMessage(message)
        ? incompleteMs
        : standardMs;

  if (status === "leader" && lastWindowMs > 0) {
    await sleep(Math.min(pollMs, lastWindowMs));
  }

  const maxBusyWaitMs = Math.max(maxWaitMs + 5000, maxWaitMs * 2);
  while (true) {
    const elapsed = Date.now() - startedAt;
    const forceClaim = elapsed >= maxWaitMs;
    const state = await sb.rpc("whatsapp_estado_cola_actor", {
      p_empresa: user.empresa_id,
      p_actor: user.id,
      p_batch_id: batchId,
      p_window_ms: lastWindowMs,
      p_claim: forceClaim,
    });

    if (state?.error) {
      if (isMissingQueueSchema(state.error)) return { role: "fallback" };
      throw state.error;
    }

    const res = state?.data;
    if (res?.ready) {
      const items = Array.isArray(res.items) && res.items.length ? res.items : [message];
      return { role: "leader", batchId, items };
    }
    if (res?.empty) {
      // Otro líder ya reclamó estos mensajes mientras esperábamos.
      return { role: "queued" };
    }
    if (res?.busy && elapsed >= maxBusyWaitMs) {
      // Evita bucles infinitos quemando RPCs si otro proceso mantiene el lote ocupado hasta el timeout de Vercel.
      return { role: "queued" };
    }
    if (Array.isArray(res?.preview) && res.preview.length > 0) {
      const latest = res.preview[res.preview.length - 1];
      lastWindowMs = seemsIncompleteWhatsAppMessage(latest)
        ? incompleteMs
        : standardMs;
    }

    const waitSlice = forceClaim ? pollMs : Math.min(pollMs, Math.max(10, maxWaitMs - elapsed));
    await sleep(waitSlice);
  }
}
