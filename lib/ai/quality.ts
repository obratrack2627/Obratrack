export type QualityKind = 'invalid_action' | 'provider_failure' | 'user_correction' | 'action_cancelled' | 'execution_failure';
export interface QualityEvent { kind: QualityKind; code?: string; recovered?: boolean; attempt?: number; action_type?: string }
const kinds = new Set(['invalid_action','provider_failure','user_correction','action_cancelled','execution_failure']);
const codes = new Set(['AI_INVALID_ACTION','ACTION_PLAN_INVALID','AI_TIMEOUT','AI_EMPTY','AI_NETWORK','AI_RATE_LIMIT','AI_UNAVAILABLE','AI_CREDENTIALS','AI_NOT_CONFIGURED','AI_INVALID_RESPONSE','AI_INCOMPLETE','AI_REFUSED','EXECUTION_FAILED','USER_CORRECTION','ACTION_CANCELLED']);
const dbActionTypes = new Set([
  'crear_proyecto','crear_proyecto_completo','actualizar_proyecto','eliminar_proyecto',
  'crear_cliente','actualizar_cliente','actualizar_trabajador','agregar_trabajador','agregar_trabajadores',
  'asignar_trabajador','asignar_trabajadores','desasignar_trabajador','crear_actividad','actualizar_avance',
  'agregar_material','agregar_materiales','actualizar_material','registrar_imprevisto','registrar_pago',
  'crear_bitacora','generar_reporte','agendar_visita','agendar_evento','generar_mensaje_whatsapp',
  'enviar_mensaje_equipo','crear_solicitud_cambio','registrar_asistencia','registrar_documento',
]);
// Whitelist: nunca persistir prompts, respuestas, IDs de clientes, contactos ni montos.
export function qualityPayload(event: QualityEvent) {
  if (!event || !kinds.has(event.kind)) return null;
  const mappedAction = event.action_type === 'actualizar_evento' || event.action_type === 'eliminar_evento'
    ? 'agendar_evento'
    : event.action_type;
  return {kind:event.kind,code:codes.has(event.code || '')?event.code:'AI_INVALID_RESPONSE',recovered:event.recovered===true,attempt:event.attempt===2?2:1,action_type:dbActionTypes.has(mappedAction || '')?mappedAction:null};
}
export function turnQualityEvent(message: string, history: any[], pending: boolean): QualityEvent | null {
  const text=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  if (pending && /^(?:cancela|cancelar|olvida|descarta)(?:\s+(?:eso|el borrador|la accion|la creacion))?[.!]*$/.test(text)) return {kind:'action_cancelled',code:'ACTION_CANCELLED'};
  if (history.some(m=>m.rol==='model'||m.remitente==='agente') && /^(?:no[, ]+(?:era|quise decir)|corrijo\b|correccion\b|me equivoque\b)/.test(text)) return {kind:'user_correction',code:'USER_CORRECTION'};
  return null;
}
