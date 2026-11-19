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

const { sanitizeLogData } = require('../lib/privacy/mask.ts');
const { contentSecurityPolicy } = require('../lib/security-csp.ts');
const { isAllowedPushEndpoint } = require('../lib/push/endpoint.ts');
const { buildPushPayload, sendPushIdempotent, resetCachedVapidForTest } = require('../lib/push/server.ts');
const { signStoredFile, signRows } = require('../lib/supabase/private-files.ts');
const {
  handleFlowPaymentCallback,
  cancelCompanySubscription,
  reconcileExpiredSubscriptions,
} = require('../lib/billing/service.ts');
const server = require('../lib/ai/server.ts');

const savedEnv = { ...process.env };
afterEach(() => {
  fixture.reset();
  resetCachedVapidForTest();
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
});

test('Bloque 3: sanitizeLogData redacta depth > 4 y claves sensibles compuestas', () => {
  const deep = { a: { b: { c: { d: { e: { secretLeak: '12.345.678-5' } } } } } };
  const sanitizedDeep = sanitizeLogData(deep);
  assert.equal(sanitizedDeep.a.b.c.d.e, '[REDACTED_DEPTH]');

  const compound = sanitizeLogData({
    access_token: 'abc',
    refreshToken: 'def',
    client_secret: 'ghi',
    flow_secret_key: 'jkl',
    apiKey: 'mno',
    service_role_key: 'pqr',
    private_key: 'stu',
    session_cookie: 'vwx',
    nombre: 'Juan Perez',
  });
  assert.equal(compound.access_token, '[REDACTED]');
  assert.equal(compound.refreshToken, '[REDACTED]');
  assert.equal(compound.client_secret, '[REDACTED]');
  assert.equal(compound.flow_secret_key, '[REDACTED]');
  assert.equal(compound.apiKey, '[REDACTED]');
  assert.equal(compound.service_role_key, '[REDACTED]');
  assert.equal(compound.private_key, '[REDACTED]');
  assert.equal(compound.session_cookie, '[REDACTED]');
  assert.equal(compound.nombre, 'Juan Perez');
});

test('Bloque 3: CSP script-src excluye wildcard *.googleapis.com manteniendo maps.googleapis.com', () => {
  const csp = contentSecurityPolicy('test-nonce-123', false);
  const scriptDirective = csp.split(';').map((s) => s.trim()).find((d) => d.startsWith('script-src '));
  assert.ok(scriptDirective);
  assert.equal(scriptDirective.includes('*.googleapis.com'), false);
  assert.equal(scriptDirective.includes('https://maps.googleapis.com'), true);
  assert.equal(scriptDirective.includes("'nonce-test-nonce-123'"), true);
});

test('Bloque 3: Push endpoint allowlist bloquea subdominios arbitrarios de googleapis.com y buildPushPayload bloquea //evil.com', () => {
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(isAllowedPushEndpoint('https://android.googleapis.com/gcm/send/abc'), true);
  assert.equal(isAllowedPushEndpoint('https://storage.googleapis.com/bucket/obj'), false);
  assert.equal(isAllowedPushEndpoint('https://www.googleapis.com/oauth2/v1/certs'), false);
  assert.equal(isAllowedPushEndpoint('https://wns2-bl2p.notify.windows.com/w/?token=1'), true);

  assert.equal(buildPushPayload({ title: 'A', body: 'B', url: '//evil.com/phish' }).url, '/dashboard');
  assert.equal(buildPushPayload({ title: 'A', body: 'B', url: '/\\evil.com' }).url, '/dashboard');
  assert.equal(buildPushPayload({ title: 'A', body: 'B', url: '/proyectos/p-1' }).url, '/proyectos/p-1');
});

test('Bloque 3: sendPushIdempotent realiza claim atómico previo al envío evitando carrera TOCTOU', async () => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';

  const claimedKeys = new Set();
  const subs = [
    { id: 's1', empresa_id: 'e1', usuario_id: 'u1', rol: 'admin', endpoint: 'https://fcm.googleapis.com/u1', p256dh: 'p', auth: 'a', activo: true, preferencias: {} },
  ];
  const sb = {
    from(table) {
      return {
        insert(row) {
          if (table === 'notificaciones_push_enviadas') {
            if (claimedKeys.has(row.dedup_key)) {
              return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } });
            }
            claimedKeys.add(row.dedup_key);
            return Promise.resolve({ data: [row], error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        update() { return this; },
        then(resolve) {
          return Promise.resolve({ data: table === 'push_suscripciones' ? subs : [], error: null }).then(resolve);
        },
      };
    },
  };

  let sentCount = 0;
  const sender = async () => { sentCount += 1; };

  const [r1, r2] = await Promise.all([
    sendPushIdempotent(sb, 'dedup-race-1', { empresaId: 'e1', payload: { title: 'T', body: 'B' } }, sender),
    sendPushIdempotent(sb, 'dedup-race-1', { empresaId: 'e1', payload: { title: 'T', body: 'B' } }, sender),
  ]);

  assert.equal(sentCount, 1);
  assert.equal([r1.skipped, r2.skipped].filter(Boolean).length, 1);
  assert.equal(r1.sent + r2.sent, 1);
});

test('Bloque 3: signStoredFile y signRows bloquean bypass cross-project en whatsapp-evidencias', async () => {
  const hash = 'c'.repeat(64);
  const path = `emp-1/admin-1/${hash}.jpg`;
  const ref = `whatsapp-evidencias:${path}`;
  const client = {
    storage: {
      from: () => ({
        createSignedUrl: async (p) => ({ data: { signedUrl: `https://signed.test/${p}` }, error: null }),
      }),
    },
  };

  // Adjunto pertenece a proj-B; terreno intenta firmarlo desde proj-A
  const validator = (p, projectId) => p === path && projectId === 'proj-B';
  assert.equal(await signStoredFile(ref, 'emp-1', new Set(['proj-A']), client, 'proj-A', validator), null);
  assert.equal(await signStoredFile(ref, 'emp-1', new Set(['proj-B']), client, 'proj-B', validator), `https://signed.test/${path}`);

  const [blocked] = await signRows(
    [{ id: 'row1', proyecto_id: 'proj-A', foto_url: ref }],
    ['foto_url'],
    'emp-1',
    new Set(['proj-A']),
    client,
    validator,
  );
  assert.equal(blocked.foto_url, null);
});

test('Bloque 3: POST /api/whatsapp/estado y /api/whatsapp/plantilla exigen is_dev === true', async () => {
  let isDev = false;
  server.authorizeAI = async () => ({
    client: fixture.supabase,
    user: { id: 'u-admin', empresa_id: 'emp-1', rol: 'admin', is_dev: isDev, nombre: 'Admin' },
  });

  const estadoRoute = require('../app/api/whatsapp/estado/route.ts');
  const plantillaRoute = require('../app/api/whatsapp/plantilla/route.ts');

  const deniedEstado = await estadoRoute.POST(new NextRequest('https://example.test/api/whatsapp/estado', { method: 'POST' }));
  assert.equal(deniedEstado.status, 403);

  const deniedPlantilla = await plantillaRoute.POST(new NextRequest('https://example.test/api/whatsapp/plantilla', { method: 'POST' }));
  assert.equal(deniedPlantilla.status, 403);
});

test('Bloque 3: /auth/callback reenvía PKCE code y recovery token_hash sin exponer access_token en Location', async () => {
  const callbackRoute = require('../app/auth/callback/route.ts');

  const pkceRes = await callbackRoute.GET(
    new NextRequest('https://obratrack.test/auth/callback?code=pkce-123&next=/actualizar-password'),
  );
  assert.equal(pkceRes.status, 307);
  const pkceLoc = pkceRes.headers.get('location') || '';
  assert.equal(pkceLoc, 'https://obratrack.test/actualizar-password?code=pkce-123');
  assert.equal(pkceLoc.includes('access_token'), false);

  const recRes = await callbackRoute.GET(
    new NextRequest('https://obratrack.test/auth/callback?token_hash=th-xyz&type=recovery'),
  );
  assert.equal(recRes.status, 307);
  const recLoc = recRes.headers.get('location') || '';
  assert.equal(recLoc, 'https://obratrack.test/actualizar-password?token_hash=th-xyz&type=recovery');
  assert.equal(recLoc.includes('access_token'), false);
  assert.equal(recLoc.includes('refresh_token'), false);
});

test('Bloque 3: /api/auth/login-rut bloquea cross-origin y no permite enumerar RUTs', async () => {
  const loginRutRoute = require('../app/api/auth/login-rut/route.ts');

  const crossOrigin = await loginRutRoute.POST(
    new NextRequest('https://obratrack.test/api/auth/login-rut', {
      method: 'POST',
      headers: { origin: 'https://evil.test', host: 'obratrack.test', 'content-type': 'application/json' },
      body: JSON.stringify({ rut: '12.345.678-5', password: 'secret' }),
    }),
  );
  assert.equal(crossOrigin.status, 403);

  const badInput = await loginRutRoute.POST(
    new NextRequest('https://obratrack.test/api/auth/login-rut', {
      method: 'POST',
      headers: { host: 'obratrack.test', 'content-type': 'application/json' },
      body: JSON.stringify({ rut: '123', password: 'secret' }),
    }),
  );
  assert.equal(badInput.status, 401);
});

test('Bloque 3: billing rechaza wildcards ILIKE en renovaciones, exige flow para cancelar y expira recurrentes estancadas tras gracia', async () => {
  const users = [
    { id: 'u1', empresa_id: 'emp-1', email: 'contacto@otra.cl', email_acceso: 'jefe@norte.cl', rol: 'admin' },
  ];
  const subs = [
    {
      id: 'sub-rec',
      empresa_id: 'emp-1',
      plan_id: 'pro',
      ciclo: 'mensual',
      modalidad: 'recurrente',
      estado: 'active',
      cancel_at_period_end: false,
      gateway_subscription_id: 'sus_1',
      gateway_customer_id: 'cus_1',
      current_period_end: '2026-11-10T00:00:00.000Z',
    },
  ];
  const empresas = [{ id: 'emp-1', plan_id: 'pro' }];

  const admin = {
    from(table) {
      const filters = [];
      let op = 'select';
      let patch = null;
      const rowsRef = () => (table === 'usuarios' ? users : table === 'suscripciones' ? subs : table === 'empresas' ? empresas : []);
      const match = (r) => filters.every((f) => {
        if (f.t === 'eq') return r[f.c] === f.v;
        if (f.t === 'ilike') return String(r[f.c] || '').toLowerCase() === String(f.v).toLowerCase();
        if (f.t === 'in') return f.v.includes(r[f.c]);
        if (f.t === 'lte') return r[f.c] != null && String(r[f.c]) <= String(f.v);
        return true;
      });
      const exec = (single) => {
        const list = rowsRef();
        if (op === 'update') {
          for (const r of list) if (match(r)) Object.assign(r, patch);
          return Promise.resolve({ data: null, error: null });
        }
        const matched = list.filter(match);
        return Promise.resolve({ data: single ? matched[0] || null : matched, error: null });
      };
      const b = {
        select() { return b; },
        update(p) { op = 'update'; patch = p; return b; },
        eq(c, v) { filters.push({ t: 'eq', c, v }); return b; },
        ilike(c, v) { filters.push({ t: 'ilike', c, v }); return b; },
        in(c, v) { filters.push({ t: 'in', c, v }); return b; },
        lte(c, v) { filters.push({ t: 'lte', c, v }); return b; },
        order() { return b; },
        limit() { return b; },
        maybeSingle() { return exec(true); },
        single() { return exec(true); },
        then(res, rej) { return exec(false).then(res, rej); },
      };
      return b;
    },
    async rpc() {
      return { data: { outcome: 'paid' }, error: null };
    },
  };

  // Wildcard email no debe matchear la empresa
  const wildcardRes = await handleFlowPaymentCallback({
    admin,
    flow: {
      getPaymentStatus: async () => ({ flowOrder: 1, commerceOrder: 'INV-1', status: 2, amount: 12990, payer: '%@norte.cl' }),
      getSubscription: async () => ({ subscriptionId: 'sus_1', customerId: 'cus_1', planId: 'ot_pro_12990', status: 1 }),
    },
    token: 'tok-wild',
  });
  assert.equal(wildcardRes.outcome, 'unmatched');

  // Renovación usando email_acceso sigue funcionando aunque usuarios.email haya sido cambiado en /api/perfil
  const accessEmailRes = await handleFlowPaymentCallback({
    admin,
    flow: {
      getPaymentStatus: async () => ({ flowOrder: 2, commerceOrder: 'INV-2', status: 2, amount: 12990, payer: 'jefe@norte.cl' }),
      getSubscription: async () => ({ subscriptionId: 'sus_1', customerId: 'cus_1', planId: 'ot_pro_12990', status: 1 }),
    },
    token: 'tok-access',
  });
  assert.equal(accessEmailRes.outcome, 'paid');

  // cancelCompanySubscription con gateway_subscription_id y flow === null debe fallar 503
  await assert.rejects(
    cancelCompanySubscription({
      admin,
      flow: null,
      actor: { id: 'u1', empresa_id: 'emp-1', rol: 'admin', nombre: 'Admin' },
    }),
    (e) => e.status === 503 && e.code === 'BILLING_NOT_CONFIGURED',
  );

  // Dentro de la ventana de gracia de 3 días (1 día vencido) NO degrada todavía
  const withinGrace = await reconcileExpiredSubscriptions(admin, new Date('2026-11-11T00:00:00.000Z'));
  assert.equal(withinGrace.downgraded, 0);
  assert.equal(empresas[0].plan_id, 'pro');

  // Pasados 3 días de gracia (4 días vencido) sí expira y degrada a gratis
  const pastGrace = await reconcileExpiredSubscriptions(admin, new Date('2026-11-14T00:00:00.000Z'));
  assert.equal(pastGrace.downgraded, 1);
  assert.equal(empresas[0].plan_id, 'gratis');
  assert.equal(subs[0].estado, 'expired');
});
