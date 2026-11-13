require('./helpers/typescript.cjs');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./helpers/supabase.cjs');
require.cache[require.resolve('../lib/supabase/client.ts')] = { id: require.resolve('../lib/supabase/client.ts'), loaded: true, exports: fixture };
const { supabaseService } = require('../lib/supabase/supabase-service.ts');
const { dataService } = require('../lib/data-service.ts');
const { signUpWithSupabase, signInWithSupabase, mapSupabaseAuthError } = require('../lib/supabase/auth.ts');
const {
  validateSignUpFields,
  formatRegistrationConflictMessage,
  mapContactDatabaseError,
  sanitizeEmail,
  isValidEmail,
} = require('../lib/auth/registration-validation.ts');
const uid='00000000-0000-0000-0000-000000000001';
let activated, calls;
const originalFetch=global.fetch;
beforeEach(() => {
  calls=0; activated=null;
  global.fetch=async (url, init)=>{
    if(url==='/api/auth/validar-registro'){
      return new Response(JSON.stringify({ok:true,conflicts:[]}),{status:200});
    }
    assert.equal(url,'/api/auth/session');assert.equal(init.headers.Authorization,'Bearer fixture');return new Response(JSON.stringify({user:{id:uid,rol:'admin'}}),{status:200});
  };
  global.window={location:{origin:'http://localhost:3000'}};global.document={cookie:''};
  supabaseService.saveEmpresa=async()=>{throw Error('El navegador no debe elegir la empresa ni el plan')};
  supabaseService.saveUsuario=async()=>{throw Error('El navegador no debe asignarse un perfil')};
  supabaseService.getEmpresaById=async()=>({id:'owned-company',nombre:'Empresa propia'});
  dataService.setActiveUser=(u)=>{activated=u};
  dataService.loadTenantDataFromSupabase=async()=>{assert.equal(activated.auth_user_id,uid);return{success:true}};
  fixture.supabase.rpc=async(name)=>{calls++;assert.equal(name,'completar_registro_actual');return {data:{id:'legacy-user',auth_user_id:uid,empresa_id:'owned-company',nombre:'Constructor',rol:'admin'},error:null}};
});
afterEach(()=>{delete global.window;delete global.document;global.fetch=originalFetch});
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
test('ingresar por RUT usa el correo de Auth aunque WhatsApp haya corregido el de contacto',async()=>{
  dataService.getUsuarios=()=>[{id:'legacy-user',rut:'12.345.678-5',email:'contacto-nuevo@example.test',email_acceso:'login-original@example.test'}];
  fixture.supabase.auth.signInWithPassword=async({email})=>{
    assert.equal(email,'login-original@example.test');
    return{data:{user:{id:uid},session:{access_token:'fixture'}},error:null};
  };
  const result=await signInWithSupabase('12.345.678-5','Contraseña123');
  assert.equal(result.success,true);
});
test('signUpWithSupabase detiene el registro con mensaje específico cuando RUT y teléfono ya existen',async()=>{
  let signUpCalled=false;
  fixture.supabase.auth.signUp=async()=>{signUpCalled=true;return{data:null,error:null};};
  global.fetch=async(url)=>{
    assert.equal(url,'/api/auth/validar-registro');
    return new Response(
      JSON.stringify({
        ok:false,
        conflicts:['rut','telefono'],
        error:formatRegistrationConflictMessage(['rut','telefono']),
      }),
      {status:409}
    );
  };
  const result=await signUpWithSupabase('nuevo@example.test','Contraseña123','Jorge Castro','12.345.678-5','BjSolutions','+56 9 48743041');
  assert.equal(result.success,false);
  assert.equal(signUpCalled,false);
  assert.match(result.error,/RUT y número de teléfono ya están registrados/);
});
test('mapSupabaseAuthError y validateSignUpFields traducen errores de base de datos y campos inválidos',()=>{
  assert.match(mapSupabaseAuthError('Database error saving new user'),/RUT, número de teléfono y correo/);
  assert.match(mapSupabaseAuthError('CONTACT_DUPLICATE'),/RUT, número de teléfono o correo/);
  assert.match(mapSupabaseAuthError('CONTACT_INVALID_PHONE'),/teléfono ingresado no es válido/);
  assert.match(mapSupabaseAuthError('REGISTRATION_DETAILS_REQUIRED'),/Completa tu nombre completo y RUT personal/);
  assert.match(validateSignUpFields({nombre:'Jorge Castro',rut:'',email:'jorge@example.com',telefono:'+56 9 48743041',signupPassword:'123456',signupConfirmPassword:'123456',acceptTerms:true}),/Ingresa tu RUT personal/);
  assert.match(validateSignUpFields({nombre:'Jorge Castro',rut:'12.345.678-5',email:'jorge@example.com',telefono:'+56 9 ',signupPassword:'123456',signupConfirmPassword:'123456',acceptTerms:true}),/número de teléfono válido/);
  assert.equal(validateSignUpFields({nombre:'Jorge Castro',rut:'12.345.678-5',email:'jorge@example.com',telefono:'+56 9 48743041',signupPassword:'123456',signupConfirmPassword:'123456',acceptTerms:true}),null);
  assert.match(mapContactDatabaseError({code:'23505',message:'duplicate key value violates unique constraint "usuarios_rut_key"'}),/RUT ya está registrado/);
});
test('sanitiza correos vigentes y distingue correo no autorizado por SMTP de correo mal formado',async()=>{
  assert.equal(sanitizeEmail(' \u200Bjorge.castro@gmail.com '), 'jorge.castro@gmail.com');
  assert.equal(isValidEmail('\u200Bjorge.castro+obra@constructorachile.cl '), true);
  assert.equal(validateSignUpFields({nombre:'Jorge Castro',rut:'12.345.678-5',email:' \u200Bjorge.castro@gmail.com ',telefono:'+56 9 48743041',signupPassword:'123456',signupConfirmPassword:'123456',acceptTerms:true}),null);
  const smtpMsg=mapSupabaseAuthError('Email address not authorized','email_address_not_authorized');
  assert.match(smtpMsg,/SMTP personalizado/);
  assert.doesNotMatch(smtpMsg,/no es válido/);
  assert.match(mapSupabaseAuthError('Email address "jorge@gmail.com" is invalid','email_address_invalid'),/rechazó la dirección de correo/);
  fixture.supabase.auth.signUp=async()=>({data:{user:{id:uid,identities:[]},session:null},error:null});
  const dup=await signUpWithSupabase('yaexiste@gmail.com','Contraseña123','Jorge Castro','12.345.678-5','BjSolutions','+56 9 48743041');
  assert.equal(dup.success,false);
  assert.match(dup.error,/ya está registrado/);
});
