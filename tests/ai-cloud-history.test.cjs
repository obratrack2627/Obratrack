require('./helpers/typescript.cjs');const {test}=require('node:test');const assert=require('node:assert/strict');
const {CloudChatHistory}=require('../lib/ai/cloud-chat-history.ts');const {historyMessages,syncChat}=require('../lib/ai/chat-history-server.ts');
const message=(id,text=id)=>({id,remitente:'usuario',texto:text,timestamp:'10:00'});
function cloud(){let version=0;const rows=new Map();return async(method,body)=>{
 if(method==='POST'&&body.version===version){if(body.reset){rows.clear();version++;}else for(const row of body.messages)if(!rows.has(row.id))rows.set(row.id,row);}
 return{version,messages:[...rows.values()],conflict:method==='POST'&&body.version!==version&&!body.reset};
};}
function device(request,initial=[]){let local=initial,cache={version:null,reset_pending:false},active=true,status;
 const sync=new CloudChatHistory({read:()=>local,write:r=>local=r,readCache:()=>cache,writeCache:c=>cache=c,active:()=>active,status:s=>status=s,request});
 return{sync,get rows(){return local;},set rows(v){local=v;},get cache(){return cache;},get status(){return status;},deactivate:()=>active=false};}
test('dos dispositivos importan legado sin duplicar y continúan la misma conversación',async()=>{
 const backend=cloud(),desktop=device(backend,[message('legado')]);await desktop.sync.initialize();await desktop.sync.sync();
 const mobile=device(backend);await mobile.sync.initialize();assert.deepEqual(mobile.rows.map(r=>r.id),['legado']);
 mobile.rows.push(message('movil'));await mobile.sync.sync();desktop.rows.push(message('escritorio'));await desktop.sync.sync();await mobile.sync.sync();
 assert.deepEqual(new Set(mobile.rows.map(r=>r.id)),new Set(['legado','movil','escritorio']));
});
test('reiniciar en un dispositivo impide que otro restaure mensajes antiguos',async()=>{
 const backend=cloud(),a=device(backend,[message('viejo')]),b=device(backend);
 await a.sync.initialize();await a.sync.sync();await b.sync.initialize();a.rows=[];await a.sync.reset();await b.sync.sync();assert.deepEqual(b.rows,[]);assert.equal(b.cache.version,1);
});
test('fallos de red conservan copia local y se recuperan al reintentar',async()=>{
 const backend=cloud();let online=false;const d=device(async(...args)=>{if(!online)throw Error('offline');return backend(...args);},[message('local')]);
 await d.sync.initialize();await d.sync.sync();assert.equal(d.rows.length,1);assert.equal(d.status,'pending');online=true;await d.sync.sync();assert.equal(d.status,'synced');assert.equal(d.rows[0].id,'local');
});
test('un reset sin conexión se conserva hasta recuperar la nube',async()=>{
 const backend=cloud();await backend('POST',{version:0,messages:[message('viejo')]});let online=false;const d=device(async(...args)=>{if(!online)throw Error('offline');return backend(...args);});
 await d.sync.initialize();await d.sync.reset();assert.equal(d.cache.reset_pending,true);online=true;await d.sync.sync();assert.deepEqual(d.rows,[]);assert.equal(d.cache.version,1);
});
test('cambiar de cuenta descarta respuestas tardías y no escribe en el nuevo propietario',async()=>{
 let resolve;const d=device(()=>new Promise(r=>resolve=r));const pending=d.sync.initialize();d.deactivate();resolve({version:0,messages:[message('secreto')]});await pending;assert.deepEqual(d.rows,[]);
});
test('la nube conserva IDs de presupuestos y no persiste copias financieras ni colas de ejecución',()=>{
 const result=historyMessages([{...message('q'),cotizacion_generada:{id:'cot-1',estructura_financiera:{precio_total_con_iva:1}},pendiente_sincronizacion:'no-repetir'}]);
 assert.equal(result[0].cotizacion_id,'cot-1');assert.equal(result[0].cotizacion_generada,undefined);assert.equal(result[0].pendiente_sincronizacion,undefined);
 assert.throws(()=>historyMessages([{...message('x'),texto:''}]),e=>e.code==='CHAT_INVALID');
 assert.throws(()=>historyMessages([{...message('x'),cotizacion_id:'x'.repeat(201)}]),e=>e.code==='CHAT_INVALID');
});
test('hidratar presupuestos consulta la empresa del actor y no ejecuta acciones',async()=>{
 const calls=[];const chain={select:()=>chain,eq:(k,v)=>{calls.push([k,v]);return chain;},maybeSingle:async()=>({data:{cotizacion:{id:'cot-1'}}})};
 const client={rpc:async()=>({data:{version:0,messages:[{...message('q'),cotizacion_id:'cot-1'}]}}),from:()=>chain};
 const data=await syncChat(client,{empresa_id:'empresa'});assert.equal(data.messages[0].cotizacion_generada.id,'cot-1');assert.ok(calls.some(([k,v])=>k==='empresa_id'&&v==='empresa'));
});

test('la migración local conserva el propietario anterior al cambiar de cuenta',()=>{
 require('./helpers/browser.cjs')();const {dataService}=require('../lib/data-service.ts');
 dataService.setActiveUser({id:'owner-a',empresa_id:'company-a',nombre:'A',email:'a@example.test',rol:'admin'});
 localStorage.setItem('obratrack_chat_session_history_v7',JSON.stringify([message('legado-a')]));
 dataService.setActiveUser({id:'owner-b',empresa_id:'company-b',nombre:'B',email:'b@example.test',rol:'admin'});
 assert.equal(dataService.getChatSessionHistory(),null);
 dataService.setActiveUser({id:'owner-a',empresa_id:'company-a',nombre:'A',email:'a@example.test',rol:'admin'});
 assert.equal(dataService.getChatSessionHistory()[0].id,'legado-a');
});
test('un reset gana frente a una respuesta de sincronización anterior en vuelo',async()=>{
 const backend=cloud();let resolve,blocked=false;const d=device(async(method,body)=>{
  if(method==='POST'&&!body.reset&&blocked){blocked=false;return new Promise(r=>resolve=()=>backend(method,body).then(r));}
  return backend(method,body);
 },[message('viejo')]);
 await d.sync.initialize();blocked=true;const prior=d.sync.sync();await new Promise(r=>setImmediate(r));
 d.rows=[];const reset=d.sync.reset();resolve();await prior;await reset;assert.deepEqual(d.rows,[]);assert.equal(d.cache.version,1);
});

test('importar más de cien mensajes usa lotes sin perder el historial anterior',async()=>{
 const backend=cloud();const sizes=[];const d=device(async(method,body)=>{if(method==='POST')sizes.push(body.messages.length);return backend(method,body);},Array.from({length:250},(_,i)=>message('legacy-'+i)));
 await d.sync.initialize();await d.sync.sync();assert.deepEqual(sizes,[100,100,50]);assert.equal((await backend('GET')).messages.length,250);
});

test('la versión de caché permanece unida a los mensajes de cada pestaña',()=>{
 const browser=require('./helpers/browser.cjs');browser();const {dataService}=require('../lib/data-service.ts');
 dataService.setActiveUser({id:'tabs-user',empresa_id:'tabs-company',nombre:'A',email:'a@example.test',rol:'admin'});
 dataService.saveChatSessionHistory([message('viejo')],{version:0,reset_pending:false});
 const shared=localStorage,firstSession=sessionStorage;
 browser();global.localStorage=shared;window.localStorage=shared;
 dataService.saveChatSessionHistory([],{version:1,reset_pending:false});
 assert.equal(dataService.getChatSessionSyncState().version,1);
 global.sessionStorage=firstSession;
 assert.equal(dataService.getChatSessionSyncState().version,0);
 assert.equal(dataService.getChatSessionHistory()[0].id,'viejo');
});
