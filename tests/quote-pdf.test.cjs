require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuote } = require('../lib/ai/protocol.ts');
const { buildQuoteDocument } = require('../lib/quotes/document.ts');
const { createQuotePdf } = require('../lib/quotes/pdf.ts');
const quote = (count = 2) => ({
  ...normalizeQuote({
    id: 'quote-654321', titulo_proyecto: 'Ampliación de vivienda', comuna_region: 'Maipú',
    cliente_nombre: 'Constructora Álvarez', condiciones_pago: 'Anticipo del 30% y saldo contra entrega.',
    materiales: Array.from({ length: count }, (_, i) => ({ nombre: `Material ${i + 1}: Cemento y áridos para ampliación`, cantidad: 2.5, precio_unitario_estimado: 25000, unidad: 'm²' })),
    mano_de_obra: [{ rol: 'Maestro', cantidad_personas: 2, dias_estimados: 3, valor_jornal_diario: 50000 }],
  }),
  fecha_creacion: '2026-11-02T01:00:00.000Z',
});
test('vista y exportación conservan el detalle, los totales guardados y la fecha original de Chile', () => {
  const q = quote();
  const document = buildQuoteDocument(q, { clienteEmail: 'cliente@example.test' });
  assert.equal(document.items.reduce((total, item) => total + item.total, 0), document.subtotal);
  assert.equal(document.total, q.estructura_financiera.precio_total_con_iva);
  assert.equal(document.iva, q.estructura_financiera.iva_19);
  assert.match(document.fecha, /01.*11.*2026/);
  assert.equal(document.cliente.email, 'cliente@example.test');
  assert.equal(buildQuoteDocument({ ...q, cliente_email: 'anterior@example.test' }, { clienteEmail: '' }).cliente.email, 'Por definir');
  assert.equal(document.validez, 'Por acordar');
  assert.match(document.filename, /^ObraTrack_Cotizacion_.*Ampliacion_de_vivienda\.pdf$/);
});
test('genera un archivo PDF real, A4 y seleccionable sin requerir DOM ni impresión', () => {
  const pdf = createQuotePdf(buildQuoteDocument(quote()));
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 210) < .1);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 297) < .1);
  const bytes = Buffer.from(pdf.output('arraybuffer'));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 3000);
  assert.match(bytes.toString('latin1'), /\/Font/);
});
test('los presupuestos extensos generan más páginas y conservan todas las partidas', () => {
  const document = buildQuoteDocument(quote(100));
  const pdf = createQuotePdf(document);
  assert.equal(document.items.filter((item) => item.nombre.startsWith('Material ')).length, 100);
  assert.ok(pdf.getNumberOfPages() >= 3);
  const final = document.items.at(-1);
  assert.ok(final && final.total > 0);
});

const SAMPLE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('el documento y PDF de cotización aplican logo de empresa, RUT, firma y datos bancarios', () => {
  const cotizacion = normalizeQuote({
    titulo_proyecto: 'Ampliación Terraza Norte',
    materiales: [
      { nombre: 'Estructura metálica', cantidad: 12, unidad: 'm2', precio_unitario_estimado: 45000 },
      { nombre: 'Cubierta policarbonato', cantidad: 12, unidad: 'm2', precio_unitario_estimado: 22000 },
    ],
    mano_de_obra: [
      { rol: 'Maestro soldador', cantidad_personas: 1, dias_estimados: 3, valor_jornal_diario: 45000 },
    ],
  });

  const document = buildQuoteDocument(cotizacion, {
    emisor: {
      nombre: 'Andrés Soto',
      empresa_nombre: 'Constructora Andes SpA',
      empresa_rut: '76.543.210-K',
      empresa_logo_url: SAMPLE_PNG_DATA_URL,
      empresa_configuracion: {
        giro: 'Construcción y Remodelaciones',
        direccion: 'Av. Providencia 1234',
        comuna: 'Providencia',
        sitio_web: 'www.andesconstruye.cl',
        firma_texto: 'Andrés Soto · Constructora Andes SpA',
        email_comercial: 'ventas@andesconstruye.cl',
        telefono_comercial: '+56 9 8765 4321',
        condiciones_pago_defecto: '50% anticipo y 50% contra entrega.',
        datos_bancarios: 'Banco de Chile\nCta Cte 00-123-456\nRUT 76.543.210-K',
        mostrar_datos_bancarios: true,
      },
    },
  });

  assert.equal(document.emisor.logoUrl, SAMPLE_PNG_DATA_URL);
  assert.equal(document.emisor.empresa, 'Constructora Andes SpA');
  assert.equal(document.emisor.rut, '76.543.210-K');
  assert.equal(document.emisor.firma, 'Andrés Soto · Constructora Andes SpA');
  assert.match(document.condiciones, /50% anticipo y 50% contra entrega\./);
  assert.match(document.condiciones, /Banco de Chile/);

  const pdf = createQuotePdf(document);
  const raw = pdf.output('arraybuffer');
  const text = Buffer.from(raw).toString('latin1');
  assert.ok(text.startsWith('%PDF-'));
  assert.match(text, /\/Subtype \/Image/);
  assert.match(text, /Constructora Andes SpA/);
});

test('el PDF de Estado de Pago se cifra con los últimos 4 dígitos del RUT del mandante', () => {
  const { deriveEdpPdfPassword, paymentPdf } = require('../lib/payments/pdf.ts');
  assert.equal(deriveEdpPdfPassword('76.412.890-K'), '2890');
  assert.equal(deriveEdpPdfPassword('12.345.678-5'), '5678');
  assert.equal(deriveEdpPdfPassword('201868246'), '6824');
  assert.equal(deriveEdpPdfPassword(''), null);

  const pdf = paymentPdf({
    nombre: 'Ampliación PAC',
    cliente: 'Constructora del Norte S.A.',
    clienteRut: '76.412.890-K',
    fecha: '20-11-2026',
    resumen: {
      numeroCorrelativo: 1,
      folio: 'EDP-001',
      montoContratadoVigente: 10000000,
      adicionalesAprobadosMonto: 0,
      adicionalesAprobadosCantidad: 0,
      porcentajeAvanceFisico: 50,
      valorAvanceAcumulado: 5000000,
      totalPagadoAnterior: 0,
      totalRetenidoAnterior: 0,
      saldoPendienteContrato: 10000000,
      cobroSugeridoSegunAvance: 5000000,
      montoBrutoPeriodoConIva: 5000000,
      retencionPorcentaje: 0,
      retencionMonto: 0,
      liquidoAPagarConIva: 5000000,
      netoPeriodo: 4201681,
      ivaPeriodo: 798319,
      saldoRemanenteTrasEdp: 5000000,
    },
    actividades: [],
    observacion: '',
    emisor: {
      empresa: 'AJ-Constructora',
      rut: '20.186.824-6',
      datosBancarios: 'Banco Estado · Cta Vista 123456',
    },
  });

  const text = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  assert.ok(text.startsWith('%PDF-'));
  assert.match(text, /\/Encrypt/);
});

test('la cotización pactada conserva el total comercial y detalla los insumos incluidos en el PDF', () => {
  const q = normalizeQuote({
    titulo_proyecto: 'Radier', modo_presupuesto: 'precio_acordado', tratamiento_iva: 'incluido',
    partidas_venta: [{ nombre: 'Radier instalado', unidad: 'gl', cantidad: 1, precio_unitario: 238000 }],
    materiales: Array.from({ length: 12 }, (_, i) => ({
      nombre: `Insumo ${i + 1}`, unidad: 'm³', cantidad: 0.5, precio_unitario_estimado: 2000,
    })), mano_de_obra: [],
  });
  const summary = require('../lib/whatsapp/format.ts').quoteWhatsApp(q);
  assert.match(summary, /8 de 12/);
  assert.doesNotMatch(summary, /Insumo 12/);
  const doc = buildQuoteDocument(q);
  assert.equal(doc.items.length, 1);
  assert.equal(doc.total, 238000);
  assert.equal(doc.materialesIncluidos.length, 12);
  assert.equal(doc.materialesIncluidos[11].total, 1000);
  const table = createQuotePdf(doc).lastAutoTable;
  assert.equal(table.body.length, 12);
  assert.equal(table.body[11].cells[1].raw, 'Insumo 12');
  assert.deepEqual(table.body[11].raw.slice(2), ['m³', '0,5', '$ 2.000', '$ 1.000']);
});

test('separa Sección 1 Partidas y Sección 2 Materiales en documento y PDF sin duplicarlos', () => {
  const q = normalizeQuote({
    titulo_proyecto: 'Remodelación baño',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    partidas_venta: [
      { nombre: 'Instalación cerámica piso', unidad: 'm2', cantidad: 10, precio_unitario: 15000, tipo: 'partida' },
      { nombre: 'Porcelanato 60x60', unidad: 'm2', cantidad: 11, precio_unitario: 12000, tipo: 'material' },
    ],
    materiales: [
      { nombre: 'Porcelanato 60x60', unidad: 'm2', cantidad: 11, precio_unitario_estimado: 10084 },
    ],
    mano_de_obra: [],
  });

  const doc = buildQuoteDocument(q);
  assert.deepEqual(doc.partidasSeccion.map((l) => l.nombre), ['Instalación cerámica piso']);
  assert.deepEqual(doc.materialesSeccion.map((l) => l.nombre), ['Porcelanato 60x60']);
  assert.equal(doc.materialesEsReferencia, false);
  assert.equal(doc.materialesIncluidos.length, 0);
  assert.equal(doc.total, 282000);

  const pdf = createQuotePdf(doc);
  const bytes = Buffer.from(pdf.output('arraybuffer'));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  const docConEmpresa = buildQuoteDocument(q, { emisor: { empresa_nombre: 'HBM Construcciones' } });
  assert.match(docConEmpresa.filename, /^Cotizacion_HBM_Construcciones_.*Remodelacion_bano\.pdf$/);
});

test('materiales considerados sin precio unitario y resumen económico agrupado generan 1 página sin duplicar observaciones', () => {
  const { normalizeQuote } = require('../lib/ai/protocol.ts');
  const q = normalizeQuote({
    titulo_proyecto: 'Portón peatonal WPC',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    partidas_venta: [
      { nombre: 'Materiales', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 335000, tipo: 'material' },
      { nombre: 'Mano de obra', unidad: 'gl', cantidad: 1, precio_unitario: 0, precio_partida: 280000, tipo: 'partida' },
    ],
    materiales: [],
    materiales_considerados: [
      { nombre: 'Deck WPC de 25 mm', cantidad: 13 },
      { nombre: 'Perfil tubular 70 x 30 x 2 mm', cantidad: 2 },
      { nombre: 'Perfil tubular 50 x 50 x 2 mm', cantidad: 1 },
      { nombre: 'Canal 25 x 25 x 2 mm', cantidad: 3 },
      { nombre: 'Cerradura', cantidad: 1 },
      { nombre: 'Anticorrosivo', cantidad: null },
      { nombre: 'Brocha y rodillo', cantidad: null },
      { nombre: 'Soldadura', cantidad: 2, unidad: 'kg' },
      { nombre: 'Discos de corte', cantidad: 10 },
      { nombre: 'Discos prelaminados', cantidad: 2 },
    ],
    mano_de_obra: [],
    observaciones: 'Incluye:\nAnticorrosivo\nSoldadura\nEntrega coordinada con cliente.',
  });

  const doc = buildQuoteDocument(q);
  assert.equal(doc.isGroupedSummaryOnly, true);
  assert.equal(doc.partidasSeccion.length, 0);
  assert.equal(doc.materialesSeccion.length, 0);
  assert.equal(doc.materialesConsiderados.length, 10);
  assert.deepEqual(
    doc.materialesConsiderados.map((m) => m.cantidadTexto),
    ['13', '2', '1', '3', '1', '—', '—', '2 kg', '10', '2'],
  );
  assert.deepEqual(doc.resumenEconomico, [
    { label: 'MATERIALES', amount: 335000 },
    { label: 'MANO DE OBRA', amount: 280000 },
  ]);
  assert.equal(doc.total, 615000);
  assert.ok(doc.observaciones.every((obs) => !/Anticorrosivo|Soldadura/.test(obs)));
  assert.ok(doc.observaciones.some((obs) => /Entrega coordinada con cliente/.test(obs)));

  const pdf = createQuotePdf(doc);
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.equal(pdf.lastAutoTable.body.length, 10);
  assert.deepEqual(Object.values(pdf.lastAutoTable.body[5].cells).map((c) => c.raw), ['6', '—', 'Anticorrosivo']);
  assert.deepEqual(Object.values(pdf.lastAutoTable.body[7].cells).map((c) => c.raw), ['8', '2 kg', 'Soldadura']);
});
