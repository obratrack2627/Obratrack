require('./helpers/typescript.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateAction}=require('../lib/ai/protocol.ts');
const {prepareActionPlan}=require('../lib/ai/actions.ts');
const {isolatedState,planWhatsAppActions}=require('../lib/whatsapp/state.ts');
const {checkActionPermissions}=require('../lib/ai/permissions.ts');
const {deliverReplyOnce}=require('../lib/whatsapp/reply-delivery.ts');
const {ragEligible}=require('../lib/ai/rag.ts');
const {acceptsQuotedProject}=require('../lib/whatsapp/quote-intake.ts');
const actor={id:'admin',rol:'admin',empresa_id:'company',nombre:'Admin'};
const project={id:'p',empresa_id:'company',nombre:'Cerámica La Reina',fecha_inicio:'2026-11-17',fecha_termino_estimada:'2026-11-20',estado:'activo',monto_cotizado:626828};
test('admin cambia inicio y término junto con la asignación; conserva presupuesto y partidas',()=>{
 const worker={id:'worker',empresa_id:'company',nombre:'Benjamín Arriagada',rol:'terreno'};
 const service=isolatedState(actor,{usuarios:[actor,worker],proyectos:[project],actividades:[{id:'a',proyecto_id:'p',nombre:'Preparación',fecha_inicio:'2026-11-17',fecha_termino:'2026-11-18',porcentaje_avance:0,estado:'pendiente'}]},'pro_ia');
 const dates=validateAction({tipo:'actualizar_proyecto',proyecto_id:'p',fecha_inicio:'2026-11-25',fecha_termino_estimada:'2026-11-28'});
 const plan=planWhatsAppActions(service,[dates,{tipo:'asignar_trabajador',proyecto_id:'p',trabajador_nombre:worker.nombre}]);
 assert.equal(plan.changed.proyectos[0].fecha_inicio,'2026-11-25');assert.equal(plan.changed.proyectos[0].fecha_termino_estimada,'2026-11-28');assert.equal(plan.changed.proyectos[0].monto_cotizado,626828);assert.ok(plan.changed.proyectos[0].trabajadores_ids.includes('worker'));assert.equal(plan.changed.actividades?.length||0,0);
 assert.match(JSON.stringify(plan.result),/25\/11\/2026/);
});
test('cambio solo de inicio es válido; fecha imposible y rango inverso se rechazan',()=>{
 assert.equal(validateAction({tipo:'actualizar_proyecto',proyecto_id:'p',fecha_inicio:'2026-11-18'}).fecha_inicio,'2026-11-18');
 assert.throws(()=>validateAction({tipo:'actualizar_proyecto',proyecto_id:'p',fecha_inicio:'2026-02-30'}));
 assert.throws(()=>prepareActionPlan({tipo:'actualizar_proyecto',proyecto_id:'p',fecha_inicio:'2026-11-25'},{proyectos:[project],clientes:[],usuarios:[],actividades:[]}),/nuevo término/);
 assert.throws(()=>checkActionPermissions({...actor,rol:'terreno'}, {tipo:'actualizar_proyecto',proyecto_id:'p',fecha_inicio:'2026-11-18'},'Cambia inicio al 18'),e=>e.status===403);
});
test('RAG no participa al editar fechas y un sí fuera de la oferta no aprueba una cotización antigua',()=>{
 for(const text of ['Cambia el inicio al 25 y el término al 28','Mueve la fecha de inicio de la obra','Reprograma la obra según ese APU'])assert.equal(ragEligible(text,'admin',true),false);
 assert.equal(acceptsQuotedProject('Sí',false),false);assert.equal(acceptsQuotedProject('Sí',true),true);assert.equal(acceptsQuotedProject('Crea la obra con esa cotización',false),true);
});
test('reintentos concurrentes y respuesta perdida no repiten texto o PDF aceptados',async()=>{
 const sb={rpc:require('./helpers/reply-delivery.cjs')()};let sends=0;const receipt={...actor,actor_id:actor.id,persistido:true};
 const run=()=>deliverReplyOnce(sb,receipt,'inbound','quote_pdf',async()=>{sends++;await new Promise(r=>setImmediate(r));});
 await Promise.all([run(),run()]);await run();assert.equal(sends,1);
 await deliverReplyOnce(sb,receipt,'inbound','text:0',async()=>{sends++;});assert.equal(sends,2);
});
test('timeout ambiguo conserva la reserva y no repite automáticamente el envío',async()=>{
 const sb={rpc:require('./helpers/reply-delivery.cjs')()};const receipt={actor_id:actor.id,empresa_id:actor.empresa_id,persistido:true};let sends=0;
 await assert.rejects(deliverReplyOnce(sb,receipt,'inbound','text:0',async()=>{sends++;throw new Error('timeout after acceptance');}));
 await deliverReplyOnce(sb,receipt,'inbound','text:0',async()=>{sends++;});assert.equal(sends,1);
});
