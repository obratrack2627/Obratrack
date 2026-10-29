import type { CotizacionEstimacion } from "@/types/database";
import { AIError } from "./errors";

export const ACTION_TYPES = [
  "crear_proyecto",
  "crear_proyecto_completo",
  "actualizar_proyecto",
  "eliminar_proyecto",
  "crear_cliente",
  "actualizar_cliente",
  "agregar_trabajador",
  "agregar_trabajadores",
  "asignar_trabajador",
  "asignar_trabajadores",
  "desasignar_trabajador",
  "crear_actividad",
  "actualizar_avance",
  "agregar_material",
  "agregar_materiales",
  "registrar_imprevisto",
  "registrar_pago",
  "crear_bitacora",
  "generar_reporte",
  "agendar_visita",
  "agendar_evento",
  "generar_mensaje_whatsapp",
  "enviar_mensaje_equipo",
  "crear_solicitud_cambio",
  "registrar_asistencia",
  "registrar_documento",
] as const;
export type AIAction = { tipo: string; [key: string]: any };
const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
function fail(message: string): never {
  throw new AIError("AI_INVALID_ACTION", message, 422);
}
function amount(v: unknown, label: string, positive = false): number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    (positive ? v <= 0 : v < 0)
  )
    fail(
      `Revisa ${label}: debe ser un número ${positive ? "mayor a cero" : "válido y no negativo"}.`,
    );
  return v;
}
const validDate = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export function roundLine(quantity: number, price: number): number {
  amount(quantity, "la cantidad");
  amount(price, "el precio");
  const scale = BigInt(1000000);
  const product =
    BigInt(Math.round(quantity * 1000000)) * BigInt(Math.round(price));
  const result = Number((product + scale / BigInt(2)) / scale);
  if (!Number.isSafeInteger(result)) fail("El monto supera el rango admitido.");
  return result;
}
function material(m: any) {
  if (!m || !text(m.nombre)) fail("Falta el nombre del material.");
  amount(m.cantidad, "la cantidad de material", true);
  amount(m.precio_unitario, "el precio unitario");
}
export function flattenActions(input: any, depth = 0): AIAction[] {
  if (depth > 4) fail("El lote de acciones es demasiado complejo.");
  const list = Array.isArray(input)
    ? input
    : input?.tipo === "lote_acciones"
      ? input.acciones
      : input
        ? [input]
        : [];
  if (!Array.isArray(list) || list.length > 30)
    fail("Solicita hasta 30 acciones por mensaje.");
  const actions = list.flatMap((a) =>
    a?.tipo === "lote_acciones" || Array.isArray(a)
      ? flattenActions(a, depth + 1)
      : [a],
  );
  if (actions.length > 30) fail("Solicita hasta 30 acciones por mensaje.");
  return actions.map(validateAction);
}
export function validateAction(raw: any): AIAction {
  if (!raw || typeof raw !== "object" || !ACTION_TYPES.includes(raw.tipo))
    fail("La IA propuso una acción que la plataforma no admite.");
  const a: AIAction = JSON.parse(JSON.stringify(raw));
  const required = (field: string) => {
    if (!text(a[field]))
      fail(
        `Falta ${field.replaceAll("_", " ")} para ${a.tipo.replaceAll("_", " ")}.`,
      );
  };
  for (const field of [
    "monto",
    "monto_cotizado",
    "precio_unitario",
    "impacto_monto",
  ])
    if (a[field] !== undefined) amount(a[field], field);
  if (a.dias !== undefined) {
    amount(a.dias, "la duración", a.tipo !== "crear_solicitud_cambio");
    if (!Number.isInteger(a.dias))
      fail("La duración debe indicarse en días completos.");
  }
  if (
    a.porcentaje_avance !== undefined &&
    amount(a.porcentaje_avance, "el avance") > 100
  )
    fail("El avance debe estar entre 0 y 100 %.");
  for (const field of ["fecha", "fecha_inicio", "fecha_termino_estimada"])
    if (a[field] !== undefined && !validDate(a[field]))
      fail(`Revisa ${field.replaceAll("_", " ")}.`);
  for (const field of ["hora", "hora_entrada", "hora_salida"])
    if (a[field] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(a[field]))
      fail("Revisa las horas de entrada y salida.");
  if (
    [
      "crear_proyecto",
      "crear_proyecto_completo",
      "crear_cliente",
      "registrar_documento",
      "agregar_trabajador",
    ].includes(a.tipo)
  )
    required("nombre");
  if (["crear_proyecto", "crear_proyecto_completo"].includes(a.tipo)) {
    amount(a.monto_cotizado ?? a.monto, "el presupuesto");
  }
  if (
    a.estado &&
    a.tipo === "actualizar_proyecto" &&
    !["activo", "terminado", "pausado"].includes(a.estado)
  )
    fail("Estado de obra no válido.");
  if (
    a.tipo === "actualizar_proyecto" &&
    ![
      "estado",
      "monto",
      "monto_cotizado",
      "fecha_termino_estimada",
      "descripcion",
    ].some((k) => a[k] !== undefined)
  )
    fail("Indica qué dato de la obra quieres actualizar.");
  if (a.tipo === "actualizar_cliente" && !text(a.nombre) && !text(a.cliente_id))
    fail("Indica el cliente que quieres actualizar.");
  if (a.tipo === "agregar_trabajador")
    a.rol = ["terreno", "supervisor"].includes(a.rol) ? a.rol : "terreno";
  if (a.tipo === "agregar_trabajadores") {
    if (!Array.isArray(a.trabajadores) || !a.trabajadores.length)
      fail("Falta la lista de trabajadores.");
    a.trabajadores = a.trabajadores.map((t: any) =>
      validateAction({ ...t, tipo: "agregar_trabajador" }),
    );
  }
  if (
    [
      "asignar_trabajador",
      "asignar_trabajadores",
      "desasignar_trabajador",
    ].includes(a.tipo) &&
    !text(a.trabajador_nombre) &&
    !a.trabajadores_nombres?.length &&
    !a.trabajadores?.length
  )
    fail("Indica qué trabajadores quieres asignar.");
  if (a.tipo === "crear_actividad" || a.partidas !== undefined) {
    const list =
      a.partidas || a.actividades || (a.tipo === "crear_actividad" ? [a] : []);
    if (!Array.isArray(list) || !list.length) fail("Faltan las actividades.");
    list.forEach((p: any) => {
      if (!text(p.nombre)) fail("Falta el nombre de una actividad.");
      amount(p.dias, "la duración de la actividad", true);
    });
  }
  if (a.tipo === "actualizar_avance") {
    if (!text(a.nombre) && !text(a.actividad_id))
      fail("Indica la actividad que quieres actualizar.");
    amount(a.porcentaje_avance, "el avance");
  }
  if (a.materiales !== undefined) {
    if (!Array.isArray(a.materiales) || a.materiales.length > 150)
      fail("Lista de materiales inválida.");
    a.materiales.forEach(material);
  }
  if (["agregar_material", "agregar_materiales"].includes(a.tipo)) {
    if (a.materiales) {
      if (!a.materiales.length) fail("Faltan los materiales.");
    } else material(a);
  }
  if (a.tipo === "registrar_pago") {
    amount(a.monto, "el pago", true);
    if (a.metodo && !["transferencia", "efectivo", "debito"].includes(a.metodo))
      fail("Forma de pago no válida.");
  }
  if (a.tipo === "registrar_imprevisto") {
    required("descripcion");
    amount(a.monto, "el costo del imprevisto");
  }
  if (a.tipo === "crear_bitacora") {
    required("titulo");
    required("nota");
  }
  if (["agendar_visita", "agendar_evento"].includes(a.tipo)) {
    required("titulo");
    if (!validDate(a.fecha)) fail("Indica la fecha de la visita.");
    required("hora");
  }
  if (a.tipo === "generar_mensaje_whatsapp") required("mensaje");
  if (a.tipo === "enviar_mensaje_equipo") {
    required("mensaje");
    if (a.mensaje.length > 800)
      fail("El aviso al equipo admite hasta 800 caracteres.");
    if (
      a.roles_destino !== undefined &&
      (!Array.isArray(a.roles_destino) ||
        a.roles_destino.some(
          (r: any) => !["admin", "supervisor", "terreno"].includes(r),
        ))
    )
      fail("Indica los roles destinatarios del aviso.");
    if (!a.roles_destino?.length && !a.trabajadores_nombres?.length)
      fail("Indica a quiénes quieres enviar el aviso.");
  }
  if (a.tipo === "crear_solicitud_cambio") {
    required("titulo");
    required("descripcion");
  }
  if (a.tipo === "registrar_asistencia") {
    if (a.todos_presentes !== true) required("trabajador_nombre");
    if (
      a.estado &&
      !["presente", "atraso", "ausente", "licencia", "permiso"].includes(
        a.estado,
      )
    )
      fail("Estado de asistencia no válido.");
  }
  return a;
}

export function normalizeQuote(raw: any): CotizacionEstimacion {
  if (
    !raw ||
    !text(raw.titulo_proyecto) ||
    !Array.isArray(raw.materiales) ||
    !Array.isArray(raw.mano_de_obra) ||
    (!raw.materiales.length && !raw.mano_de_obra.length)
  )
    fail("La cotización debe incluir un nombre y costos desglosados.");
  const materiales = raw.materiales.map((m: any) => {
    if (!text(m.nombre))
      fail("Falta identificar un material de la cotización.");
    const cantidad = amount(m.cantidad, "la cantidad", true);
    const precio = Math.round(
      amount(m.precio_unitario_estimado, "el precio del material"),
    );
    return {
      nombre: m.nombre,
      categoria: m.categoria || "general",
      cantidad,
      unidad: m.unidad || "unidad",
      precio_unitario_estimado: precio,
      subtotal: roundLine(cantidad, precio),
      mejor_tienda: m.mejor_tienda || "Por cotizar",
      precio_mas_barato: precio,
      ahorro_estimado: 0,
    };
  });
  const mano_de_obra = raw.mano_de_obra.map((m: any) => {
    if (!text(m.rol)) fail("Falta el oficio de mano de obra.");
    const cantidad_personas = amount(m.cantidad_personas, "la cuadrilla", true);
    const dias_estimados = amount(
      m.dias_estimados,
      "los días de trabajo",
      true,
    );
    const valor_jornal_diario = Math.round(
      amount(m.valor_jornal_diario, "el valor diario"),
    );
    return {
      rol: m.rol,
      cantidad_personas,
      dias_estimados,
      valor_jornal_diario,
      subtotal: roundLine(
        cantidad_personas * dias_estimados,
        valor_jornal_diario,
      ),
    };
  });
  const costo_materiales_total = materiales.reduce(
    (s: number, m: any) => s + m.subtotal,
    0,
  );
  const costo_mano_obra_total = mano_de_obra.reduce(
    (s: number, m: any) => s + m.subtotal,
    0,
  );
  const costo_directo = costo_materiales_total + costo_mano_obra_total;
  const f = raw.estructura_financiera || {};
  const gg = amount(
    f.gastos_generales_porcentaje ?? 10,
    "los gastos generales",
  );
  const im = amount(f.imprevistos_porcentaje ?? 5, "los imprevistos");
  const margen = amount(f.margen_utilidad_porcentaje ?? 30, "la utilidad");
  const gastos_generales_monto = roundLine(gg / 100, costo_directo),
    imprevistos_monto = roundLine(im / 100, costo_directo);
  const base = costo_directo + gastos_generales_monto + imprevistos_monto;
  const margen_utilidad_monto = roundLine(margen / 100, base),
    precio_sugerido_neto = base + margen_utilidad_monto;
  const iva_19 = roundLine(0.19, precio_sugerido_neto);
  return {
    id: `cot-${crypto.randomUUID()}`,
    titulo_proyecto: raw.titulo_proyecto,
    tipo_obra: raw.tipo_obra || "General",
    cliente_id: typeof raw.cliente_id === "string" ? raw.cliente_id : undefined,
    cliente_nombre:
      typeof raw.cliente_nombre === "string" ? raw.cliente_nombre : undefined,
    cliente_telefono:
      typeof raw.cliente_telefono === "string"
        ? raw.cliente_telefono
        : undefined,
    condiciones_pago:
      typeof raw.condiciones_pago === "string"
        ? raw.condiciones_pago
        : undefined,
    comuna_region: raw.comuna_region || "Por definir",
    ...(raw.metros_cuadrados
      ? {
          metros_cuadrados: amount(raw.metros_cuadrados, "la superficie", true),
        }
      : {}),
    duracion_dias_estimada: amount(
      raw.duracion_dias_estimada || 1,
      "el plazo",
      true,
    ),
    resumen_ejecutivo:
      typeof raw.resumen_ejecutivo === "string" ? raw.resumen_ejecutivo : "",
    materiales,
    mano_de_obra,
    estructura_financiera: {
      costo_materiales_total,
      costo_mano_obra_total,
      costo_directo,
      gastos_generales_porcentaje: gg,
      gastos_generales_monto,
      imprevistos_porcentaje: im,
      imprevistos_monto,
      margen_utilidad_porcentaje: margen,
      margen_utilidad_monto,
      precio_sugerido_neto,
      iva_19,
      precio_total_con_iva: precio_sugerido_neto + iva_19,
      ahorro_compras_estrategicas: 0,
    },
    actividades_gantt: (Array.isArray(raw.actividades_gantt)
      ? raw.actividades_gantt
      : []
    ).map((a: any, i: number) => {
      if (!text(a.nombre)) fail("Actividad sin nombre en la cotización.");
      return {
        nombre: a.nombre,
        dias: amount(a.dias, "la duración", true),
        orden: i + 1,
      };
    }),
    radar_proveedores: [],
    consejos_experto_pyme: [
      "Precios estimados; confirma valores y disponibilidad con el proveedor antes de comprar.",
    ],
    fecha_creacion: new Date().toISOString(),
  };
}

export function parseChatResponse(raw: string) {
  let parsed: any;
  try {
    parsed = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw new AIError(
      "AI_INVALID_RESPONSE",
      "La IA devolvió una respuesta incompleta o no válida. No se ejecutaron acciones.",
    );
  }
  if (
    !parsed ||
    typeof parsed.respuesta !== "string" ||
    !parsed.respuesta.trim()
  )
    throw new AIError(
      "AI_INVALID_RESPONSE",
      "La IA no incluyó una respuesta válida.",
    );
  const actions = flattenActions(parsed.acciones ?? parsed.accion);
  return {
    respuesta: parsed.respuesta.trim(),
    ...(parsed.obra_propuesta &&
    typeof parsed.obra_propuesta === "object" &&
    !Array.isArray(parsed.obra_propuesta)
      ? { obra_propuesta: parsed.obra_propuesta }
      : {}),
    accion:
      actions.length === 1
        ? actions[0]
        : actions.length
          ? { tipo: "lote_acciones", acciones: actions }
          : null,
    sugerencias: (Array.isArray(parsed.sugerencias) ? parsed.sugerencias : [])
      .filter((s: any) => typeof s === "string")
      .slice(0, 4),
    cotizacion: parsed.cotizacion ? normalizeQuote(parsed.cotizacion) : null,
  };
}

// Compatibilidad con WhatsApp: el JSON puede contener arrays y corchetes dentro de cadenas.
export function extractLegacyActions(raw: string) {
  const tag = /\[(?:ACCION_OBRA|ACCIONES_OBRA|ACCION_PROYECTO):\s*/g;
  const actions: AIAction[] = [];
  let clean = "",
    cursor = 0,
    match: RegExpExecArray | null;
  while ((match = tag.exec(raw))) {
    let i = tag.lastIndex,
      start = i,
      depth = 0,
      quoted = false,
      escaped = false,
      end = -1;
    if (!["{", "["].includes(raw[i])) fail("Bloque de acción inválido.");
    for (; i < raw.length; i++) {
      const c = raw[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) fail("La IA no completó el bloque de acciones.");
    const tail = /^\s*\]/.exec(raw.slice(end));
    if (!tail) fail("Etiqueta de acción incompleta.");
    let value: any;
    try {
      value = JSON.parse(raw.slice(start, end));
    } catch {
      fail("JSON de acción inválido.");
    }
    actions.push(...flattenActions(value));
    clean += raw.slice(cursor, match.index);
    cursor = end + tail[0].length;
    tag.lastIndex = cursor;
  }
  clean += raw.slice(cursor);
  return {
    textoLimpio: clean.trim(),
    accion:
      actions.length === 1
        ? actions[0]
        : actions.length
          ? { tipo: "lote_acciones", acciones: actions }
          : null,
  };
}
