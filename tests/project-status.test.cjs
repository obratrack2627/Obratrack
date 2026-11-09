require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateAction } = require('../lib/ai/protocol.ts');
test('ObraBot acepta nuevos estados de obra y rechaza valores desconocidos', () => {
  for (const estado of ['pendiente', 'cancelada', 'activo', 'terminado', 'pausado']) {
    assert.equal(validateAction({ tipo: 'actualizar_proyecto', proyecto_id: 'p-a', estado }).estado, estado);
  }
  assert.throws(() => validateAction({ tipo: 'actualizar_proyecto', proyecto_id: 'p-a', estado: 'inexistente' }));
});
