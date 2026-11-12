require('./helpers/typescript.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {assertAttendanceManager,isAttendanceManagementRequest}=require('../lib/attendance-access.ts');
const {checkActionPermissions}=require('../lib/ai/permissions.ts');
const {isolatedState}=require('../lib/whatsapp/state.ts');
const worker={id:'worker',empresa_id:'company',nombre:'Pedro Morales',rol:'terreno'};
const project={id:'p',empresa_id:'company',nombre:'Quincho'};
const row={id:'attendance',proyecto_id:'p',empresa_id:'company',usuario_id:'worker',trabajador_nombre:worker.nombre,fecha:'2026-11-12',estado:'presente',hora_entrada:'08:00'};
const context={usuarios:[worker],proyectos:[project],proyecto_trabajadores:[{proyecto_id:'p',usuario_id:'worker'}],asistencia_obreros:[row]};

test('solo administrador y supervisor gestionan asistencia; terreno no marca ni la propia ni la cuadrilla',()=>{
 for(const rol of ['admin','supervisor'])assert.doesNotThrow(()=>assertAttendanceManager({rol}));
 for(const user of [null,{},worker,{rol:'inventado'}])assert.throws(()=>assertAttendanceManager(user),e=>e.code==='ATTENDANCE_FORBIDDEN');
 for(const fields of [{trabajador_nombre:worker.nombre},{trabajador_nombre:worker.id},{todos_presentes:true}])assert.throws(()=>checkActionPermissions(worker,{tipo:'registrar_asistencia',proyecto_id:'p',...fields},'Marca mi asistencia'),e=>e.code==='ATTENDANCE_FORBIDDEN');
 assert.throws(()=>checkActionPermissions(worker,{tipo:'lote_acciones',acciones:[{tipo:'crear_bitacora',proyecto_id:'p',titulo:'Avance',nota:'Avance'},{tipo:'registrar_asistencia',proyecto_id:'p',trabajador_nombre:worker.nombre}]},'Registra mi asistencia y el avance'),e=>e.code==='ATTENDANCE_FORBIDDEN');
});

test('las mutaciones locales de asistencia rechazan al trabajador antes de crear, editar o eliminar filas',()=>{
 const service=isolatedState(worker,context,'pro_ia');const before=service.getAsistencias();
 for(const action of [()=>service.upsertAsistenciaObrero({...row,estado:'ausente'}),()=>service.deleteAsistencia(row.id),()=>service.marcarCuadrillaPresente('p','2026-11-12'),()=>service.ejecutarAccionGlobalIA({tipo:'registrar_asistencia',proyecto_id:'p',trabajador_nombre:worker.nombre})]) assert.throws(action,e=>e.code==='ATTENDANCE_FORBIDDEN');
 assert.deepEqual(service.getAsistencias(),before);
});

test('supervisor y jefe pueden corregir y eliminar; el responsable se toma del actor real',()=>{
 for(const rol of ['admin','supervisor']){
  const actor={id:'manager',empresa_id:'company',nombre:'Responsable Real',rol};
  const service=isolatedState(actor,{...context,usuarios:[actor,worker]},'pro_ia');
  const updated=service.upsertAsistenciaObrero({...row,estado:'atraso',registrado_por:'Otra persona'});
  assert.equal(updated.registrado_por,actor.nombre);assert.equal(updated.estado,'atraso');assert.equal(service.getAsistencias().length,1);
  assert.equal(service.deleteAsistencia(row.id),true);assert.equal(service.getAsistencias().length,0);
 }
});

test('las solicitudes chilenas de marcación se distinguen de la recepción de materiales',()=>{
 for(const text of ['Márcame presente en la obra','Registra mi entrada a las ocho','Corrige mi asistencia de ayer','Borra mi salida de hoy','Pon a la cuadrilla presente'])assert.equal(isAttendanceManagementRequest(text),true,text);
 assert.equal(isAttendanceManagementRequest('Registra la entrada de materiales al quincho'),false);
 assert.equal(isAttendanceManagementRequest('Guarda estas fotos del avance'),false);
});
