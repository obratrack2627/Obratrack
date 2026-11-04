require('./helpers/typescript.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {personIntake}=require('../lib/whatsapp/person-intake.ts');
const {registrationFields}=require('../lib/registrations.ts');
const projects=[{id:'p1',nombre:'Radier'},{id:'p2',nombre:'Terraza'}];
test('el registro interactivo acumula los campos y asigna la obra sin crear cuentas web',()=>{
 let step=personIntake([{tipo:'agregar_trabajador',nombre:'Pedro Morales'}],null,null,'Agrega al maestro Pedro Morales',projects);
 assert.equal(step.actions.length,0);assert.match(step.question,/RUT/);assert.match(step.question,/Correo/);assert.match(step.question,/Obra/);
 step=personIntake([], {tipo:'trabajador',rut:'12.345.678-5',email:'pedro@empresa.cl',telefono:'+56912345678',rol:'terreno',proyecto_id:'p1'},step.draft,'RUT 12.345.678-5, correo pedro@empresa.cl, teléfono +56912345678, terreno en Radier',projects);
 assert.equal(step.question,null);assert.equal(step.draft,null);assert.equal(step.actions[0].tipo,'agregar_trabajador');assert.equal(step.actions[1].tipo,'asignar_trabajador');
 assert.equal(step.actions[1].proyecto_id,'p1');assert.equal(step.actions[1].rut,'12345678-5');assert.equal(step.actions[0].password,undefined);
});
test('no inventa datos ni asignaciones cuando el modelo completa lo que el usuario no dio',()=>{
 const step=personIntake([], {tipo:'trabajador',nombre:'Pedro Morales',rut:'12345678-5',email:'inventado@empresa.cl',telefono:'+56912345678',rol:'supervisor',proyecto_id:'p2'},null,'Agrega a Pedro Morales',projects);
 assert.equal(step.actions.length,0);assert.equal(step.draft.items[0].email,undefined);assert.equal(step.draft.items[0].rut,undefined);assert.equal(step.draft.items[0].proyecto_id,undefined);assert.match(step.question,/Rol/);
});
test('una consulta intermedia conserva el borrador, un dato literal lo completa y cancelar no crea nada',()=>{
 const first=personIntake([], {tipo:'cliente',nombre:'Constructora Sur'},null,'Registra al cliente Constructora Sur',projects);
 const query=personIntake([],null,first.draft,'¿Qué obras tengo?',projects);assert.deepEqual(query.draft,first.draft);assert.equal(query.question,null);
 const rut=personIntake([],null,query.draft,'12.345.678-5',projects);assert.equal(rut.draft.items[0].rut,'12345678-5');
 const cancelled=personIntake([],null,rut.draft,'Cancela el registro',projects);assert.equal(cancelled.draft,null);assert.deepEqual(cancelled.actions,[]);
});
test('un lote no crea parcialmente a la primera persona cuando faltan datos de otra',()=>{
 const step=personIntake([{tipo:'agregar_trabajadores',trabajadores:[{nombre:'Pedro Morales',rut:'12345678-5',telefono:'+56912345678',email:'pedro@empresa.cl',rol:'supervisor'},{nombre:'Ana Pérez'}]}],null,null,'Registra a Pedro Morales RUT 12345678-5 teléfono +56912345678 correo pedro@empresa.cl supervisor, y a Ana Pérez',projects);
 assert.equal(step.draft.items.length,2);assert.equal(step.actions.length,0);assert.match(step.question,/Ana Pérez/);
});
test('nombre completo, RUT, correo, teléfono, rol y obra se validan antes del alta',()=>{
 const checked=registrationFields({tipo:'trabajador',nombre:'Pedro',rut:'12345678-9',email:'invalido',telefono:'123',rol:'admin'});
 assert.ok(checked.missing.length>=5);
});
