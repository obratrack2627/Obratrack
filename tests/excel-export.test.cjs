require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  buildProjectExcelBuffer,
  buildPortfolioExcelBuffer,
  buildMonthlyAttendanceExcelBuffer,
  buildDailyAttendanceExcelBuffer,
  buildProjectAttendanceExcelBuffer,
  buildClientesExcelBuffer,
  buildEquipoExcelBuffer,
} = require('../lib/excel-export.ts');

async function loadBook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer));
  return wb;
}

test('buildClientesExcelBuffer genera libro .xlsx estructurado con banner, encabezados y totales', async () => {
  const buf = await buildClientesExcelBuffer(
    [
      {
        id: 'c-1',
        empresa_id: 'e-1',
        nombre: 'Inmobiliaria Andes',
        rut: '76.123.456-7',
        telefono: '+56911112222',
        email: 'contacto@andes.cl',
        direccion: 'Providencia 123',
      },
    ],
    [
      {
        id: 'p-1',
        empresa_id: 'e-1',
        cliente_id: 'c-1',
        nombre: 'Edificio Norte',
        estado: 'activo',
        monto_cotizado: 4500000,
      },
    ],
    'Constructora Demo',
  );
  const wb = await loadBook(buf);
  const ws = wb.worksheets[0];
  assert.equal(ws.name, 'Clientes');
  assert.match(String(ws.getCell('A1').value), /OBRATRACK/);
  assert.equal(ws.getRow(4).getCell(1).value, 'Cliente / Mandante');
  assert.equal(ws.getRow(5).getCell(1).value, 'Inmobiliaria Andes');
  assert.equal(ws.getRow(5).getCell(7).value, 4500000);
  assert.deepEqual(ws.getRow(6).getCell(7).value, { formula: 'SUM(G5:G5)', result: 4500000 });
  assert.equal(ws.views[0].ySplit, 4);
});

test('buildEquipoExcelBuffer genera nómina estilizada con roles y obras asignadas', async () => {
  const buf = await buildEquipoExcelBuffer(
    [
      {
        id: 'u-1',
        empresa_id: 'e-1',
        nombre: 'Pedro Soto',
        rut: '15.222.333-4',
        rol: 'terreno',
        telefono_whatsapp: '+56988887777',
        email: 'pedro@demo.cl',
        especialidades: ['Carpintería', 'Terminaciones'],
      },
    ],
    [
      {
        id: 'p-1',
        empresa_id: 'e-1',
        nombre: 'Casa Maipú',
        estado: 'activo',
        trabajadores_ids: ['u-1'],
      },
    ],
    'Constructora Demo',
  );
  const wb = await loadBook(buf);
  const ws = wb.worksheets[0];
  assert.equal(ws.name, 'Equipo de Faena');
  assert.equal(ws.getRow(5).getCell(1).value, 'Pedro Soto');
  assert.equal(ws.getRow(5).getCell(3).value, 'Terreno');
  assert.equal(ws.getRow(5).getCell(7).value, 'Casa Maipú');
});

test('planillas de asistencia diaria, mensual y por obra generan Excel con encabezados fijos y totales de horas', async () => {
  const daily = await loadBook(
    await buildDailyAttendanceExcelBuffer(
      [
        {
          fecha: '2026-11-24',
          obra: 'Terraza',
          trabajador: 'Luis Pérez',
          cargo: 'Maestro',
          estado: 'presente',
          hora_entrada: '08:00',
          hora_salida: '18:00',
          horas_trabajadas: 9,
          origen: 'web',
        },
      ],
      '2026-11-24',
      'Constructora Demo',
    ),
  );
  assert.equal(daily.worksheets[0].getRow(5).getCell(5).value, 'Presente');
  assert.deepEqual(daily.worksheets[0].getRow(6).getCell(8).value, { formula: 'SUM(H5:H5)', result: 9 });

  const monthly = await loadBook(
    await buildMonthlyAttendanceExcelBuffer(
      [
        {
          trabajador: 'Luis Pérez',
          cargo: 'Maestro',
          presentes: 20,
          atrasos: 1,
          ausentes: 0,
          licenciasPermisos: 0,
          totalDias: 21,
          totalHoras: 189,
          obras: ['Terraza'],
        },
      ],
      '2026-11',
      'Constructora Demo',
    ),
  );
  assert.deepEqual(monthly.worksheets[0].getRow(6).getCell(8).value, { formula: 'SUM(H5:H5)', result: 189 });

  const proj = await loadBook(
    await buildProjectAttendanceExcelBuffer(
      [
        {
          fecha: '2026-11-24',
          trabajador: 'Luis Pérez',
          rol: 'Maestro',
          estado: 'atraso',
          hora_entrada: '08:30',
          hora_salida: '18:00',
          horas_trabajadas: 8.5,
          origen: 'whatsapp',
          registrado_por: 'Jefe Obra',
          observacion: 'Tráfico',
        },
      ],
      'Terraza',
      'Constructora Demo',
    ),
  );
  assert.equal(proj.worksheets[0].getRow(5).getCell(4).value, 'Atraso');
  assert.deepEqual(proj.worksheets[0].getRow(6).getCell(7).value, { formula: 'SUM(G5:G5)', result: 8.5 });
});

test('buildPortfolioExcelBuffer y buildProjectExcelBuffer mantienen estructura multi-hoja con fórmulas de suma', async () => {
  const portfolio = await loadBook(
    await buildPortfolioExcelBuffer({
      empresaNombre: 'Constructora Demo',
      proyectos: [
        { id: 'p-1', empresa_id: 'e-1', nombre: 'Obra A', estado: 'activo', monto_cotizado: 1000000, porcentaje_avance_ponderado: 50 },
      ],
      clientes: [],
      materiales: [],
      imprevistos: [],
      pagos: [{ id: 'pg-1', proyecto_id: 'p-1', monto: 400000, estado: 'completado' }],
      reclamos: [],
    }),
  );
  assert.deepEqual(portfolio.worksheets.map((w) => w.name), [
    'Resumen Cartera',
    'Obras y Rentabilidad',
    'Reclamos y Cambios',
  ]);
  assert.deepEqual(portfolio.worksheets[1].getRow(6).getCell(6).value, { formula: 'SUM(F5:F5)', result: 1000000 });

  const projectBook = await loadBook(
    await buildProjectExcelBuffer({
      proyecto: { id: 'p-1', empresa_id: 'e-1', nombre: 'Obra A', estado: 'activo', monto_cotizado: 1000000, fecha_inicio: '2026-11-01', fecha_termino_estimada: '2026-12-01' },
      actividades: [],
      pagos: [{ id: 'pg-1', proyecto_id: 'p-1', fecha: '2026-11-05', metodo: 'transferencia', monto: 400000 }],
      materiales: [],
      imprevistos: [],
      asistencias: [],
    }),
  );
  assert.deepEqual(projectBook.worksheets[1].getRow(6).getCell(3).value, { formula: 'SUM(C5:C5)', result: 400000 });
});
