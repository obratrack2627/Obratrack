require('./helpers/typescript.cjs');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const fixture = require('./helpers/supabase.cjs');

require.cache[require.resolve('../lib/supabase/client.ts')] = {
  id: require.resolve('../lib/supabase/client.ts'),
  filename: require.resolve('../lib/supabase/client.ts'),
  loaded: true,
  exports: fixture,
};

require.cache[require.resolve('../lib/supabase/admin.ts')] = {
  id: require.resolve('../lib/supabase/admin.ts'),
  filename: require.resolve('../lib/supabase/admin.ts'),
  loaded: true,
  exports: { getSupabaseAdmin: () => null },
};

require('./helpers/browser.cjs')();
const { dataService } = require('../lib/data-service.ts');
const server = require('../lib/ai/server.ts');

let user;
server.authorizeAI = async () => ({ client: fixture.supabase, user });

const { GET, PATCH } = require('../app/api/perfil/route.ts');
const syncRoute = require('../app/api/supabase/sync/route.ts');

const SAMPLE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const makeRequest = (method, body) =>
  new NextRequest('https://example.test/api/perfil', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  fixture.reset();
  localStorage.clear();
  user = {
    id: 'u-admin',
    auth_user_id: 'auth-admin',
    empresa_id: 'emp-1',
    nombre: 'Carlos Vega',
    email: 'carlos@constructora.cl',
    email_acceso: 'carlos@constructora.cl',
    telefono_whatsapp: '+56912345678',
    rut: '11.111.111-1',
    rol: 'admin',
    especialidades: ['Obra Gruesa'],
    is_dev: false,
  };
  fixture.tables.set('usuarios', [{ ...user }]);
  fixture.tables.set('empresas', [
    {
      id: 'emp-1',
      nombre: 'Constructora Vega Ltda',
      rut: '76.111.111-6',
      plan_id: 'pro_ia',
      logo_url: null,
      configuracion: {},
    },
  ]);
  localStorage.setItem('obratrack_active_user_v7', JSON.stringify(user));
});

afterEach(() => {
  fixture.reset();
  localStorage.clear();
});

test('GET y PATCH /api/perfil actualizan perfil personal, logo de empresa y configuración', async () => {
  const getRes = await GET(makeRequest('GET'));
  assert.equal(getRes.status, 200);
  const initial = await getRes.json();
  assert.equal(initial.success, true);
  assert.equal(initial.usuario.nombre, 'Carlos Vega');
  assert.equal(initial.empresa.nombre, 'Constructora Vega Ltda');

  const patchRes = await PATCH(
    makeRequest('PATCH', {
      usuario: {
        nombre: 'Carlos Vega Rojas',
        rut: '11.111.111-1',
        telefono_whatsapp: '+56 9 8765 4321',
        email: 'ventas@constructora.cl',
        especialidades: ['Terminaciones', 'Gasfitería'],
      },
      empresa: {
        nombre: 'Constructora Vega SpA',
        rut: '76.111.111-6',
        logo_url: SAMPLE_PNG_DATA_URL,
        configuracion: {
          giro: 'Construcción General',
          direccion: 'Av. Apoquindo 4500',
          comuna: 'Las Condes',
          telefono_comercial: '+56 2 2345 6789',
          email_comercial: 'contacto@constructora.cl',
          sitio_web: 'www.vega.cl',
          firma_texto: 'Carlos Vega · Gerente General',
          condiciones_pago_defecto: '50% anticipo al aceptar presupuesto',
          datos_bancarios: 'Banco Santander Cta Cte 123456',
          mostrar_datos_bancarios: true,
        },
      },
    }),
  );

  assert.equal(patchRes.status, 200);
  const updated = await patchRes.json();
  assert.equal(updated.success, true);
  assert.equal(updated.usuario.nombre, 'Carlos Vega Rojas');
  assert.equal(updated.usuario.telefono_whatsapp, '+56987654321');
  assert.deepEqual(updated.usuario.especialidades, ['Terminaciones', 'Gasfitería']);
  assert.equal(updated.usuario.empresa_logo_url, SAMPLE_PNG_DATA_URL);
  assert.equal(updated.empresa.nombre, 'Constructora Vega SpA');
  assert.equal(updated.empresa.logo_url, SAMPLE_PNG_DATA_URL);
  assert.equal(updated.empresa.configuracion.giro, 'Construcción General');
  assert.equal(updated.empresa.configuracion.mostrar_datos_bancarios, true);

  // Sync GET expone empresa completa y dataService aplica caché local sin fallar
  const syncRes = await syncRoute.GET(new NextRequest('https://example.test/api/supabase/sync'));
  assert.equal(syncRes.status, 200);
  const syncJson = await syncRes.json();
  assert.equal(syncJson.empresa.logo_url, SAMPLE_PNG_DATA_URL);
  assert.equal(syncJson.empresa.configuracion.firma_texto, 'Carlos Vega · Gerente General');

  dataService.applyLocalProfileUpdate(updated.usuario, updated.empresa);
  assert.equal(dataService.getEmpresa()?.logo_url, SAMPLE_PNG_DATA_URL);
  assert.equal(dataService.getActiveUser()?.empresa_nombre, 'Constructora Vega SpA');
});

test('supervisor puede editar su perfil personal pero no los datos o logo de empresa', async () => {
  user = {
    id: 'u-sup',
    auth_user_id: 'auth-sup',
    empresa_id: 'emp-1',
    nombre: 'Luis Supervisor',
    email: 'luis@constructora.cl',
    email_acceso: 'luis@constructora.cl',
    telefono_whatsapp: '+56922223333',
    rut: '11.111.111-1',
    rol: 'supervisor',
    especialidades: [],
    is_dev: false,
  };
  fixture.tables.set('usuarios', [{ ...user }]);

  const okRes = await PATCH(
    makeRequest('PATCH', {
      usuario: { nombre: 'Luis Díaz', especialidades: ['Electricidad'] },
    }),
  );
  assert.equal(okRes.status, 200);
  const okBody = await okRes.json();
  assert.equal(okBody.usuario.nombre, 'Luis Díaz');

  const forbiddenRes = await PATCH(
    makeRequest('PATCH', {
      empresa: { nombre: 'Empresa Hackeada', logo_url: SAMPLE_PNG_DATA_URL },
    }),
  );
  assert.equal(forbiddenRes.status, 403);
});

test('PATCH /api/perfil rechaza logos que no sean PNG/JPG/WebP base64', async () => {
  const badRes = await PATCH(
    makeRequest('PATCH', {
      empresa: { logo_url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
    }),
  );
  assert.equal(badRes.status, 422);
  const badUrlRes = await PATCH(
    makeRequest('PATCH', {
      empresa: { logo_url: 'https://externo.test/logo.png' },
    }),
  );
  assert.equal(badUrlRes.status, 422);
});
