require('./helpers/typescript.cjs');const {test}=require('node:test');const assert=require('node:assert/strict');
const {formatDate}=require('../lib/utils.ts');
test('fechas de presupuestos y fechas civiles se presentan en Chile sin mostrar el timestamp técnico',()=>{
 assert.equal(formatDate('2026-11-09T01:00:00Z'),formatDate('2026-11-08'));
 assert.equal(formatDate('2026-11-09T15:00:00Z'),formatDate('2026-11-09'));
 assert.doesNotMatch(formatDate('2026-11-09T15:00:00Z'),/T15|:00|Z/);
});
