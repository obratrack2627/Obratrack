require('./helpers/typescript.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {personIntake}=require('../lib/whatsapp/person-intake.ts');
const {pendingPerson}=require('../lib/ai/person-context.ts');
const {createdProjectTeamDraft}=require('../lib/ai/team-assignment.ts');
const {isolatedState,planWhatsAppActions}=require('../lib/whatsapp/state.ts');
const {checkActionPermissions}=require('../lib/ai/permissions.ts');
const {ragEligible}=require('../lib/ai/rag.ts');
const projects=[{id:'p1',nombre:'Quincho Peñaflor',empresa_id:'e',estado:'activo',monto_cotizado:1000000},{id:'p2',nombre:'Radier Maipú',empresa_id:'e'}];
const users=[{id:'u1',nombre:'Nicolás Paredes',rol:'terreno',empresa_id:'e'},{id:'u2',nombre:'Ana Pérez',rol:'supervisor',empresa_id:'e'}];
const step=(text,draft=null,current='p1',people=users,actions=[])=>personIntake(actions,null,draft,text,projects,current,people);
for(const text of ['Asigna al trabajador Nicolás paredes','Añade al trabajador Nicolás paredes al proyecto','Agrega al trabajador Nicolas Paredes a esta obra','Asigna a Nicolás Paredes a la obra Quincho Peñaflor','Añade Nicolás Paredes','Asigna al jefe de obra Ana Pérez','Agrega a la supervisora Ana Pérez a esta obra'])
 test('reutiliza ficha sin contactos: '+text,()=>{
  const result=step(text);assert.equal(result.question,null);assert.equal(result.draft,null);assert.equal(result.actions.length,1);assert.equal(result.actions[0].tipo,'asignar_trabajador');assert.equal(result.actions[0].proyecto_id,'p1');
 });
test('el complemento de proyecto no se convierte en nombre ni se registra una persona inexistente al asignar',()=>{
 const result=step('Añade al trabajador Pedro Morales al proyecto');assert.equal(result.actions.length,0);assert.match(result.question,/No encontré a Pedro Morales/);assert.deepEqual(result.draft.asignacion.nombres,['Pedro Morales']);assert.doesNotMatch(result.question,/RUT|Teléfono|Correo/);
});
test('ya existe recupera un borrador antiguo con al proyecto incluido en el nombre',()=>{
 const result=step('Ya existe',{items:[{tipo:'trabajador',nombre:'Nicolás paredes al proyecto'}]});assert.equal(result.actions[0].trabajador_nombre,'u1');assert.equal(result.draft,null);
});
test('un supervisor se asigna conservando su rol y un terreno no se convierte en jefe',()=>{
 const rejected=step('Asigna al jefe de obra Nicolás Paredes');assert.equal(rejected.actions.length,0);assert.match(rejected.question,/no figura como jefe/);
 const accepted=step('Ana Pérez',rejected.draft);assert.equal(accepted.actions[0].trabajador_nombre,'u2');assert.equal(accepted.actions[0].rol,undefined);
});
test('homónimos requieren aclaración y el ID de ficha los distingue',()=>{
 const people=[...users,{...users[0],id:'u3'}];const result=step('Asigna a Nicolás Paredes',null,'p1',people);assert.match(result.question,/más de una/);assert.equal(result.actions.length,0);
 const selected=step('u3',result.draft,'p1',people);assert.equal(selected.actions[0].trabajador_nombre,'u3');
});
test('varias obras sin contexto piden la obra, y su respuesta completa la asignación',()=>{
 const result=step('Asigna a Nicolás Paredes',null,null);assert.equal(result.actions.length,0);assert.match(result.question,/en qué obra/);
 const selected=step('Radier Maipú',result.draft,null);assert.equal(selected.actions[0].proyecto_id,'p2');assert.equal(selected.actions[0].trabajador_nombre,'u1');
});
test('una obra explícita inexistente no cae en la obra anterior',()=>{
 const result=step('Asigna a Nicolás Paredes a la obra Inexistente');assert.equal(result.actions.length,0);assert.match(result.question,/No se encontró/);
});
test('el seguimiento de creación acepta sí, nombres de ambos roles y ahora no',()=>{
 const initial={items:[],asignacion:{nombres:[],proyecto_id:'p1'}};
 const yes=step('Sí',initial);assert.equal(yes.actions.length,0);assert.match(yes.question,/nombres/);
 const names=step('Nicolás Paredes y Ana Pérez',yes.draft);assert.deepEqual(names.actions.map(a=>a.trabajador_nombre),['u1','u2']);
 const no=step('ahora no',initial);assert.equal(no.draft,null);assert.equal(no.actions.length,0);
});
test('una consulta intermedia no se interpreta como persona y conserva la asignación pendiente',()=>{
 const draft={items:[],asignacion:{nombres:[],proyecto_id:'p1'}};const result=step('¿Qué obras tengo?',draft);assert.equal(result.question,null);assert.deepEqual(result.draft,draft);assert.equal(result.actions.length,0);
});
test('registrar ficha existente pide asignación en vez de exigir contactos',()=>{
 const result=step('Registra al trabajador Nicolás Paredes');assert.match(result.question,/ya está en el equipo/);assert.doesNotMatch(result.question,/RUT|Teléfono|Correo/);assert.equal(result.actions.length,0);
 assert.equal(step('sí',result.draft).actions[0].trabajador_nombre,'u1');
});
test('registrar persona nueva conserva los requisitos y reconoce jefe de obra como supervisor',()=>{
 const result=step('Registra al jefe de obra Pedro Morales');assert.match(result.question,/RUT/);assert.equal(result.draft.items[0].rol,'supervisor');assert.equal(result.actions.length,0);
});
test('las instrucciones compuestas conservan la asignación y el cambio de fecha para el agente',()=>{
 const text='Añade al trabajador Nicolás Paredes al proyecto y cambia el inicio al 25 de noviembre';assert.equal(step(text).question,null);
 const actions=[{tipo:'asignar_trabajador',proyecto_id:'p1',trabajador_nombre:'u1'},{tipo:'actualizar_proyecto',proyecto_id:'p1',fecha_inicio:'2026-11-25'}];assert.deepEqual(step(text,null,'p1',users,actions).actions,actions);
});
test('el borrador web conserva solo campos admitidos y no autoriza proyectos que ya no existen',()=>{
 const draft=pendingPerson([{rol:'model',texto:'¿Añadir personas?',registro_pendiente:{items:[],asignacion:{nombres:['u1'],proyecto_id:'borrada',rol:'admin',empresa_id:'otra'}}}],[],projects);
 assert.deepEqual(draft,{items:[],asignacion:{nombres:['u1'],proyecto_id:'borrada'}});assert.equal(step('sí',draft).actions.length,0);
});
test('la asignación real muestra nombres, es idempotente y no crea fichas ni cambia el contrato',()=>{
 const actor={id:'admin',empresa_id:'e',rol:'admin',nombre:'Admin'};
 const service=isolatedState(actor,{usuarios:[actor,...users],proyectos:projects},'pro_ia');
 const actions=step('Asigna a Nicolás Paredes').actions;
 const plan=planWhatsAppActions(service,actions);assert.deepEqual(plan.result.detalles.acciones[0].detalles.nombres,['Nicolás Paredes']);
 planWhatsAppActions(service,actions);assert.deepEqual(service.getProyectoById('p1').trabajadores_ids,['u1']);assert.equal(service.getUsuarios().length,3);assert.equal(service.getProyectoById('p1').monto_cotizado,1000000);
 assert.throws(()=>checkActionPermissions(users[0],actions,'Asigna a Nicolás Paredes'),e=>e.status===403);
});
test('RAG se excluye también con añade/incorpora y el seguimiento solo nace de una creación ejecutada',()=>{
 for(const text of ['Añade a Nicolás Paredes a la obra APU','Incorpora al trabajador según ese APU'])assert.equal(ragEligible(text,'admin',true),false);
 assert.equal(createdProjectTeamDraft({tipo:'actualizar_proyecto',detalles:{id:'p1'}}),undefined);
 assert.deepEqual(createdProjectTeamDraft({tipo:'crear_proyecto',detalles:{id:'p1'}}),{nombres:[],proyecto_id:'p1'});
});
test('los homónimos se distinguen por RUT sin exigir todos los contactos',()=>{
 const people=[{...users[0],rut:'12345678-5'},{...users[0],id:'u3',rut:'11111111-1'}];
 const ambiguous=step('Asigna a Nicolás Paredes',null,'p1',people);assert.equal(ambiguous.actions.length,0);
 const selected=step('RUT 11.111.111-1',ambiguous.draft,'p1',people);assert.equal(selected.actions[0].trabajador_nombre,'u3');
});
test('un registro nuevo explícito y un pedido con dos roles no se confunden con asignar una sola ficha',()=>{
 const registration=step('Agrega un nuevo trabajador Pedro Morales a esta obra');assert.match(registration.question,/RUT/);assert.equal(registration.draft.items[0].nombre,'Pedro Morales');
 const mixed=step('Asigna al trabajador Nicolás Paredes y a la jefa de obra Ana Pérez');assert.equal(mixed.question,null);assert.equal(mixed.actions.length,0);
});
test('cambiar explícitamente de obra descarta el seguimiento anterior para no trasladar personas por error',()=>{
 const draft={items:[],asignacion:{nombres:[],proyecto_id:'p1'}};
 const query=step('¿Cuál es el saldo de Radier Maipú?',draft);assert.equal(query.draft,null);assert.equal(query.actions.length,0);
 const assignment=step('Asigna a Nicolás Paredes a la obra Radier Maipú',draft);assert.equal(assignment.actions[0].proyecto_id,'p2');
});
test('un alta propuesta con nombre homónimo no elige la primera ficha al corregirse a asignación',()=>{
 const people=[{...users[0],rut:'12345678-5'},{...users[0],id:'u3',rut:'11111111-1'}];
 const result=step('Registra al trabajador Nicolás Paredes',null,'p1',people);assert.equal(result.actions.length,0);assert.match(result.question,/más de una/);
 const stillAmbiguous=step('sí',result.draft,'p1',people);assert.equal(stillAmbiguous.actions.length,0);
 const selected=step('RUT 11.111.111-1',result.draft,'p1',people);assert.equal(selected.actions[0].trabajador_nombre,'u3');
});
