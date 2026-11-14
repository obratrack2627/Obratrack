require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadWhatsAppContext, whatsappChildTables } = require('../lib/whatsapp/context-loader.ts');
const actor = { id: 'admin', empresa_id: 'company', rol: 'admin' };
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
function database({ plan = 'pro_ia', gates = {}, failure } = {}) {
  const events = [];
  const rows = {
    empresas: [{ id: 'company', plan_id: plan }],
    proyectos: [{ id: 'own', empresa_id: 'company' }, { id: 'foreign', empresa_id: 'other' }],
    clientes: [{ id: 'client', empresa_id: 'company' }, { id: 'other-client', empresa_id: 'other' }],
    agenda_eventos: [],
    whatsapp_mensajes: [{ id: 'history', empresa_id: 'company', actor_id: 'admin', created_at: '2026-11-13' }, { id: 'other-user', empresa_id: 'company', actor_id: 'other' }],
    ...Object.fromEntries([...whatsappChildTables, 'proyecto_trabajadores'].map(name => [name, [{ id: name, proyecto_id: 'own' }, { id: 'other-row', proyecto_id: 'foreign' }]])),
  };
  const sb = { from(table) {
    const predicates = [];
    const query = {
      select() { return query; },
      eq(key, value) { predicates.push(row => row[key] === value); return query; },
      in(key, values) { predicates.push(row => values.includes(row[key])); return query; },
      order() { return query; }, limit() { return query; },
      then(resolve, reject) {
        events.push(table);
        return (async () => {
          if (gates[table]) await gates[table].promise;
          if (failure === table) return { error: { message: 'database unavailable' } };
          return { data: (rows[table] || []).filter(row => predicates.every(test => test(row))) };
        })().then(resolve, reject);
      },
    };
    return query;
  }};
  return { sb, events, rows };
}
test('plan y proyectos se consultan en paralelo; el historial no espera las tablas de obra', async () => {
  const company = gate(), projects = gate();
  const db = database({ gates: { empresas: company, proyectos: projects } });
  const pending = loadWhatsAppContext(db.sb, actor, [actor]);
  await turn();
  assert.deepEqual(db.events, ['empresas', 'proyectos']);
  company.release();
  await turn();
  assert.ok(db.events.includes('whatsapp_mensajes'));
  assert.ok(!db.events.includes('actividades'));
  projects.release();
  const result = await pending;
  assert.deepEqual(result.tables.proyectos, [{ id: 'own', empresa_id: 'company' }]);
  assert.deepEqual(result.tables.clientes, [{ id: 'client', empresa_id: 'company' }]);
  assert.deepEqual(result.conversationRows.map(row => row.id), ['history']);
  for (const name of [...whatsappChildTables, 'proyecto_trabajadores']) assert.equal(result.tables[name].length, 1, name);
});
test('cada mensaje usa el plan actual y no carga historial cuando el canal no está habilitado', async () => {
  const db = database();
  assert.equal((await loadWhatsAppContext(db.sb, actor, [actor])).conversationRows.length, 1);
  db.rows.empresas[0].plan_id = 'gratis';
  db.events.length = 0;
  const result = await loadWhatsAppContext(db.sb, actor, [actor]);
  assert.equal(result.company.plan_id, 'gratis');
  assert.deepEqual(result.conversationRows, []);
  assert.ok(!db.events.includes('whatsapp_mensajes'));
});
test('un fallo de lectura nunca devuelve un contexto parcial al agente', async () => {
  for (const table of ['empresas', 'proyectos', 'pagos', 'whatsapp_mensajes']) {
    const db = database({ failure: table });
    await assert.rejects(loadWhatsAppContext(db.sb, actor, [actor]), error => error.code === 'WHATSAPP_DATABASE_READ');
  }
});
