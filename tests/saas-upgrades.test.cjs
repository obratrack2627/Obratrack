require('./helpers/typescript.cjs');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const setupBrowser = require('./helpers/browser.cjs');
const ExcelJS = require('exceljs');

const supabaseFixture = require('./helpers/supabase.cjs');
require.cache[require.resolve('../lib/supabase/client.ts')] = {
  id: require.resolve('../lib/supabase/client.ts'),
  filename: require.resolve('../lib/supabase/client.ts'),
  loaded: true,
  exports: supabaseFixture,
};

// Mockear sincronización remota de supabaseService en pruebas locales
const supabaseServiceModule = require('../lib/supabase/supabase-service.ts');
for (const key of Object.keys(supabaseServiceModule.supabaseService)) {
  if (typeof supabaseServiceModule.supabaseService[key] === 'function') {
    supabaseServiceModule.supabaseService[key] = async () => ({});
  }
}

const { isValidAuthToken, sanitizeRedirectPath } = require('../middleware.ts');
const { DataService, dataService, DATA_STORAGE_KEYS } = require('../lib/data-service.ts');
const { exportService } = require('../lib/export-service.ts');
const { convertirPresupuestoEnObra } = require('../lib/presupuestos-to-obra.ts');
const { calcularEstadoPago } = require('../lib/edp-calculator.ts');
const { buildProjectExcelBuffer } = require('../lib/excel-export.ts');
const manifestFn = require('../app/manifest.ts').default;
const aiServer = require('../lib/ai/server.ts');

beforeEach(() => {
  setupBrowser();
  supabaseFixture.reset();
});

test('middleware exige JWT y rechaza identificadores UUID como credencial', () => {
  assert.equal(isValidAuthToken(undefined), false);
  assert.equal(isValidAuthToken(''), false);
  assert.equal(isValidAuthToken('12345678'), false);
  assert.equal(isValidAuthToken('inventado_token_corto'), false);

  assert.equal(isValidAuthToken('00000000-0000-0000-0000-000000000001'), false);
  assert.equal(isValidAuthToken('f47ac10b-58cc-4372-a567-0e02b2c3d479'), false);
  assert.equal(
    isValidAuthToken('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1NiJ9.valid_signature_12345'),
    true
  );

  assert.equal(sanitizeRedirectPath('//malicious.example'), '/dashboard');
  assert.equal(sanitizeRedirectPath('https://malicious.example'), '/dashboard');
  assert.equal(sanitizeRedirectPath('/proyectos/p-1/finanzas'), '/proyectos/p-1/finanzas');
});

test('exportService incluye materiales reales del tenant y todas las entidades de cumplimiento Ley 21.719', () => {
  const tenantId = 'emp-compliance-test';
  dataService.setActiveUser({
    id: 'u-owner',
    empresa_id: tenantId,
    empresa_nombre: 'Constructora Andina SpA',
    nombre: 'Carlos Soto',
    email: 'carlos@andina.test',
    rol: 'admin',
    rut: '76.123.456-7',
    telefono_whatsapp: '+56911112222',
  });
  localStorage.setItem(`${DATA_STORAGE_KEYS.PLAN}_${tenantId}`, JSON.stringify('pro'));

  const proj = dataService.createProyecto({
    empresa_id: tenantId,
    nombre: 'Remodelación Local Comercial',
    fecha_inicio: '2026-11-01',
    fecha_termino_estimada: '2026-12-01',
    estado: 'activo',
    monto_cotizado: 8500000,
  });

  dataService.createMaterialProyecto({
    proyecto_id: proj.id,
    nombre: 'Cemento Polpaico 25kg',
    categoria: 'Obra Gruesa',
    cantidad: 20,
    unidad: 'sacos',
    precio_unitario: 4590,
    subtotal: 91800,
    proveedor: 'Easy',
    comprado: true,
  });

  dataService.upsertAsistenciaObrero({
    proyecto_id: proj.id,
    trabajador_nombre: 'Juan Pérez',
    fecha: '2026-11-02',
    estado: 'presente',
    hora_entrada: '08:00',
    hora_salida: '18:00',
    origen: 'web',
  });

  const payload = exportService.buildFullBackupPayload();
  assert.equal(payload.empresa.nombre, 'Constructora Andina SpA');
  assert.equal(payload.empresa.plan_activo, 'pro');
  assert.equal(payload.materiales.length, 1);
  assert.equal(payload.materiales[0].nombre, 'Cemento Polpaico 25kg');
  assert.equal(payload.asistencias.length, 1);
  assert.ok(Array.isArray(payload.reclamos_cambios));
  assert.ok(Array.isArray(payload.documentos_obra));
});

test('convertirPresupuestoEnObra crea cliente, proyecto georreferenciado, Carta Gantt y materiales en 1 clic', () => {
  const service = new DataService(localStorage);
  const tenantId = 'emp-presupuesto-obra';
  service.setActiveUser({
    id: 'u-admin',
    empresa_id: tenantId,
    nombre: 'Administrador',
    email: 'admin@obra.test',
    rol: 'admin',
    telefono_whatsapp: '',
  });
  localStorage.setItem(`${DATA_STORAGE_KEYS.PLAN}_${tenantId}`, JSON.stringify('pro'));

  const cotizacion = {
    id: 'cot-991122',
    titulo_proyecto: 'Quincho y Terraza Providencia',
    tipo_obra: 'Ampliación habitacional',
    comuna_region: 'Providencia, Región Metropolitana',
    cliente_nombre: 'María González',
    cliente_telefono: '+56987654321',
    duracion_dias_estimada: 18,
    resumen_ejecutivo: 'Construcción de quincho techado con radier y revestimiento.',
    fecha_creacion: '2026-11-02',
    materiales: [
      {
        nombre: 'Cemento Especial 25kg',
        categoria: 'Obra Gruesa',
        cantidad: 30,
        unidad: 'sacos',
        precio_unitario_estimado: 4690,
        precio_mas_barato: 4490,
        subtotal: 134700,
        mejor_tienda: 'Easy',
        ahorro_estimado: 6000,
      },
      {
        nombre: 'Placa OSB Estructural 11.1mm',
        categoria: 'Tabiquería',
        cantidad: 12,
        unidad: 'placas',
        precio_unitario_estimado: 15990,
        precio_mas_barato: 14990,
        subtotal: 179880,
        mejor_tienda: 'Imperial',
        ahorro_estimado: 12000,
      },
    ],
    mano_de_obra: [],
    estructura_financiera: {
      costo_materiales_total: 314580,
      costo_mano_obra_total: 900000,
      costo_directo: 1214580,
      gastos_generales_porcentaje: 10,
      gastos_generales_monto: 121458,
      imprevistos_porcentaje: 5,
      imprevistos_monto: 60729,
      margen_utilidad_porcentaje: 20,
      margen_utilidad_monto: 279353,
      precio_sugerido_neto: 1676120,
      iva_19: 318463,
      precio_total_con_iva: 1994583,
      ahorro_compras_estrategicas: 18000,
    },
    radar_proveedores: [],
    actividades_gantt: [
      { nombre: 'Trazado y Radier', dias: 5, orden: 1 },
      { nombre: 'Estructura Metálica y Techumbre', dias: 8, orden: 2 },
      { nombre: 'Terminaciones Eléctricas y Pintura', dias: 5, orden: 3 },
    ],
    consejos_experto_pyme: [],
  };

  const res = convertirPresupuestoEnObra(cotizacion, {
    service,
    fechaInicio: '2026-11-03',
  });

  assert.equal(res.proyecto.nombre, 'Quincho y Terraza Providencia');
  assert.equal(res.proyecto.comuna, 'Providencia');
  assert.equal(res.proyecto.monto_cotizado, 1994583);
  assert.equal(res.cliente.nombre, 'María González');
  assert.equal(res.actividadesCreadas, 3);
  assert.equal(res.materialesCargados, 2);

  const acts = service.getActividades(res.proyecto.id);
  assert.equal(acts.length, 3);
  assert.equal(acts[0].nombre, 'Trazado y Radier');

  const mats = service.getMaterialesProyecto(res.proyecto.id);
  assert.equal(mats.length, 2);
  assert.equal(mats[0].proveedor, 'Easy');

  const bitacora = service.getBitacora(res.proyecto.id);
  assert.equal(bitacora.length, 1);
});

test('calcularEstadoPago determina correlativo, avance Gantt, descuentos previos, retención e IVA 19%', () => {
  const edp = calcularEstadoPago({
    proyecto: {
      id: 'p-1',
      nombre: 'Casa Maitencillo',
      monto_cotizado: 10000000,
      porcentaje_avance_ponderado: 60,
    },
    actividades: [
      {
        id: 'a1',
        proyecto_id: 'p-1',
        nombre: 'Fundaciones',
        fecha_inicio: '2026-10-01',
        fecha_termino: '2026-10-10',
        porcentaje_avance: 100,
        estado: 'terminada',
        orden: 1,
      },
      {
        id: 'a2',
        proyecto_id: 'p-1',
        nombre: 'Estructura',
        fecha_inicio: '2026-10-11',
        fecha_termino: '2026-10-25',
        porcentaje_avance: 20,
        estado: 'en_curso',
        orden: 2,
      },
    ],
    pagos: [
      {
        id: 'pay-1',
        proyecto_id: 'p-1',
        monto: 3000000,
        metodo: 'transferencia',
        fecha: '2026-10-02',
        nota: 'Anticipo 30%',
      },
    ],
    cambios: [
      {
        id: 'rc-1',
        proyecto_id: 'p-1',
        tipo: 'solicitud_cambio',
        prioridad: 'media',
        estado: 'aprobado',
        titulo: 'Ampliación alero',
        descripcion: 'Alero norte',
        impacto_monto: 800000,
        impacto_dias: 3,
        materiales_requeridos: [],
        materiales_inyectados: true,
        origen: 'web',
        fecha: '2026-10-15',
      },
    ],
    retencionPorcentaje: 5,
  });

  assert.equal(edp.folio, 'EDP-002');
  assert.equal(edp.porcentajeAvanceFisico, 60);
  assert.equal(edp.valorAvanceAcumulado, 6000000);
  assert.equal(edp.totalPagadoAnterior, 3000000);
  assert.equal(edp.cobroSugeridoSegunAvance, 3000000);
  assert.equal(edp.retencionMonto, 150000);
  assert.equal(edp.liquidoAPagarConIva, 2850000);
  assert.equal(edp.netoPeriodo + edp.ivaPeriodo, edp.liquidoAPagarConIva);
  assert.equal(edp.saldoRemanenteTrasEdp, 4150000);
});

test('buildProjectExcelBuffer genera libro .xlsx válido con las 5 hojas contables y operativas', async () => {
  const buffer = await buildProjectExcelBuffer({
    proyecto: {
      id: 'p-xlsx',
      empresa_id: 'emp-1',
      nombre: 'Galpón Industrial Lampa',
      comuna: 'Lampa',
      region: 'Región Metropolitana de Santiago',
      fecha_inicio: '2026-11-01',
      fecha_termino_estimada: '2026-12-15',
      estado: 'activo',
      monto_cotizado: 15000000,
      porcentaje_avance_ponderado: 45,
    },
    cliente: { id: 'c-1', nombre: 'Logística Sur Ltda.' },
    empresaNombre: 'Constructora Norte SpA',
    actividades: [
      {
        id: 'act-1',
        proyecto_id: 'p-xlsx',
        nombre: 'Radier H25',
        fecha_inicio: '2026-11-01',
        fecha_termino: '2026-11-10',
        porcentaje_avance: 45,
        estado: 'en_curso',
        orden: 1,
      },
    ],
    pagos: [
      {
        id: 'pay-1',
        proyecto_id: 'p-xlsx',
        monto: 4500000,
        metodo: 'transferencia',
        fecha: '2026-11-02',
        nota: 'EDP-001 Anticipo',
      },
    ],
    materiales: [
      {
        id: 'mat-1',
        proyecto_id: 'p-xlsx',
        nombre: 'Malla Acma C-139',
        categoria: 'Enfierradura',
        cantidad: 15,
        unidad: 'placas',
        precio_unitario: 28990,
        subtotal: 434850,
        proveedor: 'Imperial',
        comprado: true,
      },
    ],
    imprevistos: [],
    asistencias: [],
  });

  assert.ok(buffer.byteLength > 1000);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer));
  const sheetNames = wb.worksheets.map((ws) => ws.name);
  assert.deepEqual(sheetNames, [
    'Resumen de Obra',
    'Pagos e Ingresos',
    'Materiales',
    'Imprevistos',
    'Gantt y Asistencia',
  ]);
});

test('endpoint /api/materiales/comparar rechaza rol terreno y manifest PWA expone modo standalone', async () => {
  const originalAuth = aiServer.authorizeAI;
  try {
    aiServer.authorizeAI = async () => ({
      client: supabaseFixture.supabase,
      user: { id: 'u-terreno', empresa_id: 'emp-1', rol: 'terreno' },
    });
    const { POST } = require('../app/api/materiales/comparar/route.ts');
    const req = new NextRequest('http://localhost/api/materiales/comparar', {
      method: 'POST',
      body: JSON.stringify({ producto: 'Cemento 25kg' }),
    });
    const res = await POST(req);
    assert.equal(res.status, 403);
  } finally {
    aiServer.authorizeAI = originalAuth;
  }

  const manifest = manifestFn();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/dashboard');
  assert.equal(manifest.id, '/proyectos');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});
