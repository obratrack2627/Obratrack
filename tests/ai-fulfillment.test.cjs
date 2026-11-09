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

const {conversationProjectId,projectMentions}=require('../lib/ai/project-reference.ts');
const works=[{id:'floor',nombre:'Porcelanato La Florida',estado:'activo',monto_cotizado:570493},{id:'pac',nombre:'Ampliación PAC',estado:'activo',monto_cotizado:12000000}];
test('las referencias naturales cambian solo el estado de la obra recién mencionada',()=>{
 const history=[{rol:'user',texto:'¿Hay obras vencidas?'},{rol:'model',texto:'Tienes 1 obra con el plazo vencido: Porcelanato La Florida, hace 3 días.'}];
 for(const [phrase,state] of [
  ['quiero que la dejes como cancelada','cancelada'],['Déjala cancelada','cancelada'],['Cancélala','cancelada'],
  ['Márcala como terminada','terminado'],['Dala por finalizada','terminado'],['Necesito que le cambies el estado a pendiente','pendiente'],
  ['Por favor, déjala en pausa','pausado'],['Reanúdala','activo'],['Actívala','activo'],['Suspéndela','pausado'],
 ]){
  const rows=works.map(row=>({...row,estado:undefined}));
  const result=projectStatusCommand(phrase,rows,conversationProjectId(rows,phrase,history),history);
  assert.ok(result,phrase);assert.deepEqual(result.accion,{tipo:'actualizar_proyecto',proyecto_id:'floor',estado:state},phrase);
 }
});
test('la aclaración inmediata conserva la intención y un cambio de tema la descarta',()=>{
 const pending=projectStatusCommand('Quiero que la dejes como cancelada',works);
 assert.equal(pending.accion,null);assert.match(pending.respuesta,/Qué obra/);
 const history=[{rol:'user',texto:'Quiero que la dejes como cancelada'},{rol:'model',texto:pending.respuesta}];
 assert.equal(projectStatusCommand('Porcelanato La Florida',works,undefined,history).accion.estado,'cancelada');
 assert.equal(projectStatusCommand('Cotiza Ampliación PAC',works,undefined,history),null);
 assert.equal(projectStatusCommand('Porcelanato La Florida',works,undefined,[...history,{rol:'user',texto:'Mejor cotiza una terraza'},{rol:'model',texto:'¿De cuántos metros?'}]),null);
 assert.equal(projectStatusCommand('Porcelanato La Florida',works),null);
});
test('las listas ambiguas y los nombres desconocidos no se sustituyen por otra obra',()=>{
 const history=[{rol:'user',texto:'Háblame de Porcelanato La Florida'},{rol:'model',texto:'Porcelanato La Florida y Ampliación PAC tienen pendientes.'}];
 const id=conversationProjectId(works,'Déjala cancelada',history);
 assert.equal(id,undefined);assert.equal(projectStatusCommand('Déjala cancelada',works,id).accion,null);
 assert.equal(projectStatusCommand('Marca la obra Fantasma como terminada',works,'floor').accion,null);
});
test('reconoce nombres completos, respeta homónimos y evita coincidencias dentro de otras palabras',()=>{
 const rows=[{id:'short',nombre:'Radier'},{id:'long',nombre:'Radier Norte'},{id:'river',nombre:'Río'}];
 assert.deepEqual(projectMentions(rows,'Marca Radier Norte como terminado').map(p=>p.id),['long']);
 assert.deepEqual(projectMentions(rows,'Radier y Radier Norte').map(p=>p.id),['short','long']);
 assert.equal(projectMentions(rows,'Hace frío').length,0);
 assert.equal(projectStatusCommand('Termina Radier',[rows[0],{id:'copy',nombre:'Radier'}]).accion,null);
});
test('un estado ya guardado no genera escrituras redundantes',()=>{
 const result=projectStatusCommand('Déjala en curso',works,'floor');
 assert.equal(result.accion,null);assert.match(result.respuesta,/ya figura como en curso/);
});
test('las preguntas de estado, fechas y las negativas no se convierten en órdenes',()=>{
 for(const phrase of ['¿Cuándo termina la obra?','¿Cómo marcar la obra como terminada?','Quiero preguntar cuándo termina la obra','No la canceles','¿Está cancelada la obra?','Cancela el borrador','Marca la partida como terminada'])assert.equal(projectStatusCommand(phrase,works,'floor'),null,phrase);
 const action={tipo:'actualizar_proyecto',proyecto_id:'floor',estado:'cancelada'};
 for(const phrase of ['No la canceles','Solo quiero saber si está cancelada','¿Está cancelada?','Revisa sin guardar cambios'])assert.throws(()=>checkActionPermissions({rol:'admin',id:'u'},action,phrase),undefined,phrase);
});

test('permite reintentar después del error antiguo sin perder el antecedente de la obra',()=>{
 const history=[{rol:'user',texto:'¿Qué obras tengo vencidas?'},{rol:'model',texto:'Tienes 1 obra vencida: Porcelanato La Florida.'},{rol:'user',texto:'quiero que la dejes como cancelada'},{rol:'model',texto:'Indica qué dato de la obra quieres actualizar.'}];
 const id=conversationProjectId(works,'Cancélala',history);
 assert.equal(id,'floor');assert.equal(projectStatusCommand('Cancélala',works,id,history).accion.estado,'cancelada');
 assert.equal(conversationProjectId(works,'Déjala cancelada',[{rol:'user',texto:'Veamos Ampliación PAC'},{rol:'model',texto:'Vamos a revisar Porcelanato La Florida.'}]),undefined);
});

test('mencionar que no cambie el presupuesto nunca autoriza copiar un monto propuesto por el modelo',()=>{
 for(const message of ['Cancela Radier pero no cambies el presupuesto','Marca Radier como terminada sin modificar su monto','Déjala pausada, no quiero que toques el valor']){
  const [action]=checkActionPermissions({rol:'admin',id:'u'},{tipo:'actualizar_proyecto',proyecto_id:'a',estado:'cancelada',monto_cotizado:0,monto:0},message);
  assert.equal(action.monto_cotizado,undefined);assert.equal(action.monto,undefined);
 }
 assert.throws(()=>checkActionPermissions({rol:'admin',id:'u'},{tipo:'actualizar_proyecto',proyecto_id:'a',estado:'cancelada'},'No cambies el estado de la obra'),error=>error.code==='STATUS_NOT_REQUESTED');
});
