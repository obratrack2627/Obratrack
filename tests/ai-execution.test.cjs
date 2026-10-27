require('./helpers/typescript.cjs');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./helpers/supabase.cjs');
require.cache[require.resolve('../lib/supabase/client.ts')] = {
  id: require.resolve('../lib/supabase/client.ts'),
  filename: require.resolve('../lib/supabase/client.ts'),
  loaded: true,
  exports: fixture,
};
require('./helpers/browser.cjs')();
const { dataService } = require('../lib/data-service.ts');
const { executeAI, retryAIWrite } = require('../lib/ai/execute.ts');
const active = {
  id: 'owner',
  auth_user_id: 'owner',
  empresa_id: 'test-company',
  nombre: 'Contratista',
  email: 'owner@example.test',
  rol: 'admin',
  telefono_whatsapp: '',
};
beforeEach(() => {
  fixture.reset();
  localStorage.clear();
  localStorage.setItem('obratrack_active_user_v7', JSON.stringify(active));
  localStorage.setItem(
    'obratrack_active_plan_v7_test-company',
    JSON.stringify('pro'),
  );
});
const project = {
  tipo: 'crear_proyecto',
  nombre: 'Terraza',
  comuna: 'Maipú',
  monto: 3000000,
  dias: 10,
  cliente_nombre: 'Cliente nuevo',
  partidas: [
    { nombre: 'Fundaciones', dias: 2 },
    { nombre: 'Estructura', dias: 3 },
  ],
  materiales: [
    { nombre: 'Cemento', cantidad: 10, precio_unitario: 5000 },
    { nombre: 'Madera', cantidad: 15, precio_unitario: 8000 },
  ],
  trabajadores_nombres: ['Maestro A', 'Maestro B'],
};
test('crea obra, cliente, partidas, materiales y cuadrilla con IDs únicos y guarda cada entidad', async () => {
  const result = await executeAI(project);
  assert.ok(result.result);
  assert.equal(result.pendingId, undefined);
  assert.equal(dataService.getProyectos().length, 1);
  assert.equal(fixture.tables.get('proyectos').length, 1);
  assert.equal(fixture.tables.get('clientes').length, 1);
  assert.equal(fixture.tables.get('actividades').length, 2);
  assert.equal(
    new Set(fixture.tables.get('actividades').map((a) => a.id)).size,
    2,
  );
  assert.equal(fixture.tables.get('materiales_proyecto').length, 2);
  assert.equal(fixture.tables.get('proyecto_trabajadores').length, 2);
  assert.equal(fixture.tables.get('usuarios').length, 2);
  assert.equal(fixture.tables.get('usuarios')[0].rut, null);
  assert.equal(fixture.tables.get('usuarios')[0].email, null);
  const tables = fixture.calls
    .filter((x) => x.mode === 'upsert')
    .map((x) => x.table);
  assert.ok(tables.indexOf('clientes') < tables.indexOf('proyectos'));
  assert.ok(tables.indexOf('proyectos') < tables.indexOf('actividades'));
});
test('valida todo el lote antes del primer efecto local o remoto', async () => {
  await assert.rejects(
    executeAI([
      { tipo: 'crear_cliente', nombre: 'No debe crearse' },
      { tipo: 'registrar_pago', proyecto_nombre: 'Inexistente', monto: 100 },
    ]),
    /No se encontró/,
  );
  assert.equal(dataService.getClientes().length, 0);
  assert.equal(fixture.calls.length, 0);
});
test('un error de plan a mitad del lote revierte los cambios locales sin escribir en Supabase', async () => {
  localStorage.setItem(
    'obratrack_active_plan_v7_test-company',
    JSON.stringify('gratis'),
  );
  await assert.rejects(
    executeAI([
      { ...project, nombre: 'Obra 1' },
      { ...project, nombre: 'Obra 2' },
    ]),
    /Límite/,
  );
  assert.equal(dataService.getProyectos().length, 0);
  assert.equal(dataService.getClientes().length, 0);
  assert.equal(fixture.calls.length, 0);
});
test('pago fallido queda pendiente y reintentar no duplica el abono', async () => {
  await executeAI(project);
  fixture.fail('pagos');
  const result = await executeAI({
    tipo: 'registrar_pago',
    proyecto_nombre: 'Terraza',
    monto: 250000,
    metodo: 'transferencia',
    nota: 'Anticipo',
    fecha: '2026-10-27',
  });
  assert.equal(result.result, undefined);
  assert.ok(result.pendingId);
  assert.match(result.warning, /pendiente/);
  assert.equal(dataService.getPagos().length, 1);
  await retryAIWrite(result.pendingId);
  assert.equal(fixture.tables.get('pagos').length, 1);
  assert.equal(fixture.tables.get('pagos')[0].notas, 'Anticipo');
  assert.equal(fixture.tables.get('pagos')[0].fecha, '2026-10-27');
  assert.equal(dataService.getPagos().length, 1);
});
test('actualiza avance, asistencia, adicionales, documentos y agenda en la obra indicada', async () => {
  await executeAI(project);
  await executeAI([
    {
      tipo: 'actualizar_avance',
      proyecto_nombre: 'Terraza',
      nombre: 'Fundaciones',
      porcentaje_avance: 50,
    },
    {
      tipo: 'registrar_asistencia',
      proyecto_nombre: 'Terraza',
      trabajador_nombre: 'Maestro A',
      estado: 'presente',
      fecha: '2026-10-27',
      hora_entrada: '08:00',
      hora_salida: '17:00',
    },
    {
      tipo: 'crear_solicitud_cambio',
      proyecto_nombre: 'Terraza',
      titulo: 'Techo',
      descripcion: 'Techar terraza',
      monto: 500000,
      dias: 0,
    },
    {
      tipo: 'registrar_documento',
      proyecto_nombre: 'Terraza',
      nombre: 'Acuerdo techo',
      categoria: 'correo',
      correo_asunto: 'Aprobación',
    },
    {
      tipo: 'agendar_visita',
      titulo: 'Visita',
      fecha: '2026-10-28',
      hora: '10:00',
    },
  ]);
  assert.equal(
    fixture.tables.get('actividades').find((a) => a.nombre === 'Fundaciones')
      .porcentaje_avance,
    50,
  );
  assert.equal(fixture.tables.get('asistencia_obreros').length, 1);
  assert.equal(fixture.tables.get('reclamos_cambios_obra').length, 1);
  assert.equal(fixture.tables.get('documentos_obra').length, 1);
  assert.equal(fixture.tables.get('agenda_eventos').length, 1);
});
test('actualización a monto cero respeta el valor y no cambia otra obra', async () => {
  await executeAI(project);
  await executeAI({ ...project, nombre: 'Casa' });
  await executeAI({
    tipo: 'actualizar_proyecto',
    proyecto_nombre: 'Terraza',
    monto_cotizado: 0,
  });
  assert.equal(
    dataService.getProyectos().find((p) => p.nombre === 'Terraza')
      .monto_cotizado,
    0,
  );
  assert.equal(
    dataService.getProyectos().find((p) => p.nombre === 'Casa').monto_cotizado,
    3000000,
  );
});
test('IDs de clientes y actividades prevalecen sobre coincidencias parciales de nombre', async () => {
  dataService.runLocalAI(() => {
    dataService.createCliente({ nombre: 'Juan Pérez Hijo', email: '', telefono: '' });
    dataService.createCliente({ nombre: 'Juan Pérez', email: '', telefono: '' });
  });
  const target = dataService.getClientes().find(c => c.nombre === 'Juan Pérez');
  await executeAI({ tipo: 'actualizar_cliente', cliente_id: target.id, telefono: '+56912345678' });
  assert.equal(dataService.getClientes().find(c => c.nombre === 'Juan Pérez Hijo').telefono, '');
  assert.equal(dataService.getClienteById(target.id).telefono, '+56912345678');
  await executeAI({ ...project, partidas: [{ nombre: 'Fundaciones terraza', dias: 2 }, { nombre: 'Fundaciones', dias: 1 }] });
  await executeAI({ tipo: 'actualizar_avance', proyecto_nombre: 'Terraza', nombre: 'Fundaciones', porcentaje_avance: 80 });
  assert.equal(dataService.getActividades().find(a => a.nombre === 'Fundaciones').porcentaje_avance, 80);
  assert.equal(dataService.getActividades().find(a => a.nombre === 'Fundaciones terraza').porcentaje_avance, 0);
});
