import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ResumenEstadoPago } from '@/lib/edp-calculator';
import type { Actividad } from '@/types/database';
import { quoteMoney } from '@/lib/quotes/document';
export function paymentPdf(input: { nombre: string; cliente: string; fecha: string; resumen: ResumenEstadoPago; actividades: Actividad[]; observacion: string }) {
  const pdf = new jsPDF({ format: 'a4', compress: true });
  pdf.setFont('helvetica', 'bold').setFontSize(22).setTextColor('#FF6A00').text('ObraTrack', 14, 21);
  pdf.setFontSize(13).setTextColor('#1E1E1E').text('ESTADO DE PAGO ' + input.resumen.folio, 14, 32);
  autoTable(pdf, { startY: 37, head: [['OBRA', 'CLIENTE', 'FECHA']], body: [[input.nombre, input.cliente, input.fecha]], theme: 'grid', headStyles: { fillColor: '#1E1E1E' }, styles: { fontSize: 9 } });
  const r = input.resumen;
  const rows = [
    ['Monto contratado vigente (IVA incluido)', quoteMoney(r.montoContratadoVigente)],
    ['Avance promedio de partidas', r.porcentajeAvanceFisico + '%'],
    ['Valorización del avance acumulado', quoteMoney(r.valorAvanceAcumulado)],
    ['Pagos anteriores confirmados', quoteMoney(r.totalPagadoAnterior)],
    ['Monto bruto del período', quoteMoney(r.montoBrutoPeriodoConIva)],
    ['Retención de garantía (' + r.retencionPorcentaje + '%)', quoteMoney(r.retencionMonto)],
    ['Neto del monto a pagar', quoteMoney(r.netoPeriodo)],
    ['IVA incluido en el líquido (19%)', quoteMoney(r.ivaPeriodo)],
    ['LÍQUIDO A PAGAR', quoteMoney(r.liquidoAPagarConIva)],
    ['Saldo del contrato tras el pago', quoteMoney(r.saldoRemanenteTrasEdp)],
  ];
  autoTable(pdf, { startY: (pdf as any).lastAutoTable.finalY + 8, head: [['CONCEPTO', 'MONTO CLP']], body: rows, theme: 'striped', headStyles: { fillColor: '#FF6A00' }, columnStyles: { 1: { halign: 'right' } }, styles: { fontSize: 9 } });
  if (input.actividades.length) autoTable(pdf, { startY: (pdf as any).lastAutoTable.finalY + 8, head: [['PARTIDA', 'AVANCE']], body: input.actividades.map((a) => [a.nombre, a.porcentaje_avance + '%']), theme: 'grid', headStyles: { fillColor: '#1E1E1E' }, rowPageBreak: 'avoid' });
  if (input.observacion) autoTable(pdf, { startY: (pdf as any).lastAutoTable.finalY + 8, head: [['OBSERVACIONES']], body: [[input.observacion]], headStyles: { fillColor: '#666666' }, styles: { fontSize: 9 } });
  for (let i = 1; i <= pdf.getNumberOfPages(); i++) { pdf.setPage(i); pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor('#666666').text(`ObraTrack · Documento de cobro · ${i} / ${pdf.getNumberOfPages()}`, 14, 289); }
  return pdf;
}
