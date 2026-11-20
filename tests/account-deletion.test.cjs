require('./helpers/typescript.cjs');
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const fixture = require('./helpers/supabase.cjs');

require.cache[require.resolve('../lib/supabase/client.ts')] = {
  id: require.resolve('../lib/supabase/client.ts'),
  filename: require.resolve('../lib/supabase/client.ts'),
  loaded: true,
  exports: fixture,
};
require('./helpers/browser.cjs')();

const { deleteAccountForUser, DEMO_EMPRESA_ID } = require('../lib/account-deletion.ts');
const server = require('../lib/ai/server.ts');
const { DELETE: deletePerfilRoute } = require('../app/api/perfil/route.ts');

const originalAuthorizeAI = server.authorizeAI;
const savedEnv = { ...process.env };
afterEach(() => {
  fixture.reset();
  server.authorizeAI = originalAuthorizeAI;
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
});

function buildAdminStub({ teamRows, subscriptionRow, bucketFiles, rpcResult }) {
  const removed = [];
  const deletedAuthIds = [];
  const rpcCalls = [];

  const admin = {
    from(table) {
      return {
        select() {
          return {
            eq() {
              if (table === 'usuarios') {
                return Promise.resolve({ data: teamRows, error: null });
              }
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: subscriptionRow, error: null }),
                  };
                },
                maybeSingle: async () => ({ data: subscriptionRow, error: null }),
              };
            },
          };
        },
        update() {
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: subscriptionRow ? { ...subscriptionRow, cancel_at_period_end: true } : null,
                  error: null,
                }),
              }),
            }),
          };
        },
      };
    },
    storage: {
      from(bucket) {
        return {
          async list(prefix) {
            const entries = bucketFiles[`${bucket}:${prefix}`] || [];
            return { data: entries, error: null };
          },
          async remove(paths) {
            removed.push({ bucket, paths });
            return { data: paths, error: null };
          },
        };
      },
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      return { data: rpcResult, error: null };
    },
    auth: {
      admin: {
        async deleteUser(uid) {
          deletedAuthIds.push(uid);
          return { data: {}, error: null };
        },
      },
    },
  };

  return { admin, removed, deletedAuthIds, rpcCalls };
}

test('deleteAccountForUser protege cuentas demo y cuentas dev', async () => {
  const { admin } = buildAdminStub({ teamRows: [], subscriptionRow: null, bucketFiles: {}, rpcResult: {} });

  await assert.rejects(
    () =>
      deleteAccountForUser({
        admin,
        user: { id: 'u-demo', empresa_id: DEMO_EMPRESA_ID, rol: 'admin', is_dev: false },
        flow: null,
      }),
    (err) => err.code === 'ACCOUNT_DELETE_PROTECTED' && err.status === 403,
  );

  await assert.rejects(
    () =>
      deleteAccountForUser({
        admin,
        user: { id: 'u-dev', empresa_id: 'emp-1', rol: 'admin', is_dev: true },
        flow: null,
      }),
    (err) => err.code === 'ACCOUNT_DELETE_PROTECTED' && err.status === 403,
  );
});

test('deleteAccountForUser como único admin cancela Flow, limpia Storage, borra empresa y elimina Auth users', async () => {
  const empresaId = 'emp-clean-1';
  const authAdminId = '11111111-1111-4111-a111-111111111111';
  const authWorkerId = '22222222-2222-4222-a222-222222222222';
  const flowCancelled = [];

  const { admin, removed, deletedAuthIds, rpcCalls } = buildAdminStub({
    teamRows: [
      { id: authAdminId, rol: 'admin' },
      { id: 'worker-1', rol: 'terreno' },
    ],
    subscriptionRow: {
      id: 'sub-1',
      estado: 'active',
      plan_id: 'pro_ia',
      cancel_at_period_end: false,
      gateway_subscription_id: 'sub_flow_999',
    },
    bucketFiles: {
      [`documentos-obra:${empresaId}`]: [{ name: 'p1', id: null }],
      [`documentos-obra:${empresaId}/p1`]: [{ name: 'factura.pdf', id: 'f1' }],
      [`bitacora-fotos:${empresaId}`]: [{ name: 'foto.jpg', id: 'f2' }],
      [`whatsapp-evidencias:${empresaId}`]: [],
    },
    rpcResult: {
      scope: 'company',
      empresa_id: empresaId,
      auth_user_ids: [authAdminId, authWorkerId],
    },
  });

  const flow = {
    async cancelSubscription(args) {
      flowCancelled.push(args);
      return {};
    },
  };

  const result = await deleteAccountForUser({
    admin,
    user: { id: authAdminId, empresa_id: empresaId, rol: 'admin', is_dev: false },
    flow,
  });

  assert.deepEqual(result, {
    scope: 'company',
    empresa_id: empresaId,
    deleted_auth_users: 2,
  });
  assert.deepEqual(flowCancelled, [{ subscriptionId: 'sub_flow_999', atPeriodEnd: true }]);
  assert.deepEqual(rpcCalls, [{ name: 'eliminar_cuenta_usuario', args: { p_usuario_id: authAdminId } }]);
  assert.deepEqual(deletedAuthIds, [authAdminId, authWorkerId]);
  assert.ok(removed.some((r) => r.bucket === 'documentos-obra' && r.paths.includes(`${empresaId}/p1/factura.pdf`)));
  assert.ok(removed.some((r) => r.bucket === 'bitacora-fotos' && r.paths.includes(`${empresaId}/foto.jpg`)));
  assert.ok(removed.some((r) => r.bucket === 'obratrack-cloud-db' && r.paths.includes(`ledgers/v2_${empresaId}.json`)));
});

test('deleteAccountForUser con otro admin activo solo elimina al usuario sin borrar la empresa ni cancelar suscripción', async () => {
  const empresaId = 'emp-multi-admin';
  const adminA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const adminB = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  let flowCalled = false;

  const { admin, removed, deletedAuthIds } = buildAdminStub({
    teamRows: [
      { id: adminA, rol: 'admin' },
      { id: adminB, rol: 'admin' },
    ],
    subscriptionRow: {
      id: 'sub-2',
      estado: 'active',
      plan_id: 'pro',
      cancel_at_period_end: false,
      gateway_subscription_id: 'sub_flow_123',
    },
    bucketFiles: {
      [`whatsapp-evidencias:${empresaId}/${adminA}`]: [{ name: 'evidencia.jpg', id: 'e1' }],
    },
    rpcResult: {
      scope: 'user',
      empresa_id: empresaId,
      auth_user_ids: [adminA],
    },
  });

  const result = await deleteAccountForUser({
    admin,
    user: { id: adminA, empresa_id: empresaId, rol: 'admin', is_dev: false },
    flow: {
      async cancelSubscription() {
        flowCalled = true;
        return {};
      },
    },
  });

  assert.equal(result.scope, 'user');
  assert.equal(flowCalled, false);
  assert.deepEqual(deletedAuthIds, [adminA]);
  assert.deepEqual(removed, [{ bucket: 'whatsapp-evidencias', paths: [`${empresaId}/${adminA}/evidencia.jpg`] }]);
});

test('DELETE /api/perfil exige escribir ELIMINAR antes de ejecutar el borrado', async () => {
  const uid = '33333333-3333-4333-a333-333333333333';
  server.authorizeAI = async () => ({
    client: fixture.supabase,
    user: { id: uid, empresa_id: 'emp-x', rol: 'admin', nombre: 'Admin', is_dev: false },
  });

  const req = new NextRequest('https://obratrack.test/api/perfil', {
    method: 'DELETE',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ confirmacion: 'borrar' }),
  });

  const res = await deletePerfilRoute(req);
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.code, 'ACCOUNT_DELETE_CONFIRM_REQUIRED');
});
