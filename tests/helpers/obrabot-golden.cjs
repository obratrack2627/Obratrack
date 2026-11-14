require('./typescript.cjs');
const { parseChatResponse } = require('../../lib/ai/protocol.ts');
const { quoteProjectFields } = require('../../lib/ai/generation.ts');
const { prepareActionPlan, scopeProjectActions } = require('../../lib/ai/actions.ts');
const { checkActionPermissions } = require('../../lib/ai/permissions.ts');
const { AIError } = require('../../lib/ai/errors.ts');
const dataset = require('../fixtures/obrabot-golden.json');
function validateCandidate(item, response) {
  const context = {...structuredClone(dataset.entities), ...item.context};
  if(item.role==='terreno'){const actor=context.usuarios.find(u=>u.rol==='terreno');const assigned=new Set((context.proyecto_trabajadores||[]).filter(m=>m.usuario_id===actor?.id).map(m=>m.proyecto_id));context.proyectos=context.proyectos.filter(p=>assigned.has(p.id));context.actividades=context.actividades.filter(a=>assigned.has(a.proyecto_id));}
  const parsed = parseChatResponse(quoteProjectFields(JSON.stringify(response), item.message, context));
  const actions = scopeProjectActions(parsed.accion, undefined, context.proyectos, item.selectedId);
  checkActionPermissions({id:'u-test',rol:item.role}, actions, item.message);
  if (actions.length && item.plan !== 'pro_ia') throw new AIError('PLAN_REQUIRED','Los cambios requieren Pro IA.',403);
  if (context.creacion_obra_whatsapp && actions.some(a=>/^crear_proyecto/.test(a.tipo))) throw new Error('WhatsApp exige obra_propuesta');
  try {prepareActionPlan(actions,context,item.selectedId);} catch(e) { if(e instanceof AIError)throw e;throw new AIError('ACTION_PLAN_INVALID',e.message,422); }
  return parsed;
}
module.exports = {dataset, validateCandidate};
