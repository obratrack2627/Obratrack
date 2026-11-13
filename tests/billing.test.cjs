require('./helpers/typescript.cjs');
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');

const { getPlanPricing, isPaidPlanId } = require('../lib/plans.ts');
const { requireSupabaseAdmin, getSupabaseAdmin } = require('../lib/supabase/admin.ts');
const {
  signFlowParams,
  resolveFlowBaseUrl,
  createFlowGateway,
} = require('../lib/billing/flow.ts');
const {
  buildFlowPlanId,
  parseFlowPlanId,
  createBillingCheckout,
  handleFlowRegisterReturn,
  handleFlowPaymentCallback,
  cancelCompanySubscription,
  reconcileExpiredSubscriptions,
} = require('../lib/billing/service.ts');
const { middleware } = require('../middleware.ts');

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  global.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

function createInMemoryBillingDb(seed = {}) {
  const db = {
    empresas: seed.empresas ? structuredClone(seed.empresas) : [
      { id: 'emp-1', nombre: 'Constructora Norte SpA', plan_id: 'gratis', updated_at: '2026-01-01T00:00:00.000Z' },
    ],
    usuarios: seed.usuarios ? structuredClone(seed.usuarios) : [
      { id: 'u-admin', empresa_id: 'emp-1', email: 'jefe@norte.cl', nombre: 'Pedro Jefe', rol: 'admin', is_dev: false },
    ],
    suscripciones: seed.suscripciones ? structuredClone(seed.suscripciones) : [],
    pagos_suscripcion: seed.pagos_suscripcion ? structuredClone(seed.pagos_suscripcion) : [],
    billing_webhook_events: [],
  };

  let seq = 1;
  const makeBuilder = (table) => {
    const state = {
      op: 'select',
      payload: null,
      upsertOpts: null,
      filters: [],
      orderBy: null,
      maxRows: null,
    };

    const matches = (row) =>
      state.filters.every((f) => {
        const val = row[f.col];
        if (f.type === 'eq') return val === f.val;
        if (f.type === 'ilike') return String(val || '').toLowerCase() === String(f.val).toLowerCase();
        if (f.type === 'in') return f.vals.includes(val);
        if (f.type === 'lte') return val != null && String(val) <= String(f.val);
        return true;
      });

    const execute = (mode = 'many') => {
      const rows = db[table];
      if (!rows) return { data: null, error: { message: `Unknown table ${table}` } };

      if (state.op === 'insert') {
        const items = Array.isArray(state.payload) ? state.payload : [state.payload];
        const inserted = [];
        for (const item of items) {
          if (table === 'billing_webhook_events' && rows.some((r) => r.event_key === item.event_key)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value' } };
          }
          const copy = {
            id: item.id || `${table}-${seq++}`,
            created_at: new Date().toISOString(),
            ...structuredClone(item),
          };
          rows.push(copy);
          inserted.push(copy);
        }
        return { data: mode === 'single' ? inserted[0] : inserted, error: null };
      }

      if (state.op === 'upsert') {
        const key = state.upsertOpts?.onConflict || 'id';
        const item = structuredClone(state.payload);
        const idx = rows.findIndex((r) => r[key] === item[key]);
        let saved;
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...item };
          saved = rows[idx];
        } else {
          saved = { id: item.id || `${table}-${seq++}`, created_at: new Date().toISOString(), ...item };
          rows.push(saved);
        }
        return { data: mode === 'single' ? saved : [saved], error: null };
      }

      if (state.op === 'update') {
        const updated = [];
        for (let i = 0; i < rows.length; i++) {
          if (matches(rows[i])) {
            rows[i] = { ...rows[i], ...structuredClone(state.payload) };
            updated.push(rows[i]);
          }
        }
        return {
          data: mode === 'single' || mode === 'maybeSingle' ? updated[0] ?? null : updated,
          error: null,
        };
      }

      let result = rows.filter(matches);
      if (state.orderBy) {
        const { col, ascending } = state.orderBy;
        result = [...result].sort((a, b) =>
          ascending ? String(a[col]).localeCompare(String(b[col])) : String(b[col]).localeCompare(String(a[col]))
        );
      }
      if (state.maxRows != null) result = result.slice(0, state.maxRows);
      if (mode === 'maybeSingle' || mode === 'single') {
        return { data: result[0] ? structuredClone(result[0]) : null, error: null };
      }
      return { data: structuredClone(result), error: null };
    };

    const builder = {
      select() { return builder; },
      insert(payload) { state.op = 'insert'; state.payload = payload; return builder; },
      update(payload) { state.op = 'update'; state.payload = payload; return builder; },
      upsert(payload, opts) { state.op = 'upsert'; state.payload = payload; state.upsertOpts = opts; return builder; },
      eq(col, val) { state.filters.push({ type: 'eq', col, val }); return builder; },
      ilike(col, val) { state.filters.push({ type: 'ilike', col, val }); return builder; },
      in(col, vals) { state.filters.push({ type: 'in', col, vals }); return builder; },
      lte(col, val) { state.filters.push({ type: 'lte', col, val }); return builder; },
      order(col, opts) { state.orderBy = { col, ascending: opts?.ascending ?? true }; return builder; },
      limit(n) { state.maxRows = n; return builder; },
      maybeSingle() { return Promise.resolve(execute('maybeSingle')); },
      single() { return Promise.resolve(execute('single')); },
      then(resolve, reject) { return Promise.resolve(execute('many')).then(resolve, reject); },
    };
    return builder;
  };

  return {
    db,
    client: {
      from(table) { return makeBuilder(table); },
    },
  };
}

test('firma HMAC-SHA256 de Flow ordena parámetros alfabéticamente y resuelve base URL por entorno', () => {
  const sig1 = signFlowParams({ z: 'last', apiKey: 'k1', amount: 12990, s: 'ignorado', empty: undefined }, 'sec');
  const sig2 = signFlowParams({ amount: 12990, z: 'last', apiKey: 'k1' }, 'sec');
  assert.equal(sig1, sig2);
  assert.match(sig1, /^[a-f0-9]{64}$/);
  assert.equal(resolveFlowBaseUrl(undefined), 'https://sandbox.flow.cl/api');
  assert.equal(resolveFlowBaseUrl('sandbox'), 'https://sandbox.flow.cl/api');
  assert.equal(resolveFlowBaseUrl('production'), 'https://www.flow.cl/api');
});

test('tarifas de planes coinciden entre mensual y anual -15% redondeado a decena CLP', () => {
  assert.equal(isPaidPlanId('gratis'), false);
  assert.equal(isPaidPlanId('pro'), true);
  assert.equal(isPaidPlanId('pro_ia'), true);

  const proMensual = getPlanPricing('pro', 'mensual');
  assert.equal(proMensual.montoCobroCLP, 12990);
  assert.equal(proMensual.duracionDias, 30);

  const proAnual = getPlanPricing('pro', 'anual');
  assert.equal(proAnual.precioEfectivoMensualCLP, 11040);
  assert.equal(proAnual.montoCobroCLP, 132480);
  assert.equal(proAnual.duracionDias, 365);

  const proIaAnual = getPlanPricing('pro_ia', 'anual');
  assert.equal(proIaAnual.precioEfectivoMensualCLP, 21240);
  assert.equal(proIaAnual.montoCobroCLP, 254880);
});

test('requireSupabaseAdmin exige SUPABASE_SERVICE_ROLE_KEY y nunca cae en anonKey', () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-only-should-never-be-used';
  assert.equal(getSupabaseAdmin(), null);
  assert.throws(() => requireSupabaseAdmin(), (err) => err.code === 'BILLING_DB_CONFIG' && err.status === 503);
});

test('checkout rechaza roles no admin, planes inválidos y protege cuentas ilimitadas', async () => {
  const { client } = createInMemoryBillingDb({
    empresas: [{ id: 'emp-dev', nombre: 'Dev Studio', plan_id: 'ilimitado' }],
    usuarios: [{ id: 'u-dev', empresa_id: 'emp-dev', email: 'dev@obratrack.cl', nombre: 'Dev', rol: 'admin', is_dev: true }],
  });
  const fakeFlow = { createPayment: async () => { throw new Error('Should not run'); } };

  await assert.rejects(
    createBillingCheckout({
      admin: client,
      flow: fakeFlow,
      appUrl: 'https://obratrack.test',
      actor: { id: 'u-sup', empresa_id: 'emp-1', rol: 'supervisor', nombre: 'Sup' },
      input: { planId: 'pro', ciclo: 'mensual', modalidad: 'prepago' },
    }),
    (e) => e.status === 403 && e.code === 'BILLING_FORBIDDEN',
  );

  await assert.rejects(
    createBillingCheckout({
      admin: client,
      flow: fakeFlow,
      appUrl: 'https://obratrack.test',
      actor: { id: 'u-admin', empresa_id: 'emp-1', rol: 'admin', nombre: 'Admin' },
      input: { planId: 'gratis', ciclo: 'mensual', modalidad: 'prepago' },
    }),
    (e) => e.status === 422 && e.code === 'PLAN_INVALID',
  );

  await assert.rejects(
    createBillingCheckout({
      admin: client,
      flow: fakeFlow,
      appUrl: 'https://obratrack.test',
      actor: { id: 'u-dev', empresa_id: 'emp-dev', rol: 'admin', nombre: 'Dev', is_dev: true },
      input: { planId: 'pro_ia', ciclo: 'mensual', modalidad: 'prepago' },
    }),
    (e) => e.status === 409 && e.code === 'PLAN_UNLIMITED',
  );
});

test('flujo prepago Webpay activa el plan al verificar estado pagado en Flow e ignora duplicados', async () => {
  const { db, client } = createInMemoryBillingDb();
  const captured = [];
  const flow = {
    async createPayment(input) {
      captured.push(input);
      return { url: 'https://sandbox.flow.cl/app/web/pay.php', token: 'tok_pay_1', flowOrder: 7001 };
    },
    async getPaymentStatus(token) {
      assert.equal(token, 'tok_pay_1');
      return {
        flowOrder: 7001,
        commerceOrder: captured[0].commerceOrder,
        status: 2,
        amount: 132480,
        payer: 'jefe@norte.cl',
        paymentData: { media: 'Webpay Plus' },
      };
    },
  };

  const checkout = await createBillingCheckout({
    admin: client,
    flow,
    appUrl: 'https://obratrack.test',
    actor: { id: 'u-admin', empresa_id: 'emp-1', rol: 'admin', nombre: 'Pedro Jefe' },
    input: { planId: 'pro', ciclo: 'anual', modalidad: 'prepago' },
  });

  assert.equal(checkout.montoCLP, 132480);
  assert.match(checkout.redirectUrl, /^https:\/\/sandbox\.flow\.cl\/app\/web\/pay\.php\?token=tok_pay_1$/);
  assert.equal(db.pagos_suscripcion[0].estado, 'pending');

  const first = await handleFlowPaymentCallback({ admin: client, flow, token: 'tok_pay_1' });
  assert.equal(first.outcome, 'paid');
  assert.equal(db.empresas[0].plan_id, 'pro');
  assert.equal(db.suscripciones[0].estado, 'active');
  assert.equal(db.pagos_suscripcion[0].estado, 'paid');
  assert.equal(db.pagos_suscripcion[0].metodo_pago, 'Webpay Plus');

  const second = await handleFlowPaymentCallback({ admin: client, flow, token: 'tok_pay_1' });
  assert.equal(second.idempotent, true);
  assert.equal(second.outcome, 'duplicate');
});

test('webhook rechaza montos alterados y un upgrade fallido no degrada el plan activo actual', async () => {
  const { db, client } = createInMemoryBillingDb({
    empresas: [{ id: 'emp-1', nombre: 'Constructora Norte SpA', plan_id: 'pro' }],
    suscripciones: [{
      id: 'sub-1',
      empresa_id: 'emp-1',
      plan_id: 'pro',
      ciclo: 'mensual',
      modalidad: 'prepago',
      estado: 'active',
      pasarela: 'flow',
      cancel_at_period_end: false,
      current_period_end: '2026-12-30T00:00:00.000Z',
    }],
    pagos_suscripcion: [
      { id: 'p-tamper', empresa_id: 'emp-1', commerce_order: 'OT-TAMPER', gateway_token: 'tok_tamper', plan_id: 'pro_ia', ciclo: 'mensual', modalidad: 'prepago', monto_clp: 24990, estado: 'pending' },
      { id: 'p-fail', empresa_id: 'emp-1', commerce_order: 'OT-FAIL', gateway_token: 'tok_fail', plan_id: 'pro_ia', ciclo: 'mensual', modalidad: 'prepago', monto_clp: 24990, estado: 'pending' },
    ],
  });

  const flowTamper = {
    async getPaymentStatus() {
      return { flowOrder: 8801, commerceOrder: 'OT-TAMPER', status: 2, amount: 100 };
    },
  };
  await assert.rejects(
    handleFlowPaymentCallback({ admin: client, flow: flowTamper, token: 'tok_tamper' }),
    (e) => e.code === 'BILLING_AMOUNT_MISMATCH' && e.status === 422,
  );
  assert.equal(db.empresas[0].plan_id, 'pro');

  const flowFail = {
    async getPaymentStatus() {
      return { flowOrder: 8802, commerceOrder: 'OT-FAIL', status: 3, amount: 24990 };
    },
  };
  const failed = await handleFlowPaymentCallback({ admin: client, flow: flowFail, token: 'tok_fail' });
  assert.equal(failed.outcome, 'failed');
  assert.equal(db.empresas[0].plan_id, 'pro');
  assert.equal(db.suscripciones[0].estado, 'active');
  assert.equal(db.pagos_suscripcion.find((p) => p.id === 'p-fail').estado, 'failed');
});

test('enrolamiento recurrente crea suscripción mensual, maneja webhook diferido, cancela y expira', async () => {
  const { db, client } = createInMemoryBillingDb();
  const createdFlowCalls = [];
  const flow = {
    async createCustomer({ name, email, externalId }) {
      createdFlowCalls.push({ name, email, externalId });
      return { customerId: 'cus_flow_1' };
    },
    async ensurePlan(input) {
      createdFlowCalls.push({ planId: input.planId });
      return { planId: input.planId, name: input.name, amount: input.amountCLP, interval: 3 };
    },
    async registerCustomerCard({ customerId }) {
      assert.equal(customerId, 'cus_flow_1');
      return { url: 'https://sandbox.flow.cl/app/web/reg.php', token: 'tok_reg_1' };
    },
    async getRegisterStatus(token) {
      assert.equal(token, 'tok_reg_1');
      return { status: '1', customerId: 'cus_flow_1', creditCardType: 'Visa', last4CardDigits: '4242' };
    },
    async createSubscription({ planId, customerId }) {
      assert.equal(planId, buildFlowPlanId('pro_ia', 24990));
      assert.equal(customerId, 'cus_flow_1');
      return {
        subscriptionId: 'sus_flow_1',
        planId,
        status: 0,
        invoices: [{ id: 91, status: 1 }],
      };
    },
    async getSubscription(subscriptionId) {
      assert.equal(subscriptionId, 'sus_flow_1');
      return { subscriptionId: 'sus_flow_1', planId: buildFlowPlanId('pro_ia', 24990), status: 1 };
    },
    async getPaymentStatus(token) {
      assert.equal(token, 'tok_inv_91');
      return {
        flowOrder: 9101,
        commerceOrder: 'FLOW-INV-91',
        status: 2,
        amount: 24990,
        payer: 'jefe@norte.cl',
        paymentData: { media: 'Oneclick / Tarjeta' },
      };
    },
    async cancelSubscription({ subscriptionId, atPeriodEnd }) {
      assert.equal(subscriptionId, 'sus_flow_1');
      assert.equal(atPeriodEnd, true);
      return { subscriptionId, status: 1, cancel_at_period_end: 1 };
    },
  };

  const checkout = await createBillingCheckout({
    admin: client,
    flow,
    appUrl: 'https://obratrack.test',
    actor: { id: 'u-admin', empresa_id: 'emp-1', rol: 'admin', nombre: 'Pedro Jefe' },
    input: { planId: 'pro_ia', ciclo: 'mensual', modalidad: 'recurrente' },
  });
  assert.match(checkout.redirectUrl, /tok_reg_1/);

  const regOutcome = await handleFlowRegisterReturn({
    admin: client,
    flow,
    token: 'tok_reg_1',
    order: checkout.commerceOrder,
  });
  assert.equal(regOutcome.outcome, 'pending');
  assert.equal(db.suscripciones[0].gateway_subscription_id, 'sus_flow_1');
  assert.equal(parseFlowPlanId(buildFlowPlanId('pro_ia', 24990)), 'pro_ia');

  const webhookResult = await handleFlowPaymentCallback({ admin: client, flow, token: 'tok_inv_91' });
  assert.equal(webhookResult.outcome, 'paid');
  assert.equal(db.empresas[0].plan_id, 'pro_ia');
  assert.equal(db.suscripciones[0].plan_id, 'pro_ia');
  assert.equal(db.suscripciones[0].estado, 'active');

  const canceled = await cancelCompanySubscription({
    admin: client,
    flow,
    actor: { id: 'u-admin', empresa_id: 'emp-1', rol: 'admin', nombre: 'Pedro Jefe' },
  });
  assert.equal(canceled.cancel_at_period_end, true);
  assert.equal(db.empresas[0].plan_id, 'pro_ia');

  const farFuture = new Date(Date.now() + 45 * 86_400_000);
  const reconciled = await reconcileExpiredSubscriptions(client, farFuture);
  assert.equal(reconciled.downgraded, 1);
  assert.equal(db.empresas[0].plan_id, 'gratis');
  assert.equal(db.suscripciones[0].estado, 'canceled');
});

test('createFlowGateway firma solicitudes GET y POST con HMAC correcto', async () => {
  const requests = [];
  const mockFetch = async (url, init = {}) => {
    requests.push({ url: String(url), method: init.method, body: init.body });
    return Response.json({ url: 'https://sandbox.flow.cl/pay', token: 'tok_http', flowOrder: 123 });
  };
  const gw = createFlowGateway(
    {
      env: 'sandbox',
      baseUrl: 'https://sandbox.flow.cl/api',
      apiKey: 'KEY123',
      secretKey: 'SEC123',
      appUrl: 'https://obratrack.test',
    },
    mockFetch,
  );

  const res = await gw.createPayment({
    commerceOrder: 'OT-1',
    subject: 'ObraTrack Plan Pro',
    amount: 12990,
    email: 'a@b.cl',
    urlConfirmation: 'https://obratrack.test/api/billing/webhook/flow',
    urlReturn: 'https://obratrack.test/api/billing/return/flow',
  });
  assert.equal(res.token, 'tok_http');
  assert.equal(requests[0].method, 'POST');
  const sentParams = new URLSearchParams(requests[0].body);
  assert.equal(sentParams.get('apiKey'), 'KEY123');
  assert.equal(sentParams.get('amount'), '12990');
  assert.match(sentParams.get('s'), /^[a-f0-9]{64}$/);
});

test('middleware permite webhook/return de Flow y página pública /precios', async () => {
  for (const path of ['/precios', '/api/billing/webhook/flow', '/api/billing/return/flow', '/api/billing/reconcile']) {
    const req = new NextRequest(`https://obratrack.test${path}`, { method: 'POST' });
    const res = await middleware(req);
    assert.equal(res.status, 200);
  }
});

test('endpoints HTTP /api/billing validan auth, token faltante, CRON_SECRET y return 303 sin token', async () => {
  const checkoutRoute = require('../app/api/billing/checkout/route.ts');
  const webhookRoute = require('../app/api/billing/webhook/flow/route.ts');
  const returnRoute = require('../app/api/billing/return/flow/route.ts');
  const reconcileRoute = require('../app/api/billing/reconcile/route.ts');

  const unauthCheckout = await checkoutRoute.POST(
    new NextRequest('https://obratrack.test/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'pro', ciclo: 'mensual', modalidad: 'prepago' }),
    }),
  );
  assert.equal(unauthCheckout.status, 401);

  const missingTokenWebhook = await webhookRoute.POST(
    new NextRequest('https://obratrack.test/api/billing/webhook/flow', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    }),
  );
  assert.equal(missingTokenWebhook.status, 400);

  const returnCanceled = await returnRoute.POST(
    new NextRequest('https://obratrack.test/api/billing/return/flow?kind=payment&order=OT-1', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    }),
  );
  assert.equal(returnCanceled.status, 303);
  assert.equal(returnCanceled.headers.get('location'), 'https://obratrack.test/planes?billing=canceled&order=OT-1');

  process.env.CRON_SECRET = 'cron-secret-test-value';
  const badCronPost = await reconcileRoute.POST(
    new NextRequest('https://obratrack.test/api/billing/reconcile', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret-val' },
    }),
  );
  assert.equal(badCronPost.status, 401);

  const badCronGet = await reconcileRoute.GET(
    new NextRequest('https://obratrack.test/api/billing/reconcile', {
      method: 'GET',
      headers: { authorization: 'Bearer wrong-secret-val' },
    }),
  );
  assert.equal(badCronGet.status, 401);
});
