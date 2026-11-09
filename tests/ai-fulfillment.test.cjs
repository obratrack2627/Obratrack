require('./helpers/typescript.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {projectStatusCommand}=require('../lib/ai/project-status-command.ts');
const {checkActionPermissions}=require('../lib/ai/permissions.ts');
const {validateAction}=require('../lib/ai/protocol.ts');
const {whatsappCard}=require('../lib/whatsapp/format.ts');
const projects=[{id:'a',nombre:'Radier',estado:'activo',monto_cotizado:570493}];
test('las órdenes de estado y sus sinónimos conservan solo el cambio solicitado',()=>{
 for(const phrase of ['Pon esa obra como terminada','Da como terminada esa obra','Marca Radier como finalizada']){
  assert.deepEqual(projectStatusCommand(phrase,projects).accion,{tipo:'actualizar_proyecto',proyecto_id:'a',estado:'terminado'});
 }
 for(const phrase of ['No marques la obra terminada','¿La obra está terminada?','Marca la partida como terminada','Cancela el borrador','Quiero saber si la obra está terminada'])assert.equal(projectStatusCommand(phrase,projects),null,phrase);
 assert.equal(validateAction({tipo:'actualizar_proyecto',estado:'terminada'}).estado,'terminado');
});
test('campos de presupuesto no solicitados se descartan antes de ejecutar una acción',()=>{
 const [a]=checkActionPermissions({rol:'admin',id:'u'},{tipo:'actualizar_proyecto',proyecto_id:'a',estado:'terminado',monto:0,monto_cotizado:0},'Marca la obra como terminada');
 assert.equal(a.monto,undefined);assert.equal(a.monto_cotizado,undefined);assert.equal(a.estado,'terminado');
 assert.throws(()=>checkActionPermissions({rol:'admin',id:'u'},{tipo:'actualizar_proyecto',proyecto_id:'a',monto_cotizado:0},'Termina la obra'));
});
test('enviar y preparar mensajes conservan significados distintos',()=>{
 const draft={tipo:'generar_mensaje_whatsapp',mensaje:'Mañana a las 8',trabajadores_nombres:['Pedro']};
 assert.equal(checkActionPermissions({rol:'admin',id:'u'},draft,'Envíale un mensaje a Pedro: mañana a las 8')[0].tipo,'enviar_mensaje_equipo');
 assert.equal(checkActionPermissions({rol:'admin',id:'u'},draft,'Prepara un mensaje que voy a enviar a Pedro')[0].tipo,'generar_mensaje_whatsapp');
});
test('la conversación no añade marca, categoría ni emojis, pero los documentos conservan su título',()=>{
 assert.equal(whatsappCard('Consulta de obra','Porcelanato tiene 3 días de atraso.'),'Porcelanato tiene 3 días de atraso.');
 assert.equal(whatsappCard('Registro de obra','Porcelanato quedó como terminada.'),'Porcelanato quedó como terminada.');
 assert.equal(whatsappCard('Cotización · Radier','Total: $500.000'),'*Cotización · Radier*\n\nTotal: $500.000');
});
test('un nombre de obra con medidas numéricas no impide cambiar solo su estado',()=>{
 const result=projectStatusCommand('Marca Pintura de pieza 3x3 como terminada',[{id:'paint',nombre:'Pintura de pieza 3x3'}]);
 assert.equal(result.accion.estado,'terminado');assert.equal(result.accion.monto_cotizado,undefined);
});
