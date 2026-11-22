require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleDestinationTurn, isDestinationContinuation, rememberQuoteDestination } = require('../lib/obrabot/quote-destination.ts');
const { quoteWhatsAppTurn } = require('../lib/obrabot/whatsapp.ts');

const actor = { id: 'admin', empresa_id: 'empresa', rol: 'admin' };
const quote = 'e234caf9-cfb2-47cd-8c04-9c6f8fbfb5a2';
const proyecto = 'proyecto-01';
const vista = { proyecto_id: proyecto, obra: 'Quincho Maipú', tiene_presupuesto: true, monto_cotizacion: 119000, monto_anterior: 220000, monto_reemplazo: 139000, monto_adicional: 339000, version: '3', cabecera: 'presupuesto-01' };

function fixture(handler = () => ({})) {
  const stored = new Map();
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = {};
      let deleting = false;
      const key = row => JSON.stringify([row.empresa_id, row.actor_id, row.canal]);
      return {
        select() { return this; },
        eq(name, value) { filters[name] = value; return this; },
        neq() { return this; },
        order() { return this; },
        delete() { deleting = true; return this; },
        then(resolve) {
          assert.equal(table, 'obrabot_destino_conversacion');
          assert.equal(deleting, true);
          stored.delete(key(filters));
          return Promise.resolve({}).then(resolve);
        },
        async range() {
          assert.equal(table, 'proyectos');
          assert.equal(filters.empresa_id, actor.empresa_id);
          return { data: [{ id: proyecto, nombre: vista.obra }] };
        },
        async upsert(row) {
          assert.equal(table, 'obrabot_destino_conversacion');
          assert.ok(!JSON.stringify(row).includes('persona@example.test'));
          stored.set(key(row), row);
          return {};
        },
        async maybeSingle() {
          assert.equal(table, 'obrabot_destino_conversacion');
          return { data: stored.get(key(filters)) || null };
        },
      };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'aplicar_lote_copiloto') return { data: { message_id: args.p_id, respuesta: args.p_respuesta, acciones: args.p_acciones } };
      assert.equal(args.p_empresa, actor.empresa_id);
      return handler(name, args);
    },
  };
}

test('WhatsApp retoma la aprobación, pide el cliente nuevo y permite asignar el equipo por audio', async () => {
  const db = fixture((name, args) => {
    if (name === 'obrabot_equipo_cotizacion') {
      assert.deepEqual(args.p_equipo, ['Ana Pérez']);
      assert.equal(args.p_proyecto, proyecto);
      return { data: { equipo: ['Ana Pérez'], equipo_pendiente: [] } };
    }
    assert.equal(args.p_id, quote);
    assert.equal(args.p_modo, 'crear');
    if (!args.p_datos.correo) return { error: { message: 'OBRABOT_CLIENT_REQUIRED' } };
    assert.deepEqual(args.p_datos, { direccion: 'Av. Las Palmas 123', cliente: 'Consuelo Díaz', telefono: '912345678', correo: 'persona@example.test' });
    return { data: { modo: 'crear', obra: vista.obra, proyecto_id: proyecto, monto_nuevo: 119000, equipo: [], equipo_pendiente: [] } };
  });
  const media = async () => { throw new Error('El audio ya está transcrito.'); };
  const send = async (id, text, audio = false) => {
    const message = audio ? { id, type: 'audio', from: '56912345678' } : { id, type: 'text', text: { body: text }, from: '56912345678' };
    return quoteWhatsAppTurn(db, actor, message, [message], media, audio ? text : undefined);
  };
  await rememberQuoteDestination(db, actor, 'whatsapp', quote);
  assert.match((await send('1', 'Crear obra')).respuesta, /dirección y el cliente/);
  assert.match((await send('2', 'Dirección: Av. Las Palmas 123\nCliente: Consuelo Díaz')).respuesta, /cliente nuevo/);
  const created = await send('3', 'Teléfono: 912345678\nCorreo: persona@example.test');
  assert.match(created.respuesta, /119\.000.*IVA/);
  assert.match(created.respuesta, /¿Quieres asignar trabajadores/);
  assert.equal(created.acciones.proyecto_contexto_id, proyecto);
  assert.equal(created.acciones.archivo_cotizacion, undefined);
  assert.match((await send('4', 'Asigna a Ana Pérez.', true)).respuesta, /Equipo asignado.*Ana Pérez/);
  assert.equal(db.calls.filter(call => call.name === 'aplicar_lote_copiloto').some(call => call.args.p_texto.includes('@')), false);
  assert.equal(await send('5', 'Hola'), null);
});

test('vincular muestra el total, exige una opción explícita y refresca una confirmación antigua', async () => {
  let stale = true;
  const db = fixture((_name, args) => {
    if (args.p_modo === 'estado') return { data: { cotizacion: 'Quincho', monto_cotizacion: 119000 } };
    if (args.p_modo === 'vista') return { data: { ...vista, version: stale ? '3' : '4' } };
    assert.equal(args.p_modo, 'reemplazar');
    assert.equal(args.p_datos.version, stale ? '3' : '4');
    if (stale) {
      stale = false;
      return { error: { message: 'OBRABOT_DESTINATION_STALE' } };
    }
    return { data: { modo: 'reemplazar', obra: vista.obra, proyecto_id: proyecto, monto_nuevo: 139000, equipo: [], equipo_pendiente: [] } };
  });
  const turn = text => handleDestinationTurn(db, actor, 'plataforma', text);
  assert.match((await turn(`Vincula cotización ${quote} a la obra Quincho Maipu`)).respuesta, /139\.000/);
  assert.match((await turn('Sí')).respuesta, /Responde con la opción/);
  assert.equal(db.calls.length, 2);
  assert.match((await turn('Reemplazar')).respuesta, /obra cambió/);
  assert.match((await turn('Reemplazar')).respuesta, /guardé el anterior/);
  assert.equal(await turn('Reemplazar'), null);
});

test('la selección no cruza canales y una respuesta a una cotización anterior no usa el contexto activo', async () => {
  const db = fixture();
  await rememberQuoteDestination(db, actor, 'whatsapp', quote);
  assert.equal(await handleDestinationTurn(db, actor, 'plataforma', 'Crear obra'), null);
  assert.equal(await handleDestinationTurn(db, actor, 'whatsapp', 'Crea la obra con esa cotización', null), null);
  assert.deepEqual(db.calls, []);
  assert.equal(isDestinationContinuation('Crear obra\nDirección: Av. Principal 321\nCliente: Mario Rojas'), true);
  await assert.rejects(handleDestinationTurn(db, { ...actor, rol: 'supervisor' }, 'whatsapp', `Crea obra con cotización ${quote}`), { status: 403 });
});
