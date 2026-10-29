import { generateGemini, getServerGeminiKey } from '@/lib/ai/provider';
import { parseChatResponse, extractLegacyActions, normalizeQuote } from '@/lib/ai/protocol';
import { chatPrompt, quotePrompt, isQuoteRequest } from '@/lib/ai/prompt';
import { CHAT_RESPONSE_SCHEMA } from '@/lib/ai/schema';
import { CotizacionEstimacion } from '@/types/database';

export const DEFAULT_GEMINI_API_KEY = '';

export const getGeminiApiKey = getServerGeminiKey;

/**
 * Llamada directa a la API REST de Google Gemini (soporta Texto y Visión Multimodal Base64)
 */
export async function llamarGeminiDirectoRest(
  prompt: string, imagenInline?: { mimeType: string; data: string }
): Promise<string | null> {
  return generateGemini(prompt, { image: imagenInline });
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
  descripcion: string; tipo_obra: string; metros_cuadrados: number; comuna_region: string;
  margen_utilidad: number; nivel_calidad: string;
}): Promise<CotizacionEstimacion> {
  const prompt = quotePrompt([], `Genera una cotización detallada con estos datos: ${JSON.stringify(params)}. Incluye cotizacion y no emitas acciones para crear una obra.`, {});
  const result = parseChatResponse(await generateGemini(prompt, { json: true, schema: CHAT_RESPONSE_SCHEMA }));
  if (!result.cotizacion) throw new Error('La IA no incluyó el presupuesto solicitado.');
  return normalizeQuote({ ...result.cotizacion, estructura_financiera: { ...result.cotizacion.estructura_financiera, margen_utilidad_porcentaje: params.margen_utilidad } });
}

/**
 * Motor Heurístico Experto de Construcción en Chile para el Copiloto Obrero
 */
export const extraerAccionesDeTexto = extractLegacyActions;

/**
 * Chat interactivo conversacional con el Asesor Experto en Obras & Controlador Autónomo IA (Google Gemini)
 */
export async function chatAsesorObrasGemini(
  historial: { rol: 'user' | 'model'; texto: string }[], mensajeUsuario: string,
  contextoDB?: Record<string, any>, options: { budgetMs?: number; timeoutMs?: number; image?: {mimeType:string;data:string} } = {}
) {
  const prompt = isQuoteRequest(mensajeUsuario) ? quotePrompt(historial, mensajeUsuario, contextoDB) : chatPrompt(historial, mensajeUsuario, contextoDB);
  const raw = await generateGemini(prompt, { json: true, schema: CHAT_RESPONSE_SCHEMA, ...options });
  return parseChatResponse(raw);
}

export async function chatAsistenteClienteWhatsAppGemini(params: {
  historial: { rol: 'user' | 'model'; texto: string }[];
  mensajeCliente: string;
  clienteAutenticado?: {
    cliente: { id: string; nombre: string; rut?: string; telefono?: string; direccion?: string };
    proyectos: Array<{
      proyecto: {
        id: string;
        nombre: string;
        comuna?: string;
        direccion?: string;
        fecha_inicio: string;
        fecha_termino_estimada: string;
        estado: string;
      };
      actividades: Array<{ nombre: string; porcentaje_avance: number; estado: string }>;
      bitacora_reciente?: Array<{ titulo: string; nota: string; fecha: string; tipo: string }>;
      solicitudes_cambio?: Array<{ titulo: string; estado: string; impacto_monto: number }>;
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
  const msgLower = params.mensajeCliente.toLowerCase();

  // Intentar detectar si el cliente no autenticado envió su RUT o nombre
  let candidatoAuth: string | undefined;
  if (!params.clienteAutenticado && params.clientesRegistrados && params.clientesRegistrados.length > 0) {
    const cleanInput = params.mensajeCliente.replace(/[\.\-\s]/g, '').toLowerCase();
    for (const c of params.clientesRegistrados) {
      const cleanRut = (c.rut || '').replace(/[\.\-\s]/g, '').toLowerCase();
      if (
        (cleanRut.length >= 7 && cleanInput.includes(cleanRut)) ||
        (c.nombre && msgLower.includes(c.nombre.toLowerCase()))
      ) {
        candidatoAuth = c.rut || c.nombre;
        break;
      }
    }
  }

  const fotosDisponibles: string[] = [];
  if (params.clienteAutenticado?.proyectos) {
    params.clienteAutenticado.proyectos.forEach((p) => {
      (p.fotos_avance || []).forEach((f) => {
        if (f && !fotosDisponibles.includes(f)) fotosDisponibles.push(f);
      });
    });
  }

  const pideFotos =
    msgLower.includes('foto') ||
    msgLower.includes('imagen') ||
    msgLower.includes('ver') ||
    msgLower.includes('avance') ||
    msgLower.includes('como va') ||
    msgLower.includes('cómo va');

  const contextoObras = params.clienteAutenticado
    ? params.clienteAutenticado.proyectos
        .map((p, idx) => {
          const acts =
            p.actividades
              .map((a) => `   - ${a.nombre}: ${a.porcentaje_avance}% (${a.estado})`)
              .join('\n') || '   - Sin partidas registradas aún';
          const bit =
            (p.bitacora_reciente || [])
              .slice(0, 4)
              .map((b) => `   - [${b.fecha}] ${b.titulo}: ${b.nota}`)
              .join('\n') || '   - Sin novedades recientes en bitácora';
          const cambios =
            (p.solicitudes_cambio || [])
              .slice(0, 3)
              .map(
                (sc) =>
                  `   - ${sc.titulo} (${sc.estado}) — Ajuste: $${sc.impacto_monto.toLocaleString('es-CL')} CLP`
              )
              .join('\n') || '   - Sin solicitudes de cambio adicionales';
          return `OBRA #${idx + 1}: "${p.proyecto.nombre}" (${p.proyecto.comuna || 'Chile'})
• Estado: ${p.proyecto.estado.toUpperCase()} | Entrega estimada: ${p.proyecto.fecha_termino_estimada}
• Avance Físico General: ${p.porcentaje_avance}%
• Presupuesto Contratado: $${p.total_contratado.toLocaleString('es-CL')} CLP
• Total Pagado: $${p.total_pagado.toLocaleString('es-CL')} CLP | Saldo Pendiente: $${p.saldo_pendiente.toLocaleString('es-CL')} CLP
• Detalle de Partidas (Carta Gantt):
${acts}
• Últimos Reportes de Terreno / Bitácora:
${bit}
• Solicitudes de Cambio / Adicionales:
${cambios}
• Fotos reales disponibles: ${(p.fotos_avance || []).length}`;
        })
        .join('\n\n')
    : 'El cliente aún NO está identificado. Pídele amablemente su Nombre Completo o RUT para buscar su obra en ObraTrack.';

  const prompt = `Eres el Asistente Oficial de WhatsApp de ObraTrack para Clientes/Mandantes en Chile.
Tu misión es entregar información real, transparente, ejecutiva y cordial sobre cómo va la obra del cliente usando EXCLUSIVAMENTE los datos reales de la base de datos de ObraTrack mostrados abajo.

ESTADO DE IDENTIFICACIÓN:
${
  params.clienteAutenticado
    ? `Cliente Verificado: ${params.clienteAutenticado.cliente.nombre} (RUT: ${params.clienteAutenticado.cliente.rut || 'Verificado'})`
    : 'No verificado aún'
}

DATOS EN VIVO DESDE SUPABASE / OBRATRACK:
${contextoObras}

HISTORIAL RECIENTE DE WHATSAPP:
${params.historial.map((h) => `${h.rol === 'user' ? 'Cliente' : 'ObraTrack'}: ${h.texto}`).join('\n')}

MENSAJE ACTUAL DEL CLIENTE: "${params.mensajeCliente}"

REGLAS DE FORMATO WHATSAPP:
1. Usa formato amigable de WhatsApp (*negritas* con un solo asterisco, emojis sobrios 🏗️📊💰📅, viñetas claras).
2. Si el cliente está verificado, infórmale con cifras exactas su porcentaje de avance, en qué partidas se está trabajando hoy, las últimas novedades reportadas por los maestros en terreno y su estado de pagos si corresponde.
3. Sé conciso (máximo 18 líneas) para lectura cómoda en celular.

Responde ahora para WhatsApp:`;

  try {
    const rawText = await llamarGeminiDirectoRest(prompt);
    if (rawText) {
      return {
        respuesta: rawText.trim(),
        fotos: pideFotos && fotosDisponibles.length > 0 ? fotosDisponibles.slice(0, 3) : undefined,
        autenticar_rut_o_nombre: candidatoAuth,
      };
    }
  } catch (error) {
    console.warn('Error en asistente WhatsApp Cliente Gemini, usando resumen directo:', error);
  }

  // Fallback determinístico con los datos reales de Supabase si Gemini no responde
  if (!params.clienteAutenticado) {
    return {
      respuesta:
        '¡Hola! 👋 Bienvenido al seguimiento en línea de *ObraTrack*.\n\nPara consultar el avance en vivo, fotos de terreno y estado financiero de tu obra, indícame por favor tu *Nombre Completo* o *RUT*.',
      autenticar_rut_o_nombre: candidatoAuth,
    };
  }

  const p0 = params.clienteAutenticado.proyectos[0];
  if (!p0) {
    return {
      respuesta: `Hola *${params.clienteAutenticado.cliente.nombre}* 👋. Actualmente no registramos obras activas asociadas a tu ficha en el sistema.`,
    };
  }

  const ultimasPartidas = p0.actividades
    .slice(0, 4)
    .map((a) => `• ${a.nombre}: *${a.porcentaje_avance}%*`)
    .join('\n');

  const ultimaNota = p0.bitacora_reciente?.[0]
    ? `\n📝 *Último reporte de terreno (${p0.bitacora_reciente[0].fecha}):* ${p0.bitacora_reciente[0].titulo} — _"${p0.bitacora_reciente[0].nota}"_`
    : '';

  return {
    respuesta: `🏗️ *ESTADO EN VIVO DE TU OBRA - OBRATRACK*\nHola *${params.clienteAutenticado.cliente.nombre}*, así avanza tu proyecto:\n\n📌 *Obra:* ${p0.proyecto.nombre}\n📊 *Avance General:* *${p0.porcentaje_avance}%*\n📅 *Entrega Estimada:* ${p0.proyecto.fecha_termino_estimada}\n💰 *Pagado:* $${p0.total_pagado.toLocaleString('es-CL')} de $${p0.total_contratado.toLocaleString('es-CL')} CLP _(Saldo: $${p0.saldo_pendiente.toLocaleString('es-CL')} CLP)_\n\n*Partidas Principales:*\n${ultimasPartidas || '• En planificación inicial'}${ultimaNota}`,
    fotos: pideFotos && fotosDisponibles.length > 0 ? fotosDisponibles.slice(0, 3) : undefined,
    autenticar_rut_o_nombre: candidatoAuth,
  };
}

/**
 * Asistente / Copiloto de IA Especializado para un Proyecto u Obra Específica
 */
export async function chatAgenteProyectoGemini(params: {
  historial: { rol: 'user' | 'model'; texto: string }[];
  mensajeUsuario: string; contextoProyecto: any;
}) {
  const context = { proyectos: [params.contextoProyecto], proyecto_actual: params.contextoProyecto, cotizacion_actual: params.contextoProyecto.cotizacion_actual };
  const buildPrompt = isQuoteRequest(params.mensajeUsuario) ? quotePrompt : chatPrompt;
  const raw = await generateGemini(buildPrompt(params.historial, params.mensajeUsuario, context), { json: true, schema: CHAT_RESPONSE_SCHEMA });
  return parseChatResponse(raw);
}

/**
 * Procesador Multimodal IA (Texto + Foto) para Mensajes de WhatsApp enviados por Obreros / Terreno.
 * Identifica la obra destino, analiza la foto adjunta si existe, clasifica el reporte
 * (avance, nota, aviso, accidente, incidente, solicitud_cambio, asistencia) y devuelve JSON estructurado.
 */
export interface ResultadoProcesoWhatsAppObrero {
  proyecto_id: string | null;
  proyecto_nombre_detectado: string | null;
  tipo_evento: 'avance' | 'nota' | 'aviso' | 'incidente' | 'accidente' | 'solicitud_cambio' | 'asistencia';
  prioridad: 'baja' | 'media' | 'alta' | 'critica';
  titulo: string;
  descripcion: string;
  actividad_id?: string | null;
  actividad_nombre?: string | null;
  nuevo_porcentaje_avance?: number | null;
  impacto_monto?: number;
  impacto_dias?: number;
  materiales_requeridos?: Array<{
    nombre: string;
    cantidad: number;
    unidad: string;
    precio_unitario: number;
  }>;
  asistencia?: {
    estado: 'presente' | 'atraso' | 'ausente' | 'licencia' | 'permiso';
    hora_entrada?: string;
    hora_salida?: string;
    nombres_adicionales?: string[];
  } | null;
  respuesta_whatsapp: string;
}

export async function procesarMensajeObreroWhatsAppGemini(params: {
  mensajeTexto: string;
  obreroNombre: string;
  proyectoForzadoId?: string;
  obrasDisponibles: Array<{
    id: string;
    nombre: string;
    comuna?: string;
    asignadoAObrero?: boolean;
    actividades: Array<{ id: string; nombre: string; porcentaje_avance: number }>;
  }>;
  imagenBase64?: string;
  imagenMimeType?: string;
}): Promise<ResultadoProcesoWhatsAppObrero> {
  const obrasAsignadas = params.obrasDisponibles.filter((o) => o.asignadoAObrero);
  const obraPorDefecto =
    (params.proyectoForzadoId
      ? params.obrasDisponibles.find((o) => o.id === params.proyectoForzadoId)
      : null) ||
    obrasAsignadas[0] ||
    params.obrasDisponibles[0] ||
    null;

  const catalogoObrasTexto = params.obrasDisponibles
    .map((o) => {
      const acts = o.actividades
        .map((a) => `[id:${a.id}] "${a.nombre}" (${a.porcentaje_avance}%)`)
        .join(', ');
      return `• ID: "${o.id}" | Obra: "${o.nombre}" | Comuna: "${o.comuna || 'Chile'}" | Asignada al obrero: ${
        o.asignadoAObrero ? 'SÍ' : 'NO'
      } | Partidas Gantt: ${acts || 'Sin partidas'}`;
    })
    .join('\n');

  const prompt = `Eres el Motor de Inteligencia Artificial en Terreno de ObraTrack (Chile).
Un trabajador/obrero en faena acaba de enviar un mensaje por WhatsApp${
    params.imagenBase64 ? ' CON UNA FOTOGRAFÍA ADJUNTA DE LA OBRA' : ''
  }.

TRABAJADOR REMITENTE: "${params.obreroNombre}"
MENSAJE DE WHATSAPP: "${params.mensajeTexto || '(Fotografía enviada desde terreno sin texto adicional)'}"
${params.proyectoForzadoId ? `OBRA SELECCIONADA EXPLÍCITAMENTE: "${params.proyectoForzadoId}"` : ''}

OBRAS ACTIVAS EN SUPABASE:
${catalogoObrasTexto || 'Sin obras registradas'}

INSTRUCCIONES DE EXTRACCIÓN Y CLASIFICACIÓN:
1. Identifica a qué obra corresponde ("proyecto_id"):
   - Si el mensaje menciona el nombre o comuna de una obra, elige su ID exacto.
   - Si no la menciona pero tiene una obra asignada o seleccionada por defecto ("${obraPorDefecto?.id || ''}"), usa ese ID.
2. Si viene una FOTOGRAFÍA adjunta, descríbela técnicamente en "descripcion" (ej. avance de radier, tabiquería, cerámicos, daño estructural, condición de seguridad, acopio de materiales).
3. Clasifica "tipo_evento" en UNO de estos valores exactos:
   - "avance": reporta progreso físico de tareas o envía foto de avance constructivo. Si corresponde a una partida de la Carta Gantt, indica "actividad_id", "actividad_nombre" y "nuevo_porcentaje_avance" (0 a 100).
   - "accidente": accidente laboral, lesión, caída, corte o riesgo grave de seguridad (prioridad "critica" o "alta").
   - "incidente": problema técnico en terreno, rotura de matriz/cañería, atraso proveedor, falla eléctrica o hallazgo imprevisto.
   - "solicitud_cambio": el cliente en terreno pidió algo nuevo/adicional o se necesitan materiales nuevos por una nueva necesidad. Incluye en "materiales_requeridos" los insumos estimados con precios CLP de Chile y "impacto_monto".
   - "asistencia": el obrero avisa su llegada/presente, atraso, ausencia o licencia (rellena objeto "asistencia").
   - "aviso" o "nota": nota general, clima, entrega de materiales o recado de obra.
4. Redacta en "respuesta_whatsapp" una confirmación breve, cálida y profesional para WhatsApp indicando exactamente qué obra y qué módulo de ObraTrack fue actualizado en Supabase.

RESPONDE ÚNICAMENTE CON UN OBJETO JSON VÁLIDO (sin bloques markdown \`\`\`json):
{
  "proyecto_id": "id_exacto_obra",
  "proyecto_nombre_detectado": "Nombre Obra",
  "tipo_evento": "avance",
  "prioridad": "media",
  "titulo": "Resumen corto de 4 a 8 palabras",
  "descripcion": "Descripción técnica detallada del mensaje y de lo observado en la foto",
  "actividad_id": null,
  "actividad_nombre": null,
  "nuevo_porcentaje_avance": null,
  "impacto_monto": 0,
  "impacto_dias": 0,
  "materiales_requeridos": [],
  "asistencia": null,
  "respuesta_whatsapp": "✅ Recibido maestro..."
}`;

  try {
    const raw = await llamarGeminiDirectoRest(
      prompt,
      params.imagenBase64
        ? { mimeType: params.imagenMimeType || 'image/jpeg', data: params.imagenBase64 }
        : undefined
    );

    if (raw) {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const targetObra =
          params.obrasDisponibles.find((o) => o.id === parsed.proyecto_id) || obraPorDefecto;

        return {
          proyecto_id: targetObra?.id || null,
          proyecto_nombre_detectado: targetObra?.nombre || parsed.proyecto_nombre_detectado || null,
          tipo_evento: parsed.tipo_evento || 'nota',
          prioridad: parsed.prioridad || 'media',
          titulo: parsed.titulo || 'Reporte de terreno vía WhatsApp',
          descripcion: parsed.descripcion || params.mensajeTexto || 'Registro fotográfico de obra',
          actividad_id: parsed.actividad_id || null,
          actividad_nombre: parsed.actividad_nombre || null,
          nuevo_porcentaje_avance:
            parsed.nuevo_porcentaje_avance != null ? Number(parsed.nuevo_porcentaje_avance) : null,
          impacto_monto: Number(parsed.impacto_monto) || 0,
          impacto_dias: Number(parsed.impacto_dias) || 0,
          materiales_requeridos: Array.isArray(parsed.materiales_requeridos)
            ? parsed.materiales_requeridos
            : [],
          asistencia: parsed.asistencia || null,
          respuesta_whatsapp:
            parsed.respuesta_whatsapp ||
            `✅ *Registrado en ObraTrack*\n📌 Obra: *${targetObra?.nombre || 'General'}*\n📝 Evento: *${(
              parsed.titulo || 'Reporte'
            ).trim()}*\nSincronizado en tiempo real con la web y Supabase.`,
        };
      }
    }
  } catch (err) {
    console.warn('Fallback heurístico en procesarMensajeObreroWhatsAppGemini:', err);
  }

  // Fallback inteligente determinístico (si no hay API quota o sin conexión temporal)
  const msg = (params.mensajeTexto || '').toLowerCase();
  let matchedObra = obraPorDefecto;
  for (const o of params.obrasDisponibles) {
    if (
      msg.includes(o.nombre.toLowerCase()) ||
      (o.comuna && msg.includes(o.comuna.toLowerCase()))
    ) {
      matchedObra = o;
      break;
    }
  }

  let tipoEvento: ResultadoProcesoWhatsAppObrero['tipo_evento'] = params.imagenBase64 ? 'avance' : 'nota';
  let prioridad: ResultadoProcesoWhatsAppObrero['prioridad'] = 'media';

  if (msg.includes('accidente') || msg.includes('lesion') || msg.includes('lesión') || msg.includes('herid') || msg.includes('caida') || msg.includes('caída')) {
    tipoEvento = 'accidente';
    prioridad = 'critica';
  } else if (msg.includes('cliente pid') || msg.includes('cambio') || msg.includes('adicional') || msg.includes('necesitamos comprar') || msg.includes('faltan materiales')) {
    tipoEvento = 'solicitud_cambio';
    prioridad = 'alta';
  } else if (msg.includes('problema') || msg.includes('imprevisto') || msg.includes('rotura') || msg.includes('filtracion') || msg.includes('filtración')) {
    tipoEvento = 'incidente';
    prioridad = 'alta';
  } else if (msg.includes('presente') || msg.includes('llegamos') || msg.includes('llegué') || msg.includes('asistencia') || msg.includes('atraso') || msg.includes('licencia')) {
    tipoEvento = 'asistencia';
    prioridad = 'baja';
  } else if (msg.includes('%') || msg.includes('avance') || msg.includes('terminamos') || msg.includes('avanzamos') || msg.includes('listo el')) {
    tipoEvento = 'avance';
  }

  const pctMatch = msg.match(/(\d{1,3})\s*%/);
  const pct = pctMatch ? Math.min(100, Number(pctMatch[1])) : tipoEvento === 'avance' && msg.includes('terminamos') ? 100 : null;

  let actMatch: { id: string; nombre: string } | null = null;
  if (matchedObra && matchedObra.actividades.length > 0) {
    for (const a of matchedObra.actividades) {
      const words = a.nombre.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      if (words.some((w) => msg.includes(w))) {
        actMatch = a;
        break;
      }
    }
    if (!actMatch && pct != null) {
      actMatch = matchedObra.actividades[0];
    }
  }

  const horaMatch = msg.match(/(\d{1,2}:\d{2})/);
  const horaDetectada = horaMatch ? horaMatch[1] : '08:00';

  const tituloAuto =
    tipoEvento === 'accidente'
      ? 'Alerta de Accidente en Faena'
      : tipoEvento === 'solicitud_cambio'
      ? 'Solicitud de Cambio / Materiales Nuevos'
      : tipoEvento === 'incidente'
      ? 'Incidencia Técnica Reportada'
      : tipoEvento === 'asistencia'
      ? `Registro Asistencia (${params.obreroNombre})`
      : tipoEvento === 'avance'
      ? `Avance en Terreno${actMatch ? `: ${actMatch.nombre}` : ''}`
      : 'Nota de Terreno vía WhatsApp';

  return {
    proyecto_id: matchedObra?.id || null,
    proyecto_nombre_detectado: matchedObra?.nombre || null,
    tipo_evento: tipoEvento,
    prioridad,
    titulo: tituloAuto,
    descripcion:
      params.mensajeTexto ||
      'Evidencia fotográfica enviada desde WhatsApp y almacenada en Bitácora de Obra.',
    actividad_id: actMatch?.id || null,
    actividad_nombre: actMatch?.nombre || null,
    nuevo_porcentaje_avance: pct,
    impacto_monto: 0,
    impacto_dias: 0,
    materiales_requeridos: [],
    asistencia:
      tipoEvento === 'asistencia'
        ? {
            estado: msg.includes('atraso') ? 'atraso' : msg.includes('licencia') ? 'licencia' : 'presente',
            hora_entrada: horaDetectada,
            hora_salida: '18:00',
          }
        : null,
    respuesta_whatsapp: `✅ *Reporte Cargado en ObraTrack*\n📌 *Obra:* ${
      matchedObra?.nombre || 'Por asignar'
    }\n🏷️ *Clasificación:* ${tituloAuto}${
      pct != null ? `\n📊 *Avance actualizado:* ${pct}%` : ''
    }${params.imagenBase64 ? '\n📸 *Foto guardada en Supabase Storage*' : ''}`,
  };
}

/**
 * Cubicación rápida de materiales adicionales cuando hay una Solicitud de Cambio o Nueva Necesidad en Obra.
 */
export async function sugerirMaterialesCambioGemini(params: {
  titulo: string;
  descripcion: string;
  nombreObra?: string;
}): Promise<{
  materiales: Array<{ nombre: string; cantidad: number; unidad: string; precio_unitario: number }>;
  impacto_monto_sugerido: number;
  impacto_dias_sugerido: number;
  justificacion: string;
}> {
  const prompt = `${SYSTEM_PROMPT_CONSTRUCCION_CHILE}

En la obra "${params.nombreObra || 'Proyecto en ejecución'}", se registró la siguiente Solicitud de Cambio o Nueva Necesidad:
TÍTULO: "${params.titulo}"
DESCRIPCIÓN: "${params.descripcion}"

Calcula la lista realista de materiales nuevos necesarios en Chile (con precios unitarios de ferretería en CLP), el costo total adicional a cobrar al cliente ("impacto_monto_sugerido" incluyendo materiales + mano de obra + margen) y los días hábiles extra ("impacto_dias_sugerido").

Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "materiales": [
    {"nombre": "Nombre insumo", "cantidad": 10, "unidad": "unidad", "precio_unitario": 8500}
  ],
  "impacto_monto_sugerido": 450000,
  "impacto_dias_sugerido": 3,
  "justificacion": "Explicación breve del cálculo de materiales y mano de obra"
}`;

  try {
    const raw = await llamarGeminiDirectoRest(prompt);
    if (raw) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          materiales: Array.isArray(parsed.materiales) ? parsed.materiales : [],
          impacto_monto_sugerido: Number(parsed.impacto_monto_sugerido) || 0,
          impacto_dias_sugerido: Number(parsed.impacto_dias_sugerido) || 2,
          justificacion: parsed.justificacion || 'Cubicación calculada según precios de mercado en Chile.',
        };
      }
    }
  } catch (err) {
    console.warn('Error en sugerirMaterialesCambioGemini:', err);
  }

  return {
    materiales: [
      { nombre: 'Saco Cemento Especial 25kg', cantidad: 6, unidad: 'saco', precio_unitario: 4690 },
      { nombre: 'Insumos y fijaciones adicionales', cantidad: 1, unidad: 'kit', precio_unitario: 35000 },
    ],
    impacto_monto_sugerido: 185000,
    impacto_dias_sugerido: 2,
    justificacion: 'Estimación base referencial de materiales y jornal adicional.',
  };
}
