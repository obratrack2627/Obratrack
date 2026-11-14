#!/usr/bin/env node
// Eventos mínimos -> casos sintéticos revisables, nunca reconstrucción de texto privado.
const fs=require('node:fs');const {createClient}=require('@supabase/supabase-js');const {feedbackDataset}=require('./lib/obrabot-feedback.cjs');
async function main(){
 const company=process.argv[2],destination=process.argv[3];
 if(!company||!destination)throw new Error('Uso: export-obrabot-feedback.cjs EMPRESA archivo.json');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const token=process.env.OBRABOT_EXPORT_TOKEN;
 if(!key||(!process.env.SUPABASE_SERVICE_ROLE_KEY&&!token))throw new Error('Configura credencial de servicio o JWT de usuario autorizado; nunca una clave en argumentos.');
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false},...(token?{global:{headers:{Authorization:'Bearer '+token}}}:{})});
 const {data,error}=await client.from('obrabot_quality_events').select('kind,code,recovered,attempt,action_type').eq('empresa_id',company).order('created_at',{ascending:false}).limit(1000);
 if(error)throw new Error('No se pudieron exportar los eventos autorizados.');
 const dataset=feedbackDataset(data||[]);fs.writeFileSync(destination,JSON.stringify(dataset,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({cases:dataset.cases.length,review_required:true}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
