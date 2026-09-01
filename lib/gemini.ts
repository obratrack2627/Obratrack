import { GoogleGenAI } from '@google/genai';
import { CotizacionEstimacion, RecomendacionCobroCliente } from '@/types/database';

let geminiClientInstance: GoogleGenAI | null = null;

export function getGeminiApiKey(): string | null {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('YourGeminiApiKeyHere') || apiKey.startsWith('AIzaSyADGLLef')) {
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

const CANDIDATE_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-2.5-pro'];

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
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Gemini REST] Falló modelo ${model} (${res.status}):`, errText);
        continue;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
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
      "nombre": "Trazado y Replanteo",
      "dias": 2,
      "orden": 1
    }
  ],
  "consejos_experto_pyme": [
    "Consejo de compra estratégica",
    "Consejo de control de mano de obra",
    "Advertencia técnica de faena"
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

    if (contextoDB?.clientes && contextoDB.clientes.length > 0) {
      clienteNombre = contextoDB.clientes[0].nombre;
    }
    if (contextoDB?.proyectos && contextoDB.proyectos.length > 0) {
      proyectoNombre = contextoDB.proyectos[0].nombre;
    }

    const clienteMatch = msg.match(/(?:a|para)\s+([a-záéíóúñ\s]+?)(?:\s+por|\s+el|\s+la|$)/i);
    if (clienteMatch) clienteNombre = clienteMatch[1].trim();

    const textoWhatsApp = `🏗️ *PROPUESTA FORMAL DE COTIZACIÓN - OBRATRACK*\n\nEstimado(a) *${clienteNombre}*, le comparto el presupuesto oficial para la obra:\n📌 *${proyectoNombre}*\n💰 *Total Propuesta con IVA:* *$${montoTotal.toLocaleString('es-CL')} CLP*\n\n📋 *Forma de Pago Acordada:*\n• 40% Anticipo (Materiales): $${Math.round(montoTotal * 0.4).toLocaleString('es-CL')} CLP\n• 30% Avance 50%: $${Math.round(montoTotal * 0.3).toLocaleString('es-CL')} CLP\n• 20% Terminaciones: $${Math.round(montoTotal * 0.2).toLocaleString('es-CL')} CLP\n• 10% Recepción Conforme: $${Math.round(montoTotal * 0.1).toLocaleString('es-CL')} CLP\n\nEmitido a través de ObraTrack.`;

    const accion = {
      tipo: 'enviar_cotizacion_cliente',
      titulo: `Cotización Lista para Enviar a ${clienteNombre}`,
      cliente_nombre: clienteNombre,
      cliente_telefono: clienteTelefono,
      resultado_texto: `Propuesta formal generada para ${clienteNombre} por un total de $${montoTotal.toLocaleString('es-CL')} CLP. Haz clic en el botón de abajo para enviar el PDF o abrir WhatsApp.`,
      enlace_whatsapp: `https://wa.me/${clienteTelefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(textoWhatsApp)}`,
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
  const matchCrearObra = msg.match(/(?:crea(?:me|r)?\s+(?:la\s+)?obra|nueva\s+obra|ingresa\s+obra)\s+([^
]+)/i);
  if (matchCrearObra || msg.includes('crear obra') || msg.includes('créame una obra')) {
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

  // 5. CÁLCULO DE PORCELANATO / PISOS / CERÁMICAS O CONSULTAS GENERALES CON MEDIDAS
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

Para un área de **${ancho} × ${largo} metros (${m2} m²)** en Chile:

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
        model: 'gemini-2.5-flash',
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
