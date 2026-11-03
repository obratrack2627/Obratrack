import { generateAI } from "./provider";
import { quotePrompt } from "./prompt";
import { QUOTE_RESPONSE_SCHEMA } from "./schema";
import { parseChatResponse } from "./protocol";

export async function sugerirMaterialesCambioGemini(params: {
  titulo: string;
  descripcion: string;
  nombreObra?: string;
  comuna?: string;
}) {
  const message = `Cotiza exclusivamente este trabajo adicional: ${JSON.stringify(params)}. Pide dimensiones, especificaciones o alcance si no permiten calcular cantidades. No incluyas la obra completa ni inventes una superficie. Si se puede estimar, desglosa materiales, mano de obra, gastos generales, imprevistos y utilidad. Indica los supuestos.`;
  const result = parseChatResponse(
    await generateAI(
      quotePrompt([], message, {
        proyecto_actual: { nombre: params.nombreObra, comuna: params.comuna },
      }),
      { json: true, schema: QUOTE_RESPONSE_SCHEMA },
    ),
  );
  if (!result.cotizacion)
    return {
      requiere_datos: true,
      materiales: [],
      impacto_monto_sugerido: 0,
      impacto_dias_sugerido: 0,
      justificacion: result.respuesta,
    };
  const quote = result.cotizacion;
  return {
    requiere_datos: false,
    materiales: quote.materiales.map((m) => ({
      nombre: m.nombre,
      cantidad: m.cantidad,
      unidad: m.unidad,
      precio_unitario: m.precio_unitario_estimado,
    })),
    impacto_monto_sugerido: quote.estructura_financiera.precio_total_con_iva,
    impacto_dias_sugerido: quote.duracion_dias_estimada,
    justificacion: quote.resumen_ejecutivo || result.respuesta,
    desglose: quote.estructura_financiera,
  };
}
