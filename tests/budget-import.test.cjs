require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { importBudgetFile } = require('../lib/quotes/import-file.ts');
const { excelMime } = require('../lib/obrabot/quote-files.ts');

test('importa una planilla Excel con materiales y montos al formato ObraTrack sin llamar a IA', async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Presupuesto');
  sheet.addRow(['Descripción', 'Unidad', 'Cantidad', 'Precio unitario con IVA', 'Subtotal']);
  sheet.addRow(['Cemento Polpaico 25 kg', 'saco', 20, 5950, 119000]);
  sheet.addRow(['Ripio corriente', 'm3', 2, 29750, 59500]);
  sheet.addRow(['Total con IVA', '', '', '', 178500]);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());

  let aiCalls = 0;
  const result = await importBudgetFile(
    {
      bytes,
      filename: 'presupuesto_radier.xlsx',
      mime: excelMime,
      fallbackTitle: 'Radier Patio',
      fallbackClient: 'Constructora Norte',
    },
    async () => {
      aiCalls++;
      return '{}';
    },
  );

  assert.equal(aiCalls, 0);
  assert.equal(result.resumen.metodo, 'planilla');
  assert.equal(result.resumen.partidas, 2);
  assert.equal(result.resumen.materiales, 2);
  assert.equal(result.cotizacion.titulo_proyecto, 'Radier Patio');
  assert.equal(result.cotizacion.cliente_nombre, 'Constructora Norte');
  assert.equal(result.cotizacion.modo_presupuesto, 'precio_acordado');
  assert.equal(result.cotizacion.tratamiento_iva, 'incluido');
  assert.equal(result.cotizacion.estructura_financiera.precio_total_con_iva, 178500);
  assert.equal(result.cotizacion.estructura_financiera.precio_sugerido_neto, 150000);
  assert.equal(result.cotizacion.materiales[0].precio_unitario_estimado, 5000);
});

test('importa un CSV con precios netos y calcula el 19% de IVA correctamente', async () => {
  const csv = [
    'Material;Unidad;Cant.;Precio Unitario Neto',
    'Perfil metálico 40x40;tira;10;$12.000',
    'Plancha zinc 0.35mm;un;8;$10.000',
    'Subtotal Neto;;;200000',
  ].join('\n');

  const result = await importBudgetFile({
    bytes: Buffer.from(csv, 'utf8'),
    filename: 'cobertizo.csv',
    mime: 'text/csv',
    ivaPreference: 'auto',
  });

  assert.equal(result.resumen.metodo, 'texto');
  assert.equal(result.cotizacion.tratamiento_iva, 'neto');
  assert.equal(result.cotizacion.estructura_financiera.precio_sugerido_neto, 200000);
  assert.equal(result.cotizacion.estructura_financiera.iva_19, 38000);
  assert.equal(result.cotizacion.estructura_financiera.precio_total_con_iva, 238000);
  assert.equal(result.cotizacion.materiales.length, 2);
  assert.equal(result.cotizacion.materiales[0].precio_unitario_estimado, 12000);
});

test('importa un PDF usando extracción IA estructurada al formato ObraTrack', async () => {
  const fakePdf = Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF', 'utf8');
  const result = await importBudgetFile(
    {
      bytes: fakePdf,
      filename: 'cotizacion_externa.pdf',
      mime: 'application/pdf',
    },
    async () =>
      JSON.stringify({
        legible: true,
        titulo_proyecto: 'Remodelación Baño Principal',
        cliente_nombre: 'Juan Pérez',
        tratamiento_iva: 'incluido',
        partidas: [
          {
            nombre: 'Porcelanato 60x60',
            unidad: 'm2',
            cantidad: 15,
            precio_unitario: 19040,
            subtotal: 285600,
            tipo: 'material',
          },
          {
            nombre: 'Instalación cerámica',
            unidad: 'gl',
            cantidad: 1,
            precio_unitario: 357000,
            subtotal: 357000,
            tipo: 'mano_obra',
          },
        ],
        mano_de_obra: [
          { rol: 'Ceramista', cantidad_personas: 1, dias_estimados: 3, valor_jornal_diario: 71400 },
        ],
      }),
  );

  assert.equal(result.resumen.metodo, 'ia');
  assert.equal(result.cotizacion.titulo_proyecto, 'Remodelación Baño Principal');
  assert.equal(result.cotizacion.cliente_nombre, 'Juan Pérez');
  assert.equal(result.cotizacion.estructura_financiera.precio_total_con_iva, 642600);
  assert.equal(result.cotizacion.materiales.length, 1);
  assert.equal(result.cotizacion.materiales[0].precio_unitario_estimado, 16000);
  assert.equal(result.cotizacion.mano_de_obra.length, 1);
  assert.equal(result.cotizacion.mano_de_obra[0].valor_jornal_diario, 60000);
});

test('rechaza formatos no permitidos o archivos vacíos', async () => {
  await assert.rejects(
    importBudgetFile({
      bytes: Buffer.alloc(0),
      filename: 'vacio.pdf',
      mime: 'application/pdf',
    }),
    (err) => err.status === 422,
  );

  await assert.rejects(
    importBudgetFile({
      bytes: Buffer.from('MZfake-binary'),
      filename: 'programa.exe',
      mime: 'application/octet-stream',
    }),
    (err) => err.status === 422,
  );
});
