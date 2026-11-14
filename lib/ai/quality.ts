import { ACTION_TYPES } from './protocol';
export type QualityKind = 'invalid_action' | 'provider_failure' | 'user_correction' | 'action_cancelled' | 'execution_failure';
export interface QualityEvent { kind: QualityKind; code?: string; recovered?: boolean; attempt?: number; action_type?: string }
const kinds = new Set(['invalid_action','provider_failure','user_correction','action_cancelled','execution_failure']);
const codes = new Set(['AI_INVALID_ACTION','ACTION_PLAN_INVALID','AI_TIMEOUT','AI_EMPTY','AI_NETWORK','AI_RATE_LIMIT','AI_UNAVAILABLE','AI_CREDENTIALS','AI_NOT_CONFIGURED','AI_INVALID_RESPONSE','AI_INCOMPLETE','AI_REFUSED','EXECUTION_FAILED','USER_CORRECTION','ACTION_CANCELLED']);
// Whitelist: nunca persistir prompts, respuestas, IDs de clientes, contactos ni montos.
export function qualityPayload(event: QualityEvent) {
  if (!event || !kinds.has(event.kind)) return null;
  return {kind:event.kind,code:codes.has(event.code || '')?event.code:'AI_INVALID_RESPONSE',recovered:event.recovered===true,attempt:event.attempt===2?2:1,action_type:ACTION_TYPES.includes(event.action_type as any)?event.action_type:null};
}
export function turnQualityEvent(message: string, history: any[], pending: boolean): QualityEvent | null {
  const text=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  if (pending && /^(?:cancela|cancelar|olvida|descarta)(?:\s+(?:eso|el borrador|la accion|la creacion))?[.!]*$/.test(text)) return {kind:'action_cancelled',code:'ACTION_CANCELLED'};
  if (history.some(m=>m.rol==='model'||m.remitente==='agente') && /^(?:no[, ]+(?:era|quise decir)|corrijo\b|correccion\b|me equivoque\b)/.test(text)) return {kind:'user_correction',code:'USER_CORRECTION'};
  return null;
}
