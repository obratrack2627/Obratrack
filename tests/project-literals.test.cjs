require('./helpers/typescript.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {projectIntake}=require('../lib/whatsapp/project-intake.ts');
const {requestsQuotedProject,acceptsQuotedProject}=require('../lib/whatsapp/quote-intake.ts');
const actor={id:'admin',rol:'admin'};
const packet=phone=>['123456785','Pedro Morales','Cobertizo La Pintana','561.332','pedro@example.test',phone].join('\n');

test('el formato por líneas de la captura completa nombre, RUT, presupuesto y teléfono sin extracción del modelo',()=>{
 for(const phone of ['912345678','12345678','+56912345678']){
  const result=projectIntake(actor,null,{},[],packet(phone));
  assert.equal(result.question,null,JSON.stringify(result.draft));assert.equal(result.actions.length,1);
  assert.equal(result.draft.monto_cotizado,561332);assert.equal(result.draft.cliente_telefono,'+56912345678');assert.equal(result.draft.cliente_rut,'12345678-5');
  assert.equal(result.draft.cliente_nombre,'Pedro Morales');assert.equal(result.draft.nombre,'Cobertizo La Pintana');
 }
});

test('los valores que faltan se acumulan sin convertir RUT, presupuesto y teléfono en el mismo dato',()=>{
 const initial={nombre:'Cobertizo',cliente_nombre:'Pedro Morales',cliente_rut:'12345678-5',cliente_email:'pedro@example.test'};
 const budget=projectIntake(actor,null,initial,[],'561.332');assert.equal(budget.draft.monto_cotizado,561332);assert.match(budget.question,/Teléfono/);assert.doesNotMatch(budget.question,/Presupuesto/);
 const complete=projectIntake(actor,null,budget.draft,[],'912345678');assert.equal(complete.question,null);assert.equal(complete.draft.cliente_telefono,'+56912345678');assert.equal(complete.draft.monto_cotizado,561332);
 const ambiguous=projectIntake(actor,null,initial,[],'12345678');assert.match(ambiguous.question,/Presupuesto/);assert.match(ambiguous.question,/Teléfono/);assert.equal(ambiguous.draft.cliente_telefono,undefined);
});

test('los datos etiquetados sin espacio y el presupuesto de una cotización sobreviven a propuestas vacías o ceros del modelo',()=>{
 const previous={nombre:'Cobertizo cotizado',monto_cotizado:561332,presupuesto_cotizacion_id:'quote',partidas:[{nombre:'Montaje',dias:2}],materiales:[{nombre:'Pino',cantidad:2,precio_unitario:5000}]};
 const message='RUT:12345678-5\nCliente:Pedro Morales\nCorreo:pedro@example.test\nTeléfono:912345678';
 const result=projectIntake(actor,{monto_cotizado:0,monto:0},previous,[],message);
 assert.equal(result.question,null);assert.equal(result.draft.monto_cotizado,561332);assert.deepEqual(result.draft.materiales,previous.materiales);assert.deepEqual(result.draft.partidas,previous.partidas);
 const choice=projectIntake(actor,null,previous,[],'2');assert.equal(choice.draft.monto_cotizado,561332);
});

test('una frase conversacional y un RUT inválido no se registran como nombre ni se convierten en presupuesto',()=>{
 const incomplete=projectIntake(actor,{nombre:'Ya te di todos los datos',cliente_nombre:'Ya te di todos los datos'},null,[],'Ya te di todos los datos');assert.equal(incomplete.draft.nombre,undefined);assert.equal(incomplete.draft.cliente_nombre,undefined);
 const bad=projectIntake(actor,null,{},[],'123456789\nPedro Morales\nCobertizo La Pintana\n561.332\npedro@example.test\n912345678');assert.match(bad.question,/RUT válido/);assert.equal(bad.draft.monto_cotizado,561332);
});

test('retomar una cotización acepta lenguaje natural sin ejecutar preguntas, negativas ni solicitudes adicionales',()=>{
 for(const text of ['Usa esa cotización para crear una obra','Quiero convertir ese presupuesto en una obra','¿Puedes crear una obra con esa cotización?'])assert.equal(requestsQuotedProject(text),true,text);
 for(const text of ['No uses esa cotización para crear una obra','No quiero crear una obra con esa cotización','¿Cómo puedo crear una obra con esa cotización?','Crea una obra llamada Patio, presupuesto 561332','Usa esa cotización para crear una obra y registra un pago','Sí'])assert.equal(requestsQuotedProject(text),false,text);
 assert.equal(acceptsQuotedProject('Usa esa cotización para crear una obra'),true);
});

test('una fecha no se convierte en teléfono al completar una obra y dos teléfonos distintos requieren aclaración',()=>{
 const previous={nombre:'Cobertizo',cliente_nombre:'Pedro Morales',cliente_rut:'12345678-5',cliente_email:'pedro@example.test',monto_cotizado:561332};
 const date=projectIntake(actor,null,previous,[],'2026-11-12');assert.match(date.question,/Teléfono/);assert.equal(date.draft.cliente_telefono,undefined);
 const phones=projectIntake(actor,null,previous,[],'912345678\n987654321');assert.match(phones.question,/Teléfono/);assert.equal(phones.draft.cliente_telefono,undefined);
});

test('la captura reutiliza Juan Campos aunque falten contactos y pide solo el monto de la obra',()=>{
 const manager={id:'boss',rol:'admin',empresa_id:'company'};
 const clients=[{id:'juan',empresa_id:'company',nombre:'Juan Campos',email:null,telefono:null,rut:null}];
 const scope=projectIntake(manager,null,{},clients,'ampliacion de 25 metros cuadrados en casa ubicada en maipu');
 assert.equal(scope.draft.nombre,'ampliacion de 25 metros cuadrados');assert.equal(scope.draft.comuna,'maipu');
 const selected=projectIntake(manager,null,scope.draft,clients,'el cliente es Juan Campos que ya esta en la lista de clientes');
 assert.equal(selected.draft.cliente_id,'juan');assert.match(selected.question,/Presupuesto/);assert.doesNotMatch(selected.question,/Correo|Teléfono|RUT/);
 const complete=projectIntake(manager,null,selected.draft,clients,'15000000');
 assert.equal(complete.question,null);assert.equal(complete.actions.length,1);assert.equal(complete.actions[0].cliente_id,'juan');assert.equal(complete.draft.monto_cotizado,15000000);
});
test('un cambio de cliente no conserva el ID anterior ni crea fichas con coincidencias ambiguas',()=>{
 const clients=[{id:'old',nombre:'Ana Pérez'},{id:'juan1',nombre:'Juan Campos'},{id:'juan2',nombre:'Juan Castro'}];
 const previous={nombre:'Ampliación',cliente_id:'old',cliente_nombre:'Ana Pérez',monto_cotizado:500000};
 const ambiguous=projectIntake(actor,null,previous,clients,'el cliente es Juan');
 assert.match(ambiguous.question,/forma única/);assert.equal(ambiguous.actions.length,0);assert.equal(ambiguous.draft.cliente_id,undefined);
 const selected=projectIntake(actor,null,ambiguous.draft,clients,'Cliente Juan Campos');assert.equal(selected.question,null);assert.equal(selected.actions[0].cliente_id,'juan1');
});
test('crear otra obra es una solicitud; consultas y negativas no autorizan altas',()=>{
 const {requestsNewProject}=require('../lib/whatsapp/project-literals.ts');
 for(const text of ['ok necesito crear otra obra','Crea una obra nueva','necesito crear un proyecto'])assert.equal(requestsNewProject(text),true,text);
 for(const text of ['No quiero crear otra obra','Cómo puedo crear una obra','Coméntame el avance de la obra'])assert.equal(requestsNewProject(text),false,text);
});
