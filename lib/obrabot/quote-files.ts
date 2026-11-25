import ExcelJS from 'exceljs';
import { buildQuoteDocument } from '@/lib/quotes/document';
import { resolveSaleLineKind } from '@/lib/quotes/classify';
import type { CotizacionEstimacion } from '@/types/database';

export type QuoteFormat = 'pdf' | 'excel';
export const excelMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function quoteFile(db: any, empresaId: string, quote: CotizacionEstimacion, format: QuoteFormat) {
  if (format === 'pdf') {
    const { buildQuotePdfBuffer } = await import('@/lib/whatsapp/quote-document');
    const document = await buildQuotePdfBuffer(db, { cotizacion: quote, empresaId });
    return { ...document, mime: 'application/pdf' as const };
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ObraTrack';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Presupuesto', {
    properties: { defaultRowHeight: 22 },
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 },
    },
  });
  const ivaIncluded = quote.modo_presupuesto === 'precio_acordado' && quote.tratamiento_iva !== 'neto';
  sheet.columns = [
    { header: 'Partida / Descripción', width: 44 },
    { header: 'Unidad', width: 12 },
    { header: 'Cantidad', width: 14 },
    { header: ivaIncluded ? 'Precio unitario con IVA' : 'Precio unitario neto', width: 24 },
    { header: ivaIncluded ? 'Subtotal con IVA' : 'Subtotal neto', width: 22 },
    { header: 'Sección', width: 20 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Calibri', bold: true, size: 10.5, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF141A23' } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNum === 1 ? 'left' : colNum === 2 || colNum === 6 ? 'center' : 'right',
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF141A23' } },
      bottom: { style: 'medium', color: { argb: 'FFFF6A00' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });

  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FFD9E1EC' } },
    left: { style: 'thin' as const, color: { argb: 'FFD9E1EC' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFD9E1EC' } },
    right: { style: 'thin' as const, color: { argb: 'FFD9E1EC' } },
  };
  const styleItemRow = (row: ExcelJS.Row, idx: number) => {
    row.height = 22;
    const bg = idx % 2 === 1 ? 'FFFAF8F5' : 'FFFFFFFF';
    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 1 ? 'left' : c === 2 || c === 6 ? 'center' : 'right',
        wrapText: c === 1,
      };
      cell.border = thinBorder;
    }
  };

  let rowCount = 0;
  if (quote.modo_presupuesto === 'precio_acordado' && quote.partidas_venta?.length) {
    for (const line of quote.partidas_venta) {
      const fixed = line.precio_partida;
      const lumpSum = fixed != null && line.unidad === 'gl';
      const sectionLabel = resolveSaleLineKind(line) === 'material' ? 'Material' : 'Partida / Trabajo';
      const row = sheet.addRow([line.nombre, lumpSum ? null : line.unidad, lumpSum ? null : line.cantidad, fixed == null ? line.precio_unitario : null, null, sectionLabel]);
      row.getCell(5).value = fixed ?? { formula: `ROUND(C${row.number}*D${row.number},0)`, result: line.subtotal };
      styleItemRow(row, rowCount);
      rowCount++;
    }
  } else {
    for (const item of buildQuoteDocument(quote).items) {
      const lumpSum = item.precioUnit == null || (item.unidad === 'gl' && item.cantidad === 1);
      const sectionLabel = item.tipo === 'material' ? 'Material' : item.nombre.startsWith('Mano de obra:') ? 'Mano de obra' : 'Indirectos';
      const row = sheet.addRow([item.nombre, lumpSum ? null : item.unidad, lumpSum ? null : item.cantidad, lumpSum ? null : item.precioUnit, null, sectionLabel]);
      row.getCell(5).value = lumpSum ? item.total : { formula: `ROUND(C${row.number}*D${row.number},0)`, result: item.total };
      styleItemRow(row, rowCount);
      rowCount++;
    }
  }
  const totals = quote.estructura_financiera;
  const spacer = sheet.addRow([]);
  spacer.height = 10;

  const styleSummaryRow = (row: ExcelJS.Row, highlight: boolean) => {
    row.height = highlight ? 26 : 22;
    for (let c = 4; c <= 5; c++) {
      const cell = row.getCell(c);
      cell.font = {
        name: 'Calibri',
        size: highlight ? 11 : 10,
        bold: highlight || c === 4,
        color: { argb: 'FF141A23' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: highlight ? 'FFFFF4EB' : 'FFFAF8F5' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.border = highlight
        ? {
            top: { style: 'medium', color: { argb: 'FFFF6A00' } },
            bottom: { style: 'double', color: { argb: 'FF141A23' } },
            left: { style: 'thin', color: { argb: 'FFD9E1EC' } },
            right: { style: 'thin', color: { argb: 'FFD9E1EC' } },
          }
        : thinBorder;
    }
  };

  const sumFormula = rowCount > 0 ? `SUM(E2:E${rowCount + 1})` : '0';
  if (ivaIncluded) {
    const total = sheet.addRow([null, null, null, 'Total con IVA', { formula: sumFormula, result: totals.precio_total_con_iva }]);
    const net = sheet.addRow([null, null, null, 'Neto', { formula: `ROUND(E${total.number}*100/119,0)`, result: totals.precio_sugerido_neto }]);
    const iva = sheet.addRow([null, null, null, 'IVA (19 %)', { formula: `E${total.number}-E${net.number}`, result: totals.iva_19 }]);
    styleSummaryRow(total, true);
    styleSummaryRow(net, false);
    styleSummaryRow(iva, false);
  } else {
    const net = sheet.addRow([null, null, null, 'Neto', { formula: sumFormula, result: totals.precio_sugerido_neto }]);
    const iva = sheet.addRow([null, null, null, 'IVA (19 %)', { formula: `ROUND(E${net.number}*19/100,0)`, result: totals.iva_19 }]);
    const total = sheet.addRow([null, null, null, 'Total con IVA', { formula: `E${net.number}+E${iva.number}`, result: totals.precio_total_con_iva }]);
    styleSummaryRow(net, false);
    styleSummaryRow(iva, false);
    styleSummaryRow(total, true);
  }
  sheet.getColumn(4).numFmt = '"$"#,##0';
  sheet.getColumn(5).numFmt = '"$"#,##0';
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
  const bytes = Uint8Array.from(new Uint8Array(await workbook.xlsx.writeBuffer())).buffer;
  return {
    bytes,
    mime: excelMime as typeof excelMime,
    filename: `Presupuesto_${quote.id}.xlsx`,
    caption: quote.modo_presupuesto === 'precio_acordado' ? 'Presupuesto aprobado · Excel editable' : 'Presupuesto · Excel editable',
  };
}
