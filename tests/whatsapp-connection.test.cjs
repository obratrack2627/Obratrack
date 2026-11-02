require('./helpers/typescript.cjs');
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { checkMetaConnection, activateMetaWebhook } = require('../lib/whatsapp/meta.ts');
const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});
function setup() {
  Object.assign(process.env, {
    WHATSAPP_CLOUD_API_ACCESS_TOKEN: 'private-token-value',
    WHATSAPP_CLOUD_API_PHONE_NUMBER_ID: '111111',
    WHATSAPP_BUSINESS_ACCOUNT_ID: '222222',
    META_APP_ID: '333333',
    WHATSAPP_APP_SECRET: 'private-app-secret',
  });
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
test('detecta cambio de número y cuenta con el token nuevo sin exponer secretos', async () => {
  setup();
  const result = await checkMetaConnection(async (url) => {
    if (url.includes('/debug_token?')) return response({ data: {
      is_valid: true, app_id: '333333', scopes: ['whatsapp_business_messaging'],
      granular_scopes: [{ scope: 'whatsapp_business_messaging', target_ids: ['444444'] }],
    } });
    if (url.includes('/444444/phone_numbers')) return response({ data: [
      { id: '555555', display_phone_number: '+1 555 615 4571' },
    ] });
    return response({ error: { code: 100, message: 'private-provider-detail' } }, 400);
  });
  assert.equal(result.estado, 'numero_desactualizado');
  assert.equal(result.diagnostico.numero_configurado_accesible, false);
  assert.doesNotMatch(JSON.stringify(result), /private-token-value|private-app-secret|private-provider-detail|444444|555555|15556154571/);
});
test('no da por conectado un número cuya cuenta no está suscrita al webhook', async () => {
  setup();
  const result = await checkMetaConnection(async (url) => {
    if (url.includes('/me/permissions')) return response({ data: [{ permission: 'whatsapp_business_messaging', status: 'granted' }] });
    if (url.includes('/subscribed_apps')) return response({ data: [] });
    return response({ id: '111111' });
  });
  assert.equal(result.estado, 'webhook_pendiente');
});
test('confirma el permiso de mensajería y la suscripción de la aplicación correcta', async () => {
  setup();
  const result = await checkMetaConnection(async (url) => {
    if (url.includes('/me/permissions')) return response({ data: [{ permission: 'whatsapp_business_messaging', status: 'granted' }] });
    if (url.includes('/subscribed_apps')) return response({ data: [{ whatsapp_business_api_data: { id: '333333' } }] });
    return response({ id: '111111' });
  });
  assert.equal(result.estado, 'disponible');
});
test('distingue un token de otra aplicación y no propone números ajenos', async () => {
  setup();
  const result = await checkMetaConnection(async (url) => url.includes('/debug_token?')
    ? response({ data: { is_valid: true, app_id: '999999' } })
    : response({ error: { code: 100 } }, 400));
  assert.equal(result.estado, 'configuracion_incorrecta');
  assert.equal(result.diagnostico.aplicacion_coincide, false);
});

function activationMeta({ app = '333333', number = '111111', scopes = ['whatsapp_business_messaging', 'whatsapp_business_management'], active = false, accept = true } = {}) {
  let posts = 0;
  return {
    get posts() { return posts; },
    fetch: async (url, options = {}) => {
      if (url.includes('/debug_token?')) return response({ data: { is_valid: true, app_id: app, scopes } });
      if (url.includes('/222222/phone_numbers')) return response({ data: [{ id: number }] });
      if (url.includes('/222222/subscribed_apps')) {
        if (options.method === 'POST') {
          posts++;
          assert.equal(options.body, '{}');
          if (!accept) return response({ error: { message: 'private-provider-detail' } }, 403);
          active = true;
          return response({ success: true });
        }
        return response({ data: active ? [{ whatsapp_business_api_data: { id: '333333' } }] : [] });
      }
      throw new Error('Unexpected request');
    },
  };
}
test('activa y verifica la recepción en la cuenta configurada, sin enviar mensajes y sin repetir altas', async () => {
  setup();
  const meta = activationMeta();
  assert.equal((await activateMetaWebhook(meta.fetch)).estado, 'disponible');
  assert.equal(meta.posts, 1);
  assert.equal((await activateMetaWebhook(meta.fetch)).estado, 'disponible');
  assert.equal(meta.posts, 1);
});
test('rechaza suscripciones con otra aplicación, otro número o permisos insuficientes antes de modificar Meta', async () => {
  setup();
  for (const [options, code] of [
    [{ app: '999999' }, 'WHATSAPP_APPLICATION'],
    [{ number: '999999' }, 'WHATSAPP_ACCOUNT'],
    [{ scopes: ['whatsapp_business_messaging'] }, 'WHATSAPP_PERMISSIONS'],
  ]) {
    const meta = activationMeta(options);
    await assert.rejects(activateMetaWebhook(meta.fetch), error => error.code === code);
    assert.equal(meta.posts, 0);
  }
});
test('no informa recepción activa cuando Meta rechaza el alta y oculta el detalle privado', async () => {
  setup();
  const meta = activationMeta({ accept: false });
  await assert.rejects(activateMetaWebhook(meta.fetch), error => {
    assert.equal(error.code, 'WHATSAPP_SUBSCRIPTION_WRITE');
    assert.doesNotMatch(JSON.stringify(error), /private-provider-detail|private-token-value|private-app-secret/);
    return true;
  });
});
