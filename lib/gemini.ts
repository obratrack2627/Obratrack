import { GoogleGenAI } from '@google/genai';
import { CotizacionEstimacion, RecomendacionCobroCliente } from '@/types/database';

let geminiClientInstance: GoogleGenAI | null = null;

export const DEFAULT_GEMINI_API_KEY = 'REDACTED_GEMINI_KEY';

export function getGeminiApiKey(): string | null {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    DEFAULT_GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('YourGeminiApiKeyHere')) {
    return null;
  }
  return apiKey.trim();
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  if (!geminiClientInstance) {
    try {
      geminiClientInstance = new GoogleGenAI({
        apiKey,
      });
    } catch (e) {
      console.warn('Error instanciando GoogleGenAI SDK:', e);
      return null;
    }
  }
  return geminiClientInstance;
}

const CANDIDATE_GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash'];

/**
 * Llamada directa a la API REST de Google Gemini (100% compatible en Vercel Serverless)
 */
export async function llamarGeminiDirectoRest(prompt: string): Promise<string | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  for (const model of CANDIDATE_GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 3000,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Gemini REST] Falló modelo ${model} (${res.status}):`, errText);
        continue;
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p: any) => p.text || '').filter(Boolean).join('');
      if (text && text.trim().length > 0) {
        return text;
      }
    } catch (err) {
      console.warn(`[Gemini REST] Error de red con ${model}:`, err);
    }
  }
  return null;
}

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
   - Modalidad de Pago Recomendada: 40% anticipo al iniciar, 30% al 50% de avance (obra gruesa), 20% al terminar y 10% contra recepción conforme.

4. Formato de Salida y Presentación Profesional:
   - Responde siempre con redacción limpia, ejecutiva y fácil de leer para un constructor o jefe de obra.
   - Usa viñetas con "• " para enumerar puntos, tareas o materiales.
   - Usa títulos con "### " para separar secciones clave si la respuesta es detallada.
   - Resalta cifras en pesos chilenos y términos técnicos en **negrita simple** (ej: **$3.500.000 CLP**, **radier H20**).
   - NUNCA mezcles asteriscos con comillas (PROHIBIDO escribir *"ejemplo"* o **"ejemplo"** o *“ejemplo”*). Si citas una frase o ejemplo de orden, usa comillas normales directamente: "ejemplo".
   - Mantén los párrafos concisos y bien espaciados.`;

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
      "descuentos_disponibles": "Descuento Constructor 10%",
      "ahorro_estimado_total": 85000,
      "ventajas": ["Cortes a medida", "Stock permanente"]
    }
  ],
  "actividades_gantt": [
    {
      "nombre": "Trazado y Replanteo",
      "dias": 2,
      "orden": 1
    }
  ],
  "consejos_experto_pyme": [
    "Consejo de compra estratégica",
    "Consejo de control de mano de obra"
  ],
  "recomendacion_cobro": {
    "precio_minimo_rentable": 1200000,
    "precio_sugerido_mercado": 1500000,
    "precio_premium_garantia": 1800000,
    "estrategia_negociacion": "Consejo de negociación para el contratista chileno",
    "formas_pago_recomendadas": [
      "40% Anticipo para materiales",
      "30% al 50% avance de obra gruesa",
      "20% al terminar terminaciones",
      "10% contra recepción conforme"
    ],
    "justificacion_precio": "Argumento de venta para defender el presupuesto ante el mandante"
  }
}`;

  try {
    let rawText = await llamarGeminiDirectoRest(prompt);

    if (!rawText) {
      const gemini = getGeminiClient();
      if (gemini) {
        for (const m of CANDIDATE_GEMINI_MODELS) {
          try {
            const resp = await gemini.models.generateContent({ model: m, contents: prompt });
            if (resp.text) {
              rawText = resp.text;
              break;
            }
          } catch (e) {
            console.warn(`Error en SDK con ${m}:`, e);
          }
        }
      }
    }

    if (!rawText) return null;

    let cleanJson = rawText.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(cleanJson);

    const costoMat = (parsed.materiales || []).reduce((acc: number, m: any) => acc + (Number(m.subtotal) || 0), 0);
    const costoMo = (parsed.mano_de_obra || []).reduce((acc: number, mo: any) => acc + (Number(mo.subtotal) || 0), 0);
    const costoDirecto = costoMat + costoMo;
    const ggMonto = Math.round(costoDirecto * 0.1);
    const impMonto = Math.round(costoDirecto * 0.05);
    const costoBase = costoDirecto + ggMonto + impMonto;
    const margenMonto = Math.round(costoBase * (params.margen_utilidad / 100));
    const neto = costoBase + margenMonto;
    const iva = Math.round(neto * 0.19);
    const totalConIva = neto + iva;

    return {
      id: 'cot-' + Date.now(),
      titulo_proyecto: parsed.titulo_proyecto || `Cotización: ${params.descripcion.slice(0, 30)}...`,
      tipo_obra: params.tipo_obra,
      metros_cuadrados: params.metros_cuadrados,
      comuna_region: params.comuna_region,
      duracion_dias_estimada: parsed.duracion_dias_estimada || 15,
      resumen_ejecutivo: parsed.resumen_ejecutivo || 'Presupuesto formal generado.',
      materiales: parsed.materiales || [],
      mano_de_obra: parsed.mano_de_obra || [],
      estructura_financiera: {
        costo_materiales_total: costoMat,
        costo_mano_obra_total: costoMo,
        costo_directo: costoDirecto,
        gastos_generales_porcentaje: 10,
        gastos_generales_monto: ggMonto,
        imprevistos_porcentaje: 5,
        imprevistos_monto: impMonto,
        margen_utilidad_porcentaje: params.margen_utilidad,
        margen_utilidad_monto: margenMonto,
        precio_sugerido_neto: neto,
        iva_19: iva,
        precio_total_con_iva: totalConIva,
        ahorro_compras_estrategicas: 50000,
      },
      radar_proveedores: (parsed.radar_proveedores || []).map((rp: any) => ({
        ...rp,
        descuentos_disponibles: rp.descuentos_disponibles || 'Descuento Constructor 10%',
      })),
      actividades_gantt: parsed.actividades_gantt || [],
      consejos_experto_pyme: parsed.consejos_experto_pyme || [],
      recomendacion_cobro: parsed.recomendacion_cobro,
      fecha_creacion: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error al generar cotización con Google Gemini:', error);
    return null;
  }
}

/**
 * Motor Heurístico Experto de Construcción en Chile para el Copiloto Obrero
 */
export function generarRespuestaHeuristicaCopiloto(
  mensajeUsuario: string,
  contextoDB?: {
    proyectos?: { id: string; nombre: string; comuna?: string; estado?: string; monto_cotizado?: number }[];
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
    let proyectoNombre = 'Presupuesto de Faena';
    let montoTotal = 28908505;

    if (contextoDB?.clientes && contextoDB.clientes.length > 0) {
      clienteNombre = contextoDB.clientes[0].nombre;
    }
    if (contextoDB?.proyectos && contextoDB.proyectos.length > 0) {
      proyectoNombre = contextoDB.proyectos[0].nombre;
      montoTotal = contextoDB.proyectos[0].monto_cotizado || montoTotal;
    }

    const clienteMatch = msg.match(/(?:a|para)\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+por|\s+el|\s+la|$)/i);
    if (clienteMatch) clienteNombre = clienteMatch[1].trim();

    const textoWhatsApp = `🏗️ *PROPUESTA FORMAL DE COTIZACIÓN - OBRATRACK*

Estimado(a) *${clienteNombre}*, le comparto el presupuesto oficial para la obra:
📌 *${proyectoNombre}*
💰 *Total Propuesta con IVA:* *$${montoTotal.toLocaleString('es-CL')} CLP*

📋 *Forma de Pago Acordada:*
• 40% Anticipo (Materiales): $${Math.round(montoTotal * 0.4).toLocaleString('es-CL')} CLP
• 30% Avance 50%: $${Math.round(montoTotal * 0.3).toLocaleString('es-CL')} CLP
• 30% Contra Entrega: $${Math.round(montoTotal * 0.3).toLocaleString('es-CL')} CLP

Emitido a través de ObraTrack.`;

    const accion = {
      tipo: 'enviar_cotizacion_cliente',
      titulo: `Cotización Lista para Enviar a ${clienteNombre}`,
      cliente_nombre: clienteNombre,
      cliente_telefono: clienteTelefono,
      resultado_texto: `Propuesta formal generada para ${clienteNombre} por un total de $${montoTotal.toLocaleString('es-CL')} CLP. Haz clic en el botón de abajo para enviar el PDF o abrir WhatsApp.`,
      enlace_whatsapp: `https://wa.me/${clienteTelefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(textoWhatsApp)}`,
    };

    return {
      respuesta: `📲 **¡Cotización oficial preparada para enviar a ${clienteNombre}!**

He generado el documento formal de cotización con desglose de materiales, mano de obra, IVA (19%) y calendario de pagos 40/30/30.

Puedes **descargar el PDF oficial membretado** o presionar el botón de **Enviar por WhatsApp** para abrir el mensaje directamente en el teléfono del cliente.`,
      accion,
      sugerencias: [
        'Ver / Descargar PDF de Cotización',
        'Enviar propuesta por WhatsApp',
        'Crear esta obra en el menú de proyectos',
      ],
    };
  }

  // 2. Detectar intención de CREAR / AGENDAR OBRA
  const matchCrearObra = msg.match(/(?:crea(?:me|r)?\s+(?:la\s+)?obra|nueva\s+obra|ingresa\s+obra)\s+(.+)/i);
  if (matchCrearObra || msg.includes('crear obra') || msg.includes('créame una obra')) {
    let nombreObra = 'Nueva Obra';
    let comuna = 'Santiago';
    let clienteNombre = 'Cliente';
    let monto = 3500000;

    const clienteMatch = msg.match(/para\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+en|\s+por|\s+de|\s+iniciando|$)/i);
    if (clienteMatch) clienteNombre = clienteMatch[1].trim();

    const comunaMatch = msg.match(/en\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+por|\s+para|\s+iniciando|$)/i);
    if (comunaMatch) comuna = comunaMatch[1].trim();

    const montoMatch = msg.match(/por\s+(\d+(?:[\.,]\d+)?)\s*(?:millones|m|clp|\$)/i);
    if (montoMatch) {
      const num = parseFloat(montoMatch[1].replace(',', '.'));
      monto = num < 100 ? Math.round(num * 1000000) : Math.round(num);
    }

    if (msg.includes('radier')) nombreObra = `Construcción de Radier - ${clienteNombre}`;
    else if (msg.includes('pintura')) nombreObra = `Pintura y Terminaciones - ${clienteNombre}`;
    else if (msg.includes('tabique')) nombreObra = `Tabiquería Volcanita - ${clienteNombre}`;
    else if (msg.includes('techumbre') || msg.includes('techo')) nombreObra = `Techumbre - ${clienteNombre}`;
    else if (msg.includes('electr')) nombreObra = `Instalación Eléctrica - ${clienteNombre}`;
    else if (msg.includes('sanit') || msg.includes('gasfit')) nombreObra = `Instalación Sanitaria - ${clienteNombre}`;
    else if (msg.includes('quincho')) nombreObra = `Construcción de Quincho - ${clienteNombre}`;
    else if (msg.includes('porcelanato') || msg.includes('ceramica')) nombreObra = `Instalación de Porcelanato - ${clienteNombre}`;
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
      respuesta: `✅ **¡Obra registrada exitosamente en el sistema!**

He creado el proyecto **"${nombreObra}"** para **${clienteNombre}** en la comuna de **${comuna}** con un presupuesto cotizado de **$${monto.toLocaleString('es-CL')} CLP**.

El proyecto ya aparece en tu panel de **Proyectos** y en el visor de **Google Maps** listo para asignar cuadrilla y generar su Carta Gantt.`,
      accion,
      sugerencias: [
        'Agendar una visita a terreno para esta obra',
        'Asignar maestro a esta obra',
        'Ver desglose de materiales y costos',
      ],
    };
  }

  // 3. Detectar dimensiones generales
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

  // 4. RADIER / HORMIGÓN / FUNDACIONES
  if (msg.includes('radier') || msg.includes('hormigon') || msg.includes('hormigón') || msg.includes('fundacion') || msg.includes('fundación')) {
    const espesorM = 0.10;
    const m3Hormigon = Math.round(m2 * espesorM * 1.10 * 10) / 10;
    const sacosCemento = Math.ceil(m3Hormigon * 6.5);
    const mallasAcma = Math.ceil(m2 / 12);
    const m3Aridos = Math.round(m3Hormigon * 1.15 * 10) / 10;

    const costoCemento = sacosCemento * 4490;
    const costoAridos = Math.round(m3Aridos * 24000);
    const costoMallas = mallasAcma * 19990;
    const costoMateriales = costoCemento + costoAridos + costoMallas + 35000;

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
        'Descargar cotización en PDF',
        'Enviar propuesta por WhatsApp',
      ],
    };
  }

  // 5. PINTURA / EMPASTE / MUROS
  if (msg.includes('pint') || msg.includes('latex') || msg.includes('látex') || msg.includes('esmalte') || msg.includes('pasta muro') || msg.includes('empaste')) {
    const galonesPintura = Math.ceil(m2 / 30); // 1 galón rinde ~30-35m2 a 2 manos
    const tinetaPasta = Math.ceil(m2 / 40);
    const costoPintura = galonesPintura * 22990;
    const costoPasta = tinetaPasta * 14990;
    const costoInsumos = 18000; // lijas, cinta enmascarar, plásticos
    const costoMateriales = costoPintura + costoPasta + costoInsumos;
    const manoObraM2 = 4500;
    const totalManoObra = Math.round(m2 * manoObraM2);
    const costoDirecto = costoMateriales + totalManoObra;
    const precioTotalConIva = Math.round((costoDirecto * 1.15) * 1.30 * 1.19);

    return {
      respuesta: `🎨 **CUBICACIÓN Y COSTOS: PINTURA Y PREPARACIÓN DE MUROS (${m2} m²)**

Para pintar y empastar una superficie de **${m2} m²** en Chile:

• **Esmalte al Agua / Látex Extra Cubriente:** **${galonesPintura} galón(es)** (~$${costoPintura.toLocaleString('es-CL')} CLP en *Sodimac / Tricolor* a 2 manos).
• **Pasta Muro Interior:** **${tinetaPasta} tineta(s)** (~$${costoPasta.toLocaleString('es-CL')} CLP).
• **Insumos de Preparación:** Lijas de grano 120/180, cinta masking tape azul, plásticos protectores (~$${costoInsumos.toLocaleString('es-CL')} CLP).

💰 **Costo Materiales:** **$${costoMateriales.toLocaleString('es-CL')} CLP**
👷 **Mano de Obra Pintor Calificado:** **$${totalManoObra.toLocaleString('es-CL')} CLP** ($4.500 CLP/m² incluye lijado, 2 manos de pasta y 2 manos de pintura).
📊 **Precio Sugerido al Cliente con IVA:** **$${precioTotalConIva.toLocaleString('es-CL')} CLP**.`,
      sugerencias: [
        `Créame la obra de pintura de ${m2}m2`,
        'Descargar cotización en PDF',
        'Enviar propuesta por WhatsApp',
      ],
    };
  }

  // 6. TABIQUERÍA / VOLCANITA / METALCON
  if (msg.includes('tabiq') || msg.includes('volcan') || msg.includes('metalcon') || msg.includes('yeso') || msg.includes('plancha')) {
    const planchasVolcanita = Math.ceil((m2 * 2) / 2.88); // 2 caras por tabique
    const montantesMetalcon = Math.ceil(m2 / 1.2);
    const solerasMetalcon = Math.ceil(m2 / 3);
    const lanaAislante = Math.ceil(m2 / 10);
    const costoVolcanita = planchasVolcanita * 6490;
    const costoMetalcon = (montantesMetalcon + solerasMetalcon) * 4290;
    const costoAislacion = lanaAislante * 18990;
    const costoInsumos = 25000; // tornillos, masilla, cinta
    const costoMateriales = costoVolcanita + costoMetalcon + costoAislacion + costoInsumos;
    const manoObraM2 = 11000;
    const totalManoObra = Math.round(m2 * manoObraM2);
    const costoDirecto = costoMateriales + totalManoObra;
    const precioTotalConIva = Math.round((costoDirecto * 1.15) * 1.30 * 1.19);

    return {
      respuesta: `🧱 **CUBICACIÓN Y COSTOS: TABIQUERÍA METALCON & VOLCANITA (${m2} m²)**

Para tabiquería divisoria de **${m2} m²** con estructura de acero galvanizado y aislamiento:

• **Planchas Yeso-Cartón Volcanita 10mm:** **${planchasVolcanita} planchas (1.20×2.40m)** (~$${costoVolcanita.toLocaleString('es-CL')} CLP ambas caras).
• **Perfiles Metalcon 60mm (Montantes y Soleras):** **${montantesMetalcon + solerasMetalcon} tiras de 3m** (~$${costoMetalcon.toLocaleString('es-CL')} CLP en *Construmart*).
• **Aislamiento Térmico-Acústico (Lana de Vidrio 50mm):** **${lanaAislante} rollo(s)** (~$${costoAislacion.toLocaleString('es-CL')} CLP).
• **Fijaciones:** Tornillos cabeza de lenteja, tornillos yeso-cartón, huincha de fibra y masilla base (~$${costoInsumos.toLocaleString('es-CL')} CLP).

💰 **Costo Materiales:** **$${costoMateriales.toLocaleString('es-CL')} CLP**
👷 **Mano de Obra Cuadrilla Tabiquera:** **$${totalManoObra.toLocaleString('es-CL')} CLP** ($11.000 CLP/m²).
📊 **Precio Sugerido al Cliente con IVA:** **$${precioTotalConIva.toLocaleString('es-CL')} CLP**.`,
      sugerencias: [
        `Créame la obra de tabiquería de ${m2}m2`,
        'Descargar cotización en PDF',
        'Enviar propuesta por WhatsApp',
      ],
    };
  }

  // 7. TECHUMBRE / ESTRUCTURA DE TECHO / ZINC
  if (msg.includes('tech') || msg.includes('zinc') || msg.includes('teja') || msg.includes('cubierta') || msg.includes('viga')) {
    const planchasZinc = Math.ceil(m2 / 2.5);
    const costaneras = Math.ceil(m2 / 1.5);
    const fieltroAsfaltico = Math.ceil(m2 / 40);
    const costoZinc = planchasZinc * 9490;
    const costoCostaneras = costaneras * 3890;
    const costoFieltro = fieltroAsfaltico * 16990;
    const costoMateriales = costoZinc + costoCostaneras + costoFieltro + 30000; // caballetes, tornillos
    const manoObraM2 = 15000;
    const totalManoObra = Math.round(m2 * manoObraM2);
    const costoDirecto = costoMateriales + totalManoObra;
    const precioTotalConIva = Math.round((costoDirecto * 1.15) * 1.30 * 1.19);

    return {
      respuesta: `🏠 **CUBICACIÓN Y COSTOS: TECHUMBRE Y CUBIERTAS (${m2} m²)**

Para la cubierta de techumbre de **${m2} m²** en Chile:

• **Planchas de Zinc Acanalado / 5V 0.35mm (3.66m):** **${planchasZinc} planchas** (~$${costoZinc.toLocaleString('es-CL')} CLP en *Imperial Barracas*).
• **Costaneras Pino Radiata 2×2 / Perfil Galvalume:** **${costaneras} tiras de 3.2m** (~$${costoCostaneras.toLocaleString('es-CL')} CLP).
• **Barrera Hidrófuga (Fieltro Asfáltico 15 lbs):** **${fieltroAsfaltico} rollo(s)** (~$${costoFieltro.toLocaleString('es-CL')} CLP).
• **Accesorios:** Caballetes galvanizados cumbrera y tornillos autoperforantes con golilla EPDM (~$30.000 CLP).

💰 **Costo Materiales:** **$${costoMateriales.toLocaleString('es-CL')} CLP**
👷 **Mano de Obra Maestro Techador:** **$${totalManoObra.toLocaleString('es-CL')} CLP** ($15.000 CLP/m²).
📊 **Precio Sugerido al Cliente con IVA:** **$${precioTotalConIva.toLocaleString('es-CL')} CLP**.`,
      sugerencias: [
        `Créame la obra de techumbre de ${m2}m2`,
        'Descargar cotización en PDF',
        'Enviar propuesta por WhatsApp',
      ],
    };
  }

  // 8. INSTALACIÓN ELÉCTRICA
  if (msg.includes('electr') || msg.includes('cable') || msg.includes('enchufe') || msg.includes('tablero') || msg.includes('luz')) {
    const puntos = Math.max(6, Math.ceil(m2 / 5));
    const costoMaterialesPunto = 12000;
    const manoObraPunto = 18000;
    const costoMateriales = puntos * costoMaterialesPunto + 45000; // tablero, disyuntor, diferencial
    const totalManoObra = puntos * manoObraPunto;
    const costoDirecto = costoMateriales + totalManoObra;
    const precioTotalConIva = Math.round((costoDirecto * 1.15) * 1.30 * 1.19);

    return {
      respuesta: `⚡ **CUBICACIÓN Y COSTOS: INSTALACIÓN ELÉCTRICA (${puntos} puntos / centros)**

Para normalización e instalación eléctrica de **${puntos} centros/enchufes** según norma SEC (RIC):

• **Conductores Libres de Halógeno (EVA/H07Z1-K 2.5mm² y 1.5mm²):** 2 rollos de 100m.
• **Canalización:** Tubería Conduit 20mm, cajas de derivación chuqui y módulos de enchufe/interruptor *Bticino / Schneider*.
• **Protecciones en Tablero:** Interruptor general 25A, disyuntor 16A (fuerza), 10A (alumbrado) e Interruptor Diferencial 25A / 30mA.

💰 **Costo Materiales Eléctricos:** **$${costoMateriales.toLocaleString('es-CL')} CLP**
👷 **Mano de Obra Instalador Eléctrico Autorizado SEC:** **$${totalManoObra.toLocaleString('es-CL')} CLP** ($18.000 CLP por punto).
📊 **Precio Sugerido al Cliente con IVA:** **$${precioTotalConIva.toLocaleString('es-CL')} CLP**.`,
      sugerencias: [
        `Créame la obra eléctrica de ${puntos} puntos`,
        'Descargar cotización en PDF',
        'Enviar propuesta por WhatsApp',
      ],
    };
  }

  // 9. INSTALACIÓN SANITARIA / GASFITERÍA / BAÑO
  if (msg.includes('sanit') || msg.includes('gasfit') || msg.includes('pvc') || msg.includes('baño') || msg.includes('bano') || msg.includes('agua') || msg.includes('alcantarill')) {
    const costoMateriales = 185000; // PVC 110/50mm, PPR/PEX, llaves de paso, pegamento
    const totalManoObra = 220000; // gasfíter especialista
    const costoDirecto = costoMateriales + totalManoObra;
    const precioTotalConIva = Math.round((costoDirecto * 1.15) * 1.30 * 1.19);

    return {
      respuesta: `🚰 **CUBICACIÓN Y COSTOS: INSTALACIÓN SANITARIA Y GASFITERÍA**

Para red de agua potable (fría/caliente) y alcantarillado sanitario en Chile:

• **Desagües y Descargas:** Tuberías PVC Sanitario 110mm (WC) y 50mm/40mm (lavamanos/ducha) con codos a 45°, ramales y sifones.
• **Agua Potable:** Cañerías PPR Termofusión o PEX 20mm/16mm con llaves de paso de corte rápido y terminales rosca he/hi.
• **Insumos:** Adhesivo Vinilit PVC, teflón alta densidad y abrazaderas de fijación.

💰 **Costo Materiales Sanitarios:** **$${costoMateriales.toLocaleString('es-CL')} CLP**
👷 **Mano de Obra Maestro Gasfíter Calificado:** **$${totalManoObra.toLocaleString('es-CL')} CLP** (incluye pruebas de presión y estanqueidad).
📊 **Precio Sugerido al Cliente con IVA:** **$${precioTotalConIva.toLocaleString('es-CL')} CLP**.`,
      sugerencias: [
        'Créame la obra de instalación sanitaria',
        'Descargar cotización en PDF',
        'Enviar propuesta por WhatsApp',
      ],
    };
  }

  // 10. QUINCHO / COBERTIZO / PÉRGOLA
  if (msg.includes('quincho') || msg.includes('asador') || msg.includes('pergola') || msg.includes('pérgola') || msg.includes('cobertizo') || msg.includes('cobert')) {
    const costoLadrillosRefractarios = 85000;
    const costoCampana = 180000;
    const costoMaderas = 160000; // vigas pino oregón
    const costoMateriales = costoLadrillosRefractarios + costoCampana + costoMaderas + 95000; // cemento, fierro, mesón
    const totalManoObra = 420000;
    const costoDirecto = costoMateriales + totalManoObra;
    const precioTotalConIva = Math.round((costoDirecto * 1.15) * 1.30 * 1.19);

    return {
      respuesta: `🔥 **CUBICACIÓN Y COSTOS: CONSTRUCCIÓN DE QUINCHO & COBERTIZO**

Para un quincho tradicional completo con mesón de trabajo y parrilla en Chile:

• **Zona de Fuego:** 120 Ladrillos refractarios + 4 sacos de cemento refractario + parrilla en ángulo en V con grasera de acero inoxidable.
• **Campana y Ducto:** Campana de fierro 1.5mm con tiraje regulable y extractor eólico.
• **Estructura Cobertizo:** Pilares y vigas en Pino Oregón 4×4 y 2×6 cepillado seco con barniz marino tinte roble.
• **Mesón de Apoyo:** Estructura de hormigón armado revestido con porcelanato o granito.

💰 **Costo Materiales:** **$${costoMateriales.toLocaleString('es-CL')} CLP**
👷 **Mano de Obra Cuadrilla Especialista:** **$${totalManoObra.toLocaleString('es-CL')} CLP** (plazo estimado 7 a 9 días hábiles).
📊 **Precio Sugerido al Cliente con IVA:** **$${precioTotalConIva.toLocaleString('es-CL')} CLP**.`,
      sugerencias: [
        'Créame la obra de quincho por $1.5M',
        'Descargar cotización en PDF',
        'Enviar propuesta por WhatsApp',
      ],
    };
  }

  // 11. PORCELANATO / CERÁMICAS / PISOS (Solo si explícitamente se consulta por pisos/porcelanato)
  if (msg.includes('porcelan') || msg.includes('ceram') || msg.includes('piso') || msg.includes('azulejo') || msg.includes('ceramica') || msg.includes('cerámica')) {
    const merma = 1.15;
    const m2Material = Math.ceil(m2 * merma * 10) / 10;
    const sacosBekron = Math.ceil(m2 / 4.5);
    const kgFrague = Math.ceil(m2 * 0.22);
    const cajasCrucetas = Math.ceil(m2 / 20);

    const costoPorcelanatoM2 = 12990;
    const costoTotalPorcelanato = Math.round(m2Material * costoPorcelanatoM2);
    const costoBekron = sacosBekron * 7490;
    const costoFrague = kgFrague * 2490;
    const costoInsumos = 25000;
    const totalMateriales = costoTotalPorcelanato + costoBekron + costoFrague + costoInsumos;

    const manoObraM2 = 14000;
    const totalManoObra = Math.round(m2 * manoObraM2);
    const diasTrabajo = Math.max(3, Math.ceil(m2 / 12));

    const costoDirecto = totalMateriales + totalManoObra;
    const gastosGenerales = Math.round(costoDirecto * 0.1);
    const imprevistos = Math.round(costoDirecto * 0.05);
    const costoBase = costoDirecto + gastosGenerales + imprevistos;

    const precioSugeridoNeto = Math.round(costoBase * 1.30);
    const iva = Math.round(precioSugeridoNeto * 0.19);
    const precioTotalConIva = precioSugeridoNeto + iva;
    const precioMinimo = Math.round(costoBase * 1.15 * 1.19);
    const precioPremium = Math.round(costoBase * 1.40 * 1.19);

    return {
      respuesta: `📐 **ANÁLISIS TÉCNICO Y PRESUPUESTO: INSTALACIÓN DE PORCELANATO (${m2} m²)**

Para una superficie de **${m2} m²** en Chile:

---

### 1. 🧱 Cubicador de Materiales (con 15% de merma por cortes):
• **Porcelanato (60×60 o 80×80 cm):** **${m2Material} m²** (~$${costoTotalPorcelanato.toLocaleString('es-CL')} CLP en *Sodimac Constructor / Easy*).
• **Adhesivo Bekron DA / Topex Pasta:** **${sacosBekron} sacos de 25 kg** (~$${costoBekron.toLocaleString('es-CL')} CLP en *Construmart* a $7.490/saco).
• **Fragüe Impermeable Antihongos:** **${kgFrague} kg** (~$${costoFrague.toLocaleString('es-CL')} CLP).
• **Crucetas 2mm + Cuñas Niveladoras:** **${cajasCrucetas} bolsa(s)** (~$${costoInsumos.toLocaleString('es-CL')} CLP).
💰 **Subtotal Materiales:** **$${totalMateriales.toLocaleString('es-CL')} CLP**.

---

### 2. 👷 Mano de Obra & Plazo de Ejecución:
• **Tarifa Maestro Ceramista Especialista:** $14.000 CLP / m².
• **Costo Mano de Obra Cuadrilla:** **$${totalManoObra.toLocaleString('es-CL')} CLP** (incluye preparación, cortes, colocación y limpieza).
• **Plazo Estimado:** **${diasTrabajo} a ${diasTrabajo + 1} días hábiles**.

---

### 3. 💡 Asesor de Cobro al Mandante ("¿Cuánto Cobrar?"):
• 🟢 **Precio Mínimo Rentable (15% margen):** **$${precioMinimo.toLocaleString('es-CL')} CLP**
• 🔵 **Precio Sugerido de Mercado (30% margen + IVA):** **$${precioTotalConIva.toLocaleString('es-CL')} CLP** (valor por m²: **$${Math.round(precioTotalConIva / m2).toLocaleString('es-CL')} CLP/m²**).
• 🟣 **Precio Premium con Garantía (40% margen):** **$${precioPremium.toLocaleString('es-CL')} CLP**.

---

### 4. 📝 Modalidad de Pago Recomendada:
1. **40% al iniciar ($${Math.round(precioTotalConIva * 0.4).toLocaleString('es-CL')} CLP):** Compra y despacho de porcelanatos.
2. **40% al terminar colocación ($${Math.round(precioTotalConIva * 0.4).toLocaleString('es-CL')} CLP):** Pago de avances.
3. **20% contra entrega conforme ($${Math.round(precioTotalConIva * 0.2).toLocaleString('es-CL')} CLP):** Fraguado y limpieza final.`,
      sugerencias: [
        `Créame una obra de porcelanato de ${m2}m2`,
        'Descargar cotización en PDF',
        'Enviar presupuesto por WhatsApp',
      ],
    };
  }

  // 12. RESPUESTA DINÁMICA CONSULTIVA PARA CUALQUIER OTRA CONSULTA O REQUERIMIENTO
  return {
    respuesta: `👷‍♂️ **ANÁLISIS DE FAENA Y ASESORÍA TÉCNICA - OBRATRACK**

Entendido tu requerimiento: *"${mensajeUsuario}"*.

En el contexto de la construcción en Chile, te asesoro con los parámetros recomendados para esta faena:

• 🧱 **Cubicación de Materiales:** Cotiza siempre considerando entre un **10% y 15% de merma** por cortes y despuntes en ferreterías con descuento constructor (*Construmart, Imperial Barracas o Sodimac*).
• 👷 **Rendimiento de Cuadrilla:** Los jornales actuales de mercado en Chile son: **Maestro Mayor $50.000/día**, **Maestro Especialista $40.000/día** y **Ayudante $28.000/día**.
• 💡 **Estructura de Cobro Rentable:** Para asegurar la rentabilidad de tu constructora, aplica la fórmula: **Costo Directo + 10% Gastos Generales + 5% Imprevistos + 30% Margen de Utilidad + IVA (19%)**.
• 📝 **Forma de Pago:** Solicita **40% de anticipo** para compra de insumos, **30% a mitad de faena** y **30% contra recepción conforme**.

¿Deseas que genere la cotización oficial en PDF o que cree esta obra en tu panel de Proyectos?`,
    sugerencias: [
      'Descargar cotización en PDF',
      'Créame esta obra en el menú de proyectos',
      '¿Cuánto cobrar por mano de obra?',
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
    proyectos?: { id: string; nombre: string; comuna?: string; estado?: string; monto_cotizado?: number }[];
    trabajadores?: { id: string; nombre: string; rol?: string }[];
    clientes?: { id: string; nombre: string }[];
  }
): Promise<{ respuesta: string; accion?: any; sugerencias?: string[] }> {
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
2. Responde de forma completamente natural, experta, analítica y directa a la consulta específica del usuario. Responde EXACTAMENTE sobre el tema que te preguntan (si preguntan por pintura, habla de pintura; si preguntan por techos, habla de techos; si preguntan por radier, habla de radier; si preguntan por porcelanato, habla de porcelanato).
3. REGLA ESTRICTA DE CONTEXTO: Tu dominio es única y exclusivamente la construcción, edificación, cubicación, ingeniería civil, materiales en Chile y agendamiento de faenas.

4. CAPACIDAD DE CONTROLAR LA WEB (EJECUTAR ACCIONES EN VIVO):
   Cuando el usuario te pida crear una obra, agregar un trabajador, asignar cuadrilla o agendar un compromiso, responde conversacionalmente confirmándolo y agrega AL FINAL DE TU RESPUESTA una etiqueta [ACCION_OBRA: {...}] con el JSON correspondiente:

   A) CREAR / AGENDAR NUEVA OBRA EN EL MENÚ DE PROYECTOS:
      [ACCION_OBRA: {"tipo":"crear_proyecto","nombre":"Nombre de la Obra","cliente_nombre":"Nombre Cliente","cliente_telefono":"+56912345678","comuna":"Comuna","monto":3500000,"dias":20,"descripcion":"Detalle de la obra"}]

   B) AGREGAR NUEVO TRABAJADOR AL EQUIPO:
      [ACCION_OBRA: {"tipo":"agregar_trabajador","nombre":"Juan Pérez","rol":"albañil","telefono":"+56987654321","email":"juan.perez@obratrack.cl"}]

   C) ASIGNAR TRABAJADOR A OBRA:
      [ACCION_OBRA: {"tipo":"asignar_trabajador","trabajador_nombre":"Juan Pérez","proyecto_nombre":"Peñalolén"}]

   D) AGENDAR VISITA A TERRENO:
      [ACCION_OBRA: {"tipo":"agendar_visita","titulo":"Visita a Terreno","fecha":"YYYY-MM-DD","hora":"10:00","comuna_lugar":"Peñalolén","descripcion":"Revisión de obra","cliente_nombre":"Don Carlos"}]

HISTORIAL DE LA CONVERSACIÓN:
${historial.map((h) => `${h.rol === 'user' ? 'Usuario' : 'Copiloto'}: ${h.texto}`).join('\n')}

NUEVO MENSAJE DEL USUARIO: "${mensajeUsuario}"

Responde como Copiloto de Obras experto:`;

  try {
    let rawText = await llamarGeminiDirectoRest(promptConversacional);

    if (!rawText) {
      const gemini = getGeminiClient();
      if (gemini) {
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
            console.warn(`Chat falló con ${m}:`, mErr);
          }
        }
      }
    }

    if (!rawText) {
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
      'Descargar cotización en PDF',
      'Enviar propuesta por WhatsApp',
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

  const prompt = `${SYSTEM_PROMPT_CONSTRUCCION_CHILE}

CLIENTE EN LÍNEA: ${params.clienteAutenticado ? params.clienteAutenticado.cliente.nombre : 'No autenticado'}
HISTORIAL:
${params.historial.map((h) => `${h.rol === 'user' ? 'Cliente' : 'Asistente'}: ${h.texto}`).join('\n')}

MENSAJE DEL CLIENTE: "${params.mensajeCliente}"

Responde amablemente:`;

  try {
    let rawText = await llamarGeminiDirectoRest(prompt);
    if (!rawText) {
      const resp = await gemini.models.generateContent({
        model: CANDIDATE_GEMINI_MODELS[0],
        contents: prompt,
      });
      rawText = resp.text || '';
    }
    return { respuesta: rawText || 'Mensaje recibido.' };
  } catch (error) {
    console.error('Error en asistente WhatsApp Gemini:', error);
    return { respuesta: 'Hubo un error al procesar tu consulta por favor intenta más tarde.' };
  }
}

/**
 * Asistente / Copiloto de IA Especializado para un Proyecto u Obra Específica
 */
export async function chatAgenteProyectoGemini(params: {
  historial: { rol: 'user' | 'model'; texto: string }[];
  mensajeUsuario: string;
  contextoProyecto: {
    id: string;
    nombre: string;
    comuna?: string;
    direccion?: string;
    estado: string;
    fecha_inicio: string;
    fecha_termino_estimada: string;
    monto_cotizado: number;
    total_pagado: number;
    total_imprevistos: number;
    total_materiales: number;
    saldo_pendiente: number;
    porcentaje_avance: number;
    cliente?: { nombre: string; telefono?: string };
    actividades?: Array<{
      id: string;
      nombre: string;
      dias: number;
      porcentaje_avance: number;
      estado: string;
      fecha_inicio: string;
      fecha_termino: string;
    }>;
    materiales?: Array<{
      id: string;
      nombre: string;
      cantidad: number;
      unidad: string;
      precio_unitario: number;
      subtotal: number;
    }>;
    imprevistos?: Array<{
      id: string;
      descripcion: string;
      monto: number;
      fecha: string;
    }>;
    bitacora?: Array<{
      id: string;
      titulo: string;
      nota: string;
      fecha: string;
      tipo: string;
    }>;
    trabajadores?: Array<{
      id: string;
      nombre: string;
      rol?: string;
    }>;
  };
}): Promise<{
  respuesta: string;
  accion?: any;
  sugerencias?: string[];
}> {
  const p = params.contextoProyecto;
  const msg = params.mensajeUsuario.toLowerCase().trim();

  // Partidas formateadas
  const partidasTexto = (p.actividades || [])
    .map(
      (a, idx) =>
        `${idx + 1}. "${a.nombre}" (${a.porcentaje_avance}% avance, estado: ${a.estado}, fechas: ${a.fecha_inicio} a ${a.fecha_termino})`
    )
    .join('\n') || 'Sin partidas definidas en la Carta Gantt.';

  // Insumos
  const materialesTexto = (p.materiales || [])
    .slice(0, 8)
    .map((m) => `• ${m.nombre}: ${m.cantidad} ${m.unidad} a $${m.precio_unitario.toLocaleString('es-CL')} ($${m.subtotal.toLocaleString('es-CL')})`)
    .join('\n') || 'Sin materiales registrados.';

  // Bitácora reciente
  const bitacoraTexto = (p.bitacora || [])
    .slice(0, 5)
    .map((b) => `• [${b.fecha} - ${b.tipo}]: ${b.titulo} ("${b.nota}")`)
    .join('\n') || 'Sin entradas en la bitácora.';

  // Cuadrilla
  const cuadrillaTexto = (p.trabajadores || [])
    .map((t) => `• ${t.nombre} (${t.rol || 'faena'})`)
    .join('\n') || 'Sin trabajadores asignados a esta obra.';

  const prompt = `${SYSTEM_PROMPT_CONSTRUCCION_CHILE}

ERES EL ASISTENTE DE IA DEDICADO EXCLUSIVAMENTE A ESTA OBRA:
======================================================
• OBRA: "${p.nombre}" (ID: ${p.id})
• MANDANTE / CLIENTE: ${p.cliente?.nombre || 'No asignado'} (Teléfono: ${p.cliente?.telefono || 'No registrado'})
• UBICACIÓN: ${p.direccion || ''}, ${p.comuna || 'Chile'}
• ESTADO DE LA OBRA: ${p.estado.toUpperCase()}
• PLAZO: ${p.fecha_inicio} al ${p.fecha_termino_estimada}
• AVANCE FÍSICO GENERAL PONDERADO: ${p.porcentaje_avance}%

ESTADO FINANCIERO DE ESTA OBRA:
• Monto Total Contratado: $${p.monto_cotizado.toLocaleString('es-CL')} CLP
• Total Pagado por el Mandante: $${p.total_pagado.toLocaleString('es-CL')} CLP
• Saldo Pendiente por Cobrar: $${p.saldo_pendiente.toLocaleString('es-CL')} CLP
• Gastos en Materiales: $${p.total_materiales.toLocaleString('es-CL')} CLP
• Gastos en Imprevistos: $${p.total_imprevistos.toLocaleString('es-CL')} CLP

CRONOGRAMA (CARTA GANTT DE ESTA OBRA):
${partidasTexto}

MATERIALES E INSUMOS REGISTRADOS:
${materialesTexto}

BITÁCORA DE TERRENO RECIENTE:
${bitacoraTexto}

CUADRILLA ASIGNADA:
${cuadrillaTexto}

INSTRUCCIONES CLAVE:
1. Conoces cada detalle de esta obra específica. Si el usuario te pregunta por el saldo, cronograma, materiales, imprevistos o mandante, responde con los datos reales precisos de la obra.
2. ACCIONES AUTÓNOMAS DISPONIBLES: Si el usuario te pide modificar, agregar o registrar algo en esta obra, confirma amablemente y coloca al final de tu respuesta una etiqueta [ACCION_PROYECTO: {...}] con el JSON:
   - Crear partida en Gantt: [ACCION_PROYECTO: {"tipo":"crear_actividad","nombre":"Nombre partida","dias":4}]
   - Actualizar avance partida: [ACCION_PROYECTO: {"tipo":"actualizar_avance","nombre":"Nombre partida o id","porcentaje_avance":100}]
   - Registrar imprevisto: [ACCION_PROYECTO: {"tipo":"registrar_imprevisto","descripcion":"Detalle del imprevisto","monto":120000}]
   - Agregar material: [ACCION_PROYECTO: {"tipo":"agregar_material","nombre":"Nombre material","cantidad":10,"unidad":"saco","precio_unitario":4500}]
   - Crear entrada bitácora: [ACCION_PROYECTO: {"tipo":"crear_bitacora","titulo":"Título","nota":"Detalle del día","subtipo":"avance"}]
   - Redactar WhatsApp cliente: [ACCION_PROYECTO: {"tipo":"generar_mensaje_whatsapp","mensaje":"Texto para el cliente","telefono":"${p.cliente?.telefono || ''}"}]

HISTORIAL DE CONVERSACIÓN DE ESTA OBRA:
${params.historial.map((h) => `${h.rol === 'user' ? 'Constructor' : 'Agente Obra'}: ${h.texto}`).join('\n')}

MENSAJE DEL CONSTRUCTOR: "${params.mensajeUsuario}"

Responde como el Agente Especialista de esta Obra:`;

  try {
    let rawText = await llamarGeminiDirectoRest(prompt);
    if (!rawText) {
      const gemini = getGeminiClient();
      if (gemini) {
        for (const m of CANDIDATE_GEMINI_MODELS) {
          try {
            const resp = await gemini.models.generateContent({
              model: m,
              contents: prompt,
            });
            if (resp.text) {
              rawText = resp.text;
              break;
            }
          } catch (e) {
            console.warn(`Error en SDK Gemini con ${m}:`, e);
          }
        }
      }
    }

    if (!rawText) {
      // Fallback heurístico si no hay conexión externa
      return generarFallbackAgenteProyecto(msg, p);
    }

    let accion: any = null;
    const actionMatch = rawText.match(/\[ACCION_PROYECTO:\s*(\{.*?\})\s*\]/);
    if (actionMatch) {
      try {
        accion = JSON.parse(actionMatch[1]);
        rawText = rawText.replace(actionMatch[0], '').trim();
      } catch (err) {
        console.warn('No se pudo parsear acción de proyecto:', err);
      }
    }

    const sugerencias = [
      '¿Cuánto saldo nos queda por cobrar?',
      '¿Qué partidas tenemos pendientes en la Carta Gantt?',
      'Redacta un mensaje de avance para el mandante',
    ];

    return {
      respuesta: rawText,
      accion,
      sugerencias,
    };
  } catch (error) {
    console.warn('Fallo en llamada Gemini para agente de obra, usando motor heurístico:', error);
    return generarFallbackAgenteProyecto(msg, p);
  }
}

function generarFallbackAgenteProyecto(msg: string, p: any) {
  // 1. Pregunta sobre finanzas o saldo
  if (msg.includes('saldo') || msg.includes('cobrar') || msg.includes('plata') || msg.includes('financ') || msg.includes('cuanto') || msg.includes('cuánto')) {
    return {
      respuesta: `💰 **ESTADO FINANCIERO DE LA OBRA "${p.nombre}"**
      
• **Monto Contratado Total:** $${p.monto_cotizado.toLocaleString('es-CL')} CLP
• **Total Pagado a la Fecha:** $${p.total_pagado.toLocaleString('es-CL')} CLP
• **Saldo Pendiente por Cobrar:** **$${p.saldo_pendiente.toLocaleString('es-CL')} CLP**
• **Gastos en Materiales:** $${p.total_materiales.toLocaleString('es-CL')} CLP
• **Imprevistos Registrados:** $${p.total_imprevistos.toLocaleString('es-CL')} CLP

El cliente **${p.cliente?.nombre || 'Mandante'}** ha cancelado el **${p.monto_cotizado > 0 ? Math.round((p.total_pagado / p.monto_cotizado) * 100) : 0}%** del presupuesto acordado.`,
      sugerencias: [
        'Redactar cobro por WhatsApp para el cliente',
        '¿Cómo va la Carta Gantt?',
        'Registrar un imprevisto en la obra',
      ],
    };
  }

  // 2. Partidas / Cronograma / Avance
  if (msg.includes('gantt') || msg.includes('partida') || msg.includes('avance') || msg.includes('cronograma')) {
    return {
      respuesta: `📊 **CRONOGRAMA & AVANCE FÍSICO: "${p.nombre}"**

• **Avance General Estimado:** **${p.porcentaje_avance}%**
• **Fecha de Término Comprometida:** ${p.fecha_termino_estimada}
• **Total de Partidas:** ${(p.actividades || []).length} partidas planificadas.

Puedes pedirme: *"Agrega partida Instalación de pisos de 4 días"* o *"Actualiza el avance de fundaciones al 100%"* y lo haré inmediatamente en tu Carta Gantt.`,
      sugerencias: [
        'Agrega una nueva partida',
        'Redactar informe semanal',
        '¿Cuánto saldo nos queda por cobrar?',
      ],
    };
  }

  // 3. Agregar partida
  const matchPartida = msg.match(/(?:agrega|crea|nueva)\s+partida\s+['"]?([^'"]+?)['"]?(?:\s+de\s+(\d+)\s+d[ií]as)?$/i);
  if (matchPartida) {
    const nombre = matchPartida[1].trim();
    const dias = matchPartida[2] ? Number(matchPartida[2]) : 5;
    return {
      respuesta: `🏗️ **¡Partida planificada para la Carta Gantt!**
      
Voy a incorporar **"${nombre}"** con una duración estimada de **${dias} días hábiles** en el cronograma de esta obra.`,
      accion: {
        tipo: 'crear_actividad',
        nombre,
        dias,
      },
      sugerencias: [
        'Ver Carta Gantt',
        '¿Cuánto presupuesto nos queda?',
        'Registrar avance del 50%',
      ],
    };
  }

  // 4. Default
  return {
    respuesta: `👷‍♂️ **Copiloto Obrero: Faena "${p.nombre}"**

Estoy a cargo de la gestión de esta obra. Puedo ayudarte a:
1. **Controlar el presupuesto:** Saldo por cobrar a ${p.cliente?.nombre || 'mandante'}, gastos de materiales e imprevistos.
2. **Modificar la Carta Gantt:** Agregar nuevas partidas o actualizar avances en vivo.
3. **Control de terreno:** Registrar entradas a la bitácora o añadir materiales.
4. **Comunicación:** Redactar mensajes de WhatsApp con estados de avance para el cliente.

¿Qué necesitas gestionar en esta faena?`,
    sugerencias: [
      '¿Cuánto saldo nos queda por cobrar?',
      '¿Cómo vamos con las partidas del Gantt?',
      'Redacta un mensaje para el mandante',
    ],
  };
}
