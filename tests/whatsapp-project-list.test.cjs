require('./helpers/typescript.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {projectListAnswer}=require('../lib/whatsapp/project-list.ts');
const projects=[{id:'bath',nombre:'Baño',estado:'activo',trabajadores_ids:['worker'],monto_cotizado:1000000},{id:'roof',nombre:'Cobertizo',estado:'pausado',trabajadores_ids:['worker']},{id:'other',nombre:'Otra cuadrilla',estado:'activo',trabajadores_ids:['other']}];
test('la lista filtra asignaciones y estados sin mostrar datos financieros',()=>{
 const answer=projectListAnswer('¿Cuántas obras tengo asignadas?',projects,{id:'worker',rol:'terreno'});
 assert.match(answer.respuesta,/asignadas \(2\)/);assert.match(answer.respuesta,/Cobertizo/);assert.doesNotMatch(answer.respuesta,/Otra cuadrilla|1000000/);
 const active=projectListAnswer('Lista mis obras activas',projects,{id:'worker',rol:'terreno'});assert.match(active.respuesta,/asignadas \(1\)/);assert.doesNotMatch(active.respuesta,/Cobertizo/);
 assert.match(projectListAnswer('Lista las obras de la empresa',projects,{id:'admin',rol:'admin'}).respuesta,/empresa \(3\)/);
});
test('listados no absorben acciones, consultas financieras ni obras vencidas',()=>{
 for(const text of ['Crea obras nuevas','Agrega material en mis obras','¿Cuáles obras están vencidas?','Lista materiales de mis obras','Lista mis obras y registra un avance','¿Cuántas obras tengo y cuánto presupuesto queda?','Inicia mis obras'])assert.equal(projectListAnswer(text,projects,{id:'worker',rol:'terreno'}),null,text);
});
