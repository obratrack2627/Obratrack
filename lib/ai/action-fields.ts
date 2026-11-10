import type { AIAction } from "./protocol";

// El proveedor comparte un esquema para las operaciones. Un cero o una lista
// vacía de otra operación no debe convertirse en un requisito para esta acción.
const scoped: Record<string, string[]> = {
  dias: [
    "crear_proyecto",
    "crear_proyecto_completo",
    "crear_actividad",
    "crear_solicitud_cambio",
  ],
  monto: [
    "crear_proyecto",
    "crear_proyecto_completo",
    "actualizar_proyecto",
    "registrar_pago",
    "registrar_imprevisto",
    "crear_solicitud_cambio",
  ],
  monto_cotizado: [
    "crear_proyecto",
    "crear_proyecto_completo",
    "actualizar_proyecto",
  ],
  precio_unitario: ["agregar_material", "agregar_materiales"],
  cantidad: ["agregar_material", "agregar_materiales"],
  monto_documento: ["registrar_documento"],
  impacto_monto: ["crear_solicitud_cambio"],
  porcentaje_avance: ["actualizar_avance"],
  partidas: ["crear_proyecto", "crear_proyecto_completo", "crear_actividad"],
  actividades: ["crear_proyecto", "crear_proyecto_completo", "crear_actividad"],
  materiales: [
    "crear_proyecto",
    "crear_proyecto_completo",
    "agregar_material",
    "agregar_materiales",
    "crear_solicitud_cambio",
  ],
  trabajadores: ["agregar_trabajadores", "asignar_trabajadores"],
  fecha_inicio: [
    "crear_proyecto",
    "crear_proyecto_completo",
    "crear_actividad",
  ],
  fecha_termino_estimada: [
    "crear_proyecto",
    "crear_proyecto_completo",
    "actualizar_proyecto",
  ],
  fecha_documento: ["registrar_documento"],
  fecha: [
    "registrar_pago",
    "registrar_imprevisto",
    "crear_bitacora",
    "agendar_evento",
    "agendar_visita",
    "crear_solicitud_cambio",
    "registrar_asistencia",
    "registrar_documento",
  ],
  hora: ["agendar_evento", "agendar_visita"],
  hora_entrada: ["registrar_asistencia"],
  hora_salida: ["registrar_asistencia"],
};
export function relevantActionFields(action: AIAction): AIAction {
  for (const [field, types] of Object.entries(scoped)) {
    if (!types.includes(action.tipo)) delete action[field];
  }
  return action;
}
