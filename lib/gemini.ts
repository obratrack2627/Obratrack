import { compactAIContext, separatePrompt, ACTION_EXAMPLES } from '@/lib/ai/prompt-context';
import { buildToolChatInput, buildToolChatInstructions, getObraBotTools } from '@/lib/ai/tools';
import { generateValidatedChat, type ChatGenerationOptions } from '@/lib/ai/generation';
import { selectAIProfile } from '@/lib/ai/model-router';
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
  isQuoteFollowUp,
  isQuoteRevision,
  isMaterialPriceRequest,
  isFollowUpMaterialSearch,
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
  compareQuoteMaterials,
  completePurchaseQuantity,
} from "@/lib/materials/catalog";
import { compareMaterialPricesEnriched } from "@/lib/materials/enriched";
import { findNearbyHardwareStores } from "@/lib/materials/nearby";
import type { HistoricalMaterialRecord, HistoricalProjectRecord } from "@/lib/materials/history";
import { formatMaterialComparison, formatBatchMaterialComparison } from "@/lib/materials/format";
import { isMaterialComparison } from "@/lib/materials/types";
import { quoteSummaryText } from "@/lib/ai/quote-format";
import { extractQuoteMaterials } from "@/lib/quotes/project-bridge";

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

export function chatGenerationRequest(
  historial: { rol: "user" | "model"; texto: string }[], mensajeUsuario: string,
  contextoDB: Record<string, any> = {}, options: ChatGenerationOptions = {},
) {
  const followUpSearch = isFollowUpMaterialSearch(
    mensajeUsuario,
    historial,
    Boolean(contextoDB.cotizacion_actual),
  );
  const quote =
    !requestsPlatformAction(mensajeUsuario) &&
    !isMaterialPriceRequest(mensajeUsuario) &&
    !followUpSearch &&
    (isQuoteRequest(mensajeUsuario) ||
      isQuoteFollowUp(mensajeUsuario, historial) ||
      Boolean(contextoDB.cotizacion_actual && (isQuoteRevision(mensajeUsuario) || isAlternativeRequest(mensajeUsuario))));
  const priceSearch =
    isMaterialPriceRequest(mensajeUsuario) ||
    followUpSearch ||
    (/^(?:y |ahora (?:el|la|los|las) |(?:el|la|los|las) de )/i.test(
      mensajeUsuario,
    ) &&
      !/\b(registra|asigna|agenda|elimina|borra|crea|agrega|actualiza|marcar|envia)\w*\b/i.test(
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
  const compacted = compactAIContext(contextoDB);
  const actionRequested = requestsPlatformAction(mensajeUsuario);
  const useToolCalling =
    !pureSearchOnly &&
    !quote &&
    process.env.OBRABOT_TOOL_CALLING !== 'false';
  if (useToolCalling) {
    const tools = getObraBotTools({
      role: contextoDB.rol || contextoDB.usuario_actual?.rol || 'admin',
      actionsEnabled: contextoDB.acciones_habilitadas !== false,
      whatsapp: Boolean(contextoDB.creacion_obra_whatsapp),
    });
    const profile = selectAIProfile({
      mode: 'chat',
      message: mensajeUsuario,
      hasImage: Boolean(options.image),
      hasActionRequest: actionRequested,
      channel: contextoDB.creacion_obra_whatsapp ? 'whatsapp' : 'web',
    });
    const extended = Boolean(options.image) || profile.tier === 'complex';
    return {
      mode: 'chat' as const,
      pureSearchOnly: false,
      input: buildToolChatInput(historial, mensajeUsuario, compacted),
      options: {
        ...options,
        model: options.model || profile.model,
        reasoningEffort: options.reasoningEffort || profile.reasoningEffort,
        maxOutputTokens: options.maxOutputTokens || profile.maxOutputTokens,
        instructions: buildToolChatInstructions(compacted),
        tools,
        toolChoice: 'auto' as const,
        budgetMs: Math.min(options.budgetMs || (extended ? 45000 : 30000), extended ? 45000 : 30000),
        timeoutMs: Math.min(options.timeoutMs || (extended ? 40000 : 30000), extended ? 40000 : 30000),
      },
    };
  }
  const prompt = (
    pureSearchOnly ? materialSearchPrompt : quote ? quotePrompt : chatPrompt
  )(historial, mensajeUsuario, compacted);
  const schema = pureSearchOnly
    ? MATERIAL_QUERY_SCHEMA
    : quote ? QUOTE_RESPONSE_SCHEMA
    : contextoDB.creacion_obra_whatsapp
      ? WHATSAPP_RESPONSE_SCHEMA
      : CHAT_RESPONSE_SCHEMA;
  const resolvedMode: 'search' | 'quote' | 'chat' = pureSearchOnly ? 'search' : quote ? 'quote' : 'chat';
  const profile = selectAIProfile({
    mode: resolvedMode,
    message: mensajeUsuario,
    hasImage: Boolean(options.image),
    hasActionRequest: actionRequested,
    channel: contextoDB.creacion_obra_whatsapp ? 'whatsapp' : 'web',
  });
  const extended = quote || Boolean(options.image) || profile.tier === 'complex';
  const separated = separatePrompt(prompt);
  return { mode: resolvedMode, pureSearchOnly,
    input: separated.input, options: {
      ...options,
      model: options.model || profile.model,
      reasoningEffort: options.reasoningEffort || profile.reasoningEffort,
      maxOutputTokens: options.maxOutputTokens || profile.maxOutputTokens,
      instructions: separated.instructions + (pureSearchOnly || quote ? '' : '\n' + CONSTRUCTION_WORKFLOW_RULES + '\n' + ACTION_EXAMPLES),
      json: true, schema,
      budgetMs: Math.min(options.budgetMs || (extended ? 45000 : 30000), extended ? 45000 : 30000),
      timeoutMs: Math.min(options.timeoutMs || (extended ? 40000 : 30000), extended ? 40000 : 30000),
    } };
}

export async function chatAsesorObrasGemini(
  historial: { rol: "user" | "model"; texto: string }[],
  mensajeUsuario: string,
  contextoDB: Record<string, any> = {},
  options: ChatGenerationOptions = {},
) {
  const quoteContext = contextoDB.cotizacion_actual;
  const activeProject = contextoDB.proyecto_actual;
  const projectList: any[] = Array.isArray(contextoDB.proyectos) ? contextoDB.proyectos : [];
  const historyProjects: HistoricalProjectRecord[] = projectList
    .filter((p) => p?.id && p?.nombre)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      comuna: p.comuna,
      region: p.region,
    }));
  const historyMaterials: HistoricalMaterialRecord[] = projectList.flatMap((p) =>
    Array.isArray(p?.materiales)
      ? p.materiales
          .filter((m: any) => m?.nombre && Number(m?.precio_unitario) > 0)
          .map((m: any) => ({
            proyecto_id: p.id,
            nombre: m.nombre,
            cantidad: m.cantidad,
            unidad: m.unidad,
            precio_unitario: Number(m.precio_unitario),
            proveedor: m.proveedor,
            comprado: m.comprado,
            created_at: m.created_at,
          }))
      : [],
  );
  const projectLocationLabel =
    [activeProject?.comuna, activeProject?.region].filter(Boolean).join(", ") ||
    undefined;

  const quoteMaterials = quoteContext ? extractQuoteMaterials(quoteContext) : [];
  const followUpQuoteSearch =
    quoteMaterials.length > 0 &&
    !hasNonSearchTask(mensajeUsuario) &&
    !requestsPlatformAction(mensajeUsuario) &&
    isFollowUpMaterialSearch(mensajeUsuario, historial, true);
  if (followUpQuoteSearch) {
    const batchLocation =
      quoteContext.comuna_region && quoteContext.comuna_region !== "Por definir"
        ? quoteContext.comuna_region
        : projectLocationLabel;
    const [items, nearby] = await Promise.all([
      compareQuoteMaterials(quoteMaterials, {
        ubicacion: batchLocation,
        latitud: activeProject?.latitud,
        longitud: activeProject?.longitud,
        tiendas: contextoDB.preferencias_conversacion?.tiendas,
      }),
      batchLocation || (activeProject?.latitud != null && activeProject?.longitud != null)
        ? findNearbyHardwareStores({
            producto: quoteMaterials.map((m) => m.nombre).slice(0, 3).join(", "),
            ubicacion: batchLocation,
            latitud: activeProject?.latitud,
            longitud: activeProject?.longitud,
          }).catch(() => [])
        : Promise.resolve([]),
    ]);
    if (items.length) {
      const responseText = formatBatchMaterialComparison(items, batchLocation);
      const flatOffers = items.flatMap((it) => it.comparison.ofertas.slice(0, 3)).slice(0, 12);
      const consolidated = {
        consulta: {
          producto: items.map((it) => it.label).join(", ").slice(0, 150),
          ...(batchLocation ? { ubicacion: batchLocation } : {}),
        },
        consultado_en: items[0].comparison.consultado_en,
        resumen: `Precios reales consultados en tiendas para ${items.length} ${items.length === 1 ? "material" : "materiales"} de «${quoteContext.titulo_proyecto}».`,
        ofertas: flatOffers,
        proveedores: items[0].comparison.proveedores.slice(0, 10),
        mejores_ids: items.flatMap((it) => it.comparison.mejores_ids).slice(0, 12),
        ...(nearby.length ? { ferreterias_cercanas: nearby.slice(0, 8) } : {}),
      };
      return {
        respuesta: responseText,
        accion: null,
        cotizacion: null,
        comparaciones_materiales: items,
        ...(isMaterialComparison(consolidated) ? { comparacion_materiales: consolidated } : {}),
        sugerencias: [
          "Cotiza otra alternativa con estos materiales",
          "Crea la obra con la cotización",
        ],
      };
    }
  }
  const request = chatGenerationRequest(historial, mensajeUsuario, contextoDB, options);
  const pureSearchOnly = request.pureSearchOnly;
  const result = await generateValidatedChat(request.input, mensajeUsuario, contextoDB, request.options);
  if (result.busqueda_materiales) {
    const parsedQuery = completePurchaseQuantity(result.busqueda_materiales, mensajeUsuario);
    const enrichedQuery = {
      ...parsedQuery,
      ...(!parsedQuery.ubicacion && projectLocationLabel ? { ubicacion: projectLocationLabel } : {}),
      ...(!parsedQuery.ubicacion && activeProject?.latitud != null && activeProject?.longitud != null
        ? { latitud: activeProject.latitud, longitud: activeProject.longitud }
        : {}),
    };
    const comparison = await compareMaterialPricesEnriched(enrichedQuery, {
      materials: historyMaterials,
      projects: historyProjects,
      comuna: activeProject?.comuna || enrichedQuery.ubicacion,
      region: activeProject?.region,
    });
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
