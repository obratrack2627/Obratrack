import ExcelJS from 'exceljs';
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
  sheet.columns = [
    { header: 'Material', width: 42 },
    { header: 'Unidad', width: 12 },
    { header: 'Cantidad', width: 14 },
    { header: 'Precio unitario con IVA', width: 24 },
    { header: 'Subtotal con IVA', width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  const lines = quote.partidas_venta ?? [];
  for (const line of lines) {
    const row = sheet.addRow([line.nombre, line.unidad, line.cantidad, line.precio_unitario]);
    row.getCell(5).value = { formula: `ROUND(C${row.number}*D${row.number},0)`, result: line.subtotal };
  }
  const totals = quote.estructura_financiera;
  sheet.addRow([]);
  const total = sheet.addRow([null, null, null, 'Total con IVA', { formula: `SUM(E2:E${lines.length + 1})`, result: totals.precio_total_con_iva }]);
  const net = sheet.addRow([null, null, null, 'Neto', { formula: `ROUND(E${total.number}*100/119,0)`, result: totals.precio_sugerido_neto }]);
  sheet.addRow([null, null, null, 'IVA (19 %)', { formula: `E${total.number}-E${net.number}`, result: totals.iva_19 }]);
  sheet.getColumn(4).numFmt = '"$"#,##0';
  sheet.getColumn(5).numFmt = '"$"#,##0';
  total.font = { bold: true };
  const bytes = Uint8Array.from(new Uint8Array(await workbook.xlsx.writeBuffer())).buffer;
  return { bytes, mime: excelMime as typeof excelMime, filename: `Presupuesto_${quote.id}.xlsx`, caption: 'Presupuesto aprobado · Excel editable' };
}
