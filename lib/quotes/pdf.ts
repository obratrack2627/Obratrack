import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawObraTrackWordmarkPdf } from '@/lib/brand-pdf';
import { quoteMoney, type QuoteConsideredMaterial, type QuoteDocument, type QuoteLine } from './document';

const ORANGE = '#EA4C00';
const HEADER_DARK = '#141414';
const INK = '#1E1E1E';
const GRAY = '#666666';
const BORDER = '#DCDCDC';
const ROW_ALT = '#F7F7F7';
const MARGIN = 12;
const WIDTH = 186;
const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;

// Logo vectorial: conserva nitidez al ampliar, sin imágenes ni servicios externos.
function logo(pdf: jsPDF, x: number, y: number, subtitle?: string) {
  drawObraTrackWordmarkPdf(pdf, x, y, subtitle);
}

function drawBrand(pdf: jsPDF, document: QuoteDocument, x: number, y: number, compact = false) {
  const logoUrl = (document.emisor.logoUrl || '').trim();
  const match = LOGO_DATA_URL_RE.exec(logoUrl);
  if (match) {
    try {
      const format = match[1].toUpperCase() === 'JPG' ? 'JPEG' : match[1].toUpperCase();
      const maxW = compact ? 32 : 44;
      const maxH = compact ? 10 : 16;
      const props = pdf.getImageProperties(logoUrl);
      const ratio = props?.width && props?.height ? Math.min(maxW / props.width, maxH / props.height) : 1;
      const w = props?.width && props?.height ? props.width * ratio : maxW;
      const h = props?.width && props?.height ? props.height * ratio : maxH;
      const imgY = y + Math.max(0, (maxH - h) / 2);
      pdf.addImage(logoUrl, format, x, imgY, w, h, undefined, 'FAST');

      const hasCompany = document.emisor.empresa && document.emisor.empresa !== 'Emitido con ObraTrack';
      const textX = x + w + 4;
      const textMaxW = Math.max(36, 138 - textX);
      let textY = y + (compact ? 4.5 : 5.5);
      if (hasCompany) {
        pdf.setFont('helvetica', 'bold').setFontSize(compact ? 8.5 : 11).setTextColor(INK);
        const titleLines = pdf.splitTextToSize(document.emisor.empresa, textMaxW).slice(0, compact ? 1 : 2) as string[];
        pdf.text(titleLines, textX, textY);
        textY += titleLines.length * (compact ? 3.5 : 4.2);
      }
      if (!compact) {
        pdf.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRAY);
        const subParts = [document.emisor.rut ? `RUT: ${document.emisor.rut}` : '', document.emisor.giro].filter(Boolean);
        for (const part of subParts) {
          const lines = pdf.splitTextToSize(part, textMaxW).slice(0, 1) as string[];
          pdf.text(lines, textX, textY);
          textY += 3.2;
        }
      }
      return;
    } catch {
      // Si la imagen falla al decodificar en el navegador/entorno, respaldar con el logo vectorial.
    }
  }
  logo(pdf, x, y, document.emisor.giro || undefined);
}

function section(pdf: jsPDF, title: string, x: number, y: number) {
  pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ORANGE).text(title, x, y);
}

function drawSectionBanner(pdf: jsPDF, title: string, y: number) {
  const cy = y - 1.1;
  const cx = MARGIN + 2.3;
  pdf.setFillColor(ORANGE).circle(cx, cy, 2.3, 'F');
  pdf.setDrawColor('#FFFFFF').setLineWidth(0.45);
  pdf.line(cx - 1.0, cy - 0.55, cx + 1.0, cy - 0.55);
  pdf.line(cx - 1.0, cy + 0.55, cx + 1.0, cy + 0.55);
  pdf.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(HEADER_DARK).text(title, MARGIN + 6.8, y);
  const titleWidth = pdf.getTextWidth(title);
  const lineStart = MARGIN + 6.8 + titleWidth + 3.2;
  if (lineStart < MARGIN + WIDTH) {
    pdf.setDrawColor(ORANGE).setLineWidth(0.45).line(lineStart, cy, MARGIN + WIDTH, cy);
  }
}

export function createQuotePdf(document: QuoteDocument) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: `Cotización ${document.folio} · ${document.proyecto.nombre}`, author: document.emisor.empresa, creator: 'ObraTrack' });
  drawBrand(pdf, document, MARGIN, 11);
  pdf.setDrawColor(ORANGE).setLineWidth(0.3).line(141, 12, 141, 32);
  pdf.setFont('helvetica', 'bold').setFontSize(17).setTextColor(INK).text('COTIZACIÓN', 147, 18);
  pdf.setFontSize(8).text(`N.° ${document.folio}`, 147, 24);
  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRAY);
  if (document.fecha) pdf.text(`FECHA: ${document.fecha}`, 147, 28);
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

  function drawItems(items: QuoteLine[], startY: number, opts: { itemColTitle: string; reference?: boolean }) {
    const firstPage = pdf.getCurrentPageInfo().pageNumber;
    const reference = Boolean(opts.reference);
    const billedTotalLabel = document.ivaIncluidoEnPartidas ? 'TOTAL (IVA INCL.)' : 'TOTAL';
    const body = items.map((item, i) => [String(i + 1), `${item.nombre}${item.descripcion ? '\n' + item.descripcion : ''}`, item.unidad === 'gl' && item.precioUnit === null ? '' : item.unidad, item.unidad === 'gl' && item.precioUnit === null ? '' : item.cantidad.toLocaleString('es-CL', { maximumFractionDigits: 6 }), item.precioUnit === null ? '—' : quoteMoney(item.precioUnit), quoteMoney(item.total)]);
    autoTable(pdf, {
      startY,
      margin: { left: MARGIN, right: MARGIN, top: 27, bottom: 23 },
      tableWidth: WIDTH,
      head: [['N°', opts.itemColTitle, 'UNIDAD', 'CANT.', 'PRECIO UNIT.', reference ? 'IMPORTE REF.' : billedTotalLabel]],
      body,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 1.85, lineColor: BORDER, lineWidth: 0.15, textColor: INK, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: HEADER_DARK, textColor: '#FFFFFF', fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { cellWidth: 11, halign: 'center', fillColor: ORANGE, textColor: '#FFFFFF', fontStyle: 'bold' },
        1: { cellWidth: 80 },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 15, halign: 'right' },
        4: { cellWidth: 32, halign: 'right' },
        5: { cellWidth: 34, halign: 'right' },
      },
      rowPageBreak: 'avoid',
      willDrawPage: () => {
        if (pdf.getCurrentPageInfo().pageNumber > firstPage) {
          drawBrand(pdf, document, MARGIN, 8, true);
          pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(INK).text(`COTIZACIÓN N.° ${document.folio}`, 198, 15, { align: 'right' });
        }
      },
    });
    return (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  function drawConsideredMaterials(rows: QuoteConsideredMaterial[], startY: number) {
    const firstPage = pdf.getCurrentPageInfo().pageNumber;
    const body = rows.map((row, i) => [String(i + 1), row.cantidadTexto, row.nombre]);
    autoTable(pdf, {
      startY,
      margin: { left: MARGIN, right: MARGIN, top: 27, bottom: 23 },
      tableWidth: WIDTH,
      head: [['N°', 'CANT.', 'MATERIAL / INSUMO']],
      body,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 1.9, lineColor: BORDER, lineWidth: 0.15, textColor: INK, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: HEADER_DARK, textColor: '#FFFFFF', fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { cellWidth: 13, halign: 'center', fillColor: ORANGE, textColor: '#FFFFFF', fontStyle: 'bold' },
        1: { cellWidth: 24, halign: 'center' },
        2: { cellWidth: 149, halign: 'left' },
      },
      rowPageBreak: 'avoid',
      willDrawPage: () => {
        if (pdf.getCurrentPageInfo().pageNumber > firstPage) {
          drawBrand(pdf, document, MARGIN, 8, true);
          pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(INK).text(`COTIZACIÓN N.° ${document.folio}`, 198, 15, { align: 'right' });
        }
      },
    });
    return (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  const hasPartidas = document.partidasSeccion.length > 0;
  const hasMateriales = document.materialesSeccion.length > 0;
  const hasConsidered = document.materialesConsiderados.length > 0;
  const ivaSuffix = document.ivaIncluidoEnPartidas ? ' · IVA INCLUIDO' : ' · VALORES NETOS';
  let tableEnd = bottom + 4;
  let nextY = bottom + 7;

  if (hasPartidas) {
    const titlePartidas = `${hasMateriales || hasConsidered ? '1. ' : ''}PARTIDAS / TRABAJOS${ivaSuffix}`;
    drawSectionBanner(pdf, titlePartidas, nextY);
    nextY += 3.5;
    const isInternalPartidas = !document.ivaIncluidoEnPartidas && document.partidasSeccion.every((item) =>
      /^(?:Mano de obra:|Gastos generales$|Provisi[oó]n de imprevistos$|Margen sobre venta$|Utilidad$)/.test(item.nombre),
    );
    if (isInternalPartidas && document.trabajosIncluidos.length > 0) {
      const worksLine = `Trabajos / fases: ${document.trabajosIncluidos.map((t) => `${t.nombre} (${t.dias} d)`).join(' · ')}`;
      pdf.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(GRAY);
      const wrapped = (pdf.splitTextToSize(worksLine, WIDTH) as string[]).slice(0, 2);
      pdf.text(wrapped, MARGIN, nextY);
      nextY += wrapped.length * 2.9 + 0.8;
    }
    tableEnd = drawItems(document.partidasSeccion, nextY, { itemColTitle: 'PARTIDA / TRABAJO' });
    nextY = tableEnd + 6.5;
  }

  if (hasMateriales) {
    if (hasPartidas && nextY > 246) {
      pdf.addPage();
      drawBrand(pdf, document, MARGIN, 8, true);
      nextY = 27;
    }
    const prefix = hasPartidas ? '2. ' : '';
    const titleMateriales = document.materialesEsReferencia
      ? `${prefix}MATERIALES INCLUIDOS · REFERENCIA NETA`
      : `${prefix}MATERIALES${ivaSuffix}`;
    drawSectionBanner(pdf, titleMateriales, nextY);
    nextY += 3.5;
    tableEnd = drawItems(document.materialesSeccion, nextY, {
      itemColTitle: document.materialesEsReferencia ? 'MATERIALES INCLUIDOS · VALORES NETOS DE REFERENCIA' : 'MATERIAL',
      reference: document.materialesEsReferencia,
    });
    nextY = tableEnd + 6.5;
  }

  if (hasConsidered) {
    if ((hasPartidas || hasMateriales) && nextY > 246) {
      pdf.addPage();
      drawBrand(pdf, document, MARGIN, 8, true);
      nextY = 27;
    }
    drawSectionBanner(pdf, 'MATERIALES CONSIDERADOS', nextY);
    nextY += 3.5;
    tableEnd = drawConsideredMaterials(document.materialesConsiderados, nextY);
    nextY = tableEnd + 6.5;
  }

  // Bloque RESUMEN ECONÓMICO (ancho completo con barra naranja destacada).
  const econRows = document.resumenEconomico;
  const econRowH = 6.2;
  const econBarH = 9.5;
  const econTotalH = 5 + econRows.length * econRowH + econBarH + 6;
  let econY = Math.max(tableEnd + 6.5, nextY);
  if (econY + econTotalH > 273) {
    pdf.addPage();
    drawBrand(pdf, document, MARGIN, 8, true);
    econY = 28;
  }
  drawSectionBanner(pdf, 'RESUMEN ECONÓMICO', econY);
  let ry = econY + 3.5;
  for (let i = 0; i < econRows.length; i++) {
    const row = econRows[i];
    pdf.setFillColor(i % 2 === 0 ? '#F2F2F2' : '#FFFFFF');
    pdf.setDrawColor(BORDER).setLineWidth(0.18).rect(MARGIN, ry, WIDTH, econRowH, 'FD');
    pdf.setFont('helvetica', 'bold').setFontSize(7.8).setTextColor(INK).text(row.label, MARGIN + 3.5, ry + 4.1);
    pdf.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor(INK).text(quoteMoney(row.amount), MARGIN + WIDTH - 3.5, ry + 4.1, { align: 'right' });
    ry += econRowH;
  }
  ry += 1.5;
  pdf.setFillColor(ORANGE).rect(MARGIN, ry, WIDTH, econBarH, 'F');
  pdf.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor('#FFFFFF').text('TOTAL GENERAL DEL PROYECTO', MARGIN + 3.5, ry + 6.1);
  pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor('#FFFFFF').text(quoteMoney(document.total), MARGIN + WIDTH - 3.5, ry + 6.3, { align: 'right' });
  ry += econBarH + 4;
  pdf.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(GRAY).text(
    document.ivaIncluidoEnPartidas
      ? 'Valores expresados en pesos chilenos (CLP) · IVA incluido.'
      : 'Valores expresados en pesos chilenos (CLP).',
    MARGIN,
    ry,
  );

  let y = ry + 6;
  pdf.setFont('helvetica', 'normal').setFontSize(7.4);
  const observations = document.observaciones.flatMap((value) => pdf.splitTextToSize(value, 110) as string[]);
  const conditions = pdf.splitTextToSize(document.condiciones, 110) as string[];
  const closingHeight = Math.max(40, 14 + observations.length * 3.0 + conditions.length * 3.0);
  if (y + Math.min(closingHeight, 230) > 273) { pdf.addPage(); y = 30; drawBrand(pdf, document, MARGIN, 8, true); }
  const summaryY = y;
  pdf.setDrawColor('#BBBBBB').setLineWidth(0.2).line(134, y + 26, 189, y + 26);
  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRAY).text('Firma y sello', 161.5, y + 30, { align: 'center' });
  const firmaLabel = pdf.splitTextToSize(document.emisor.firma || 'ObraTrack', 54)[0] || 'ObraTrack';
  pdf.setFont('helvetica', 'bold').setTextColor(ORANGE).text(firmaLabel, 161.5, y + 34, { align: 'center' });

  const paragraph = (value: string) => {
    pdf.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(INK);
    const lines: string[] = pdf.splitTextToSize(value, 110);
    for (const line of lines) {
      if (y + 4 > 273) { pdf.addPage(); drawBrand(pdf, document, MARGIN, 8, true); y = 32; section(pdf, 'OBSERVACIONES Y CONDICIONES (CONTINUACIÓN)', MARGIN, 27); pdf.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(INK); }
      pdf.text(line, MARGIN, y);
      y += 3.1;
    }
    y += 1.5;
  };
  section(pdf, 'OBSERVACIONES', MARGIN, summaryY + 3);
  y += 7;
  for (const value of document.observaciones) paragraph(value);
  y += 2;
  if (y + 10 > 273) { pdf.addPage(); drawBrand(pdf, document, MARGIN, 8, true); y = 32; }
  section(pdf, 'CONDICIONES DE PAGO', MARGIN, y);
  y += 4.5;
  paragraph(document.condiciones);

  if (infoBottom > 112) {
    y = Math.max(y + 8, summaryY + 65);
    function beginScopePage() {
      pdf.addPage();
      drawBrand(pdf, document, MARGIN, 8, true);
      y = 27;
    }
    if (y > 253) beginScopePage();
    section(pdf, 'DESCRIPCIÓN DEL TRABAJO', MARGIN, y);
    y += 5;
    for (const block of document.proyecto.descripcion.split(/\n\s*\n/)) {
      pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(INK);
      for (const line of pdf.splitTextToSize(block, WIDTH) as string[]) {
        if (y > 273) {
          beginScopePage();
          section(pdf, 'DESCRIPCIÓN DEL TRABAJO (CONTINUACIÓN)', MARGIN, y);
          y += 5;
          pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(INK);
        }
        pdf.text(line, MARGIN, y);
        y += 4.1;
      }
      y += 2;
    }
  }

  const pages = pdf.getNumberOfPages();
  const companyFooter = [document.emisor.empresa, document.emisor.rut ? `RUT: ${document.emisor.rut}` : '']
    .filter(Boolean)
    .join(' · ');
  const contactFooter = [
    [document.emisor.nombre, document.emisor.cargo].filter(Boolean).join(' — '),
    document.emisor.email,
    document.emisor.telefono,
    document.emisor.direccion,
    document.emisor.sitioWeb,
  ]
    .filter(Boolean)
    .join(' · ');

  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(ORANGE).setLineWidth(0.3).line(MARGIN, 282, 198, 282);
    pdf.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(INK);
    pdf.text(pdf.splitTextToSize(companyFooter, 145).slice(0, 1), MARGIN, 286);
    pdf.setFont('helvetica', 'normal').setTextColor(GRAY);
    pdf.text(pdf.splitTextToSize(contactFooter, 165).slice(0, 2), MARGIN, 289.5);
    pdf.text(`${page} / ${pages}`, 198, 289.5, { align: 'right' });
  }
  return pdf;
}

export function downloadQuotePdf(document: QuoteDocument) {
  createQuotePdf(document).save(document.filename);
}
