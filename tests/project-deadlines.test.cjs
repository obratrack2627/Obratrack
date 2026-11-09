require('./helpers/typescript.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chileToday,projectDeadlines,projectDeadlineAnswer,isProjectDeadlineQuestion}=require('../lib/ai/project-deadlines.ts');
const now=new Date('2026-11-09T15:00:00Z');
const projects=[
 {id:'a',nombre:'Pintura',estado:'activo',fecha_termino_estimada:'2026-11-05'},
 {id:'b',nombre:'Porcelanato',estado:'activo',fecha_termino_estimada:'2026-11-06'},
 {id:'c',nombre:'Entregada',estado:'terminado',fecha_termino_estimada:'2026-11-01'},
 {id:'d',nombre:'Cancelada',estado:'cancelada',fecha_termino_estimada:'2026-11-02'},
 {id:'e',nombre:'Entrega de hoy',estado:'activo',fecha_termino_estimada:'2026-11-09'},
];
test('dos obras vencidas se calculan por fecha y estado, sin confundir entregadas ni entrega de hoy',()=>{
 const report=projectDeadlines(projects,undefined,now);
 assert.deepEqual(report.vencidas.map(p=>[p.nombre,p.dias_vencida]),[['Pintura',4],['Porcelanato',3]]);
 assert.match(projectDeadlineAnswer('¿Qué obras tengo vencidas?',projects,undefined,now).respuesta,/Tienes 2 obras/);
 assert.equal(projectDeadlineAnswer('¿Qué obras tengo vencidas?',projects,'a',now).respuesta.includes('Porcelanato'),true);
 assert.equal(projectDeadlines(projects,'a',now).vencidas.length,1);
});
test('usa el calendario chileno incluso cuando UTC ya cambió de día',()=>{
 assert.equal(chileToday(new Date('2026-11-09T02:59:00Z')),'2026-11-08');
 assert.equal(chileToday(new Date('2026-11-09T03:01:00Z')),'2026-11-09');
});
test('las obras abiertas sin fecha válida se informan y las pausadas conservan su compromiso de entrega',()=>{
 const rows=[{...projects[0],fecha_termino_estimada:null},{...projects[1],estado:'pausado'}];
 const report=projectDeadlines(rows,undefined,now);
 assert.equal(report.sin_fecha_valida,1);assert.equal(report.vencidas.length,1);
 assert.match(projectDeadlineAnswer('Obras vencidas',rows,undefined,now).respuesta,/sin fecha válida/);
});
test('no intercepta instrucciones, consultas de pagos, causas ni periodos distintos',()=>{
 for(const text of ['Reprograma las obras vencidas','Qué pagos tengo vencidos','Qué obras estaban vencidas la semana pasada','Qué obras tengo vencidas y qué materiales compro','Por qué las obras están atrasadas'])assert.equal(isProjectDeadlineQuestion(text),false,text);
 assert.equal(isProjectDeadlineQuestion('Muéstrame las obras atrasadas por favor'),true);
});
