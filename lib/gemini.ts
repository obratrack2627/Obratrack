import {CONSTRUCTION_WORKFLOW_RULES} from '@/lib/ai/prompt';
import { generateAI, getServerGeminiKey } from "@/lib/ai/provider";
import { AIError } from "@/lib/ai/errors";
import {
  parseChatResponse,
  extractLegacyActions,
  normalizeQuote,
} from "@/lib/ai/protocol";
import {
  chatPrompt,
  quotePrompt,
  isQuoteRequest,
  isQuoteRevision,
  isMaterialPriceRequest,
  materialSearchPrompt,
  isAlternativeRequest,
} from "@/lib/ai/prompt";
import {
  CHAT_RESPONSE_SCHEMA,
  QUOTE_RESPONSE_SCHEMA,
  WHATSAPP_RESPONSE_SCHEMA,
  MATERIAL_QUERY_SCHEMA,
} from "@/lib/ai/schema";
import {
  compareMaterialPrices,
  completePurchaseQuantity,
} from "@/lib/materials/catalog";
import { formatMaterialComparison } from "@/lib/materials/format";
import { quoteSummaryText } from "@/lib/ai/quote-format";

export const getGeminiApiKey = getServerGeminiKey;
export const extraerAccionesDeTexto = extractLegacyActions;

export async function generarCotizacionGemini(params: {
  descripcion: string;
  tipo_obra: string;
  metros_cuadrados?: number;
  comuna_region: string;
  margen_utilidad?: number;
  nivel_calidad: string;
}) {
  const result = await chatAsesorObrasGemini(
    [],
    `Prepara una cotización con estos datos proporcionados: ${JSON.stringify(params)}. No crees obras ni emitas acciones.`,
    {},
  );
  if (!result.cotizacion)
    throw new AIError("QUOTE_NEEDS_DETAILS", result.respuesta, 422);
  if (params.margen_utilidad == null) return result.cotizacion;
  return normalizeQuote({
    ...result.cotizacion,
    estructura_financiera: {
      ...result.cotizacion.estructura_financiera,
      margen_utilidad_porcentaje: params.margen_utilidad,
    },
  });
}

export async function chatAsesorObrasGemini(
  historial: { rol: "user" | "model"; texto: string }[],
  mensajeUsuario: string,
  contextoDB: Record<string, any> = {},
  options: {
    budgetMs?: number;
    timeoutMs?: number;
    image?: { mimeType: string; data: string };
  } = {},
) {
  const quote =
    !isMaterialPriceRequest(mensajeUsuario) &&
    (isQuoteRequest(mensajeUsuario) ||
      Boolean(contextoDB.cotizacion_actual && (isQuoteRevision(mensajeUsuario) || isAlternativeRequest(mensajeUsuario))));
  const priceSearch =
    isMaterialPriceRequest(mensajeUsuario) ||
    (/^(?:y |ahora (?:el|la|los|las) |(?:el|la|los|las) de )/i.test(
      mensajeUsuario,
    ) &&
      !/\b(registra|asigna|agenda|elimina|borra|crea|agrega|actualiza|marca|envia)\w*\b/i.test(
        mensajeUsuario,
      ) &&
      historial
        .slice(-2)
        .some(
          (m) =>
            m.rol === "model" &&
            m.texto.includes("Precios publicados en CLP; confirma"),
        ));
  const prompt = (
    priceSearch ? materialSearchPrompt : quote ? quotePrompt : chatPrompt
  )(historial, mensajeUsuario, contextoDB);
  const schema = priceSearch
    ? MATERIAL_QUERY_SCHEMA
    : quote ? QUOTE_RESPONSE_SCHEMA
    : contextoDB.creacion_obra_whatsapp
      ? WHATSAPP_RESPONSE_SCHEMA
      : CHAT_RESPONSE_SCHEMA;
  const result = parseChatResponse(
    await generateAI(priceSearch||quote?prompt:prompt+"\n"+CONSTRUCTION_WORKFLOW_RULES, {
      ...options,
      json: true,
      schema,
      budgetMs: Math.min(options.budgetMs || (quote ? 45000 : 30000), quote ? 45000 : 30000),
      timeoutMs: Math.min(options.timeoutMs || (quote ? 40000 : 30000), quote ? 40000 : 30000),
    }),
  );
  if (result.busqueda_materiales) {
    const comparison = await compareMaterialPrices(
      completePurchaseQuantity(result.busqueda_materiales, mensajeUsuario),
    );
    return {
      ...result,
      respuesta: formatMaterialComparison(comparison),
      accion: null,
      cotizacion: null,
      comparacion_materiales: comparison,
      sugerencias: [
        "Compara el precio del mismo modelo en ambas tiendas",
        "Prepara una lista de compra para mi obra",
      ],
    };
  }
  if (priceSearch)
    return {
      ...result,
      accion: null,
      cotizacion: null,
      respuesta:
        result.respuesta.includes("?") && !/\$|\bCLP\b/.test(result.respuesta)
          ? result.respuesta
          : "¿Qué material o herramienta quieres comparar? Indica marca o modelo, presentación y cantidad si los conoces.",
    };
  if (result.cotizacion)
    return { ...result, respuesta: quoteSummaryText(result.cotizacion) };
  return result;
}

export async function chatAgenteProyectoGemini(params: {
  historial: { rol: "user" | "model"; texto: string }[];
  mensajeUsuario: string;
  contextoProyecto: any;
  contextoDB?: Record<string, any>;
}) {
  const context = {
    ...params.contextoDB,
    proyectos: [params.contextoProyecto],
    proyecto_actual: params.contextoProyecto,
    cotizacion_actual: params.contextoProyecto.cotizacion_actual,
  };
  return chatAsesorObrasGemini(
    params.historial,
    params.mensajeUsuario,
    context,
  );
}

export { sugerirMaterialesCambioGemini } from "@/lib/ai/change-materials";
