require('./helpers/typescript.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeSpecialties,parseSpecialties,literalSpecialties}=require('../lib/team-specialties.ts');
const {registrationFields}=require('../lib/registrations.ts');
const {personIntake}=require('../lib/whatsapp/person-intake.ts');
const {validateAction}=require('../lib/ai/protocol.ts');
const {isolatedState,planWhatsAppActions}=require('../lib/whatsapp/state.ts');
const {contactNameCommand}=require('../lib/ai/contact-name-command.ts');
const admin={id:'admin',empresa_id:'a',nombre:'Dueña Obra',rol:'admin'};
const worker={id:'worker',empresa_id:'a',nombre:'Pedro Morales',rol:'terreno',email:'pedro@example.test',rut:'12345678-5',telefono_whatsapp:'+56912345678',especialidades:['Carpintería']};
const project={id:'p',empresa_id:'a',nombre:'Baño',estado:'activo',trabajadores_ids:['worker']};

test('las especialidades son múltiples, opcionales y no se duplican por mayúsculas o acentos',()=>{
 assert.deepEqual(normalizeSpecialties([]),[]);
 assert.deepEqual(parseSpecialties(' Carpintería , gasfitería; CARPINTERIA\nPintura '),['Carpintería','gasfitería','Pintura']);
 for(const value of [null,'Pintura',[4],[''],['x'.repeat(61)],Array(13).fill('Pintura')]) assert.throws(()=>normalizeSpecialties(value));
 const data={tipo:'trabajador',nombre:worker.nombre,rut:worker.rut,telefono:worker.telefono_whatsapp,email:worker.email,rol:'terreno',proyecto_id:'p'};
 assert.deepEqual(registrationFields(data).missing,[]);
 assert.deepEqual(registrationFields({...data,especialidades:['Pintura']}).draft.especialidades,['Pintura']);
});

test('el alta conserva las especialidades mientras solicita los datos faltantes y no inventa otras',()=>{
 const first=personIntake([],null,null,'Agrega un trabajador Pedro Morales; especialidades: Carpintería y Gasfitería',[project]);
 assert.deepEqual(first.draft.items[0].especialidades,['Carpintería','Gasfitería']);
 const proposal={tipo:'trabajador',especialidades:['Electricidad']};
 const next=personIntake([],proposal,first.draft,'Su RUT es 12345678-5',[project]);
 assert.deepEqual(next.draft.items[0].especialidades,['Carpintería','Gasfitería']);
 assert.deepEqual(literalSpecialties('Especialidades: Pintura, Carpintería'),['Pintura','Carpintería']);
});

test('editar y quitar especialidades preserva la identidad, rol y asignaciones en el lote de WhatsApp',()=>{
 const ctx={usuarios:[admin,worker],proyectos:[project],clientes:[],actividades:[]};
 for(const names of [['Carpintería','Gasfitería'],[]]){
  const service=isolatedState(admin,ctx,'pro_ia');
  const action=validateAction({tipo:'actualizar_trabajador',usuario_id:'worker',especialidades:names});
  const plan=planWhatsAppActions(service,action);
  assert.deepEqual(plan.changed.usuarios[0].especialidades,names);
  assert.deepEqual(plan.changed.usuarios[0]._contacto_anterior.especialidades,['Carpintería']);
  for(const key of ['id','rol','email','rut','telefono_whatsapp']) assert.equal(plan.changed.usuarios[0][key],worker[key]);
  assert.equal(plan.changed.proyectos.length,0);
 }
 assert.throws(()=>validateAction({tipo:'actualizar_trabajador',usuario_id:'worker',especialidades:'Pintura'}));
 assert.equal(validateAction({tipo:'crear_bitacora',proyecto_id:'p',titulo:'Avance',nota:'Registro de avance',especialidades:[]}).especialidades,undefined);
});

test('un cambio de nombre y especialidades conserva ambas solicitudes para el agente general',()=>{
 const result=contactNameCommand('Cambia su nombre a Pedro Morales y sus especialidades a Pintura',[worker],[],'admin');
 assert.equal(result.handled,false);
});

test('la web conserva las especialidades del borrador al pedir el RUT y completar el alta en otro turno',()=>{
 const {pendingPerson,withPersonContext}=require('../lib/ai/person-context.ts');
 const {conversationRequest}=require('../lib/ai/conversation.ts');
 const projects=[{id:'p',nombre:'Baño'}];
 const item={tipo:'trabajador',nombre:'Pedro Morales',rol:'terreno',telefono:'+56912345678',email:'pedro@example.test',proyecto_id:'p',especialidades:['Carpintería','Gasfitería']};
 const reply=withPersonContext({respuesta:'Falta el RUT.',accion:null},{items:[item]});
 const history=conversationRequest([{rol:'model',texto:reply.respuesta,accion_ejecutada:reply.accion_ejecutada}],'12.345.678-5');
 const pending=pendingPerson(history,[],projects);
 assert.deepEqual(pending.items[0].especialidades,item.especialidades);
 const completed=personIntake([],null,pending,'12.345.678-5',projects);
 assert.deepEqual(completed.actions.find(a=>a.tipo==='agregar_trabajador').especialidades,item.especialidades);
});
