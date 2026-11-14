require('../../tests/helpers/typescript.cjs');
const {createHash}=require('node:crypto');
const {TOOL_ONLY_INSTRUCTIONS,trainingContext}=require('./obrabot-sft-policy.cjs');
const {flattenActions,parseChatResponse}=require('../../lib/ai/protocol.ts');
const {prepareActionPlan,scopeProjectActions}=require('../../lib/ai/actions.ts');
const {checkActionPermissions}=require('../../lib/ai/permissions.ts');
const {chatPrompt}=require('../../lib/ai/prompt.ts');
const {compactAIContext,separatePrompt}=require('../../lib/ai/prompt-context.ts');
const prohibited=new Set(['cotizacion','cotizaciones','busqueda_materiales','materiales','mano_de_obra','estructura_financiera','precio_unitario','precio_unitario_estimado','precio_total_con_iva','tratamiento_iva','rendimiento']);
function containsProtected(value){return value&&typeof value==='object'&&Object.entries(value).some(([k,v])=>(prohibited.has(k)&&v!=null)||containsProtected(v));}
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])]));
 return value;
}
function curate(rows){
 const seen=new Set(),train=[],validation=[],rejected=[];
 for(const [index,row]of rows.entries()){
  try{
   if(row.reviewed!==true||row.anonymized!==true||row.consent!==true||!['success','correction'].includes(row.source))throw Error('REVIEW_REQUIRED');
   if(row.role!=='admin'||row.plan!=='pro_ia'||row.market_prices!==false||row.arithmetic!==false)throw Error('PROTECTED_BACKEND_POLICY');
   if(typeof row.message!=='string'||!row.message.trim()||containsProtected(row.response)||containsProtected(row.context))throw Error('PRICING_OR_CALCULATION_EXCLUDED');
   const encoded=JSON.stringify({message:row.message,response:row.response,context:row.context});
   if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?56[\s-]*)?9(?:[\s-]*\d){8}\b|\b\d{7,8}-[\dkK]\b/.test(encoded))throw Error('CONTACT_DATA_EXCLUDED');
   const context=structuredClone(row.context||{});
   for(const collection of ['proyectos','clientes','actividades','usuarios'])context[collection] ||= [];
   // Solo marcadores anónimos explícitos; la revisión humana sigue siendo obligatoria.
   for(const collection of ['proyectos','clientes','actividades','usuarios'])for(const entity of context[collection]){
    if(!/^anon-[a-z0-9-]+$/.test(entity.id)||!/^Entidad \d+$/.test(entity.nombre))throw Error('ENTITY_NOT_ANONYMIZED');
   }
   const parsed=parseChatResponse(JSON.stringify(row.response));
   const actions=scopeProjectActions(parsed.accion,undefined,context.proyectos,row.selectedId);
   checkActionPermissions({id:'anon-actor',rol:row.role},actions,row.message);
   prepareActionPlan(actions,context,row.selectedId);
   for(const action of flattenActions(parsed.accion)){
    if(/(?:crear|actualizar)_cliente|trabajador|asistencia|pago|imprevisto|documento|enviar_mensaje/.test(action.tipo))throw Error('SENSITIVE_WORKFLOW_EXCLUDED');
    if(action.monto!==undefined||action.monto_cotizado!==undefined){const amount=action.monto_cotizado??action.monto;if(!row.message.includes(String(amount)))throw Error('DERIVED_AMOUNT_EXCLUDED');}
   }
   const canonical=JSON.stringify(stable({message:row.message.trim(),response:{...row.response,respuesta:undefined},context}));
   const digest=createHash('sha256').update(canonical).digest('hex');if(seen.has(digest))continue;seen.add(digest);
   const prompt=separatePrompt(chatPrompt([],row.message,compactAIContext(trainingContext({...context,rol:'admin',acciones_habilitadas:true}))));
   const example={messages:[{role:'system',content:TOOL_ONLY_INSTRUCTIONS},{role:'user',content:prompt.input},{role:'assistant',content:JSON.stringify(row.response)}]};
   (Number.parseInt(digest.slice(0,8),16)%5===0?validation:train).push(example);
  }catch(e){rejected.push({index,code:e.code||(/^[A-Z_]+$/.test(e.message||'')?e.message:'INVALID_EXAMPLE')});}
 }
 return {train,validation,rejected};
}
module.exports={curate};
