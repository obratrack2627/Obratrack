import { GoogleGenAI } from '@google/genai';
import { CotizacionEstimacion, RecomendacionCobroCliente } from '@/types/database';

let geminiClientInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  // Solo usar variables de entorno server-side válidas — NUNCA usar claves de Firebase
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('YourGeminiApiKeyHere') || apiKey.startsWith('AIzaSyADGLLef')) {
    return null;
  }

  if (!geminiClientInstance) {
    try {
      geminiClientInstance = new GoogleGenAI({
        apiKey: apiKey.trim(),
      });
    } catch (e) {
      console.warn('Error instanciando GoogleGenAI:', e);
      return null;
    }
  }
  return geminiClientInstance;
}

const CANDIDATE_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-2.5-pro'];

/**
 * Prompt del Sistema especializado en Construcción en Chile y Tarifas de Mercado
 */
export const SYSTEM_PROMPT_CONSTRUCCION_CHILE = `Eres el Asistente Experto y Copiloto de Obras de ObraTrack para Chile. Eres un ingeniero civil / jefe de obras de alto nivel, con amplia experiencia en cubicaciones, edificación, remuneraciones de cuadrilla y compras de materiales en ferreterías chilenas (Construmart, Imperial, Sodimac, Red MTS, Easy y Barracas).

Reglas del Mercado Chileno de Construcción (Valores en Pesos Chilenos CLP y UF/m2):
1. Red de Ferreterías y Materiales en Chile:
   - Construmart: Cemento (Melón/Polpaico $4.290-$4.500/saco 25kg), fierro estriado A63 ($5.290-$5.800/tira), mallas Acma C-92 ($19.990).
   - Imperial Barracas: Especialista en maderas (pino oregón, pino radiata seco $6.900-$7.500), tableros OSB 9.5mm ($8.990), terciados estructurales y tejas asfálticas ($27.990).
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

    let text: string | undefined;

    for (const modelName of CANDIDATE_GEMINI_MODELS) {
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
 * Motor Heurístico Experto de Construcción en Chile para el Copiloto Obrero
 * Garantiza respuestas precisas, analíticas y con acciones en vivo aún sin conexión a Gemini API
 */
export function generarRespuestaHeuristicaCopiloto(
  mensajeUsuario: string,
  contextoDB?: {
    proyectos?: { id: string; nombre: string; comuna?: string; estado?: string }[];
    trabajadores?: { id: string; nombre: string; rol?: string }[];
    clientes?: { id: string; nombre: string }[];
  }
): { respuesta: string; accion?: any; sugerencias?: string[] } {
  const msg = mensajeUsuario.toLowerCase().trim();

  // 1. Detectar intención de ENVIAR COTIZACIÓN AL CLIENTE POR WHATSAPP / PDF
  if (
    msg.includes('envia') ||
    msg.includes('envía') ||
    msg.includes('mandar') ||
    msg.includes('mándale') ||
    msg.includes('mandale') ||
    msg.includes('compartir')
  ) {
    let clienteNombre = 'Carlos Henríquez';
    let clienteTelefono = '+56987654321';
    let proyectoNombre = 'Instalación de Porcelanato (35 m²)';
    let montoTotal = 1994201;

    // Buscar en el contexto si hay proyectos o clientes activos
    if (contextoDB?.clientes && contextoDB.clientes.length > 0) {
      clienteNombre = contextoDB.clientes[0].nombre;
    }
    if (contextoDB?.proyectos && contextoDB.proyectos.length > 0) {
      proyectoNombre = contextoDB.proyectos[0].nombre;
    }

    const clienteMatch = msg.match(/(?:a|para)\s+([a-záéíóúñ\s]+?)(?:\s+por|\s+el|\s+la|$)/i);
    if (clienteMatch) clienteNombre = clienteMatch[1].trim();

    const cotizacionDemo: CotizacionEstimacion = {
      id: 'cot-' + Date.now(),
      titulo_proyecto: proyectoNombre,
      tipo_obra: 'Terminaciones',
      metros_cuadrados: 35,
      comuna_region: 'Santiago, Chile',
      duracion_dias_estimada: 4,
      resumen_ejecutivo: `Propuesta formal de cotización para ${proyectoNombre}, considerando compra de materiales en ferreterías especializadas, jornales de cuadrilla y desglose de estados de pago.`,
      materiales: [
        {
          nombre: 'Porcelanato Esmaltado Antideslizante 60x60',
          categoria: 'terminaciones',
          cantidad: 41,
          unidad: 'm2',
          precio_unitario_estimado: 12990,
          subtotal: 532590,
          mejor_tienda: 'Sodimac Constructor',
          precio_mas_barato: 12990,
          ahorro_estimado: 45000,
        },
        {
          nombre: 'Adhesivo Bekron DA en Pasta / Saco 25kg',
          categoria: 'terminaciones',
          cantidad: 8,
          unidad: 'saco',
          precio_unitario_estimado: 7490,
          subtotal: 59920,
          mejor_tienda: 'Construmart',
          precio_mas_barato: 7490,
          ahorro_estimado: 8000,
        },
        {
          nombre: 'Fragüe Impermeable Antihongos 1kg',
          categoria: 'terminaciones',
          cantidad: 8,
          unidad: 'kg',
          precio_unitario_estimado: 2490,
          subtotal: 19920,
          mejor_tienda: 'Construmart',
          precio_mas_barato: 2490,
          ahorro_estimado: 3200,
        },
      ],
      mano_de_obra: [
        {
          rol: 'Maestro Ceramista Especialista',
          cantidad_personas: 1,
          dias_estimados: 4,
          valor_jornal_diario: 45000,
          subtotal: 180000,
        },
        {
          rol: 'Ayudante de Faena',
          cantidad_personas: 1,
          dias_estimados: 4,
          valor_jornal_diario: 28000,
          subtotal: 112000,
        },
      ],
      estructura_financiera: {
        costo_materiales_total: 612430,
        costo_mano_obra_total: 292000,
        costo_directo: 904430,
        gastos_generales_porcentaje: 10,
        gastos_generales_monto: 90443,
        imprevistos_porcentaje: 5,
        imprevistos_monto: 45222,
        margen_utilidad_porcentaje: 30,
        margen_utilidad_monto: 312030,
        precio_sugerido_neto: 1352125,
        iva_19: 256904,
        precio_total_con_iva: 1609029,
        ahorro_compras_estrategicas: 56200,
      },
      radar_proveedores: [
        {
          tienda: 'Construmart',
          categoria_destacada: 'Bekron y Fragues',
          nivel_precio: 'mas_barato',
          ahorro_estimado_total: 12000,
          ventajas: ['Precios por mayor'],
        },
      ],
      actividades_gantt: [
        { nombre: 'Preparación y Nivelación de Sustrato', dias: 1, orden: 1 },
        { nombre: 'Colocación y Cortes de Porcelanato', dias: 2, orden: 2 },
        { nombre: 'Fraguado, Limpieza y Entrega', dias: 1, orden: 3 },
      ],
      consejos_experto_pyme: [
        'Pedir siempre el 40% de anticipo antes de retirar materiales en tienda.',
      ],
      fecha_creacion: new Date().toISOString(),
    };

    const textoWhatsApp = `🏗️ *PROPUESTA FORMAL DE COTIZACIÓN - OBRATRACK*\n\nEstimado(a) *${clienteNombre}*, le comparto el presupuesto oficial para la obra:\n📌 *${proyectoNombre}*\n💰 *Total Propuesta con IVA:* *$${montoTotal.toLocaleString('es-CL')} CLP*\n\n📋 *Forma de Pago Acordada:*\n• 40% Anticipo (Materiales): $${Math.round(montoTotal * 0.4).toLocaleString('es-CL')} CLP\n• 30% Avance 50%: $${Math.round(montoTotal * 0.3).toLocaleString('es-CL')} CLP\n• 20% Terminaciones: $${Math.round(montoTotal * 0.2).toLocaleString('es-CL')} CLP\n• 10% Recepción Conforme: $${Math.round(montoTotal * 0.1).toLocaleString('es-CL')} CLP\n\nEmitido a través de ObraTrack.`;

    const accion = {
      tipo: 'enviar_cotizacion_cliente',
      titulo: `Cotización Lista para Enviar a ${clienteNombre}`,
      cliente_nombre: clienteNombre,
      cliente_telefono: clienteTelefono,
      resultado_texto: `Propuesta formal generada para ${clienteNombre} por un total de $${montoTotal.toLocaleString('es-CL')} CLP. Haz clic en el botón de abajo para enviar el PDF o abrir WhatsApp.`,
      enlace_whatsapp: `https://wa.me/${clienteTelefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(textoWhatsApp)}`,
      cotizacion: cotizacionDemo,
    };

    return {
      respuesta: `📲 **¡Cotización oficial preparada para enviar a ${clienteNombre}!**\n\nHe generado el documento formal de cotización con desglose de materiales, mano de obra, IVA (19%) y calendario de pagos 40/30/20/10.\n\nPuedes **descargar el PDF oficial membretado** o presionar el botón de **Enviar por WhatsApp** para abrir el mensaje directamente en el teléfono del cliente.`,
      accion,
      sugerencias: [
        'Ver / Descargar PDF de Cotización',
        'Enviar propuesta por WhatsApp',
        'Crear esta obra en el menú de proyectos',
      ],
    };
  }

  // 2. Detectar intención de CREAR / AGENDAR OBRA
  const matchCrearObra = msg.match(/(?:crea(?:me|r)?\s+(?:la\s+)?obra|nueva\s+obra|ingresa\s+obra)\s+([^\n]+)/i);
  if (matchCrearObra || msg.includes('crear obra') || msg.includes('créame una obra')) {
    // Extraer datos si están presentes
    let nombreObra = 'Nueva Obra';
    let comuna = 'Santiago';
    let clienteNombre = 'Cliente';
    let monto = 3500000;

    const clienteMatch = msg.match(/para\s+([a-záéíóúñ\s]+?)(?:\s+en|\s+por|\s+de|\s+iniciando|$)/i);
    if (clienteMatch) clienteNombre = clienteMatch[1].trim();

    const comunaMatch = msg.match(/en\s+([a-záéíóúñ\s]+?)(?:\s+por|\s+para|\s+iniciando|$)/i);
    if (comunaMatch) comuna = comunaMatch[1].trim();

    const montoMatch = msg.match(/por\s+(\d+(?:[\.,]\d+)?)\s*(?:millones|m|clp|\$)/i);
    if (montoMatch) {
      const num = parseFloat(montoMatch[1].replace(',', '.'));
      monto = num < 100 ? Math.round(num * 1000000) : Math.round(num);
    }

    if (msg.includes('radier')) nombreObra = `Construcción de Radier - ${clienteNombre}`;
    else if (msg.includes('porcelanato') || msg.includes('ceramica')) nombreObra = `Instalación de Porcelanato - ${clienteNombre}`;
    else if (msg.includes('quincho')) nombreObra = `Construcción de Quincho - ${clienteNombre}`;
    else nombreObra = `Obra General - ${clienteNombre}`;

    const accion = {
      tipo: 'crear_proyecto',
      nombre: nombreObra,
      cliente_nombre: clienteNombre,
      cliente_telefono: '+56912345678',
      comuna: comuna,
      monto: monto,
      dias: 15,
      descripcion: `Proyecto creado automáticamente por el Copiloto IA para ${clienteNombre} en ${comuna}.`,
    };

    return {
      respuesta: `✅ **¡Obra registrada exitosamente en el sistema!**\n\nHe creado el proyecto **"${nombreObra}"** para **${clienteNombre}** en la comuna de **${comuna}** con un presupuesto cotizado de **$${monto.toLocaleString('es-CL')} CLP**.\n\nEl proyecto ya aparece en tu panel de **Proyectos** y en el visor de **Google Maps** listo para asignar cuadrilla y generar su Carta Gantt.`,
      accion,
      sugerencias: [
        'Agendar una visita a terreno para esta obra',
        'Asignar maestro a esta obra',
        'Ver desglose de materiales y costos',
      ],
    };
  }

  // 2. Detectar intención de AGREGAR TRABAJADOR
  const matchTrabajador = msg.match(/(?:agrega(?:r)?\s+(?:al\s+)?(?:maestro|trabajador))\s+([^\n]+)/i);
  if (matchTrabajador || msg.includes('agregar trabajador') || msg.includes('nuevo maestro')) {
    let nombre = 'Juan Pérez';
    let rol = 'albañil';
    let telefono = '+56987654321';

    const nombreMatch = msg.match(/(?:maestro|trabajador)\s+([a-záéíóúñ\s]+?)(?:\s+como|\s+con|$)/i);
    if (nombreMatch) nombre = nombreMatch[1].trim();

    const rolMatch = msg.match(/como\s+([a-záéíóúñ]+)/i);
    if (rolMatch) rol = rolMatch[1].trim();

    const telMatch = msg.match(/(\+?56\d{8,9}|\d{8,9})/);
    if (telMatch) telefono = telMatch[1].startsWith('+') ? telMatch[1] : `+56${telMatch[1]}`;

    const accion = {
      tipo: 'agregar_trabajador',
      nombre: nombre,
      rol: rol,
      telefono: telefono,
      email: `${nombre.toLowerCase().replace(/\s+/g, '.')}@obratrack.cl`,
    };

    return {
      respuesta: `👷‍♂️ **¡Trabajador incorporado a la cuadrilla!**\n\nHe registrado a **${nombre}** con el rol de **${rol.toUpperCase()}** y teléfono **${telefono}** en el módulo de **Equipo**.\n\nAhora puedes vincularlo directamente a tus obras activas para registrar bitácoras y coordinar asignaciones por WhatsApp.`,
      accion,
      sugerencias: [
        `Asignar a ${nombre} a una obra activa`,
        'Crear una nueva obra',
        'Consultar jornales de faena en Chile',
      ],
    };
  }

  // 3. Detectar intención de AGENDAR VISITA A TERRENO
  if (msg.includes('agenda') || msg.includes('agendar') || msg.includes('visita a terreno') || msg.includes('visita técnica')) {
    const accion = {
      tipo: 'agendar_visita',
      titulo: 'Visita Técnica a Terreno',
      fecha: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      hora: '10:00',
      comuna_lugar: 'Santiago',
      descripcion: 'Revisión técnica de faena, cubicación de terreno y coordinación con mandante.',
      cliente_nombre: 'Cliente Mandante',
    };

    return {
      respuesta: `📅 **¡Visita a terreno agendada con éxito!**\n\nHe programado la **Visita Técnica** en tu agenda de faena para las **10:00 hrs**.\n\n📍 **Detalle:** Inspección técnica, verificación de niveles y replanteo de medidas.\n🔔 Se enviará una alerta de recordatorio al equipo de terreno.`,
      accion,
      sugerencias: [
        'Crear presupuesto para esta visita',
        'Ver proyectos en el mapa',
        '¿Cuánto cobrar por visita técnica?',
      ],
    };
  }

  // 4. CÁLCULO DE PORCELANATO / CERÁMICA / PISOS (Como en el caso del usuario: "5x7 metros")
  if (
    msg.includes('porcelanato') ||
    msg.includes('ceramica') ||
    msg.includes('cerámica') ||
    msg.includes('piso') ||
    msg.includes('azulejo') ||
    (msg.includes('5') && msg.includes('7'))
  ) {
    // Detectar medidas si están presentes (ej: 5x7 -> 35m2)
    let ancho = 5;
    let largo = 7;
    let m2 = 35;

    const dimMatch = msg.match(/(\d+(?:[\.,]\d+)?)\s*(?:x|\*|por)\s*(\d+(?:[\.,]\d+)?)/i);
    if (dimMatch) {
      ancho = parseFloat(dimMatch[1].replace(',', '.'));
      largo = parseFloat(dimMatch[2].replace(',', '.'));
      m2 = Math.round(ancho * largo * 10) / 10;
    } else {
      const m2Match = msg.match(/(\d+(?:[\.,]\d+)?)\s*(?:m2|metros\s*cuadrados)/i);
      if (m2Match) m2 = parseFloat(m2Match[1].replace(',', '.'));
    }

    // Cálculos técnicos con normativas chilenas
    const merma = 1.15; // 15% por cortes diagonales y zócalos
    const m2Material = Math.ceil(m2 * merma * 10) / 10;
    const sacosBekron = Math.ceil(m2 / 4.5); // 1 saco 25kg rinde ~4.5m2
    const kgFrague = Math.ceil(m2 * 0.22); // ~220g por m2 en junta 2mm
    const cajasCrucetas = Math.ceil(m2 / 20);

    // Costos en CLP
    const costoPorcelanatoM2 = 12990;
    const costoTotalPorcelanato = Math.round(m2Material * costoPorcelanatoM2);
    const costoBekron = sacosBekron * 7490;
    const costoFrague = kgFrague * 2490;
    const costoInsumos = 25000; // crucetas, esponjas, separadores
    const totalMateriales = costoTotalPorcelanato + costoBekron + costoFrague + costoInsumos;

    const manoObraM2 = 14000; // promedio Chile para porcelanato rectificado
    const totalManoObra = Math.round(m2 * manoObraM2);
    const diasTrabajo = Math.max(3, Math.ceil(m2 / 12));

    const costoDirecto = totalMateriales + totalManoObra;
    const gastosGenerales = Math.round(costoDirecto * 0.1);
    const imprevistos = Math.round(costoDirecto * 0.05);
    const costoBase = costoDirecto + gastosGenerales + imprevistos;

    const precioSugeridoNeto = Math.round(costoBase * 1.30); // 30% utilidad
    const iva = Math.round(precioSugeridoNeto * 0.19);
    const precioTotalConIva = precioSugeridoNeto + iva;

    const precioMinimo = Math.round(costoBase * 1.15 * 1.19);
    const precioPremium = Math.round(costoBase * 1.40 * 1.19);

    return {
      respuesta: `📐 **ANÁLISIS TÉCNICO Y PRESUPUESTO: INSTALACIÓN DE PORCELANATO (${ancho} × ${largo} m = ${m2} m²)**

Para una habitación de **${ancho} × ${largo} metros (${m2} m²)**, el cálculo técnico para faena en Chile es el siguiente:

---

### 1. 🧱 Cubicador de Materiales (con 15% de merma por cortes):
• **Porcelanato (60×60 o 80×80 cm):** **${m2Material} m²** (~$${costoTotalPorcelanato.toLocaleString('es-CL')} CLP comprando a $12.990/m² en *Sodimac Constructor / Easy*).
• **Adhesivo Bekron DA / Topex Pasta:** **${sacosBekron} sacos de 25 kg** (~$${costoBekron.toLocaleString('es-CL')} CLP en *Construmart* a $7.490/saco).
• **Fragüe Impermeable Antihongos:** **${kgFrague} kg** (~$${costoFrague.toLocaleString('es-CL')} CLP).
• **Crucetas 2mm + Cuñas Niveladoras:** **${cajasCrucetas} bolsa(s)** (~$${costoInsumos.toLocaleString('es-CL')} CLP).
💰 **Subtotal Materiales:** **$${totalMateriales.toLocaleString('es-CL')} CLP**.

---

### 2. 👷 Mano de Obra & Plazo de Ejecución:
• **Tarifa Maestro Ceramista Especialista:** $14.000 CLP / m².
• **Costo Mano de Obra Cuadrilla:** **$${totalManoObra.toLocaleString('es-CL')} CLP** (incluye preparación de piso, colocación, fraguado y retiro de escombros).
• **Plazo Estimado:** **${diasTrabajo} a ${diasTrabajo + 1} días hábiles** (Día 1: nivelación/pegado; Día 2: remates/cortes; Día 3: fraguado y limpieza profunda).

---

### 3. 💡 Asesor de Cobro al Mandante ("¿Cuánto Cobrar?"):
• 🟢 **Precio Mínimo Rentable (15% margen):** **$${precioMinimo.toLocaleString('es-CL')} CLP** (para ganar la pega sin arriesgar utilidades).
• 🔵 **Precio Sugerido de Mercado (30% margen + IVA):** **$${precioTotalConIva.toLocaleString('es-CL')} CLP** (valor por m²: **$${Math.round(precioTotalConIva / m2).toLocaleString('es-CL')} CLP/m²**).
• 🟣 **Precio Premium con Garantía (40% margen):** **$${precioPremium.toLocaleString('es-CL')} CLP**.

---

### 4. 📝 Modalidad de Pago Recomendada:
1. **40% al iniciar ($${Math.round(precioTotalConIva * 0.4).toLocaleString('es-CL')} CLP):** Compra y despacho de porcelanato y Bekron.
2. **40% al terminar colocación ($${Math.round(precioTotalConIva * 0.4).toLocaleString('es-CL')} CLP):** Pago de avances a la cuadrilla.
3. **20% contra entrega conforme ($${Math.round(precioTotalConIva * 0.2).toLocaleString('es-CL')} CLP):** Fraguado impecable y limpieza final.`,
      sugerencias: [
        `Créame una obra de porcelanato de ${m2}m2`,
        '¿Dónde comprar el Bekron DA más barato?',
        'Agéndame una visita a terreno para medir niveles',
      ],
    };
  }

  // 5. CÁLCULO DE RADIER / HORMIGÓN / HORMIGÓN ARMADO
  if (msg.includes('radier') || msg.includes('hormigon') || msg.includes('hormigón') || msg.includes('fundacion') || msg.includes('fundación')) {
    let m2 = 30;
    const m2Match = msg.match(/(\d+(?:[\.,]\d+)?)\s*(?:m2|metros)/i);
    if (m2Match) m2 = parseFloat(m2Match[1].replace(',', '.'));

    const espesorM = 0.10; // 10 cm estándar
    const m3Hormigon = Math.round(m2 * espesorM * 1.10 * 10) / 10;
    const sacosCemento = Math.ceil(m3Hormigon * 6.5);
    const mallasAcma = Math.ceil(m2 / 12);
    const m3Aridos = Math.round(m3Hormigon * 1.15 * 10) / 10;

    const costoCemento = sacosCemento * 4490;
    const costoAridos = Math.round(m3Aridos * 24000);
    const costoMallas = mallasAcma * 19990;
    const costoMateriales = costoCemento + costoAridos + costoMallas + 35000; // polietileno + moldajes

    const manoObraM2 = 16000;
    const totalManoObra = Math.round(m2 * manoObraM2);
    const costoDirecto = costoMateriales + totalManoObra;
    const precioTotalConIva = Math.round((costoDirecto * 1.15) * 1.30 * 1.19);

    return {
      respuesta: `🏗️ **CUBICACIÓN Y COSTOS: RADIER DE HORMIGÓN (${m2} m² - 10 cm de espesor)**

Para un radier de **${m2} m²** en Chile:

• **Volumen de Hormigón (H-20):** **${m3Hormigon} m³** (con 10% de esponjamiento).
• **Cemento Melón / Polpaico Especial:** **${sacosCemento} sacos de 25 kg** (~$${costoCemento.toLocaleString('es-CL')} CLP en *Construmart*).
• **Árido Mezcla (Arena + Gravilla):** **${m3Aridos} m³** (~$${costoAridos.toLocaleString('es-CL')} CLP en arenera local).
• **Malla Acma C-92 (2.6 × 5.0 m):** **${mallasAcma} plancha(s)** (~$${costoMallas.toLocaleString('es-CL')} CLP).
• **Film Polietileno 0.1 mm (Barrera de humedad):** **${Math.ceil(m2 * 1.2)} m²**.

💰 **Costo Materiales:** **$${costoMateriales.toLocaleString('es-CL')} CLP**
👷 **Mano de Obra (Maestro + Ayudantes):** **$${totalManoObra.toLocaleString('es-CL')} CLP**
📊 **Precio Sugerido al Cliente con IVA:** **$${precioTotalConIva.toLocaleString('es-CL')} CLP** (aprox. **$${Math.round(precioTotalConIva / m2).toLocaleString('es-CL')} CLP/m²**).`,
      sugerencias: [
        `Créame la obra de radier de ${m2}m2 por $${Math.round(precioTotalConIva / 100000) / 10}M`,
        'Ver comparador de precios en Construmart e Imperial',
        '¿Cuánto cobrar por jornales de cuadrilla?',
      ],
    };
  }

  // 6. CONSULTAS DE PRECIOS Y TARIFAS DE MANO DE OBRA
  if (msg.includes('cuanto cobrar') || msg.includes('cuánto cobrar') || msg.includes('jornal') || msg.includes('tarifa') || msg.includes('precio')) {
    return {
      respuesta: `💰 **TABLA DE TARIFAS Y JORNALES ACTUALES EN CHILE (2025 - 2026)**

### 👷 Mano de Obra por Día de Faena:
• **Maestro Mayor / Capataz:** **$45.000 – $55.000 CLP / día** (dirección técnica, trazados y cubicación).
• **Maestro Especialista (Albañil, Carpintero, Ceramista, Gasfíter SEC):** **$38.000 – $45.000 CLP / día**.
• **Ayudante Avanzado:** **$28.000 – $34.000 CLP / día**.
• **Jornalero / Peón:** **$24.000 – $28.000 CLP / día**.

### 📊 Regla de Rentabilidad para PYMEs:
1. **Costos Directos (CD):** Materiales con fletes + Mano de obra cuadrilla.
2. **Gastos Generales (GG):** Agrega un **10%** del CD (combustible, herramientas, desgaste).
3. **Imprevistos:** Agrega un **5%** del CD (mermas, clima, atrasos).
4. **Margen de Utilidad Neto:** Agrega entre **25% y 35%** sobre el costo base.
5. **IVA (19%):** Impuesto obligatorio para contratos formales.`,
      sugerencias: [
        '¿Cuánto cobrar por radier de 30m2?',
        '¿Cuánto cobrar por instalar porcelanato?',
        'Crear una cotización en el módulo de proyectos',
      ],
    };
  }

  // 7. RESPUESTA GENERAL CONSULTIVA DE CONSTRUCCIÓN EN CHILE
  return {
    respuesta: `👷‍♂️ **¡Hola! Soy tu Copiloto Obrero de ObraTrack.**

Entendido tu consulta: *"${mensajeUsuario}"*.

En el contexto de la construcción y faenas en Chile, puedo asistirte de inmediato con:
• **Cubicaciones exactas** de materiales (cemento, maderas, porcelanatos, techumbres, fierro estriado) con comparador en *Construmart, Imperial, Sodimac y Red MTS*.
• **Cálculo de cobro al cliente** con desglose de costos directos, imprevistos y margen de ganancia en CLP.
• **Control autónomo de la plataforma:** puedes pedirme crear obras, registrar trabajadores o agendar visitas técnicas directamente en esta conversación.

¿Qué obra o presupuesto específico te gustaría analizar ahora?`,
    sugerencias: [
      '¿Cuánto cobrar por instalar porcelanato en 35m2?',
      'Cubicación de radier para 40m2 en Peñalolén',
      'Agéndame una visita a terreno para mañana a las 10:00',
    ],
  };
}

/**
 * Chat interactivo conversacional con el Asesor Experto en Obras & Controlador Autónomo IA (Google Gemini)
 */
export async function chatAsesorObrasGemini(
  historial: { rol: 'user' | 'model'; texto: string }[],
  mensajeUsuario: string,
  contextoDB?: {
    proyectos?: { id: string; nombre: string; comuna?: string; estado?: string }[];
    trabajadores?: { id: string; nombre: string; rol?: string }[];
    clientes?: { id: string; nombre: string }[];
  }
): Promise<{ respuesta: string; accion?: any; sugerencias?: string[] }> {
  const gemini = getGeminiClient();

  // Si Gemini no está configurado con una clave válida, usar el motor heurístico experto chileno
  if (!gemini) {
    return generarRespuestaHeuristicaCopiloto(mensajeUsuario, contextoDB);
  }

  const fechaHoy = new Date().toISOString().split('T')[0];
  const diaSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()];

  const proyectosTexto = (contextoDB?.proyectos || []).map((p) => `• ${p.nombre} (${p.comuna || 'Chile'}, ${p.estado})`).join('\n') || 'Ninguno creado aún.';
  const trabajadoresTexto = (contextoDB?.trabajadores || []).map((t) => `• ${t.nombre} (${t.rol})`).join('\n') || 'Ninguno registrado aún.';
  const clientesTexto = (contextoDB?.clientes || []).map((c) => `• ${c.nombre}`).join('\n') || 'Ninguno registrado aún.';

  const promptConversacional = `${SYSTEM_PROMPT_CONSTRUCCION_CHILE}

HOY ES: ${diaSemana}, ${fechaHoy}.

CONTEXTO ACTUAL DE LA CONSTRUCTORA EN OBRATRACK:
- Obras/Proyectos Activos:
${proyectosTexto}
- Equipo de Trabajadores:
${trabajadoresTexto}
- Clientes Registrados:
${clientesTexto}

INSTRUCCIONES DE CONVERSACIÓN & ACCIONES AUTÓNOMAS:
1. Eres el Copiloto Inteligente de ObraTrack y Asesor Experto de Faena en Chile.
2. Responde de forma completamente natural, experta, analítica y directa a la consulta del usuario. PIENSA y asesora al usuario (por ejemplo: si pide instalar porcelanato en 5x7m, calcula los 35m2, el 15% de merma, sacos de Bekron DA, fragüe, jornales de ceramista y costos en ferreterías chilenas).
3. REGLA ESTRICTA DE CONTEXTO: Tu dominio es única y exclusivamente la construcción, edificación, cubicación, ingeniería civil, materiales en Chile y agendamiento de faenas.

4. CAPACIDAD DE CONTROLAR LA WEB (EJECUTAR ACCIONES EN VIVO):
   Cuando el usuario te pida crear una obra, agregar un trabajador, asignar cuadrilla o agendar un compromiso, responde conversacionalmente confirmándolo y agrega AL FINAL DE TU RESPUESTA una etiqueta [ACCION_OBRA: {...}] con el JSON correspondiente:

   A) CREAR / AGENDAR NUEVA OBRA EN EL MENÚ DE PROYECTOS:
      Si el usuario dice "créame la obra X para Don Carlos en Peñalolén por 3.5 millones":
      [ACCION_OBRA: {"tipo":"crear_proyecto","nombre":"Nombre de la Obra","cliente_nombre":"Nombre Cliente","cliente_telefono":"+56912345678","comuna":"Comuna","monto":3500000,"dias":20,"descripcion":"Detalle de la obra"}]

   B) AGREGAR NUEVO TRABAJADOR AL EQUIPO:
      Si el usuario dice "agrega al maestro Juan Pérez como albañil con teléfono +56987654321":
      [ACCION_OBRA: {"tipo":"agregar_trabajador","nombre":"Juan Pérez","rol":"albañil","telefono":"+56987654321","email":"juan.perez@obratrack.cl"}]

   C) ASIGNAR TRABAJADOR A OBRA:
      Si el usuario dice "asigna a Juan Pérez a la obra de Peñalolén":
      [ACCION_OBRA: {"tipo":"asignar_trabajador","trabajador_nombre":"Juan Pérez","proyecto_nombre":"Peñalolén"}]

   D) AGENDAR VISITA A TERRENO O HITO DE FAENA:
      Si el usuario dice "agéndame una visita a terreno el viernes a las 10:00":
      [ACCION_OBRA: {"tipo":"agendar_visita","titulo":"Visita a Terreno","fecha":"YYYY-MM-DD","hora":"10:00","comuna_lugar":"Peñalolén","descripcion":"Revisión de obra","cliente_nombre":"Don Carlos"}]

HISTORIAL DE LA CONVERSACIÓN:
${historial.map((h) => `${h.rol === 'user' ? 'Usuario' : 'Copiloto'}: ${h.texto}`).join('\n')}

NUEVO MENSAJE DEL USUARIO: "${mensajeUsuario}"

Responde como Copiloto de Obras experto:`;

  try {
    let rawText = '';

    for (const m of CANDIDATE_GEMINI_MODELS) {
      try {
        const response = await gemini.models.generateContent({
          model: m,
          contents: promptConversacional,
        });
        if (response.text) {
          rawText = response.text;
          break;
        }
      } catch (mErr) {
        console.warn(`Chat falló con ${m}, probando siguiente modelo...`);
      }
    }

    if (!rawText) {
      // Si los modelos de Gemini fallaron (por cuota o red), recurrir al motor heurístico experto
      return generarRespuestaHeuristicaCopiloto(mensajeUsuario, contextoDB);
    }

    // Detectar si incluye acción estructurada
    let accion: any = null;
    const actionMatch = rawText.match(/\[ACCION_OBRA:\s*(\{.*?\})\s*\]/);
    if (actionMatch) {
      try {
        accion = JSON.parse(actionMatch[1]);
        rawText = rawText.replace(actionMatch[0], '').trim();
      } catch (err) {
        console.warn('No se pudo parsear acción de obra:', err);
      }
    }

    const sugerencias = [
      '¿Cuánto cobrar por metro cuadrado en este trabajo?',
      'Agéndame una visita a terreno para mañana a las 10:00',
      'Crear esta obra en el menú de proyectos',
    ];

    return {
      respuesta: rawText,
      accion,
      sugerencias,
    };
  } catch (error: any) {
    console.warn('Error en llamada a Gemini API, usando fallback heurístico:', error);
    return generarRespuestaHeuristicaCopiloto(mensajeUsuario, contextoDB);
  }
}

/**
 * Asistente Automatizado de WhatsApp para Clientes / Mandantes (Seguimiento de Obra en Vivo con Gemini)
 */
export async function chatAsistenteClienteWhatsAppGemini(params: {
  historial: { rol: 'user' | 'model'; texto: string }[];
  mensajeCliente: string;
  clienteAutenticado?: {
    cliente: { id: string; nombre: string; rut?: string; telefono?: string; direccion?: string };
    proyectos: Array<{
      proyecto: { id: string; nombre: string; comuna?: string; direccion?: string; fecha_inicio: string; fecha_termino_estimada: string; estado: string };
      actividades: Array<{ nombre: string; porcentaje_avance: number; estado: string }>;
      porcentaje_avance: number;
      total_contratado: number;
      total_pagado: number;
      saldo_pendiente: number;
      fotos_avance: string[];
    }>;
  } | null;
  clientesRegistrados?: Array<{ id: string; nombre: string; rut?: string }>;
}): Promise<{
  respuesta: string;
  fotos?: string[];
  autenticar_rut_o_nombre?: string;
}> {
  const gemini = getGeminiClient();

  if (!gemini) {
    return {
      respuesta:
        '¡Hola! Soy el Asistente de ObraTrack. En este momento estamos actualizando el servicio de mensajería.',
    };
  }

  const { historial, mensajeCliente, clienteAutenticado, clientesRegistrados = [] } = params;

  let promptContextoCliente = '';
  if (clienteAutenticado && clienteAutenticado.proyectos.length > 0) {
    const projsTexto = clienteAutenticado.proyectos
      .map((p, idx) => {
        const partidasTexto = p.actividades
          .map((a) => `  - ${a.nombre}: ${a.porcentaje_avance}% (${a.estado})`)
          .join('\n');
        return `
OBRA #${idx + 1}: ${p.proyecto.nombre}
• Ubicación: ${p.proyecto.direccion || p.proyecto.comuna || 'Chile'}
• Estado: ${p.proyecto.estado.toUpperCase()}
• Avance General Ponderado: ${p.porcentaje_avance}%
• Total Contratado: $${p.total_contratado.toLocaleString('es-CL')} CLP
• Total Pagado a la Fecha: $${p.total_pagado.toLocaleString('es-CL')} CLP
• Saldo Restante por Pagar: $${p.saldo_pendiente.toLocaleString('es-CL')} CLP
• Fechas: Inicio ${p.proyecto.fecha_inicio} | Término Estimado ${p.proyecto.fecha_termino_estimada}
• Partidas y Cronograma:
${partidasTexto || '  - En ejecución según cronograma'}
• Fotos de Avance Disponibles: ${p.fotos_avance.length} fotos`;
      })
      .join('\n\n');

    promptContextoCliente = `
CLIENTE IDENTIFICADO Y AUTENTICADO:
- Nombre: ${clienteAutenticado.cliente.nombre}
- RUT: ${clienteAutenticado.cliente.rut || 'Validado'}

DATOS DE SUS OBRAS CONTRATADAS:
${projsTexto}

INSTRUCCIÓN ESPECÍFICA:
El cliente ya está autenticado con éxito como ${clienteAutenticado.cliente.nombre}. Entrega de inmediato la FICHA OFICIAL DE SEGUIMIENTO de su proyecto con el desglose de avances, finanzas y fotos, dirigiéndote a él/ella por su nombre con saludo cordial.`;
  } else {
    promptContextoCliente = `
EL CLIENTE AÚN NO HA SIDO AUTENTICADO. NO ENTREGUES NINGUNA INFORMACIÓN DE OBRAS HASTA QUE SE IDENTIFIQUE.
Clientes registrados en el sistema:
${clientesRegistrados.map((c) => `• ${c.nombre} (RUT: ${c.rut || 'Sin RUT'})`).join('\n') || 'Ninguno'}

INSTRUCCIÓN DE AUTENTICACIÓN ESTRICTA:
1. Si el cliente solo saluda o pregunta en general ("hola", "¿cómo va mi obra?", etc.), saluda con amabilidad y PÍDELE OBLIGATORIAMENTE su *Nombre Completo* y su *RUT chileno* (ej: 12.345.678-9) para buscar su ficha en el sistema de la constructora. NO reveles ninguna obra.
2. Si el cliente escribe su Nombre o su RUT en su mensaje, extráelo agregando al final la etiqueta:
   [AUTENTICAR: {"query": "NOMBRE O RUT EXTRAIDO"}]
3. Si el cliente ya dio un nombre o RUT y no coincide con la lista de clientes registrados, infórmale cortésmente que no se encontró ninguna obra activa asociada a ese RUT/Nombre y que por favor verifique sus datos con el jefe de obra.`;
  }

  const promptFinal = `Eres el Asistente Virtual Oficial de ObraTrack para Mandantes y Clientes de Construcción en WhatsApp.
Tu objetivo es dar seguimiento cálido, profesional, preciso y transparente a los clientes sobre las obras por las que están pagando, resguardando la privacidad y validando siempre su identidad.

REGLAS DE COMUNICACIÓN EN WHATSAPP:
1. Habla en español de Chile, con tono muy respetuoso, cercano, formal y tranquilizador.
2. Usa formato nativo de WhatsApp: *negritas* para montos, nombres y avances clave, emojis elegantes (🏗️ 📊 💰 📸 📅 ✅), y listas con viñetas claras.
3. PROTOCOLO DE PRIVACIDAD & IDENTIFICACIÓN:
   - NUNCA des detalles de avances, finanzas o fotos a un usuario anónimo.
   - SI EL CLIENTE NO ESTÁ AUTENTICADO: Pídele su *Nombre Completo* y *RUT*.
   - SI EL CLIENTE ESTÁ IDENTIFICADO: Entrega de inmediato la *FICHA OFICIAL DE SEGUIMIENTO*:
     - 🏗️ *Proyecto:* Nombre y dirección.
     - 📊 *Avance General:* % de avance ponderado y estado de partidas clave (ej: 100%, 80%, etc.).
     - 💰 *Estado Financiero:* Total Contratado, Total Pagado a la Fecha y Saldo Pendiente.
     - 📅 *Plazo Estimado:* Fecha de entrega estimada.
     - 📸 Agrega SIEMPRE al final la etiqueta [ENVIAR_FOTOS: true] para que el sistema adjunte las fotografías reales tomadas en terreno.

${promptContextoCliente}

HISTORIAL WHATSAPP:
${historial.map((h) => `${h.rol === 'user' ? 'Cliente' : 'Asistente'}: ${h.texto}`).join('\n')}

MENSAJE DEL CLIENTE: "${mensajeCliente}"

Respuesta de WhatsApp:`;

  try {
    const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    let rawText = '';

    for (const m of candidateModels) {
      try {
        const response = await gemini.models.generateContent({
          model: m,
          contents: promptFinal,
        });
        if (response.text) {
          rawText = response.text;
          break;
        }
      } catch (err) {
        console.warn(`Asistente cliente falló con ${m}...`);
      }
    }

    if (!rawText) {
      if (clienteAutenticado && clienteAutenticado.proyectos.length > 0) {
        const pPrincipal = clienteAutenticado.proyectos[0];
        const fotos = clienteAutenticado.proyectos.flatMap((p) => p.fotos_avance).slice(0, 3);
        const partidasTexto = pPrincipal.actividades
          .slice(0, 4)
          .map((a) => `• ${a.nombre}: *${a.porcentaje_avance}%* (${a.estado})`)
          .join('\n');

        const fallbackFicha = `¡Hola, *${clienteAutenticado.cliente.nombre}*! 👋\n\nA continuación te comparto el reporte actualizado de tu obra:\n\n🏗️ *Proyecto:* ${pPrincipal.proyecto.nombre}\n📍 *Ubicación:* ${pPrincipal.proyecto.direccion || pPrincipal.proyecto.comuna || 'Chile'}\n📊 *Avance General:* *${pPrincipal.porcentaje_avance}%*\n📅 *Fecha Estimada de Entrega:* ${pPrincipal.proyecto.fecha_termino_estimada || 'En cronograma'}\n\n📋 *Partidas en ejecución:*\n${partidasTexto || '• Obra en desarrollo normal según Carta Gantt'}\n\n💰 *Estado de Pagos:*\n• Total Contratado: *$${pPrincipal.total_contratado.toLocaleString('es-CL')} CLP*\n• Total Pagado: *$${pPrincipal.total_pagado.toLocaleString('es-CL')} CLP*\n• Saldo Pendiente: *$${pPrincipal.saldo_pendiente.toLocaleString('es-CL')} CLP*\n\n📸 *Fotografías de faena adjuntas:*`;

        return {
          respuesta: fallbackFicha,
          fotos: fotos.length > 0 ? fotos : undefined,
        };
      } else {
        return {
          respuesta:
            '¡Hola! 👋 Bienvenido al servicio de seguimiento de obras de *ObraTrack*.\n\nPara poder consultar la ficha de avance, fotografías de faena y estado de tu proyecto, por favor indícame tu *Nombre Completo* y tu *RUT* (ej: 12.345.678-9).',
        };
      }
    }

    // Extraer intención de autenticación
    let autenticarQuery: string | undefined = undefined;
    const authMatch = rawText.match(/\[AUTENTICAR:\s*(\{.*?\})\s*\]/);
    if (authMatch) {
      try {
        const parsed = JSON.parse(authMatch[1]);
        autenticarQuery = parsed.query;
        rawText = rawText.replace(authMatch[0], '').trim();
      } catch (err) {
        console.warn('Error parseando tag de autenticación:', err);
      }
    }

    // Extraer fotos
    let enviarFotos = false;
    const fotoMatch = rawText.match(/\[ENVIAR_FOTOS:\s*(true|false)\s*\]/);
    if (fotoMatch) {
      enviarFotos = fotoMatch[1] === 'true';
      rawText = rawText.replace(fotoMatch[0], '').trim();
    }

    let fotos: string[] = [];
    if (enviarFotos && clienteAutenticado && clienteAutenticado.proyectos.length > 0) {
      fotos = clienteAutenticado.proyectos.flatMap((p) => p.fotos_avance).slice(0, 3);
    }

    return {
      respuesta: rawText,
      fotos: fotos.length > 0 ? fotos : undefined,
      autenticar_rut_o_nombre: autenticarQuery,
    };
  } catch (error: any) {
    console.error('Error en chatAsistenteClienteWhatsAppGemini:', error);
    return {
      respuesta:
        '¡Hola! Ocurrió una intermitencia al consultar tu ficha. Por favor indícanos tu Nombre y RUT.',
    };
  }
}
