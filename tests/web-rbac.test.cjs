require('./helpers/typescript.cjs');
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
const {authorizeAI}=require('../lib/ai/server.ts');
const {verifyWebSession}=require('../lib/auth/web-session.ts');
const session=require('../app/api/auth/session/route.ts');
const team=require('../app/api/equipo/crear-usuario/route.ts');
const plans=require('../app/api/dev/plan/route.ts');
const original=global.fetch;
const uid='00000000-0000-0000-0000-000000000001';
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp:2100000000})).toString('base64url')+'.fixture-signature-12345';
function mockAuth(profile){
 const calls=[];
 global.fetch=async(url,init={})=>{
  const path=new URL(String(url)).pathname; calls.push({path,init});
  if(path==='/auth/v1/user') return Response.json({id:uid,email:'real-login@example.test',aud:'authenticated',role:'authenticated'});
  if(path.endsWith('/usuarios')) return Response.json([{id:uid,empresa_id:'company-a',nombre:'Administración',...profile}]);
  if(path.endsWith('/rpc/cambiar_plan_desarrollo')) return Response.json({plan_id:JSON.parse(init.body).p_plan});
  if(path.endsWith('/rpc/crear_integrante_equipo')) return Response.json({id:'new-worker'});
  throw Error('Ruta no prevista: '+path);
 };
 return calls;
}
const req=(url,body,headers={})=>new NextRequest('https://obratrack.test'+url,{method:'POST',headers:{Authorization:'Bearer '+token,...headers},body:JSON.stringify(body)});
afterEach(()=>{global.fetch=original});
test('la identidad real del JWT habilita web solo para admin o flag Developer de servidor',async()=>{
 for(const profile of [{rol:'admin',is_dev:false},{rol:'supervisor',is_dev:true}]){
  mockAuth(profile); const result=await authorizeAI(req('/api/cotizador/chat',{}));assert.equal(result.user.rol,'admin');
  const verified=await verifyWebSession(token,global.fetch);assert.equal(verified.allowed,true);
 }
 for(const rol of ['terreno','supervisor']){
  mockAuth({rol,is_dev:false,email:'obratrack2627@gmail.com'});
  await assert.rejects(authorizeAI(req('/api/cotizador/chat',{})),e=>e.status===403&&e.code==='WEB_ROLE_FORBIDDEN');
  assert.equal((await verifyWebSession(token,global.fetch)).allowed,false);
 }
});
test('un UUID o una cookie inventada no autoriza el endpoint que antes creaba cuentas',async()=>{
 const calls=mockAuth({rol:'admin',is_dev:false});
 for(const cookie of [uid,'inventado']){
  const response=await team.POST(req('/api/equipo/crear-usuario',{}, {Authorization:'',cookie:'obratrack_auth_token='+cookie}));
  assert.equal(response.status,401);
 }
 assert.equal(calls.length,0);
});
test('la sesión web emite una cookie HttpOnly con JWT validado',async()=>{
 mockAuth({rol:'admin',is_dev:false});
 const response=await session.POST(req('/api/auth/session',{}));
 assert.equal(response.status,200);
 assert.match(response.headers.get('set-cookie'),/HttpOnly/i);
 assert.match(response.headers.get('set-cookie'),/Secure/i);
 assert.equal((await response.json()).user.is_dev,false);
});
test('el alta del equipo rechaza datos incompletos y roles de administrador sin invocar RPC',async()=>{
 const calls=mockAuth({rol:'admin',is_dev:false});
 for(const body of [{nombre:'Pedro'},{nombre:'Pedro Morales',rol:'admin'}])assert.equal((await team.POST(req('/api/equipo/crear-usuario',body))).status,422);
 assert.equal(calls.some(c=>c.path.includes('/rpc/')),false);
});
test('el alta del equipo usa datos validados y no acepta empresa, contraseña o privilegios del navegador',async()=>{
 const calls=mockAuth({rol:'admin',is_dev:false});
 const response=await team.POST(req('/api/equipo/crear-usuario',{nombre:'Pedro Morales',rut:'12.345.678-5',email:'PEDRO@EMPRESA.CL',telefono:'912345678',rol:'terreno',proyecto_id:'project-a',empresa_id:'other-company',password:'not-used',is_dev:true}));
 assert.equal(response.status,200);
 const rpc=calls.find(c=>c.path.endsWith('/rpc/crear_integrante_equipo'));
 const payload=JSON.parse(rpc.init.body);
 assert.equal(payload.p_datos.email,'pedro@empresa.cl');
 assert.equal(payload.p_datos.telefono_whatsapp,'+56912345678');
 assert.equal(payload.p_datos.empresa_id,undefined);assert.equal(payload.p_datos.password,undefined);assert.equal(payload.p_datos.is_dev,undefined);
 assert.equal(payload.p_proyecto,'project-a');
});
test('los cambios de plan requieren Developer confirmado en servidor, incluso con un body falsificado',async()=>{
 const calls=mockAuth({rol:'admin',is_dev:false});
 assert.equal((await plans.PATCH(req('/api/dev/plan',{plan:'pro_ia',is_dev:true}))).status,403);
 assert.equal(calls.some(c=>c.path.includes('/rpc/')),false);
 mockAuth({rol:'admin',is_dev:true});
 assert.equal((await plans.PATCH(req('/api/dev/plan',{plan:'pro'}))).status,200);
 assert.equal((await plans.PATCH(req('/api/dev/plan',{plan:'inventado'}))).status,422);
});

test('el alta transmite especialidades opcionales normalizadas y rechaza una lista inválida',async()=>{
 const calls=mockAuth({rol:'admin',is_dev:false});
 const input={nombre:'Pedro Morales',rut:'12.345.678-5',email:'pedro@empresa.cl',telefono:'912345678',rol:'terreno',proyecto_id:'project-a',especialidades:['Carpintería','CARPINTERIA','Pintura']};
 assert.equal((await team.POST(req('/api/equipo/crear-usuario',input))).status,200);
 assert.deepEqual(JSON.parse(calls.find(c=>c.path.endsWith('/rpc/crear_integrante_equipo')).init.body).p_datos.especialidades,['Carpintería','Pintura']);
 assert.equal((await team.POST(req('/api/equipo/crear-usuario',{...input,especialidades:'Pintura'}))).status,422);
});
