require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const adminPath = require.resolve('../lib/supabase/admin.ts');
require.cache[adminPath] = { id: adminPath, loaded: true, exports: { getSupabaseAdmin: () => null } };
const { POST } = require('../app/api/auth/validar-registro/route.ts');
const payload = { nombre: 'Constructor Independiente', rut: '12.345.678-5', email: 'constructor@gmail.com', telefono: '+56987654321' };
function request(origin, body = payload) {
  return new NextRequest('http://0.0.0.0:3000/api/auth/validar-registro', {
    method: 'POST',
    headers: { host: 'localhost:3000', origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
test('prevalidación acepta registro con RUT, correo real y teléfono con host público distinto del interno', async () => {
  const response = await POST(request('http://localhost:3000'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});
test('prevalidación rechaza orígenes ajenos, RUT faltante/inválido, correo temporal y teléfono inválido', async () => {
  assert.equal((await POST(request('http://otro.example'))).status, 403);
  assert.equal((await POST(request('http://localhost:3000', { ...payload, rut: '' }))).status, 400);
  assert.equal((await POST(request('http://localhost:3000', { ...payload, rut: '12.345.678-9' }))).status, 400);
  assert.equal((await POST(request('http://localhost:3000', { ...payload, email: 'test@yopmail.com' }))).status, 400);
  assert.equal((await POST(request('http://localhost:3000', { ...payload, telefono: '+56 9 ' }))).status, 400);
});
