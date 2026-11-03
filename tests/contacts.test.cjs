require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isolatedState, planWhatsAppActions } = require('../lib/whatsapp/state.ts');
const { validateAction } = require('../lib/ai/protocol.ts');
const { prepareActionPlan } = require('../lib/ai/actions.ts');
const { checkActionPermissions } = require('../lib/ai/permissions.ts');
const admin = { id: 'admin', empresa_id: 'a', auth_user_id: 'auth-admin', nombre: 'Dueña', rol: 'admin', email: 'duena@empresa.cl', telefono_whatsapp: '+56911112222', is_dev: false };
const supervisor = { id: 'sup', empresa_id: 'a', auth_user_id: 'auth-sup', nombre: 'Jorge', rol: 'supervisor', email: 'jorge@empresa.cl', telefono_whatsapp: '+56922223333' };
const client = { id: 'cli', empresa_id: 'a', nombre: 'Cliente anterior', email: 'cliente@empresa.cl', telefono: '+56933334444', direccion: 'Av. Central 1', comuna: 'Maipú' };
const context = () => ({ usuarios: [{...admin}, {...supervisor}], clientes: [{...client}], proyectos: [], actividades: [] });

test('administrador y supervisor editan fichas de usuarios autenticados sin cambiar roles ni acceso', () => {
  for (const actor of [admin, supervisor]) {
    const service = isolatedState(actor, context(), 'pro_ia');
    const action = { tipo: 'actualizar_trabajador', usuario_id: admin.id, nuevo_nombre: 'Dueña corregida', email: 'CONTACTO@EMPRESA.CL', telefono: '948743041' };
    checkActionPermissions(actor, action, 'Actualiza los datos de la dueña');
    const plan = planWhatsAppActions(service, action);
    assert.equal(plan.changed.usuarios.length, 1);
    const row = plan.changed.usuarios[0];
    assert.equal(row.nombre, 'Dueña corregida');
    assert.equal(row.email, 'contacto@empresa.cl');
    assert.equal(row.telefono_whatsapp, '+56948743041');
    assert.equal(row.auth_user_id, 'auth-admin');
    assert.equal(row.rol, 'admin');
    assert.equal(row.empresa_id, 'a');
    assert.equal(row._contacto_anterior.nombre, 'Dueña');
    assert.match(plan.result.resultado_texto, /Correo de contacto/);
    assert.match(plan.result.resultado_texto, /inicio de sesión se conserva/);
  }
});
test('corregir cliente preserva teléfono y permite nombre, dirección, comuna y RUT', () => {
  const service = isolatedState(admin, context(), 'pro_ia');
  const plan = planWhatsAppActions(service, { tipo: 'actualizar_cliente', cliente_id: client.id, nuevo_nombre: 'Nombre corregido', direccion: 'Av. Nueva 100', comuna: 'La Florida', rut: '12.345.678-5' });
  const row = plan.changed.clientes[0];
  assert.equal(row.nombre, 'Nombre corregido');
  assert.equal(row.rut, '12345678-5');
  assert.equal(row.comuna, 'La Florida');
  assert.equal(row.email, client.email);
  assert.equal(row.telefono, client.telefono);
  assert.equal(row.empresa_id, 'a');
  assert.equal(plan.changed.usuarios.length, 0);
});
test('quitar un dato opcional no elimina otros campos del integrante', () => {
  const service = isolatedState(admin, context(), 'pro_ia');
  const plan = planWhatsAppActions(service, { tipo: 'actualizar_trabajador', usuario_id: supervisor.id, email: '' });
  assert.equal(plan.changed.usuarios[0].email, null);
  assert.equal(plan.changed.usuarios[0].telefono_whatsapp, supervisor.telefono_whatsapp);
});
test('el contrato rechaza contactos inválidos, cambios vacíos y campos de seguridad', () => {
  for (const fields of [{}, {email:'no-es-correo'}, {email:'a@b'}, {telefono:'123'}, {rut:'12.345.678-9'}, {nuevo_nombre:''}, {email:12}, {email:'a@b.cl',rol:'admin'}, {email:'a@b.cl',auth_user_id:'otra'}, {telefono:'912345678',is_dev:true}])
    assert.throws(() => validateAction({ tipo:'actualizar_trabajador',usuario_id:'sup',...fields }));
});
test('homónimos y usuarios de otra empresa no se seleccionan por aproximación', () => {
  const ctx=context(); ctx.usuarios.push({...supervisor,id:'sup2'});
  assert.throws(() => prepareActionPlan({tipo:'actualizar_trabajador',trabajador_nombre:'Jorge',email:'nuevo@empresa.cl'},ctx), /más de una coincidencia/);
  assert.throws(() => prepareActionPlan({tipo:'actualizar_trabajador',usuario_id:'de-otra-empresa',email:'nuevo@empresa.cl'},context()), /No se encontró/);
});
test('teléfonos y correos de otros integrantes y direcciones reservadas se rechazan', () => {
  for (const fields of [{telefono:'9 1111 2222'}, {email:admin.email}, {email:'obratrack2627@gmail.com'}])
    assert.throws(() => prepareActionPlan({tipo:'actualizar_trabajador',usuario_id:'sup',...fields},context()), /vinculado|reservado/);
});
test('prevalidar un lote no altera las entidades originales y detecta colisiones entre cambios', () => {
  const ctx=context();
  assert.throws(() => prepareActionPlan([
    {tipo:'actualizar_cliente',cliente_id:'cli',nuevo_nombre:'No guardar'},
    {tipo:'actualizar_trabajador',usuario_id:'sup',email:admin.email},
  ],ctx));
  assert.equal(ctx.clientes[0].nombre, client.nombre);
  assert.throws(() => prepareActionPlan([
    {tipo:'actualizar_trabajador',usuario_id:'sup',telefono:'955556666'},
    {tipo:'actualizar_trabajador',usuario_id:'admin',telefono:'+56955556666'},
  ],context()), /vinculado/);
});
test('terreno y roles desconocidos no editan fichas, ni siquiera las propias', () => {
  for (const rol of ['terreno','inventado'])
    assert.throws(() => checkActionPermissions({...admin,rol},{tipo:'actualizar_trabajador',usuario_id:'admin',email:'a@empresa.cl'},'Actualiza mi correo'), /perfil|permisos/);
});
