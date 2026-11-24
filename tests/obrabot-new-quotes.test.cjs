require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const fs = require('node:fs');
const { handleQuoteTurn } = require('../lib/obrabot/quotes.ts');
const { readTextQuote, readExcelQuote, readQuoteSource } = require('../lib/obrabot/quote-input.ts');
const { quoteFile } = require('../lib/obrabot/quote-files.ts');
const { quoteWhatsAppTurn, obrabotWhatsAppFile } = require('../lib/obrabot/whatsapp.ts');

const admin = { id: 'admin', empresa_id: 'empresa1', rol: 'admin' };
const supervisor = { ...admin, id: 'boss', rol: 'supervisor' };
const text = 'Nueva cotización: Terraza\nCemento | saco | 2 | 5.950\nCerámica | caja | 3,5 | 10.200';

function database() {
  const calls = [];
  const reviews = new Map();
  let actor = { ...admin, telefono_whatsapp: '+56912345678' };
  return {
    calls,
    setRole: rol => { actor = { ...actor, rol }; },
    from(table) {
      let filters = [];
      return {
        async upsert() { return {}; },
        select() { return this; },
        eq(key, value) { filters.push(row => row[key] === value); return this; },
        async maybeSingle() {
          const rows = table === 'obrabot_cotizaciones' ? [...reviews.values()] : table === 'usuarios' ? [actor] : [{ id: 'empresa1', nombre: 'Constructora A' }];
          return { data: rows.find(row => filters.every(matches => matches(row))) || null };
        },
      };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'obrabot_registrar_cotizacion') {
        if (!reviews.has(args.p_id)) reviews.set(args.p_id, { id: args.p_id, empresa_id: args.p_empresa, estado: 'pendiente', revision: 1, borrador: args.p_borrador });
        return {};
      }
      if (name === 'obrabot_revisar_cotizacion') {
        const row = reviews.get(args.p_id);
        row.estado = 'aprobada';
        row.presupuesto_id = row.borrador.id;
        return { data: row };
      }
      if (name === 'aplicar_lote_copiloto') return { data: { message_id: args.p_id, empresa_id: args.p_empresa, actor_id: args.p_actor, respuesta: args.p_respuesta, acciones: args.p_acciones } };
      throw new Error(name);
    },
  };
}

test('la bandeja del administrador aprueba la misma solicitud que ingresó un supervisor sin mostrarle montos por WhatsApp', async () => {
  const db = database();
  const event = { id: 'wamid-1', type: 'text', from: '56912345678', text: { body: text } };
  const reply = await quoteWhatsAppTurn(db, supervisor, event, [event]);
  assert.match(reply.respuesta, /pendiente/);
  assert.doesNotMatch(reply.respuesta, /\$|5.950|10.200|Terraza/);
  assert.equal(db.calls[1].args.p_cotizacion, null);
  assert.doesNotMatch(db.calls[1].args.p_texto, /5.950|10.200/);
  const id = db.calls[0].args.p_id;
  await assert.rejects(handleQuoteTurn(db, supervisor, 'whatsapp', `revisa cotización ${id}`), { status: 403 });
  await assert.rejects(handleQuoteTurn(db, { ...admin, empresa_id: 'otra' }, 'plataforma', `revisa cotización ${id}`), { status: 404 });
  assert.match((await handleQuoteTurn(db, admin, 'plataforma', `revisa cotización ${id}`)).respuesta, /47\.600/);
  const approved = await handleQuoteTurn(db, admin, 'plataforma', `aprueba cotización ${id} 1`);
  assert.deepEqual(approved.archivo, { id, formato: 'pdf' });
  const approvedAgain = await handleQuoteTurn(db, admin, 'plataforma', `aprueba cotización ${id} 1`);
  assert.equal(approvedAgain.archivo, undefined);
  assert.match(approvedAgain.respuesta, /ya está aprobada/);
  const saved = db.calls[0].args.p_borrador;
  assert.equal(saved.estructura_financiera.precio_sugerido_neto, 40000);
  assert.equal(saved.estructura_financiera.iva_19, 7600);
  const xlsx = await quoteFile(db, admin.empresa_id, saved, 'excel');
  const sheet = (await new ExcelJS.Workbook().xlsx.load(Buffer.from(xlsx.bytes))).worksheets[0];
  assert.equal(sheet.getCell('D2').value, 5950);
  assert.deepEqual(sheet.getCell('E2').value, { formula: 'ROUND(C2*D2,0)', result: 11900 });
  assert.deepEqual(sheet.getCell('E5').value, { formula: 'SUM(E2:E3)', result: 47600 });
  const receipt = { persistido: true, actor_id: admin.id, empresa_id: admin.empresa_id, acciones: { tipo: 'obrabot_cotizacion', archivo_cotizacion: { id, formato: 'pdf' } } };
  assert.equal(await obrabotWhatsAppFile(db, receipt, '56922222222'), null);
  const pdf = await obrabotWhatsAppFile(db, receipt, '56912345678');
  assert.equal(Buffer.from(pdf.bytes).subarray(0, 5).toString(), '%PDF-');
  db.setRole('supervisor');
  assert.equal(await obrabotWhatsAppFile(db, receipt, '56912345678'), null);
});

test('el PDF contextual usa la cotización aprobada correcta, respeta el rol y no interviene en cierres', async () => {
  const db = database();
  const draft = await handleQuoteTurn(db, admin, 'plataforma', text, 'draft-for-pdf');
  const rows = [{ message_id: 'quote', acciones: { solicitud_cotizacion: draft.solicitud } }];
  function send(message, actor = admin) {
    const event = { id: 'file-request', from: '56912345678', type: 'text', text: { body: message } };
    return quoteWhatsAppTurn(db, actor, event, [event], undefined, undefined, rows);
  }
  assert.equal(await send('Dame el PDF del cierre de jornada'), null);
  assert.equal(await send('Haz una cotización de terraza en PDF'), null);
  assert.equal(await send('Genera una cotización en PDF'), null);
  assert.match((await send('Dámelo en PDF', supervisor)).respuesta, /administrador/);
  assert.match((await send('Dámelo en PDF')).respuesta, /necesita aprobación/);
  await handleQuoteTurn(db, admin, 'plataforma', `aprueba cotización ${draft.solicitud} 1`);
  const result = await send('¿Me puedes mandar la cotización en PDF?');
  assert.deepEqual(result.acciones.archivo_cotizacion, { id: draft.solicitud, formato: 'pdf' });
});

test('lee una planilla de valores e identifica filas incompletas antes de guardar', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Presupuesto');
  sheet.addRow(['Material', 'Unidad', 'Cantidad', 'Precio unitario con IVA']);
  sheet.addRow(['Arena', 'm³', 1.5, 11900]);
  const rows = await readExcelQuote(Buffer.from(await book.xlsx.writeBuffer()));
  assert.equal(rows[0].subtotal, 17850);
  assert.throws(() => readTextQuote('Arena | m³ | 1,5'), /partida 1/);
  await assert.rejects(readExcelQuote(Buffer.from('x')), /Excel/);
});

test('PDF o foto se usan solo para extraer partidas, rechazan lecturas incompletas y recalculan el subtotal', async () => {
  const row = { nombre: 'Cemento', unidad: 'saco', cantidad: 2, precio_unitario: 5950, subtotal: 1 };
  const pdf = Buffer.from('%PDF-1.4\n%%EOF');
  const rows = await readQuoteSource({ bytes: pdf, mime: 'application/pdf' }, async (_prompt, options) => {
    assert.equal(options.pdf.data, pdf.toString('base64'));
    assert.equal(options.tools, undefined);
    return JSON.stringify({ completo: true, partidas: [row] });
  });
  assert.equal(rows[0].subtotal, 11900);
  await assert.rejects(readQuoteSource({ bytes: fs.readFileSync('tests/fixtures/wall-crack.png'), mime: 'image/png' }, async (_prompt, options) => {
    assert.equal(options.image.mimeType, 'image/png');
    return JSON.stringify({ completo: false, partidas: [row] });
  }), /verificar todas/);
});

test('WhatsApp conserva las partidas, el plazo hábil y el reparto 60/40 hasta el PDF aprobado', async () => {
  const db = database();
  const message = `Podemos hacer esta cotización y sumar el total
Logia $ 5.850.000
Piso deck $ 2.950.000
Corta vista $ 884.000
Ventana 80x80 $ 215.000
Fijo PVC + puerta madera $ 650.000
Puerta wpc $ 680.000

Total de proyecto $

Descripción del trabajo:
Tabiquería de 60 mm con OSB de 11,5 mm y fibrocemento de 8 mm.
Estructura deck con perfiles 100x50x3 mm y acabado WPC.

Datos del trabajo:
Realización de trabajo aprox 35 días hábiles.
Para dar inicio al proyecto se solicita el 60 % del proyecto lo cual equivale al valor materiales y el 40 % restante de obra de mano se solicitará previo aviso al cliente por porcentajes.`;
  const event = { id: 'quote-logia', type: 'text', from: '56912345678', text: { body: message } };
  const reply = await quoteWhatsAppTurn(db, admin, event, [event]);
  assert.match(reply.respuesta, /11\.229\.000/);
  assert.match(reply.respuesta, /6\.737\.400/);
  assert.match(reply.respuesta, /4\.491\.600/);
  const { p_id: id, p_borrador: saved } = db.calls[0].args;
  assert.deepEqual(saved.partidas_venta.map(line => line.subtotal), [5850000, 2950000, 884000, 215000, 650000, 680000]);
  assert.equal(saved.plazo_texto, '35 días hábiles');
  assert.match(saved.resumen_ejecutivo, /100x50x3 mm/);
  await handleQuoteTurn(db, admin, 'whatsapp', `aprueba cotización ${id} 1`);
  const pdf = await obrabotWhatsAppFile(db, { ...reply, acciones: { ...reply.acciones, archivo_cotizacion: { id, formato: 'pdf' } } }, '56912345678');
  assert.equal(Buffer.from(pdf.bytes).subarray(0, 5).toString(), '%PDF-');
  const { buildQuoteDocument } = require('../lib/quotes/document.ts');
  const doc = buildQuoteDocument(saved);
  assert.equal(doc.items[3].nombre, 'Ventana 80x80');
  assert.equal(doc.items[3].precioUnit, null);
  assert.match(doc.condiciones, /6\.737\.400/);
  assert.match(doc.observaciones.join(' '), /35 días hábiles/);
});

test('conserva el precio por partida del radier y valida el total del cobertizo y el precio por m² de adoquines', () => {
  const { readPastedQuote } = require('../lib/obrabot/quote-message.ts');
  const radier = `Realización de radier 10 mts cuadrados sector gimnasio
• 8 cemento $ 24.000
• 1.5 mts cúbicos arena $ 62.000
• 1 mts cúbicos grava $ 31.000
• 2 malla acma c92 $ 52.000
• 2 fibra $ 18.000
• 5 listones 1x5 $ 10.000
• 2 topex latex $ 32.000
Materiales $ 229.000
Obra de mano $ 180.000
Total $ 409.000`;
  const rows = readPastedQuote(radier).partidas_venta;
  assert.deepEqual(rows.map(row => row.subtotal), [24000, 62000, 31000, 52000, 18000, 10000, 32000, 180000]);
  assert.equal(rows[0].cantidad, 8);
  assert.equal(rows[1].unidad, 'mts cúbicos');
  assert.equal(rows[1].cantidad, 1.5);
  assert.throws(() => readPastedQuote(radier.replace('409.000', '410.000')), /410\.000.*409\.000/);

  const roof = readPastedQuote(`Cobertizo antejardín estilo mediterráneo
Realización de viga reticulada y pared revestida en piedra.
Materiales:
Viga reticulada $ 1.263 000
Techumbre y cielo raso $ 1.785.000
Revestimiento piedra $ 557.000
Electricidad $ 187.000
Conexión desagüe $ 115.000
Pintura y terminación $ 435.000
Total materiales $ 4.342.000
Obra de mano $ 3.250.000
Total de proyecto $ 7.592.000`);
  assert.equal(roof.partidas_venta.reduce((sum, row) => sum + row.subtotal, 0), 7592000);

  const pavers = readPastedQuote(`Cotización de instalación de adoquines
Valor por metro cuadrado de adoquín $ 89.000
$89.000 x 50 mts cuadrados
$ 4.450.000
Preparación de terreno
Instalación de adoquín
Nivelación de cámara
Mano de obra`);
  assert.equal(pavers.partidas_venta[0].precio_unitario, 89000);
  assert.equal(pavers.partidas_venta[0].cantidad, 50);
  assert.equal(pavers.partidas_venta[0].subtotal, 4450000);
  assert.match(pavers.resumen_ejecutivo, /Nivelación de cámara/);
});

test('la transcripción de una foto conserva el total de cada fila y pide otra imagen si hay texto ilegible', async () => {
  const { transcribeQuoteImage } = require('../lib/obrabot/quote-input.ts');
  const { readPastedQuote } = require('../lib/obrabot/quote-message.ts');
  const source = { bytes: fs.readFileSync('tests/fixtures/wall-crack.png'), mime: 'image/png' };
  const message = await transcribeQuoteImage(source, async (_prompt, options) => {
    assert.equal(options.image.mimeType, 'image/png');
    assert.equal(options.tools, undefined);
    return JSON.stringify({ completo: true, texto: 'Radier gimnasio\n8 cemento $ 24.000\nTotal $ 24.000' });
  });
  assert.equal(readPastedQuote(message).partidas_venta[0].subtotal, 24000);
  await assert.rejects(transcribeQuoteImage(source, async () => '{"completo":false,"texto":""}'), /No pude leer/);
});

test('convergencia de motores: soporta valores netos + IVA, aprobación contextual sin UUID y Excel para Motor A y Motor B', async () => {
  const { readPastedQuote } = require('../lib/obrabot/quote-message.ts');
  const { normalizeQuote } = require('../lib/ai/protocol.ts');

  // 1. Cotización pegada con "Más IVA" calcula 19% IVA adicional y genera Excel neto editable
  const netMsg = `Cotización de hormigón estampado
Valor por metro cuadrado $ 37.000
$37.000 x 84 mts cuadrados
Más IVA`;
  const parsedNet = readPastedQuote(netMsg);
  assert.equal(parsedNet.tratamiento_iva, 'neto');
  assert.equal(parsedNet.partidas_venta[0].subtotal, 3108000);
  assert.throws(() => readPastedQuote(`${netMsg}\nIVA incluido`), /IVA incluido o netos/);

  const db = database();
  const budgets = new Map();
  const origFrom = db.from.bind(db);
  db.from = (table) => {
    if (table !== 'presupuestos') return origFrom(table);
    let filters = [];
    return {
      select() { return this; },
      eq(k, v) { filters.push(r => r[k] === v); return this; },
      async maybeSingle() {
        return { data: [...budgets.values()].find(r => filters.every(f => f(r))) || null };
      },
    };
  };

  // Turno 1: Admin pega cotización neta en WhatsApp -> recibe preview con revisión y sin exigir UUID
  const ev1 = { id: 'wamid-net-1', type: 'text', from: '56912345678', text: { body: netMsg } };
  const reply1 = await quoteWhatsAppTurn(db, admin, ev1, [ev1]);
  assert.match(reply1.respuesta, /Valores netos \(\+19% IVA\)/);
  assert.match(reply1.respuesta, /3\.108\.000/);
  assert.match(reply1.respuesta, /590\.520/);
  assert.match(reply1.respuesta, /3\.698\.520/);
  assert.equal(reply1.acciones.revision_cotizacion, 1);
  assert.ok(reply1.acciones.solicitud_cotizacion);

  // Turno 2: Admin responde simplemente "Aprobar" sin escribir ningún UUID
  const ev2 = { id: 'wamid-net-2', type: 'text', from: '56912345678', text: { body: 'Aprobar' } };
  const rowsAfterPreview = [{ message_id: reply1.message_id, acciones: reply1.acciones, created_at: new Date().toISOString() }];
  const reply2 = await quoteWhatsAppTurn(db, admin, ev2, [ev2], undefined, undefined, rowsAfterPreview);
  assert.match(reply2.respuesta, /Cotización aprobada/);
  assert.deepEqual(reply2.acciones.archivo_cotizacion, { id: reply1.acciones.solicitud_cotizacion, formato: 'pdf' });
  assert.equal(reply2.acciones.cotizacion_aprobada_id, reply1.acciones.solicitud_cotizacion);

  // Turno 3: Admin pide "Dámelo en Excel" -> genera Excel neto con fórmulas de Neto + IVA 19% + Total
  const ev3 = { id: 'wamid-net-3', type: 'text', from: '56912345678', text: { body: 'Dámelo en Excel' } };
  const rowsAfterApprove = [{ message_id: reply2.message_id, acciones: reply2.acciones, created_at: new Date().toISOString() }, ...rowsAfterPreview];
  const reply3 = await quoteWhatsAppTurn(db, admin, ev3, [ev3], undefined, undefined, rowsAfterApprove);
  assert.deepEqual(reply3.acciones.archivo_cotizacion, { id: reply1.acciones.solicitud_cotizacion, formato: 'excel' });
  const netExcel = await obrabotWhatsAppFile(db, reply3, '56912345678');
  const netSheet = (await new ExcelJS.Workbook().xlsx.load(Buffer.from(netExcel.bytes))).worksheets[0];
  assert.equal(netSheet.getRow(1).getCell(4).value, 'Precio unitario neto');
  assert.equal(netSheet.getCell('D2').value, 37000);
  assert.deepEqual(netSheet.getCell('E2').value, { formula: 'ROUND(C2*D2,0)', result: 3108000 });
  assert.deepEqual(netSheet.getCell('E4').value, { formula: 'SUM(E2:E2)', result: 3108000 });
  assert.deepEqual(netSheet.getCell('E5').value, { formula: 'ROUND(E4*19/100,0)', result: 590520 });
  assert.deepEqual(netSheet.getCell('E6').value, { formula: 'E4+E5', result: 3698520 });

  // Turno 4: Supervisor no puede descargar Excel contextual
  const supExcel = await quoteWhatsAppTurn(db, supervisor, ev3, [ev3], undefined, undefined, rowsAfterApprove);
  assert.match(supExcel.respuesta, /administrador/);

  // Turno 5: Cotización de Motor A (presupuestos) también descarga Excel editable vía WhatsApp
  const motorAQuote = normalizeQuote({
    id: 'cot-motora-1',
    titulo_proyecto: 'Pintura fachada',
    materiales: [{ nombre: 'Látex', cantidad: 2, unidad: 'galón', precio_unitario_estimado: 25000 }],
    mano_de_obra: [{ rol: 'Pintor', cantidad_personas: 1, dias_estimados: 2, valor_jornal_diario: 45000 }],
  });
  budgets.set(motorAQuote.id, { id: motorAQuote.id, empresa_id: admin.empresa_id, estado: 'borrador', cotizacion: motorAQuote });
  const motorARows = [{ message_id: 'wamid-ma', cotizacion: motorAQuote, acciones: { presupuesto_cotizacion_id: motorAQuote.id } }];
  const evMotorAExcel = { id: 'wamid-ma-xlsx', type: 'text', from: '56912345678', text: { body: 'Envíame la cotización en Excel' } };
  const replyMotorA = await quoteWhatsAppTurn(db, admin, evMotorAExcel, [evMotorAExcel], undefined, undefined, motorARows);
  assert.deepEqual(replyMotorA.acciones.archivo_cotizacion, { id: motorAQuote.id, formato: 'excel', origen: 'presupuesto' });
  const motorAFile = await obrabotWhatsAppFile(db, replyMotorA, '56912345678');
  assert.ok(motorAFile && motorAFile.filename.endsWith('.xlsx'));
  const maSheet = (await new ExcelJS.Workbook().xlsx.load(Buffer.from(motorAFile.bytes))).worksheets[0];
  assert.equal(maSheet.getRow(1).getCell(4).value, 'Precio unitario neto');
  assert.equal(maSheet.getCell('A2').value, 'Látex');
});
