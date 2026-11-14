import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ResumenEstadoPago } from '@/lib/edp-calculator';
import type { Actividad } from '@/types/database';
import { quoteMoney } from '@/lib/quotes/document';

const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;

export interface PaymentPdfEmisor {
  empresa?: string;
  rut?: string;
  nombre?: string;
  logoUrl?: string;
  giro?: string;
  email?: string;
  telefono?: string;
  datosBancarios?: string;
}

export function paymentPdf(input: {
  nombre: string;
  cliente: string;
  fecha: string;
  resumen: ResumenEstadoPago;
  actividades: Actividad[];
  observacion: string;
  emisor?: PaymentPdfEmisor;
}) {
  const pdf = new jsPDF({ format: 'a4', compress: true });
  let headerStartY = 32;
  const logoUrl = (input.emisor?.logoUrl || '').trim();
  const match = LOGO_DATA_URL_RE.exec(logoUrl);
  let drewCustomLogo = false;
  if (match) {
    try {
      const format = match[1].toUpperCase() === 'JPG' ? 'JPEG' : match[1].toUpperCase();
      const props = pdf.getImageProperties(logoUrl);
      const maxW = 40;
      const maxH = 14;
      const ratio = props?.width && props?.height ? Math.min(maxW / props.width, maxH / props.height) : 1;
      const w = props?.width && props?.height ? props.width * ratio : maxW;
      const h = props?.width && props?.height ? props.height * ratio : maxH;
      pdf.addImage(logoUrl, format, 14, 10, w, h, undefined, 'FAST');
      drewCustomLogo = true;
      if (input.emisor?.empresa) {
        pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor('#1E1E1E').text(input.emisor.empresa, 14 + w + 4, 15);
        const sub = [input.emisor.rut ? `RUT: ${input.emisor.rut}` : '', input.emisor.giro].filter(Boolean).join(' · ');
        if (sub) {
          pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor('#666666').text(pdf.splitTextToSize(sub, 120).slice(0, 1), 14 + w + 4, 20);
        }
      }
      headerStartY = 30;
    } catch {
      drewCustomLogo = false;
    }
  }
  if (!drewCustomLogo) {
    pdf.setFont('helvetica', 'bold').setFontSize(22).setTextColor('#FF6A00').text(input.emisor?.empresa || 'ObraTrack', 14, 21);
  }
  pdf.setFont('helvetica', 'bold').setFontSize(13).setTextColor('#1E1E1E').text('ESTADO DE PAGO ' + input.resumen.folio, 14, headerStartY);
  autoTable(pdf, { startY: headerStartY + 5, head: [['OBRA', 'CLIENTE', 'FECHA']], body: [[input.nombre, input.cliente, input.fecha]], theme: 'grid', headStyles: { fillColor: '#1E1E1E' }, styles: { fontSize: 9 } });
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
  const obsParts = [input.observacion, input.emisor?.datosBancarios ? `Datos para transferencia: ${input.emisor.datosBancarios}` : ''].filter(Boolean);
  if (obsParts.length) autoTable(pdf, { startY: (pdf as any).lastAutoTable.finalY + 8, head: [['OBSERVACIONES Y DATOS DE PAGO']], body: [[obsParts.join('\n')]], headStyles: { fillColor: '#666666' }, styles: { fontSize: 9 } });
  const footerBrand = input.emisor?.empresa || 'ObraTrack';
  const footerContact = [input.emisor?.rut ? `RUT ${input.emisor.rut}` : '', input.emisor?.email, input.emisor?.telefono].filter(Boolean).join(' · ');
  for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor('#666666').text(
      `${footerBrand}${footerContact ? ` · ${footerContact}` : ''} · Documento de cobro · ${i} / ${pdf.getNumberOfPages()}`,
      14,
      289,
    );
  }
  return pdf;
}
