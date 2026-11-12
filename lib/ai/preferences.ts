export interface ConversationPreferences {
  version: 1;
  usuario_id: string;
  empresa_id: string;
  proyecto_id: string | null;
  valores: { detalle?: 'breve' | 'detallado'; tiendas?: string[]; comuna_habitual?: string };
}
const normal = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const stores = ['Sodimac', 'Easy', 'Construmart', 'Imperial', 'Dimaco', 'Chilemat', 'MTS'];
const safePlace = (value: unknown): value is string => typeof value === 'string' && value.length <= 60 && value.trim().split(/\s+/).length <= 8 && /^[a-záéíóúüñ0-9 .'-]+$/i.test(value) && !/\b(?:ignora|instrucciones|sistema|permisos|admin|token|clave)\b/i.test(value);

export function conversationPreferences(history: unknown, user: { id: string; empresa_id: string }, projectId: string | undefined, message: string) {
  const state: ConversationPreferences = {version: 1, usuario_id: user.id, empresa_id: user.empresa_id, proyecto_id: projectId || null, valores: {}};
  if (Array.isArray(history)) {
    const last = history.findLast(row => (row?.rol === 'model' || row?.remitente === 'agente') && (() => { const candidate = row?.preferencias_conversacion || row?.accion_ejecutada?.detalles?.preferencias_conversacion; return candidate?.version === 1 && candidate.usuario_id === user.id && candidate.empresa_id === user.empresa_id && candidate.proyecto_id === state.proyecto_id; })());
    const previous = last?.preferencias_conversacion || last?.accion_ejecutada?.detalles?.preferencias_conversacion;
    if (previous?.version === 1 && previous.usuario_id === user.id && previous.empresa_id === user.empresa_id && previous.proyecto_id === state.proyecto_id) {
      const values = previous.valores || {};
      if (['breve','detallado'].includes(values.detalle)) state.valores.detalle = values.detalle;
      if (Array.isArray(values.tiendas) && values.tiendas.length <= stores.length && values.tiendas.every((name: unknown) => typeof name === 'string' && stores.includes(name))) state.valores.tiendas = Array.from(new Set<string>(values.tiendas));
      if (safePlace(values.comuna_habitual)) state.valores.comuna_habitual = values.comuna_habitual;
    }
  }
  const text = normal(message).trim().replace(/^[¿¡]+|[?!.]+$/g, '');
  const memoryWords = /\b(?:recuerda|recuerdame|acuerdate|guarda|olvida|borra|prefiero|preferencias)\b/.test(text);
  if (memoryWords && /\b(?:registr\w*|asign\w*|crea\w*|paga\w*|envia\w*|cotiz\w*|agrega\w*|modific\w*|actualiz\w*|compra\w*|manda\w*|avisa\w*|notifica\w*|anade\w*)\b/.test(text)) return {state,respuesta:null};
  const forget = /^(?:por favor[, ]+)?(?:olvida|borra|elimina|no recuerdes)\b/.test(text);
  if (forget) {
    if (/\b(?:tiendas?|ferreterias?)\b/.test(text)) delete state.valores.tiendas;
    else if (/\bcomuna\b/.test(text)) delete state.valores.comuna_habitual;
    else if (/\b(?:detalle|respuestas?|formato)\b/.test(text)) delete state.valores.detalle;
    else if (/\b(?:preferencias|memoria)\b/.test(text) || (/\b(?:todas?|todo)\b/.test(text) && /\brecuerdas\b/.test(text))) state.valores = {};
    else return { state, respuesta: null };
    return { state, respuesta: 'Dejaré de usar esa preferencia en esta conversación. Los registros de tus obras se conservan.' };
  }
  const list = /^(?:que|cuales)\b/.test(text) && /\b(?:recuerdas|preferencias)\b/.test(text);
  if (list) {
    const entries = [state.valores.detalle && `Respuestas ${state.valores.detalle === 'breve' ? 'breves' : 'detalladas'}`, state.valores.tiendas?.length && `Tiendas preferidas: ${state.valores.tiendas.join(', ')}`, state.valores.comuna_habitual && `Comuna habitual: ${state.valores.comuna_habitual}`].filter(Boolean);
    return {state, respuesta: entries.length ? `En esta conversación tengo estas preferencias:\n${entries.map(value => '• '+value).join('\n')}` : 'No tengo preferencias guardadas en esta conversación.'};
  }
  // Solo mensajes dedicados a preferencias; las solicitudes de negocio siguen su flujo normal.
  if (!memoryWords || /\b(?:no|nunca)\s+(?:prefiero|quiero|uses|guardes|recuerdes)\b/.test(text)) return { state, respuesta: null };
  let changed = false;
  if (/\b(?:respuestas?|responde|explicaciones?)\b/.test(text)) {
    if (/\b(?:breves?|cortas?|cortos?|resumid[oa]s?)\b/.test(text)) { state.valores.detalle = 'breve'; changed = true; }
    else if (/\b(?:detallad[oa]s?|detalle|paso a paso)\b/.test(text)) { state.valores.detalle = 'detallado'; changed = true; }
  }
  if (/\b(?:tiendas?|ferreterias?|materiales|compara|comparar)\b/.test(text)) {
    const found = stores.filter(store => text.split(/[^a-z]+/).includes(normal(store)));
    if (found.length) { state.valores.tiendas = found; changed = true; }
  }
  const place = message.match(/\b(?:mi\s+comuna(?:\s+habitual)?|comuna\s+habitual)\s+(?:es\s+|de\s+|:\s*)?([^,;\n.!?]+)/i)?.[1]?.trim();
  if (place && safePlace(place)) { state.valores.comuna_habitual = place; changed = true; }
  return { state, respuesta: changed ? 'Lo tendré en cuenta como preferencia en esta conversación. Puedes pedirme que la cambie o la olvide.' : null };
}

export function withPreferences(result: any, state: ConversationPreferences) {
  return {...result, accion_ejecutada: {...(result.accion_ejecutada || {}), tipo: result.accion_ejecutada?.tipo || 'solicitar_datos_persona', titulo: result.accion_ejecutada?.titulo || 'Preferencias de conversación', resultado_texto: result.accion_ejecutada?.resultado_texto || result.respuesta, detalles: {...(result.accion_ejecutada?.detalles || {}), preferencias_conversacion: state}}};
}
