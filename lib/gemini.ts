import { GoogleGenAI } from '@google/genai';
import { CotizacionEstimacion, RecomendacionCobroCliente } from '@/types/database';

let geminiClientInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('YourGeminiApiKeyHere')) {
    return null;
  }

  if (!geminiClientInstance) {
    geminiClientInstance = new GoogleGenAI({
      apiKey: apiKey.trim(),
    });
  }
  return geminiClientInstance;
}

/**
 * Prompt del Sistema especializado en Construcción en Chile y Tarifas de Mercado
 */
export const SYSTEM_PROMPT_CONSTRUCCION_CHILE = `Eres el Agente Experto Cotizador de ObraTrack y Asesor de Costos, impulsado por Google Gemini IA. Eres el especialista de mayor nivel en presupuestos de construcción, cubicaciones, análisis de precios unitarios (APU), compras en ferreterías chilenas y fijación de precios ("¿Cuánto cobrar?") para contratistas, maestros mayores y constructoras en Chile.

Reglas del Mercado Chileno de Construcción (Valores en Pesos Chilenos CLP):
1. Red de Ferreterías y Materiales en Chile:
   - Construmart: Cemento (Melón/Polpaico $4.290-$4.500/saco 25kg), fierro estriado A63 ($5.290-$5.800/tira), mallas Acma C-92 ($19.990).
   - Imperial Barracas: Especialista en maderas (pino oregón, pino radiata seco $6.900-$7.500), tableros OSB 9.5mm ($8.990), terciados y tejas asfálticas ($27.990).
   - Red MTS / Chilemat: Cemento, áridos locales, tuberías PVC y ferretería pesada a granel.
   - Sodimac Constructor / Easy: Porcelanatos, adhesivos Bekron DA/Standard, pinturas, griferías y terminaciones.
   - Areneras / Barracas Locales: Áridos mezclados ($22.000-$26.000/m3), gravilla y arena fina.

2. Mano de Obra en Chile (Jornales de faena actuales):
   - Maestro Mayor / Capataz: $45.000 - $55.000 CLP / día.
   - Maestro Albañil / Carpintero / Gasfíter / Electricista: $38.000 - $45.000 CLP / día.
   - Ayudante / Jornalero: $26.000 - $32.000 CLP / día.

3. Asesor de Cobro al Cliente ("¿Cuánto Cobrar?"):
   - Precio Mínimo Rentable: Cubre estrictamente costos directos + 10% gastos generales + 5% imprevistos + 15% utilidad mínima (para ganar licitaciones muy competidas sin perder dinero).
   - Precio Sugerido de Mercado: Costos directos + 10% gastos generales + 5% imprevistos + 25-30% de utilidad (el precio justo y estándar en Chile).
   - Precio Premium con Garantía: Para obras de alta exigencia con terminaciones de lujo, post-venta y póliza de garantía (35-40% de utilidad).
   - Modalidad de Pago Recomendada: 40% anticipo al iniciar, 30% al 50% de avance (obra gruesa), 20% al terminar y 10% contra recepción conforme.`;

/**
 * Genera una cotización completa y recomendación de cobro al cliente con Google Gemini
 */
export async function generarCotizacionGemini(params: {
  descripcion: string;
  tipo_obra: string;
  metros_cuadrados: number;
  comuna_region: string;
  margen_utilidad: number;
  nivel_calidad: string;
}): Promise<CotizacionEstimacion | null> {
  const gemini = getGeminiClient();
  if (!gemini) return null;

  try {
    const prompt = `${SYSTEM_PROMPT_CONSTRUCCION_CHILE}

Genera una cotización profesional estructurada para el siguiente proyecto:
Descripción: "${params.descripcion}"
Tipo de Obra: ${params.tipo_obra}
Metros Cuadrados: ${params.metros_cuadrados} m2
Ubicación / Comuna: ${params.comuna_region}
Nivel de Calidad: ${params.nivel_calidad}
Margen de Utilidad deseado: ${params.margen_utilidad}%

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "titulo_proyecto": "Título descriptivo del proyecto",
  "tipo_obra": "${params.tipo_obra}",
  "duracion_dias_estimada": 15,
  "resumen_ejecutivo": "Explicación técnica clara para el contratista y el cliente",
  "materiales": [
    {
      "nombre": "Nombre material exacto",
      "categoria": "obra_gruesa | maderas_tableros | techumbre | terminaciones | ferreteria | instalaciones",
      "cantidad": 10,
      "unidad": "saco | tira | plancha | m2 | m3 | paquete | unidad | litro",
      "precio_unitario_estimado": 5000,
      "subtotal": 50000,
      "mejor_tienda": "Construmart | Imperial Barracas | Sodimac Constructor | Red MTS | Easy",
      "precio_mas_barato": 4200,
      "ahorro_estimado": 8000,
      "alternativa_economica": "Sugerencia de ahorro"
    }
  ],
  "mano_de_obra": [
    {
      "rol": "Maestro Mayor / Albañil / Ayudante",
      "cantidad_personas": 1,
      "dias_estimados": 10,
      "valor_jornal_diario": 42000,
      "subtotal": 420000
    }
  ],
  "radar_proveedores": [
    {
      "tienda": "Imperial Barracas",
      "categoria_destacada": "Maderas y Tableros",
      "nivel_precio": "mas_barato",
      "descuentos_disponibles": "Descuento en compras por volumen",
      "ahorro_estimado_total": 85000,
      "ventajas": ["Cortes a medida", "Stock permanente"]
    }
  ],
  "actividades_gantt": [
    {
      "nombre": "Nombre partida",
      "dias": 4,
      "orden": 1
    }
  ],
  "consejos_experto_pyme": [
    "Consejo técnico 1",
    "Consejo de compra 2"
  ],
  "recomendacion_cobro": {
    "precio_minimo_rentable": 1500000,
    "precio_sugerido_mercado": 1950000,
    "precio_premium_garantia": 2300000,
    "estrategia_negociacion": "Cómo presentar la propuesta al mandante y justificar el valor",
    "desglose_por_metro_cuadrado": 97500,
    "formas_pago_recomendadas": [
      "40% al iniciar la obra (compra de materiales)",
      "30% al terminar obra gruesa / avance 50%",
      "20% al finalizar instalaciones y pinturas",
      "10% contra entrega de llaves y recepción conforme"
    ],
    "justificacion_precio": "Por qué este precio garantiza calidad, materiales certificados y no incurre en sobrecostos"
  }
}`;

    const candidateModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
    let text: string | undefined;

    for (const modelName of candidateModels) {
      try {
        const response = await gemini.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
        if (response.text) {
          text = response.text;
          break;
        }
      } catch (err) {
        console.warn(`Generar cotización falló con ${modelName}, probando siguiente modelo...`);
      }
    }

    if (!text) return null;

    const parsed = JSON.parse(text);

    // Calcular estructura financiera en pesos chilenos
    const costoMateriales = (parsed.materiales || []).reduce(
      (sum: number, item: any) =>
        sum + (Number(item.precio_mas_barato || item.precio_unitario_estimado || 0) * (item.cantidad || 1)),
      0
    );
    const costoManoObra = (parsed.mano_de_obra || []).reduce(
      (sum: number, item: any) => sum + Number(item.subtotal || 0),
      0
    );
    const costoDirecto = costoMateriales + costoManoObra;
    const gastosGeneralesMonto = Math.round(costoDirecto * 0.1);
    const imprevistosMonto = Math.round(costoDirecto * 0.05);
    const baseConCostosIndirectos = costoDirecto + gastosGeneralesMonto + imprevistosMonto;
    const margenMonto = Math.round(baseConCostosIndirectos * (params.margen_utilidad / 100));
    const precioNeto = baseConCostosIndirectos + margenMonto;
    const iva19 = Math.round(precioNeto * 0.19);
    const precioConIva = precioNeto + iva19;

    const totalAhorro = (parsed.materiales || []).reduce(
      (sum: number, item: any) => sum + Number(item.ahorro_estimado || 0),
      0
    );

    const recCobro: RecomendacionCobroCliente = parsed.recomendacion_cobro || {
      precio_minimo_rentable: Math.round(baseConCostosIndirectos * 1.15),
      precio_sugerido_mercado: precioConIva,
      precio_premium_garantia: Math.round(baseConCostosIndirectos * 1.38 * 1.19),
      estrategia_negociacion:
        'Presenta el presupuesto destacando la compra en ferreterías especializadas y el desglose de partidas de Carta Gantt.',
      desglose_por_metro_cuadrado:
        params.metros_cuadrados > 0 ? Math.round(precioConIva / params.metros_cuadrados) : undefined,
      formas_pago_recomendadas: [
        '40% Anticipo (Materiales e Inicio)',
        '30% Avance Intermedio (Obra Gruesa)',
        '20% Terminaciones e Instalaciones',
        '10% Entrega y Recepción Conforme',
      ],
      justificacion_precio:
        'Cálculo basado en jornales de mercado en Chile y lista de materiales optimizada.',
    };

    return {
      id: 'cot-' + Date.now(),
      titulo_proyecto: parsed.titulo_proyecto || 'Cotización de Obra (Google Gemini IA)',
      tipo_obra: parsed.tipo_obra || params.tipo_obra,
      metros_cuadrados: Number(params.metros_cuadrados),
      comuna_region: params.comuna_region,
      duracion_dias_estimada: Number(parsed.duracion_dias_estimada || 15),
      resumen_ejecutivo: parsed.resumen_ejecutivo || '',
      materiales: parsed.materiales || [],
      mano_de_obra: parsed.mano_de_obra || [],
      estructura_financiera: {
        costo_materiales_total: costoMateriales,
        costo_mano_obra_total: costoManoObra,
        costo_directo: costoDirecto,
        gastos_generales_porcentaje: 10,
        gastos_generales_monto: gastosGeneralesMonto,
        imprevistos_porcentaje: 5,
        imprevistos_monto: imprevistosMonto,
        margen_utilidad_porcentaje: Number(params.margen_utilidad),
        margen_utilidad_monto: margenMonto,
        precio_sugerido_neto: precioNeto,
        iva_19: iva19,
        precio_total_con_iva: precioConIva,
        ahorro_compras_estrategicas: totalAhorro,
      },
      radar_proveedores: parsed.radar_proveedores || [],
      actividades_gantt: parsed.actividades_gantt || [],
      consejos_experto_pyme: parsed.consejos_experto_pyme || [],
      recomendacion_cobro: recCobro,
      fecha_creacion: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error al generar cotización con Google Gemini:', error);
    return null;
  }
}

/**
 * Chat interactivo conversacional con el Asesor Experto en Obras & Agendador IA (Google Gemini)
 */
export async function chatAsesorObrasGemini(
  historial: { rol: 'user' | 'model'; texto: string }[],
  mensajeUsuario: string
): Promise<{ respuesta: string; accion?: any; sugerencias?: string[] }> {
  const gemini = getGeminiClient();

  const fechaHoy = new Date().toISOString().split('T')[0];
  const diaSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()];

  const systemInstructionsChat = `${SYSTEM_PROMPT_CONSTRUCCION_CHILE}

HOY ES: ${diaSemana}, ${fechaHoy}.

ROL Y REGLAS DE CONVERSACIÓN:
1. Eres el Copiloto Inteligente de ObraTrack y Asistente de Faena para Chile. Hablas en español de Chile de forma profesional, clara, cercana y directa como un ingeniero civil / jefe de obras experimentado.
2. REGLA ESTRICTA DE CONTEXTO: Tu único dominio es la construcción, ingeniería civil, edificación, cálculo de materiales (cemento, maderas, fierros, cerámicos), cubicaciones, precios en ferreterías chilenas, mano de obra y agendamiento de faenas. Si el usuario intenta hablar de recetas de cocina, videojuegos, política internacional o temas fuera de obra, dile amablemente: "Mi función como Asistente de ObraTrack está 100% enfocada en faena, costos y construcción en Chile. ¿En qué obra o presupuesto te puedo colaborar hoy?".
3. CAPACIDAD DE AGENDAR Y CREAR TAREAS:
   - Si el usuario te pide agendar una visita a terreno, reunión con mandante, vaciado de hormigón, inspección de faena, entrega de materiales o recordatorio (ejemplo: "Agéndame una visita a terreno para el viernes a las 10:00 en Peñalolén con Don Carlos"):
     Debes incluir en el JSON el objeto "accion" con los datos estructurados.
   - Si es solo una consulta técnica o de costos (ej: "¿cuánto rinde un saco de cemento?"), "accion" debe ser null.

FORMATO DE RESPUESTA OBLIGATORIO:
Debes responder SIEMPRE con un JSON válido con esta estructura:
{
  "respuesta": "Texto conversacional natural, empático y técnico explicando la respuesta o confirmando el agendamiento...",
  "accion": {
    "tipo": "agendar_evento",
    "titulo": "Visita de Terreno con Don Carlos",
    "tipo_evento": "visita_terreno",
    "fecha": "YYYY-MM-DD",
    "hora": "10:00",
    "comuna_lugar": "Peñalolén, Santiago",
    "descripcion": "Revisión de avances y niveles de terreno",
    "cliente_nombre": "Don Carlos"
  } | null,
  "sugerencias": [
    "Sugerencia 1",
    "Sugerencia 2",
    "Sugerencia 3"
  ]
}`;

  if (!gemini) {
    const lower = mensajeUsuario.toLowerCase();
    if (lower.includes('agendar') || lower.includes('visita') || lower.includes('reunión') || lower.includes('reunion')) {
      return {
        respuesta:
          '¡Listo! He registrado la visita a terreno en la agenda de tu obra. Puedes verla en cualquier momento en tu cronograma.',
        accion: {
          tipo: 'agendar_evento',
          titulo: 'Visita de Terreno',
          tipo_evento: 'visita_terreno',
          fecha: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          hora: '10:00',
          comuna_lugar: 'Santiago, Chile',
          descripcion: mensajeUsuario,
          cliente_nombre: 'Cliente Mandante',
        },
        sugerencias: ['Ver agenda de obras', 'Calcular insumos para la visita', '¿Cuánto cobrar por el proyecto?'],
      };
    }

    return {
      respuesta:
        '¡Hola! Soy tu Asesor de Obras & Costos de ObraTrack. Puedo ayudarte a calcular rendimientos de cemento, madera, fierro, jornales en Chile, o agendar visitas a terreno y tareas de faena directamente.',
      sugerencias: [
        'Agéndame una visita a terreno para mañana a las 10:00',
        '¿Cuánto rinde un saco de cemento en un radier de 10cm?',
        '¿Cuánto cobrar por instalar 40m2 de porcelanato?',
      ],
    };
  }

  try {
    const formattedContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    // Prompt de sistema como primer mensaje de contexto
    formattedContents.push({
      role: 'user',
      parts: [{ text: systemInstructionsChat }],
    });
    formattedContents.push({
      role: 'model',
      parts: [
        {
          text: JSON.stringify({
            respuesta: 'Entendido. Estoy listo como Asistente de Obras de ObraTrack para responder consultas técnicas y agendar eventos de faena en Chile.',
            accion: null,
            sugerencias: ['¿Cómo calculo sacos de cemento?', 'Agéndame una visita a terreno', '¿Cuánto cobrar por m2?'],
          }),
        },
      ],
    });

    // Historial previo
    for (const h of historial) {
      if (h.texto && h.texto.trim() !== '') {
        formattedContents.push({
          role: h.rol === 'user' ? 'user' : 'model',
          parts: [{ text: h.texto }],
        });
      }
    }

    // Mensaje actual del usuario
    formattedContents.push({
      role: 'user',
      parts: [{ text: mensajeUsuario }],
    });

    const candidateModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
    let rawText = '';

    for (const m of candidateModels) {
      try {
        const response = await gemini.models.generateContent({
          model: m,
          contents: formattedContents,
          config: {
            responseMimeType: 'application/json',
          },
        });
        if (response.text) {
          rawText = response.text;
          break;
        }
      } catch (mErr) {
        console.warn(`Chat falló con ${m}, intentando modelo alternativo...`);
      }
    }

    if (!rawText) {
      return {
        respuesta:
          'No pude procesar la consulta en este momento. Por favor reintenta tu pregunta sobre faena o agendamiento.',
        sugerencias: ['Reintentar', 'Ver precios de referencia'],
      };
    }

    try {
      const parsed = JSON.parse(rawText);
      return {
        respuesta: parsed.respuesta || rawText,
        accion: parsed.accion || null,
        sugerencias: parsed.sugerencias || [
          '¿Cuánto cobrar por metro cuadrado en este trabajo?',
          '¿Cómo divido las partidas para la Carta Gantt?',
          '¿Qué ferretería tiene el mejor precio para estos materiales?',
        ],
      };
    } catch {
      return {
        respuesta: rawText,
        accion: null,
        sugerencias: ['Ver costos de jornales', 'Cubicación de materiales', 'Agendar visita'],
      };
    }
  } catch (error) {
    console.error('Error en chatAsesorObrasGemini:', error);
    return {
      respuesta:
        'Hubo un problema al consultar al Asesor de Google Gemini. Verifica tu conexión o intenta nuevamente.',
      sugerencias: ['Reintentar consulta', 'Ver precios de referencia'],
    };
  }
}
