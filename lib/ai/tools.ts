import type { OpenAIFunctionTool } from './provider-types';
import { chileanRequestContext } from './chilean-context';
import { chileToday } from './project-deadlines';
import { conversationHistory } from './conversation';

export interface ParsedToolCall {
  name: string;
  arguments: string;
}

const fn = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): OpenAIFunctionTool => ({
  type: 'function',
  name,
  description,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  },
});

const TOOL_BUSCAR_PRECIOS = fn(
  'buscar_precios_materiales',
  'Busca precios reales publicados en ferreterías chilenas (Sodimac, Easy, Construmart) para un material o herramienta.',
  {
    producto: { type: 'string', description: 'Nombre del material o herramienta.' },
    presentacion: { type: 'string', description: 'Formato o medida, ej: saco de 25 kg, 2x4 pulgadas.' },
    marca_o_modelo: { type: 'string', description: 'Marca o modelo si el usuario lo mencionó.' },
    cantidad: { type: 'number', description: 'Cantidad solicitada.' },
    unidad_cantidad: { type: 'string', description: 'Unidad de la cantidad, ej: saco, unidad, plancha.' },
    tiendas: { type: 'array', items: { type: 'string' }, description: 'Tiendas específicas solicitadas.' },
  },
  ['producto'],
);

const WORKER_TOOLS: OpenAIFunctionTool[] = [
  fn(
    'actualizar_avance',
    'Actualiza el porcentaje de avance (0 a 100), fechas, duración, nombre y/o el trabajador responsable de una o todas las partidas de la Carta Gantt.',
    {
      proyecto_id: { type: 'string', description: 'ID exacto de la obra del contexto.' },
      actividad_id: { type: 'string', description: 'ID exacto de la partida si figura en el contexto, o "todas" si aplica a todas las partidas de la obra.' },
      nombre: { type: 'string', description: 'Nombre de la partida, o "todas" si se asigna el mismo responsable a todas las partidas de la Carta Gantt.' },
      nuevo_nombre: { type: 'string', description: 'Nuevo nombre de la partida solo si pidieron renombrarla.' },
      porcentaje_avance: { type: 'number', description: 'Avance total de 0 a 100. Omítelo si solo estás asignando el responsable o cambiando fechas.' },
      responsable_nombre: { type: 'string', description: 'Nombre o ID del trabajador/jefe de obra asignado como responsable de la partida (solo jefatura).' },
      fecha_inicio: { type: 'string', description: 'Nueva fecha de inicio YYYY-MM-DD de la partida.' },
      fecha_termino: { type: 'string', description: 'Nueva fecha de término YYYY-MM-DD de la partida.' },
      nota: { type: 'string', description: 'Observación breve del avance.' },
    },
    ['proyecto_id'],
  ),
  fn(
    'crear_bitacora',
    'Registra una entrada en la bitácora de obra (avance, incidente, clima o entrega de material).',
    {
      proyecto_id: { type: 'string' },
      titulo: { type: 'string', description: 'Título breve del registro.' },
      nota: { type: 'string', description: 'Detalle de lo ocurrido.' },
      tipo_bitacora: { type: 'string', enum: ['avance', 'incidente', 'clima', 'entrega_material'] },
      fecha: { type: 'string', description: 'Fecha YYYY-MM-DD si se indicó.' },
      material_id: { type: 'string' },
      cantidad_recibida: { type: 'number' },
    },
    ['proyecto_id', 'titulo', 'nota'],
  ),
  fn(
    'crear_solicitud_cambio',
    'Registra una solicitud de cambio, adicional, reclamo o incidente formal en una obra.',
    {
      proyecto_id: { type: 'string' },
      titulo: { type: 'string' },
      descripcion: { type: 'string' },
      subtipo: { type: 'string', enum: ['solicitud_cambio', 'reclamo', 'incidente', 'accidente'] },
      prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
      impacto_monto: { type: 'number', description: 'Impacto estimado en CLP (entero).' },
      impacto_dias: { type: 'number', description: 'Impacto estimado en días.' },
      solicitado_por: { type: 'string' },
    },
    ['proyecto_id', 'titulo', 'descripcion'],
  ),
  fn(
    'registrar_documento',
    'Registra un documento o boleta asociado a la obra (nunca inventes montos ni cierres diarios sin orden expresa).',
    {
      proyecto_id: { type: 'string' },
      categoria: { type: 'string', enum: ['contrato', 'plano', 'factura_boleta', 'correo', 'permiso_normativa', 'otro', 'cierre_diario', 'acta_recepcion'] },
      nombre: { type: 'string' },
      descripcion: { type: 'string' },
      monto_documento: { type: 'number' },
      proveedor_entidad: { type: 'string' },
      numero_documento: { type: 'string' },
      fecha_documento: { type: 'string' },
    },
    ['proyecto_id', 'categoria', 'nombre'],
  ),
];

const MANAGER_TOOLS: OpenAIFunctionTool[] = [
  fn(
    'actualizar_proyecto',
    'Actualiza únicamente los campos de la obra que el usuario pidió cambiar (no envíes nuevo_nombre, estado ni descripcion si no pidieron modificarlos). Al cambiar fechas o reprogramar, reprogramar_gantt ajusta automáticamente las partidas de la Carta Gantt.',
    {
      proyecto_id: { type: 'string' },
      nuevo_nombre: { type: 'string', description: 'Solo si pidió renombrar la obra.' },
      estado: { type: 'string', enum: ['pendiente', 'activo', 'pausado', 'terminado', 'cancelada'], description: 'Solo si pidió cambiar el estado.' },
      fecha_inicio: { type: 'string', description: 'YYYY-MM-DD' },
      fecha_termino_estimada: { type: 'string', description: 'YYYY-MM-DD' },
      reprogramar_gantt: { type: 'boolean', description: 'True para ajustar automáticamente las fechas de las partidas de la Carta Gantt al plazo de la obra.' },
      monto_cotizado: { type: 'number', description: 'Solo si pidió cambiar el presupuesto.' },
      descripcion: { type: 'string', description: 'Solo si pidió cambiar la descripción.' },
    },
    ['proyecto_id'],
  ),
  fn(
    'crear_actividad',
    'Agrega una o varias partidas nuevas a la Carta Gantt de una obra existente.',
    {
      proyecto_id: { type: 'string' },
      nombre: { type: 'string', description: 'Nombre de la partida.' },
      dias: { type: 'number', description: 'Duración estimada en días enteros.' },
      fecha_inicio: { type: 'string', description: 'Fecha de inicio YYYY-MM-DD opcional.' },
      responsable_nombre: { type: 'string', description: 'Nombre o ID del responsable de la partida.' },
      partidas: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            nombre: { type: 'string' },
            dias: { type: 'number' },
            fecha_inicio: { type: 'string' },
            responsable_nombre: { type: 'string' },
          },
          required: ['nombre', 'dias'],
        },
      },
    },
    ['proyecto_id'],
  ),
  fn(
    'registrar_pago',
    'Registra un pago o abono del cliente en CLP.',
    {
      proyecto_id: { type: 'string' },
      monto: { type: 'number', description: 'Monto entero positivo en CLP.' },
      metodo: { type: 'string', enum: ['transferencia', 'efectivo', 'debito', 'credito'] },
      estado: { type: 'string', enum: ['completado', 'pendiente'] },
      fecha: { type: 'string', description: 'YYYY-MM-DD' },
      notas: { type: 'string' },
      cliente_id: { type: 'string' },
    },
    ['proyecto_id', 'monto'],
  ),
  fn(
    'agregar_material',
    'Agrega un material a la lista de materiales de una obra.',
    {
      proyecto_id: { type: 'string' },
      nombre: { type: 'string' },
      cantidad: { type: 'number' },
      unidad: { type: 'string' },
      precio_unitario: { type: 'number' },
      categoria: { type: 'string' },
      proveedor: { type: 'string' },
      actividad_id: { type: 'string' },
      comprado: { type: 'boolean' },
      pagado: { type: 'boolean' },
    },
    ['proyecto_id', 'nombre', 'cantidad'],
  ),
  fn(
    'actualizar_material',
    'Actualiza el estado de compra/pago, cantidad o precio de un material existente en la obra.',
    {
      proyecto_id: { type: 'string' },
      material_id: { type: 'string' },
      nombre: { type: 'string' },
      comprado: { type: 'boolean' },
      pagado: { type: 'boolean' },
      cantidad: { type: 'number' },
      precio_unitario: { type: 'number' },
      proveedor: { type: 'string' },
    },
    ['proyecto_id'],
  ),
  fn(
    'registrar_imprevisto',
    'Registra un gasto adicional, jornal de mano de obra o imprevisto en CLP asociado a una obra.',
    {
      proyecto_id: { type: 'string' },
      titulo: { type: 'string' },
      descripcion: { type: 'string' },
      monto: { type: 'number', description: 'Monto entero en CLP.' },
      categoria_gasto: { type: 'string', enum: ['imprevisto', 'mano_obra', 'gasto_general'] },
      usuario_id: { type: 'string' },
      asistencia_id: { type: 'string', description: 'ID de asistencia confirmada si se liquida un jornal.' },
      valor_diario: { type: 'number' },
      jornada: { type: 'string', enum: ['completa', 'media'] },
      horas_extra: { type: 'number' },
      valor_hora_extra: { type: 'number' },
      pagado: { type: 'boolean' },
      estado: { type: 'string', enum: ['pendiente', 'aprobado', 'rechazado'] },
      fecha: { type: 'string' },
    },
    ['proyecto_id', 'descripcion'],
  ),
  fn(
    'registrar_asistencia',
    'Registra la asistencia diaria de un trabajador o de toda la cuadrilla (todos_presentes=true) en una obra (solo jefatura).',
    {
      proyecto_id: { type: 'string' },
      fecha: { type: 'string', description: 'YYYY-MM-DD' },
      todos_presentes: { type: 'boolean', description: 'True para marcar presentes a todos los trabajadores asignados a la obra.' },
      trabajador_nombre: { type: 'string', description: 'Nombre del trabajador si es individual.' },
      usuario_id: { type: 'string' },
      estado: { type: 'string', enum: ['presente', 'atraso', 'ausente', 'licencia', 'permiso'] },
      hora_entrada: { type: 'string' },
      hora_salida: { type: 'string' },
      horas_trabajadas: { type: 'number' },
      observacion: { type: 'string' },
    },
    ['proyecto_id'],
  ),
  fn(
    'asignar_trabajador',
    'Asigna un trabajador o supervisor existente del equipo a una obra.',
    {
      proyecto_id: { type: 'string' },
      trabajador_nombre: { type: 'string', description: 'Nombre o ID del trabajador existente.' },
      rut: { type: 'string', description: 'RUT si hay homónimos.' },
    },
    ['proyecto_id', 'trabajador_nombre'],
  ),
  fn(
    'desasignar_trabajador',
    'Retira un trabajador asignado de una obra.',
    {
      proyecto_id: { type: 'string' },
      trabajador_nombre: { type: 'string' },
    },
    ['proyecto_id', 'trabajador_nombre'],
  ),
  fn(
    'crear_cliente',
    'Propone registrar un nuevo cliente solo cuando el usuario entrega sus datos o lo solicita explícitamente.',
    {
      nombre: { type: 'string' },
      rut: { type: 'string' },
      telefono: { type: 'string' },
      email: { type: 'string' },
      direccion: { type: 'string' },
      comuna: { type: 'string' },
    },
    ['nombre'],
  ),
  fn(
    'actualizar_cliente',
    'Actualiza los datos de contacto o nombre de un cliente existente.',
    {
      cliente_id: { type: 'string' },
      nombre: { type: 'string', description: 'Nombre actual del cliente a identificar.' },
      nuevo_nombre: { type: 'string' },
      rut: { type: 'string' },
      telefono: { type: 'string' },
      email: { type: 'string' },
      direccion: { type: 'string' },
      comuna: { type: 'string' },
    },
    [],
  ),
  fn(
    'agregar_trabajador',
    'Propone registrar una nueva persona en el equipo de la empresa.',
    {
      nombre: { type: 'string' },
      rol: { type: 'string', enum: ['terreno', 'supervisor'] },
      rut: { type: 'string' },
      telefono_whatsapp: { type: 'string' },
      email: { type: 'string' },
      especialidades: { type: 'array', items: { type: 'string' } },
      proyecto_id: { type: 'string' },
    },
    ['nombre'],
  ),
  fn(
    'actualizar_trabajador',
    'Actualiza teléfono, correo, RUT, nombre o especialidades de un integrante existente del equipo.',
    {
      usuario_id: { type: 'string' },
      trabajador_nombre: { type: 'string' },
      nuevo_nombre: { type: 'string' },
      rut: { type: 'string' },
      telefono: { type: 'string' },
      email: { type: 'string' },
      especialidades: { type: 'array', items: { type: 'string' } },
    },
    [],
  ),
  fn(
    'agendar_evento',
    'Agenda una visita técnica, reunión o hito en el calendario de la obra.',
    {
      proyecto_id: { type: 'string' },
      titulo: { type: 'string' },
      fecha: { type: 'string', description: 'YYYY-MM-DD' },
      hora: { type: 'string', description: 'HH:MM (24h)' },
      tipo_evento: { type: 'string', enum: ['visita_terreno', 'reunion', 'hito', 'inspeccion', 'entrega'] },
      comuna_lugar: { type: 'string' },
      descripcion: { type: 'string' },
    },
    ['titulo', 'fecha', 'hora'],
  ),
  fn(
    'enviar_mensaje_equipo',
    'Envía un aviso real por WhatsApp a trabajadores o supervisores de una obra (solo cuando el usuario pide explícitamente enviar/avisar al equipo).',
    {
      proyecto_id: { type: 'string' },
      mensaje: { type: 'string' },
      roles_destino: { type: 'array', items: { type: 'string', enum: ['terreno', 'supervisor'] } },
      trabajadores_nombres: { type: 'array', items: { type: 'string' } },
    },
    ['mensaje'],
  ),
  fn(
    'generar_mensaje_whatsapp',
    'Prepara un borrador de mensaje WhatsApp para un cliente o sin enviar automáticamente.',
    {
      proyecto_id: { type: 'string' },
      mensaje: { type: 'string' },
      telefono: { type: 'string' },
      cliente_nombre: { type: 'string' },
    },
    ['mensaje'],
  ),
];

const WEB_CREATE_PROJECT_TOOL = fn(
  'crear_proyecto',
  'Crea una nueva obra en la plataforma web cuando el usuario lo pidió expresamente y entregó nombre y monto cotizado.',
  {
    nombre: { type: 'string' },
    monto_cotizado: { type: 'number' },
    cliente_id: { type: 'string' },
    cliente_nombre: { type: 'string' },
    cliente_email: { type: 'string' },
    cliente_telefono: { type: 'string' },
    dias: { type: 'number' },
    fecha_inicio: { type: 'string' },
    comuna: { type: 'string' },
    direccion: { type: 'string' },
    descripcion: { type: 'string' },
    partidas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { nombre: { type: 'string' }, dias: { type: 'number' } },
        required: ['nombre', 'dias'],
      },
    },
    materiales: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nombre: { type: 'string' },
          cantidad: { type: 'number' },
          unidad: { type: 'string' },
          precio_unitario: { type: 'number' },
        },
        required: ['nombre', 'cantidad'],
      },
    },
  },
  ['nombre'],
);

const WHATSAPP_PROPOSE_PROJECT_TOOL = fn(
  'proponer_obra_whatsapp',
  'Propone o actualiza el borrador de creación de una nueva obra en WhatsApp (en WhatsApp nunca se crea directamente sin confirmar los datos obligatorios).',
  {
    nombre: { type: 'string' },
    cliente_id: { type: 'string' },
    cliente_nombre: { type: 'string' },
    cliente_rut: { type: 'string' },
    cliente_email: { type: 'string' },
    cliente_telefono: { type: 'string' },
    monto_cotizado: { type: 'number' },
    comuna: { type: 'string' },
    direccion: { type: 'string' },
    descripcion: { type: 'string' },
    dias: { type: 'number' },
    fecha_inicio: { type: 'string' },
  },
  [],
);

const ADMIN_DELETE_PROJECT_TOOL = fn(
  'eliminar_proyecto',
  'Elimina una obra solo si el administrador lo solicitó de forma explícita e inequívoca.',
  {
    proyecto_id: { type: 'string' },
  },
  ['proyecto_id'],
);

const TOOL_GENERAR_COTIZACION = fn(
  'generar_cotizacion',
  'Genera una cotización o presupuesto estimado completo de construcción en CLP (estima materiales, jornales y fases estándar en Chile si faltan precios).',
  {
    titulo_proyecto: { type: 'string' },
    tipo_obra: { type: 'string' },
    comuna_region: { type: 'string' },
    metros_cuadrados: { type: 'number' },
    duracion_dias_estimada: { type: 'number' },
    resumen_ejecutivo: { type: 'string', description: 'Alcance, supuestos chilenos usados y una frase breve con detalles opcionales ajustables.' },
    cliente_id: { type: 'string' },
    cliente_nombre: { type: 'string' },
    materiales: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nombre: { type: 'string' },
          categoria: { type: 'string' },
          cantidad: { type: 'number' },
          unidad: { type: 'string' },
          precio_unitario_estimado: { type: 'number' },
          precio_incluye_iva: { type: 'boolean' },
        },
        required: ['nombre', 'cantidad', 'precio_unitario_estimado'],
      },
    },
    mano_de_obra: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rol: { type: 'string' },
          cantidad_personas: { type: 'number' },
          dias_estimados: { type: 'number' },
          valor_jornal_diario: { type: 'number' },
        },
        required: ['rol', 'cantidad_personas', 'dias_estimados', 'valor_jornal_diario'],
      },
    },
    estructura_financiera: {
      type: 'object',
      additionalProperties: false,
      properties: {
        gastos_generales_porcentaje: { type: 'number' },
        imprevistos_porcentaje: { type: 'number' },
        margen_utilidad_porcentaje: { type: 'number' },
        tipo_utilidad: { type: 'string', enum: ['recargo_costos', 'margen_venta'] },
      },
    },
    actividades_gantt: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nombre: { type: 'string' },
          dias: { type: 'number' },
        },
        required: ['nombre', 'dias'],
      },
    },
  },
  ['titulo_proyecto', 'duracion_dias_estimada', 'resumen_ejecutivo', 'materiales', 'mano_de_obra', 'actividades_gantt'],
);

/** Devuelve únicamente las herramientas autorizadas según rol, plan y canal (Tool-level RBAC). */
export function getObraBotTools(options: {
  role?: string;
  actionsEnabled?: boolean;
  whatsapp?: boolean;
}): OpenAIFunctionTool[] {
  const { role = 'admin', actionsEnabled = true, whatsapp = false } = options;
  if (!actionsEnabled) return [TOOL_BUSCAR_PRECIOS];
  if (role === 'terreno') return [TOOL_BUSCAR_PRECIOS, ...WORKER_TOOLS];

  const tools: OpenAIFunctionTool[] = [
    TOOL_BUSCAR_PRECIOS,
    TOOL_GENERAR_COTIZACION,
    ...WORKER_TOOLS,
    ...MANAGER_TOOLS,
    whatsapp ? WHATSAPP_PROPOSE_PROJECT_TOOL : WEB_CREATE_PROJECT_TOOL,
  ];
  if (role === 'admin') tools.push(ADMIN_DELETE_PROJECT_TOOL);
  return tools;
}

/** Instrucciones compactas para modo Tool Calling (reemplaza el mega-prompt JSON monolítico). */
export function buildToolChatInstructions(context: Record<string, any>): string {
  const isWhatsApp = Boolean(context.creacion_obra_whatsapp);
  const actionsEnabled = context.acciones_habilitadas !== false;
  const fecha = chileToday();
  return [
    `Eres ObraBot, asesor experto de ObraTrack para construcción en Chile (CLP, IVA 19%). Hoy en Chile: ${fecha} (America/Santiago).`,
    'Política de uso: No hay topes diarios internos en ObraBot; un servicio sin tope diario no implica saldo ilimitado si el proveedor externo limita temporalmente la capacidad.',
    'Reglas críticas:',
    '1. En acciones sobre obras/pagos/fichas usa solo IDs y montos reales del contexto; nunca inventes datos ni confirmes guardado previo. Boleta no acredita pago; comprado≠recibido≠instalado; obra al 100% cierra sola.',
    actionsEnabled
      ? '2. Cotizaciones (Estima primero, ajusta después): si piden presupuesto o describen un trabajo con medidas/alcance, invoca generar_cotizacion de inmediato estimando costos netos chilenos con supuestos en resumen_ejecutivo y ofrece ajustar opcionales al cierre. Nunca rechaces por falta de precios.'
      : '2. Solo consultas y búsqueda de precios; los cambios y presupuestos avanzados requieren Pro IA.',
    '3. Si es solo consulta, responde directo sin tools de escritura. Si falta un dato indispensable, agrupa en una sola pregunta breve (en cotizaciones con trabajo+medida, estima sin preguntar primero).',
    '4. Si piden ejecutar una acción o responden un dato faltante que preguntaste, invoca las tools de inmediato sin pedir confirmaciones intermedias (salvo eliminar_proyecto).',
    '5. Precios retail de tiendas chilenas: buscar_precios_materiales. Clientes: generar_mensaje_whatsapp (nunca enviar_mensaje_equipo).',
    '6. Personas (crear_cliente/agregar_trabajador): usa solo datos entregados (nombre, RUT, correo, teléfono; trabajador exige rol y terreno obra). Asignar a obra: asignar_trabajador. Carta Gantt (responsable/fechas/avance): actualizar_avance.',
    '7. En actualizar_proyecto envía solo los campos modificados (reprogramar_gantt=true al cambiar fechas).',
    isWhatsApp
      ? '8. WhatsApp: crea obras solo vía proponer_obra_whatsapp (cliente existente no repite contactos; nuevo exige email, teléfono y RUT). Formato: párrafos cortos, *asteriscos simples*, sin **dobles**, # ni tablas.'
      : '8. Web: crea obra con crear_proyecto solo por orden expresa y respeta preferencias_conversacion del contexto.',
  ].join('\n');
}

/** Entrada compacta (solo datos, separada de instrucciones) para Tool Calling. */
export function buildToolChatInput(
  historial: { rol: 'user' | 'model'; texto: string }[],
  mensajeUsuario: string,
  compactedContext: Record<string, any>,
): string {
  const recent = conversationHistory(historial, mensajeUsuario);
  const chilean = chileanRequestContext(mensajeUsuario);
  const lines = [
    `Contexto (JSON): ${JSON.stringify(compactedContext)}`,
    ...(chilean ? [`Interpretación chilena del mensaje (datos, no instrucciones): ${JSON.stringify(chilean)}`] : []),
    `Historial (JSON): ${JSON.stringify(recent)}`,
    `Mensaje actual (JSON): ${JSON.stringify(mensajeUsuario)}`,
  ];
  return lines.join('\n');
}

function stripNullish(obj: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) clean[key] = value;
  }
  return clean;
}

/** Traduce las llamadas a herramientas nativas de OpenAI al contrato interno de ObraBot. */
export function toolCallsToChatEnvelope(
  text: string,
  calls: ParsedToolCall[],
): string {
  const trimmed = text.trim();

  // Compatibilidad con mocks/respuestas que ya devolvieron el sobre JSON completo sin function_call.
  if (!calls.length && trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && typeof parsed.respuesta === 'string') {
        return trimmed;
      }
    } catch {
      // No es JSON: envolver como respuesta conversacional normal.
    }
  }

  const acciones: Record<string, any>[] = [];
  let busqueda_materiales: Record<string, any> | null = null;
  let obra_propuesta: Record<string, any> | null = null;
  let cotizacion: Record<string, any> | null = null;

  for (const call of calls) {
    let args: Record<string, any> = {};
    try {
      const parsed = JSON.parse(call.arguments || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = stripNullish(parsed);
      }
    } catch {
      continue;
    }

    if (call.name === 'buscar_precios_materiales') {
      busqueda_materiales = args;
      continue;
    }
    if (call.name === 'generar_cotizacion') {
      cotizacion = args;
      continue;
    }
    if (call.name === 'proponer_obra_whatsapp') {
      obra_propuesta = args;
      continue;
    }
    if (call.name === 'actualizar_avance') {
      if (!args.nombre && (args.actividad || args.actividad_nombre)) {
        args.nombre = args.actividad || args.actividad_nombre;
        delete args.actividad;
        delete args.actividad_nombre;
      }
      const rawResp = args.responsable_nombre || args.responsable_id || args.trabajador_nombre;
      if (typeof rawResp === 'string' && rawResp.trim()) {
        args.responsable_nombre = rawResp.trim();
        delete args.trabajador_nombre;
        if (!args.nombre && !args.actividad_id) {
          args.nombre = 'todas';
        }
      }
    }
    if (call.name === 'actualizar_proyecto' && (args.fecha_inicio || args.fecha_termino_estimada) && args.reprogramar_gantt === undefined) {
      args.reprogramar_gantt = true;
    }
    if (call.name === 'crear_solicitud_cambio' && args.tipo && !args.subtipo) {
      args.subtipo = args.tipo;
      delete args.tipo;
    }
    if ((call.name === 'agendar_evento' || call.name === 'agendar_visita') && args.tipo && !args.tipo_evento) {
      args.tipo_evento = args.tipo;
      delete args.tipo;
    }
    if (call.name === 'registrar_asistencia' && !args.todos_presentes && !args.estado) {
      args.estado = 'presente';
    }
    acciones.push({ ...args, tipo: call.name });
  }

  const defaultReply =
    acciones.length > 0
      ? 'Voy a preparar los cambios solicitados.'
      : cotizacion
        ? cotizacion.resumen_ejecutivo || 'Preparé el presupuesto estimado.'
        : busqueda_materiales
          ? 'Consultando precios en tiendas...'
          : obra_propuesta
            ? 'Preparando el borrador de la obra.'
            : trimmed || '¿En qué te puedo ayudar con tus obras?';

  const envelope: Record<string, any> = {
    respuesta: trimmed || defaultReply,
    acciones,
    cotizacion,
    sugerencias: [],
    ...(busqueda_materiales ? { busqueda_materiales } : {}),
    ...(obra_propuesta ? { obra_propuesta } : {}),
  };

  if (trimmed && (acciones.length > 0 || busqueda_materiales)) {
    envelope.respuesta_consulta = trimmed;
  }

  return JSON.stringify(envelope);
}
