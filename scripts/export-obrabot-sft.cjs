#!/usr/bin/env node
require('../tests/helpers/typescript.cjs');
// Solo exportación local. No sube datos ni crea trabajos de entrenamiento.
const fs = require('node:fs');
const {flattenActions, normalizeQuote} = require('../lib/ai/protocol.ts');
const {dataset,validateCandidate} = require('../tests/helpers/obrabot-golden.cjs');
const {chatPrompt,quotePrompt,materialSearchPrompt} = require('../lib/ai/prompt.ts');
const {separatePrompt,compactAIContext} = require('../lib/ai/prompt-context.ts');
function exportExamples(destination) {
  if(dataset.synthetic!==true)throw new Error('Se requieren ejemplos sintéticos revisados.');
  const lines=dataset.cases.map(item=>{
    const validated = validateCandidate(item,item.response);
    const assistant = item.route === 'chat' ? {...item.response,acciones:flattenActions(validated.accion)} : item.response;
    const context={...dataset.entities,...item.context,rol:item.role,acciones_habilitadas:item.plan==='pro_ia', ...(item.selectedId ? {chat_proyecto_id:item.selectedId,proyecto_actual:dataset.entities.proyectos.find(p=>p.id===item.selectedId)} : {})};
    if(context.cotizacion_actual)context.cotizacion_actual=normalizeQuote(context.cotizacion_actual);
    const prompt=({chat:chatPrompt,quote:quotePrompt,search:materialSearchPrompt}[item.route])([],item.message,compactAIContext(context));
    const separated=separatePrompt(prompt);
    return JSON.stringify({messages:[{role:'system',content:separated.instructions},{role:'user',content:separated.input},{role:'assistant',content:JSON.stringify(assistant)}]});
  });
  fs.writeFileSync(destination,lines.join('\n')+'\n',{flag:'wx',mode:0o600});
  return lines.length;
}
if(require.main===module){const destination=process.argv[2];if(!destination)throw new Error('Uso: node scripts/export-obrabot-sft.cjs /ruta/nueva.jsonl');console.log(`${exportExamples(destination)} ejemplos validados exportados a ${destination}`);}
module.exports={exportExamples};
