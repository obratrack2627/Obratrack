import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { quoteMoney, type QuoteDocument } from './document';

const ORANGE = '#FF6A00';
const INK = '#1E1E1E';
const GRAY = '#666666';
const MARGIN = 12;
const WIDTH = 186;

// Logo vectorial: conserva nitidez al ampliar, sin imágenes ni servicios externos.
function logo(pdf: jsPDF, x: number, y: number) {
  const s = 0.1;
  const line = (points: [number, number][], color: string, width: number) => {
    pdf.setDrawColor(color).setLineWidth(width * s);
    for (let i = 1; i < points.length; i++) pdf.line(x + points[i - 1][0] * s, y + points[i - 1][1] * s, x + points[i][0] * s, y + points[i][1] * s);
  };
  pdf.setDrawColor(ORANGE).setLineWidth(0.6).circle(x + 1.6, y + 10.6, 0.65);
  line([[22.5, 106], [58, 106]], ORANGE, 7);
  line([[23, 100], [23, 44], [68, 12], [112, 44], [112, 68]], ORANGE, 7.5);
  pdf.setFillColor(INK);
  for (const [rx, ry, rw, rh] of [[36, 52, 13, 46], [53, 32, 15, 66], [72, 46, 13, 52]]) pdf.rect(x + rx * s, y + ry * s, rw * s, rh * s, 'F');
  line([[52, 98], [74, 116], [126, 62]], '#6B8F72', 9);
  pdf.setFont('helvetica', 'bold').setFontSize(19).setTextColor(ORANGE);
  pdf.text('Obra', x + 15, y + 8.7);
  const wordWidth = pdf.getTextWidth('Obra');
  pdf.setTextColor(INK).text('Track', x + 15 + wordWidth, y + 8.7);
  pdf.setFont('helvetica', 'normal').setFontSize(4.9).setTextColor(GRAY);
  pdf.text('CONTROL · COTIZACIONES · COSTOS · PAGOS · AVANCES', x + 15, y + 12);
}

function section(pdf: jsPDF, title: string, x: number, y: number) {
  pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ORANGE).text(title, x, y);
}

export function createQuotePdf(document: QuoteDocument) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: `Cotización ${document.folio} · ${document.proyecto.nombre}`, author: document.emisor.empresa, creator: 'ObraTrack' });
  logo(pdf, MARGIN, 11);
  pdf.setDrawColor(ORANGE).setLineWidth(0.3).line(141, 12, 141, 32);
  pdf.setFont('helvetica', 'bold').setFontSize(17).setTextColor(INK).text('COTIZACIÓN', 147, 18);
  pdf.setFontSize(8).text(`N.° ${document.folio}`, 147, 24);
  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRAY);
  pdf.text(`FECHA: ${document.fecha}`, 147, 28);
  pdf.text(`VÁLIDA HASTA: ${document.validez}`, 147, 32);

  // Medir primero las fichas para que nombres, correos y alcance largos no se corten.
  const detailRows = (rows: [string, string][], x: number, start: number, draw: boolean) => {
    let y = start;
    for (const [label, value] of rows) {
      pdf.setFont('helvetica', 'normal').setFontSize(7.4);
      const lines: string[] = pdf.splitTextToSize(value, 61);
      if (draw) {
        pdf.setFont('helvetica', 'bold').setTextColor(INK).text(label, x, y);
        pdf.setFont('helvetica', 'normal').text(lines, x + 25, y);
      }
      y += Math.max(4.4, lines.length * 3.05);
    }
    return y;
  };
  const clientRows: [string, string][] = [['Nombre:', document.cliente.nombre], ['Contacto:', document.cliente.contacto], ['Email:', document.cliente.email], ['Teléfono:', document.cliente.telefono]];
  const projectRows: [string, string][] = [['Proyecto:', document.proyecto.nombre], ['Ubicación:', document.proyecto.ubicacion], ['Descripción:', document.proyecto.descripcion]];
  const infoBottom = Math.max(detailRows(clientRows, 16, 47, false), detailRows(projectRows, 111, 47, false)) + 3;
  // Un alcance excepcionalmente largo pasa al detalle de tabla para preservar el encabezado.
  const compactProjectRows: [string, string][] = infoBottom > 112 ? [['Proyecto:', document.proyecto.nombre], ['Ubicación:', document.proyecto.ubicacion]] : projectRows;
  const bottom = Math.max(detailRows(clientRows, 16, 47, false), detailRows(compactProjectRows, 111, 47, false)) + 3;
  pdf.setFillColor('#F7F7F6').roundedRect(12, 37, WIDTH, bottom - 37, 1.5, 1.5, 'F');
  pdf.setDrawColor('#E4E4E4').setLineWidth(0.2).line(105, 41, 105, bottom - 3);
  section(pdf, 'CLIENTE', 16, 42);
  section(pdf, 'PROYECTO', 111, 42);
  detailRows(clientRows, 16, 47, true);
  detailRows(compactProjectRows, 111, 47, true);
  pdf.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRAY);
  pdf.text('A continuación, presentamos nuestra cotización según los requerimientos del proyecto.', MARGIN, bottom + 6);

  const body = document.items.map((item, i) => [String(i + 1).padStart(2, '0'), `${item.nombre}${item.descripcion ? '\n' + item.descripcion : ''}`, item.unidad, item.cantidad.toLocaleString('es-CL', { maximumFractionDigits: 6 }), quoteMoney(item.precioUnit), quoteMoney(item.total)]);
  if (infoBottom > 112) body.unshift(['', 'Alcance del proyecto\n' + document.proyecto.descripcion, '', '', '', '']);
  autoTable(pdf, {
    startY: bottom + 10,
    margin: { left: MARGIN, right: MARGIN, top: 27, bottom: 23 },
    tableWidth: WIDTH,
    head: [['ÍTEM', 'DESCRIPCIÓN', 'UNIDAD', 'CANT.', 'PRECIO UNIT.', 'TOTAL']],
    body,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.2, lineColor: '#E8E8E8', lineWidth: 0.15, textColor: INK, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: INK, textColor: '#FFFFFF', fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: '#FAFAFA' },
    columnStyles: { 0: { cellWidth: 12, halign: 'center', textColor: ORANGE }, 1: { cellWidth: 79 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 15, halign: 'right' }, 4: { cellWidth: 32, halign: 'right' }, 5: { cellWidth: 34, halign: 'right' } },
    rowPageBreak: 'avoid',
    willDrawPage: (data) => {
      if (data.pageNumber > 1) {
        logo(pdf, MARGIN, 8);
        pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(INK).text(`COTIZACIÓN N.° ${document.folio}`, 198, 15, { align: 'right' });
      }
    },
  });
  let y = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  pdf.setFont('helvetica', 'normal').setFontSize(7.6);
  const observations = document.observaciones.flatMap((value) => pdf.splitTextToSize(value, 83) as string[]);
  const conditions = pdf.splitTextToSize(document.condiciones, 83) as string[];
  const closingHeight = Math.max(65, 19 + observations.length * 3.1 + conditions.length * 3.1);
  if (y + Math.min(closingHeight, 230) > 273) { pdf.addPage(); y = 30; logo(pdf, MARGIN, 8); }
  const summaryY = y;
  // Totales y firma ocupan la derecha; el texto puede continuar en otra página.
  const tx = 111;
  pdf.setFillColor('#F7F7F6').rect(tx, y, 87, 16, 'F');
  for (const [label, value, dy] of [['SUBTOTAL', document.subtotal, 6], ['IVA (19%)', document.iva, 12]] as [string, number, number][]) {
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(INK).text(label, tx + 4, y + dy);
    pdf.text(quoteMoney(value), 194, y + dy, { align: 'right' });
  }
  pdf.setFillColor(ORANGE).rect(tx, y + 16, 87, 10, 'F');
  pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor('#FFFFFF').text('TOTAL', tx + 4, y + 22.5);
  pdf.text(quoteMoney(document.total), 194, y + 22.5, { align: 'right' });
  pdf.setDrawColor('#BBBBBB').setLineWidth(0.2).line(128, y + 49, 181, y + 49);
  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRAY).text('Firma y sello', 154.5, y + 53, { align: 'center' });
  pdf.setFont('helvetica', 'bold').setTextColor(ORANGE).text('ObraTrack', 154.5, y + 57, { align: 'center' });

  const paragraph = (value: string) => {
    pdf.setFont('helvetica', 'normal').setFontSize(7.6).setTextColor(INK);
    const lines: string[] = pdf.splitTextToSize(value, 83);
    for (const line of lines) {
      if (y + 4 > 273) { pdf.addPage(); logo(pdf, MARGIN, 8); y = 32; section(pdf, 'OBSERVACIONES Y CONDICIONES (CONTINUACIÓN)', MARGIN, 27); pdf.setFont('helvetica', 'normal').setFontSize(7.6).setTextColor(INK); }
      pdf.text(line, MARGIN, y);
      y += 3.3;
    }
    y += 2;
  };
  section(pdf, 'OBSERVACIONES', MARGIN, summaryY + 3);
  y += 8;
  for (const value of document.observaciones) paragraph(value);
  y += 3;
  if (y + 12 > 273) { pdf.addPage(); logo(pdf, MARGIN, 8); y = 32; }
  section(pdf, 'CONDICIONES DE PAGO', MARGIN, y);
  y += 5;
  paragraph(document.condiciones);

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(ORANGE).setLineWidth(0.3).line(MARGIN, 282, 198, 282);
    pdf.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(INK);
    pdf.text(pdf.splitTextToSize(document.emisor.empresa, 85).slice(0, 1), MARGIN, 286);
    pdf.setFont('helvetica', 'normal').setTextColor(GRAY);
    pdf.text(pdf.splitTextToSize([document.emisor.nombre, document.emisor.email, document.emisor.telefono].filter(Boolean).join(' · '), 150).slice(0, 2), MARGIN, 289.5);
    pdf.text(`${page} / ${pages}`, 198, 289.5, { align: 'right' });
  }
  return pdf;
}

export function downloadQuotePdf(document: QuoteDocument) {
  createQuotePdf(document).save(document.filename);
}
