#!/usr/bin/env node
require('../tests/helpers/typescript.cjs');
const fs=require('node:fs');
const {dataset,validateCandidate}=require('../tests/helpers/obrabot-golden.cjs');
const {chatGenerationRequest}=require('../lib/gemini.ts');
const {generateValidatedChat}=require('../lib/ai/generation.ts');
const {generateOpenAI}=require('../lib/ai/openai-provider.ts');
const {flattenActions,normalizeQuote}=require('../lib/ai/protocol.ts');
const {projectContextForRole}=require('../lib/whatsapp/project-context.ts');
const {AIError}=require('../lib/ai/errors.ts');
const {prepareActionPlan,scopeProjectActions}=require('../lib/ai/actions.ts');

function grade(item,result,mode){
 const context={...structuredClone(dataset.entities),...structuredClone(item.context||{})};
 const canonical=input=>prepareActionPlan(scopeProjectActions(input,undefined,context.proyectos,item.selectedId),context,item.selectedId);
 let actual=flattenActions(result.accion),expected=flattenActions(validateCandidate(item,item.response).accion);
 const modeOK=mode===item.route && (actual.length>0)===(expected.length>0);
 let payloadOK=true,entitiesOK=true;
 try{validateCandidate(item,{respuesta:result.respuesta,acciones:actual,cotizacion:result.cotizacion});actual=canonical(actual);expected=canonical(expected);}catch(e){payloadOK=e.code!=='AI_INVALID_ACTION';entitiesOK=false;}
 const comparable=expected.filter(a=>a.tipo!=='crear_actividad'||!actual.some(b=>/^crear_proyecto/.test(b.tipo)&&b.nombre===a.proyecto_nombre&&(a.partidas||[]).length>0&&(a.partidas||[]).every(p=>(b.partidas||[]).some(q=>q.nombre===p.nombre&&q.dias===p.dias))));
 const types=actions=>actions.map(a=>a.tipo.replace('crear_proyecto_completo','crear_proyecto')).sort();
 const expectedByType=comparable.every(a=>actual.some(b=>b.tipo.replace('crear_proyecto_completo','crear_proyecto')===a.tipo.replace('crear_proyecto_completo','crear_proyecto') && ['proyecto_id','cliente_id','actividad_id','estado','porcentaje_avance'].every(k=>a[k]===undefined||a[k]===b[k]) && (item.response.cotizacion||item.context?.cotizacion_actual||a.monto_cotizado===undefined||(b.monto_cotizado??b.monto)===a.monto_cotizado)));
 const contractOK=JSON.stringify(types(actual))===JSON.stringify(types(comparable))&&expectedByType;
 const quoteOK=Boolean(item.response.cotizaciones?.length||item.response.cotizacion)===Boolean(result.cotizacion);
 const draftOK=!item.response.obra_propuesta||!!result.obra_propuesta;
 return {mode:modeOK,payload:payloadOK,entities:entitiesOK,contract:contractOK,quote:quoteOK,draft:draftOK,pass:modeOK&&payloadOK&&entitiesOK&&contractOK&&quoteOK&&draftOK};
}
async function run({cases=dataset.cases,generate=generateOpenAI,output,enabled=!!process.env.OPENAI_API_KEY}={}){
 if(!enabled)return {skipped:true,reason:'OPENAI_API_KEY no configurada; no se realizaron llamadas de red.'};
 const rows=[];
 for(const item of cases){
  const context={...structuredClone(dataset.entities),...item.context,rol:item.role,acciones_habilitadas:item.plan==='pro_ia',...(item.selectedId?{chat_proyecto_id:item.selectedId,proyecto_actual:dataset.entities.proyectos.find(p=>p.id===item.selectedId)}:{})};
  if(item.role==='terreno'){
    const actor=dataset.entities.usuarios.find(u=>u.rol==='terreno');
    const assigned=new Set((dataset.entities.proyecto_trabajadores||[]).filter(m=>m.usuario_id===actor?.id).map(m=>m.proyecto_id));
    context.proyectos=projectContextForRole(context.proyectos.filter(p=>assigned.has(p.id)),'terreno');
    context.actividades=context.actividades.filter(a=>assigned.has(a.proyecto_id));context.clientes=[];context.usuarios=actor?[actor]:[];context.usuario_actual=actor;
    if(context.proyectos.length===1)context.proyecto_actual=context.proyectos[0];
  }
  if(item.fixture_image){context.foto_adjunta=true;context.archivo_recibido={nombre:item.fixture_image,tipo:'image/png',contenido_visible:true};}
  if(context.cotizacion_actual)context.cotizacion_actual=normalizeQuote(context.cotizacion_actual);
  const image=item.fixture_image?{mimeType:'image/png',data:fs.readFileSync(require('node:path').join(__dirname,'../tests/fixtures',item.fixture_image)).toString('base64')}:undefined;
  const request=chatGenerationRequest([],item.message,context,image?{image}:{});
  let attempts=0;const started=Date.now();
  try{
   const result=await generateValidatedChat(request.input,item.message,context,{...request.options,validateResult:r=>validateCandidate(item,{respuesta:r.respuesta,acciones:flattenActions(r.accion),cotizacion:r.cotizacion})},async(p,o)=>{attempts++;return generate(p,o);});
   rows.push({id:item.id,...grade(item,result,request.mode),observed:{mode:request.mode,action_types:flattenActions(result.accion).map(a=>a.tipo),actions:flattenActions(result.accion),has_quote:!!result.cotizacion,has_draft:!!result.obra_propuesta,clarification:result.accion?undefined:result.respuesta},attempts,duration_ms:Date.now()-started});
  }catch(e){
   rows.push({id:item.id,pass:false,mode:false,payload:e.code!=='AI_INVALID_ACTION',entities:false,code:e instanceof AIError?e.code:'EVAL_FAILED',attempts,duration_ms:Date.now()-started});
   if(['AI_CREDENTIALS','AI_NOT_CONFIGURED','AI_RATE_LIMIT'].includes(e.code))break;
  }
  if(require.main===module)console.log(JSON.stringify(rows.at(-1)));
 }
 const total=cases.length;const rates=Object.fromEntries(['pass','mode','payload','entities'].map(k=>[k,Number((rows.filter(r=>r[k]).length/total*100).toFixed(2))]));
 const report={version:2,dataset_version:dataset.version,synthetic:true,created_at:new Date().toISOString(),total,completed:rows.length,rates,threshold:98,passed:rows.length===total&&rates.pass>=98,rows};
 if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 return report;
}
if(require.main===module){
 const value=flag=>{const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:undefined;};
 const limit=Number(value('--limit')||dataset.cases.length);
 const selected=value('--case')?dataset.cases.filter(c=>value('--case').split(',').includes(c.id)):dataset.cases.slice(0,limit);
 run({cases:selected,output:value('--output')}).then(r=>{console.log(JSON.stringify(r.skipped?r:{total:r.total,completed:r.completed,rates:r.rates,passed:r.passed}));if(!r.skipped&&!r.passed)process.exitCode=1;}).catch(()=>{console.error('EVAL_FAILED');process.exitCode=1;});
}
module.exports={run,grade};
