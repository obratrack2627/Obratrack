require('./helpers/typescript.cjs');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./helpers/supabase.cjs');
require.cache[require.resolve('../lib/supabase/client.ts')] = { id: require.resolve('../lib/supabase/client.ts'), loaded: true, exports: fixture };
const { supabaseService } = require('../lib/supabase/supabase-service.ts');
const { dataService } = require('../lib/data-service.ts');
const { signUpWithSupabase, signInWithSupabase } = require('../lib/supabase/auth.ts');
const uid='00000000-0000-0000-0000-000000000001';
let activated, calls;
beforeEach(() => {
  calls=0; activated=null;
  global.window={location:{origin:'http://localhost:3000'}};global.document={cookie:''};
  supabaseService.saveEmpresa=async()=>{throw Error('El navegador no debe elegir la empresa ni el plan')};
  supabaseService.saveUsuario=async()=>{throw Error('El navegador no debe asignarse un perfil')};
  supabaseService.getEmpresaById=async()=>({id:'owned-company',nombre:'Empresa propia'});
  dataService.setActiveUser=(u)=>{activated=u};
  dataService.loadTenantDataFromSupabase=async()=>{assert.match(document.cookie,new RegExp(uid));return{success:true}};
  fixture.supabase.rpc=async(name)=>{calls++;assert.equal(name,'completar_registro_actual');return {data:{id:'legacy-user',auth_user_id:uid,empresa_id:'owned-company',nombre:'Constructor',rol:'admin'},error:null}};
});
afterEach(()=>{delete global.window;delete global.document});
test('registro con confirmación no intenta escrituras sin sesión ni activa un perfil inventado',async()=>{
  fixture.supabase.auth.signUp=async()=>({data:{user:{id:uid},session:null},error:null});
  const result=await signUpWithSupabase('constructor@example.test','Contraseña123','Constructor','12.345.678-5','Mi empresa');
  assert.equal(result.success,true);assert.equal(result.emailConfirmationRequired,true);assert.equal(activated,null);assert.equal(calls,0);
});
test('inicio de sesión usa el perfil nativo propio y establece la sesión antes de cargar las obras',async()=>{
  fixture.supabase.auth.signInWithPassword=async()=>({data:{user:{id:uid},session:{access_token:'fixture'}},error:null});
  const result=await signInWithSupabase('constructor@example.test','Contraseña123');
  assert.equal(result.success,true);assert.equal(result.user.empresa_id,'owned-company');assert.equal(activated.auth_user_id,uid);assert.equal(calls,1);
});
