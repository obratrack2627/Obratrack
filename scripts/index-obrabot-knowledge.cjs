#!/usr/bin/env node
require('../tests/helpers/typescript.cjs');
const {getSupabaseAdmin}=require('../lib/supabase/admin.ts');const {indexKnowledge}=require('../lib/ai/rag-index.ts');
async function main(){const company=process.argv[2];if(!company)throw new Error('Indica empresa_id.');const client=getSupabaseAdmin();if(!client)throw new Error('Configura SUPABASE_SERVICE_ROLE_KEY.');console.log(JSON.stringify({indexed:await indexKnowledge(client,company,undefined,10)}));}
if(require.main===module)main().catch(()=>{console.error('No se pudo indexar; revisa credenciales y fuentes aprobadas.');process.exitCode=1;});
