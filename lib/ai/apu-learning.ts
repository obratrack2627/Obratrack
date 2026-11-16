import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { chileToday } from "./project-deadlines";
import { indexKnowledge, scheduleKnowledgeIndex } from "./rag-index";

export type ApuCategory = "obra_gruesa" | "terminaciones" | "instalaciones" | "otro";
export type ApuUnit = "m2" | "m3" | "ml" | "unidad";

export interface ParsedApuLesson {
  nombre: string;
  categoria: ApuCategory;
  unidad: ApuUnit;
  rendimiento: number;
  unidad_rendimiento: string;
}

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function inferCategory(text: string): ApuCategory {
  const clean = norm(text);
  if (/\b(?:radier|hormigon|excavacion|cimiento|losa|albanileria|tabique|muro|fierro|enfierradura|moldaje|estructura|carpinteria|techo|techumbre)\b/.test(clean)) {
    return "obra_gruesa";
  }
  if (/\b(?:pintura|latex|esmalte|ceramica|porcelanato|piso|flotante|estuco|empaste|papel|terminacion|barniz|enchape|cielo|yeso carton|volcanita)\b/.test(clean)) {
    return "terminaciones";
  }
  if (/\b(?:electric|cable|enchufe|tablero|gasfiteria|ppr|pvc|alcantarillado|agua|sanitari|calefont|clima|aire acondicionado|iluminacion)\b/.test(clean)) {
    return "instalaciones";
  }
  return "otro";
}

function normalizeApuUnit(rawUnit: string): ApuUnit {
  const u = norm(rawUnit);
  if (/^(?:m2|m²|mt2|metros?\s+cuadrados?)$/.test(u)) return "m2";
  if (/^(?:m3|m³|mt3|metros?\s+cubicos?)$/.test(u)) return "m3";
  if (/^(?:ml|metros?\s+lineales?)$/.test(u)) return "ml";
  return "unidad";
}

export function isLearnApuIntent(message: string): boolean {
  const clean = norm(message);
  return (
    /^(?:por favor[, ]+)?(?:aprende|guarda|registra|recuerda|memoriza|agrega)\b/.test(clean) &&
    /\b(?:rendimientos?|apu|rinde|rindes)\b/.test(clean)
  );
}

export function parseApuLesson(message: string): { lesson?: ParsedApuLesson; question?: string } {
  if (!isLearnApuIntent(message)) return {};
  const trimmed = message.trim();
  const body = trimmed
    .replace(
      /^(?:por favor[, ]+)?(?:aprende|guarda|registra|recuerda|memoriza|agrega)(?:\s+(?:este|el|un|una|en|como|para))?\s*(?:rendimiento|apu)?(?:\s+(?:de|para|que))?\s*[:\-]?\s*/i,
      "",
    )
    .trim();

  const qtyMatch = body.match(
    /(\d+(?:[.,]\d+)?)\s*(m2|m²|mt2|metros?\s+cuadrados?|m3|m³|mt3|metros?\s+cubicos?|ml|metros?\s+lineales?|unidades?|sacos?|planchas?|rollos?|puntos?|salidas?)?(?:\s*(?:\/|por)\s*([^\n.,;]{2,40}))?/i,
  );
  if (!qtyMatch) {
    return {
      question:
        "Para guardar un rendimiento en la base de ObraBot indica la partida y el rendimiento numérico. Ejemplo: «Aprende rendimiento: Pintura muros, 25 m2 por persona al día».",
    };
  }
  const num = Number(qtyMatch[1].replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) {
    return { question: "El rendimiento debe ser un número mayor a cero." };
  }
  const unidad = normalizeApuUnit(qtyMatch[2] || "unidad");
  const rawPeriod = (qtyMatch[3] || "persona/dia").trim().replace(/\s+/g, " ");
  const unidad_rendimiento = `${unidad}/${rawPeriod}`.slice(0, 80);

  const beforeQty = body.slice(0, qtyMatch.index || 0).replace(/[,:;\-]+$/g, "").trim();
  const afterQty = body.slice((qtyMatch.index || 0) + qtyMatch[0].length).replace(/^[,:;\-\s]+/, "").trim();
  const nombre = (beforeQty || afterQty)
    .replace(/\b(?:un|una|el|la)\s+(?:maestro|pintor|trabajador|cuadrilla)\s+(?:rinde|hace|avanza)\b/gi, "")
    .replace(/\b(?:rinde|rendimiento|hace|avanza|usa)\b/gi, "")
    .replace(/[,:;\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  if (nombre.length < 3) {
    return {
      question:
        "¿A qué partida o faena corresponde ese rendimiento? Ejemplo: «Aprende rendimiento: Pintura de muros, 25 m2/persona/día».",
    };
  }

  return {
    lesson: {
      nombre,
      categoria: inferCategory(nombre),
      unidad,
      rendimiento: num,
      unidad_rendimiento,
    },
  };
}

export async function learnApuCommand(
  client: any,
  user: { id: string; empresa_id: string; rol: string },
  message: string,
  channel: "web" | "whatsapp",
  opts: { embed?: (text: string) => Promise<number[]> } = {},
): Promise<{ handled: boolean; respuesta?: string; apu?: any }> {
  if (!isLearnApuIntent(message)) return { handled: false };
  if (!["admin", "supervisor"].includes(user.rol)) {
    return {
      handled: true,
      respuesta:
        "Solo administración y supervisión pueden guardar rendimientos oficiales (APU) en la memoria de la empresa.",
    };
  }
  const parsed = parseApuLesson(message);
  if (parsed.question || !parsed.lesson) {
    return { handled: true, respuesta: parsed.question };
  }
  const lesson = parsed.lesson;
  const { data, error } = await client
    .from("obrabot_apu")
    .insert({
      empresa_id: user.empresa_id,
      nombre: lesson.nombre,
      categoria: lesson.categoria,
      unidad: lesson.unidad,
      rendimiento: lesson.rendimiento,
      unidad_rendimiento: lesson.unidad_rendimiento,
      fuente: `Confirmado por jefatura (${channel === "whatsapp" ? "WhatsApp" : "Web"})`,
      fecha_referencia: chileToday(),
      aprobado: true,
      revisado_por: user.id,
    })
    .select("id,nombre,categoria,unidad,rendimiento,unidad_rendimiento")
    .maybeSingle();

  if (error) {
    return {
      handled: true,
      respuesta: "No se pudo guardar el rendimiento en este momento. Intenta nuevamente.",
    };
  }

  if (process.env.OBRABOT_RAG_ENABLED === "true") {
    const admin = getSupabaseAdmin();
    const indexClient = admin || client;
    if (opts.embed) {
      await indexKnowledge(indexClient, user.empresa_id, opts.embed, 5).catch(() => 0);
    } else {
      scheduleKnowledgeIndex(user.empresa_id);
    }
  }

  return {
    handled: true,
    apu: data || lesson,
    respuesta:
      `Rendimiento aprendido y guardado para futuras cotizaciones:\n` +
      `• Partida: ${lesson.nombre}\n` +
      `• Rendimiento: ${lesson.rendimiento.toLocaleString("es-CL")} ${lesson.unidad_rendimiento}\n` +
      `• Categoría: ${lesson.categoria.replace("_", " ")}`,
  };
}
