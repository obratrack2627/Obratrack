import ExcelJS from 'exceljs';
import { buildQuoteDocument } from '@/lib/quotes/document';
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
  const sheet = workbook.addWorksheet('Presupuesto');
  const ivaIncluded = quote.modo_presupuesto === 'precio_acordado' && quote.tratamiento_iva !== 'neto';
  sheet.columns = [
    { header: 'Material', width: 42 },
    { header: 'Unidad', width: 12 },
    { header: 'Cantidad', width: 14 },
    { header: ivaIncluded ? 'Precio unitario con IVA' : 'Precio unitario neto', width: 24 },
    { header: ivaIncluded ? 'Subtotal con IVA' : 'Subtotal neto', width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  let rowCount = 0;
  if (quote.modo_presupuesto === 'precio_acordado' && quote.partidas_venta?.length) {
    for (const line of quote.partidas_venta) {
      const fixed = line.precio_partida;
      const lumpSum = fixed != null && line.unidad === 'gl';
      const row = sheet.addRow([line.nombre, lumpSum ? null : line.unidad, lumpSum ? null : line.cantidad, fixed == null ? line.precio_unitario : null]);
      row.getCell(5).value = fixed ?? { formula: `ROUND(C${row.number}*D${row.number},0)`, result: line.subtotal };
      rowCount++;
    }
  } else {
    for (const item of buildQuoteDocument(quote).items) {
      const lumpSum = item.precioUnit == null || (item.unidad === 'gl' && item.cantidad === 1);
      const row = sheet.addRow([item.nombre, lumpSum ? null : item.unidad, lumpSum ? null : item.cantidad, lumpSum ? null : item.precioUnit]);
      row.getCell(5).value = lumpSum ? item.total : { formula: `ROUND(C${row.number}*D${row.number},0)`, result: item.total };
      rowCount++;
    }
  }
  const totals = quote.estructura_financiera;
  sheet.addRow([]);
  const sumFormula = rowCount > 0 ? `SUM(E2:E${rowCount + 1})` : '0';
  if (ivaIncluded) {
    const total = sheet.addRow([null, null, null, 'Total con IVA', { formula: sumFormula, result: totals.precio_total_con_iva }]);
    const net = sheet.addRow([null, null, null, 'Neto', { formula: `ROUND(E${total.number}*100/119,0)`, result: totals.precio_sugerido_neto }]);
    sheet.addRow([null, null, null, 'IVA (19 %)', { formula: `E${total.number}-E${net.number}`, result: totals.iva_19 }]);
    total.font = { bold: true };
  } else {
    const net = sheet.addRow([null, null, null, 'Neto', { formula: sumFormula, result: totals.precio_sugerido_neto }]);
    const iva = sheet.addRow([null, null, null, 'IVA (19 %)', { formula: `ROUND(E${net.number}*19/100,0)`, result: totals.iva_19 }]);
    const total = sheet.addRow([null, null, null, 'Total con IVA', { formula: `E${net.number}+E${iva.number}`, result: totals.precio_total_con_iva }]);
    total.font = { bold: true };
  }
  sheet.getColumn(4).numFmt = '"$"#,##0';
  sheet.getColumn(5).numFmt = '"$"#,##0';
  const bytes = Uint8Array.from(new Uint8Array(await workbook.xlsx.writeBuffer())).buffer;
  return {
    bytes,
    mime: excelMime as typeof excelMime,
    filename: `Presupuesto_${quote.id}.xlsx`,
    caption: quote.modo_presupuesto === 'precio_acordado' ? 'Presupuesto aprobado · Excel editable' : 'Presupuesto · Excel editable',
  };
}
