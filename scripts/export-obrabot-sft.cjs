#!/usr/bin/env node
require('../tests/helpers/typescript.cjs');
// Solo exportación local. No sube datos ni crea trabajos de entrenamiento.
const fs = require('node:fs');
const {TOOL_ONLY_INSTRUCTIONS,trainingContext}=require('./lib/obrabot-sft-policy.cjs');
const {flattenActions, normalizeQuote} = require('../lib/ai/protocol.ts');
const {dataset,validateCandidate} = require('../tests/helpers/obrabot-golden.cjs');
const {chatPrompt,quotePrompt,materialSearchPrompt} = require('../lib/ai/prompt.ts');
const {separatePrompt,compactAIContext} = require('../lib/ai/prompt-context.ts');
function sftEligibleCase(item) {
  const response=item.response||{};
  if(item.role!=='admin'||item.plan!=='pro_ia'||item.denied||item.context?.cotizacion_actual||response.cotizacion||response.cotizaciones?.length||response.busqueda_materiales)return false;
  const actions=flattenActions(response.acciones||response.accion);
  return actions.every(a=>!a.materiales?.length&&!a.precio_unitario&&!a.asistencia_id&&[a.monto,a.monto_cotizado].filter(v=>v!==undefined).every(v=>item.message.includes(String(v))));
}
function exportExamples(destination, source=dataset) {
  if(source.review_required || source.cases.some(c=>c.review_required))throw new Error('Revisa y aprueba los casos de feedback antes de entrenar.');
  if(source.synthetic!==true)throw new Error('Se requieren ejemplos sintéticos revisados.');
  const lines=source.cases.filter(sftEligibleCase).map(item=>{
    const validated = validateCandidate(item,item.response);
    const assistant = item.route === 'chat' ? {...item.response,acciones:flattenActions(validated.accion)} : item.response;
    const context={...source.entities,...item.context,rol:item.role,acciones_habilitadas:item.plan==='pro_ia', ...(item.selectedId ? {chat_proyecto_id:item.selectedId,proyecto_actual:source.entities.proyectos.find(p=>p.id===item.selectedId)} : {})};
    if(context.cotizacion_actual)context.cotizacion_actual=normalizeQuote(context.cotizacion_actual);
    const prompt=({chat:chatPrompt,quote:quotePrompt,search:materialSearchPrompt}[item.route])([],item.message,compactAIContext(trainingContext(context)));
    const separated=separatePrompt(prompt);
    return JSON.stringify({messages:[{role:'system',content:TOOL_ONLY_INSTRUCTIONS},{role:'user',content:separated.input},{role:'assistant',content:JSON.stringify(assistant)}]});
  });
  fs.writeFileSync(destination,lines.join('\n')+'\n',{flag:'wx',mode:0o600});
  return lines.length;
}
if(require.main===module){const destination=process.argv[2];if(!destination)throw new Error('Uso: node scripts/export-obrabot-sft.cjs /ruta/nueva.jsonl');const index=process.argv.indexOf('--dataset');const source=index>=0?JSON.parse(fs.readFileSync(process.argv[index+1],'utf8')):dataset;console.log(`${exportExamples(destination,source)} ejemplos validados exportados a ${destination}`);}
module.exports={exportExamples,sftEligibleCase};
