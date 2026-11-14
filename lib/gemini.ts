import { compactAIContext, separatePrompt, ACTION_EXAMPLES } from '@/lib/ai/prompt-context';
import { generateValidatedChat, type ChatGenerationOptions } from '@/lib/ai/generation';
import {CONSTRUCTION_WORKFLOW_RULES} from '@/lib/ai/prompt';
import { getServerOpenAIKey } from "@/lib/ai/provider";
import { AIError } from "@/lib/ai/errors";
import {
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
  hasNonSearchTask,
  requestsPlatformAction,
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

// Alias histórico para los imports existentes; el único motor es OpenAI.
export const getGeminiApiKey = getServerOpenAIKey;
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
  options: ChatGenerationOptions = {},
) {
  const quote =
    !requestsPlatformAction(mensajeUsuario) &&
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
  const pureSearchOnly = priceSearch && !hasNonSearchTask(mensajeUsuario) && !requestsPlatformAction(mensajeUsuario);
  const prompt = (
    pureSearchOnly ? materialSearchPrompt : quote ? quotePrompt : chatPrompt
  )(historial, mensajeUsuario, compactAIContext(contextoDB));
  const schema = pureSearchOnly
    ? MATERIAL_QUERY_SCHEMA
    : quote ? QUOTE_RESPONSE_SCHEMA
    : contextoDB.creacion_obra_whatsapp
      ? WHATSAPP_RESPONSE_SCHEMA
      : CHAT_RESPONSE_SCHEMA;
  const extended = quote || Boolean(options.image);
  const separated = separatePrompt(prompt);
  const result = await generateValidatedChat(separated.input, mensajeUsuario, contextoDB, {
    ...options,
    instructions: separated.instructions + (pureSearchOnly || quote ? '' : '\n' + CONSTRUCTION_WORKFLOW_RULES + '\n' + ACTION_EXAMPLES),
    json: true, schema,
    budgetMs: Math.min(options.budgetMs || (extended ? 45000 : 30000), extended ? 45000 : 30000),
    timeoutMs: Math.min(options.timeoutMs || (extended ? 40000 : 30000), extended ? 40000 : 30000),
  });
  if (result.busqueda_materiales) {
    const comparison = await compareMaterialPrices(
      completePurchaseQuantity(result.busqueda_materiales, mensajeUsuario),
    );
    const comparisonText = formatMaterialComparison(comparison);
    if (pureSearchOnly && !result.accion && !result.cotizacion) {
      return {
        ...result,
        respuesta: comparisonText,
        accion: null,
        cotizacion: null,
        comparacion_materiales: comparison,
        sugerencias: [
          "Compara el precio del mismo modelo en ambas tiendas",
          "Prepara una lista de compra para mi obra",
        ],
      };
    }
    const consultText = (result.respuesta_consulta || (!result.accion ? result.respuesta : "") || "").trim();
    const quoteText = result.cotizacion ? quoteSummaryText(result.cotizacion) : "";
    const extraText = [comparisonText, quoteText].filter(Boolean).join("\n\n");
    return {
      ...result,
      ...(consultText ? { respuesta_consulta: consultText } : {}),
      respuesta: [consultText, extraText].filter(Boolean).join("\n\n") || comparisonText,
      ...(extraText ? { respuesta_adicional: extraText } : {}),
      comparacion_materiales: comparison,
    };
  }
  if (pureSearchOnly)
    return {
      ...result,
      accion: null,
      cotizacion: null,
      respuesta:
        result.respuesta.includes("?") && !/\$|\bCLP\b/.test(result.respuesta)
          ? result.respuesta
          : "¿Qué material o herramienta quieres comparar? Indica marca o modelo, presentación y cantidad si los conoces.",
    };
  if (result.cotizacion) {
    const quoteText = quoteSummaryText(result.cotizacion);
    const consultText = (result.respuesta_consulta || "").trim();
    return {
      ...result,
      ...(consultText ? { respuesta_consulta: consultText } : {}),
      respuesta: [consultText, quoteText].filter(Boolean).join("\n\n"),
      ...(result.accion ? { respuesta_adicional: quoteText } : {}),
    };
  }
  return result;
}

export async function chatAgenteProyectoGemini(params: {
  historial: { rol: "user" | "model"; texto: string }[];
  mensajeUsuario: string;
  contextoProyecto: any;
  contextoDB?: Record<string, any>;
  options?: ChatGenerationOptions;
}) {
  const context = {
    ...params.contextoDB,
    proyectos: [params.contextoProyecto],
    proyecto_actual: params.contextoProyecto,
    chat_proyecto_id: params.contextoProyecto.id,
    cotizacion_actual: params.contextoProyecto.cotizacion_actual,
  };
  return chatAsesorObrasGemini(
    params.historial,
    params.mensajeUsuario,
    context,
    params.options,
  );
}

export { sugerirMaterialesCambioGemini } from "@/lib/ai/change-materials";
