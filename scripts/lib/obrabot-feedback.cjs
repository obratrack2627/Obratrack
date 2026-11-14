require('../../tests/helpers/typescript.cjs');
const {qualityPayload}=require('../../lib/ai/quality.ts');
const golden=require('../../tests/fixtures/obrabot-golden.json');
function feedbackDataset(events){
 const seen=new Set(),cases=[];
 for(const event of events){
  const safe=qualityPayload(event);if(!safe)continue;
  const signature=JSON.stringify(safe);if(seen.has(signature))continue;seen.add(signature);
  const source=golden.cases.find(c=>c.response.acciones?.some(a=>a.tipo===safe.action_type))||golden.cases.find(c=>c.id==='sin-monto');
  cases.push({...structuredClone(source),id:'feedback-'+cases.length,feedback:safe,review_required:true});
 }
 return {version:1,synthetic:true,review_required:true,origin:'anonymous_quality_templates',entities:golden.entities,cases};
}
module.exports={feedbackDataset};
