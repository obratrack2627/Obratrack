import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawObraTrackWordmarkPdf } from '@/lib/brand-pdf';
import { projectStatusLabel } from '@/lib/project-status';
import { formatDate } from '@/lib/utils';
import { chileToday } from '@/lib/work-calendar';
import type { Actividad, BitacoraEntrada, Cliente, Proyecto } from '@/types/database';

const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;

export interface ExecutiveProjectPdfInput {
  proyecto: Proyecto;
  cliente?: Cliente | null;
  empresaNombre?: string;
  empresaRut?: string | null;
  empresaLogoUrl?: string | null;
  actividades: Actividad[];
  bitacora: BitacoraEntrada[];
}

/**
 * Genera y descarga un Informe Ejecutivo de Avance (PDF A4) apto para compartir con el mandante.
 * No incluye costos internos ni márgenes.
 */
export function downloadExecutiveProjectPdf(input: ExecutiveProjectPdfInput): void {
  if (typeof window === 'undefined') return;
  const {
    proyecto,
    cliente,
    empresaNombre = 'Constructora ObraTrack',
    empresaRut,
    empresaLogoUrl,
    actividades,
    bitacora,
  } = input;

  const pdf = new jsPDF({ format: 'a4', compress: true });
  let startY = 34;

  const logoTrimmed = (empresaLogoUrl || '').trim();
  const logoMatch = LOGO_DATA_URL_RE.exec(logoTrimmed);
  let drewCustomLogo = false;
  if (logoMatch) {
    try {
      const format = logoMatch[1].toUpperCase() === 'JPG' ? 'JPEG' : logoMatch[1].toUpperCase();
      const props = pdf.getImageProperties(logoTrimmed);
      const maxW = 40;
      const maxH = 14;
      const ratio =
        props?.width && props?.height ? Math.min(maxW / props.width, maxH / props.height) : 1;
      const w = props?.width && props?.height ? props.width * ratio : maxW;
      const h = props?.width && props?.height ? props.height * ratio : maxH;
      pdf.addImage(logoTrimmed, format, 14, 10, w, h, undefined, 'FAST');
      drewCustomLogo = true;
      pdf
        .setFont('helvetica', 'bold')
        .setFontSize(11)
        .setTextColor('#1E1E1E')
        .text(empresaNombre, 14 + w + 4, 15);
      if (empresaRut) {
        pdf
          .setFont('helvetica', 'normal')
          .setFontSize(8)
          .setTextColor('#666666')
          .text(`RUT: ${empresaRut}`, 14 + w + 4, 20);
      }
      startY = 31;
    } catch {
      drewCustomLogo = false;
    }
  }

  if (!drewCustomLogo) {
    drawObraTrackWordmarkPdf(pdf, 14, 11, `${empresaNombre} · INFORME EJECUTIVO DE AVANCE`);
  }

  pdf
    .setFont('helvetica', 'normal')
    .setFontSize(8.5)
    .setTextColor('#666666')
    .text(`Emitido: ${formatDate(chileToday())}`, 196, 16, { align: 'right' });

  pdf.setDrawColor('#E5DFC9').line(14, startY - 3, 196, startY - 3);

  pdf
    .setFont('helvetica', 'bold')
    .setFontSize(15)
    .setTextColor('#1E1E1E')
    .text(`Informe de Avance: ${proyecto.nombre}`, 14, startY + 5);

  const avance = Math.max(
    0,
    Math.min(100, Math.round(Number(proyecto.porcentaje_avance_ponderado) || 0)),
  );
  const completedCount = actividades.filter(
    (a) => Number(a.porcentaje_avance) >= 100 || a.estado === 'terminada',
  ).length;
  const location = [proyecto.direccion, proyecto.comuna, proyecto.region].filter(Boolean).join(', ');

  autoTable(pdf, {
    startY: startY + 11,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, textColor: '#1E1E1E' },
    headStyles: { fillColor: [20, 26, 35], textColor: '#FFFFFF', fontStyle: 'bold' },
    head: [['Antecedente', 'Detalle']],
    body: [
      ['Mandante / Cliente', cliente?.nombre || 'No especificado'],
      ['Ubicación', location || 'Chile'],
      ['Estado operativo', projectStatusLabel(proyecto.estado)],
      ['Avance general', `${avance}% (${completedCount} de ${actividades.length} partidas completadas)`],
      ['Periodo programado', `${formatDate(proyecto.fecha_inicio)} al ${formatDate(proyecto.fecha_termino_estimada)}`],
    ],
  });

  const afterMetaY = (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 8 : startY + 62;

  pdf
    .setFont('helvetica', 'bold')
    .setFontSize(11)
    .setTextColor('#1E1E1E')
    .text('Estado de Partidas (Carta Gantt)', 14, afterMetaY);

  autoTable(pdf, {
    startY: afterMetaY + 3,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: '#1E1E1E' },
    headStyles: { fillColor: [255, 106, 0], textColor: '#FFFFFF', fontStyle: 'bold' },
    head: [['Partida', 'Inicio', 'Término', 'Estado', 'Avance']],
    body:
      actividades.length > 0
        ? actividades.map((a) => [
            a.nombre,
            formatDate(a.fecha_inicio),
            formatDate(a.fecha_termino),
            a.estado === 'terminada' ? 'Terminada' : a.estado === 'en_curso' ? 'En curso' : 'Pendiente',
            `${Math.round(Number(a.porcentaje_avance) || 0)}%`,
          ])
        : [['Sin partidas registradas', '—', '—', '—', '0%']],
  });

  const sortedLogs = [...bitacora]
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .slice(0, 8);

  if (sortedLogs.length > 0) {
    const afterGanttY =
      (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 8 : afterMetaY + 45;
    pdf
      .setFont('helvetica', 'bold')
      .setFontSize(11)
      .setTextColor('#1E1E1E')
      .text('Hitos Recientes en Bitácora', 14, afterGanttY);

    autoTable(pdf, {
      startY: afterGanttY + 3,
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 2.2, textColor: '#1E1E1E' },
      headStyles: { fillColor: [34, 42, 55], textColor: '#FFFFFF', fontStyle: 'bold' },
      head: [['Fecha', 'Tipo', 'Hito / Novedad', 'Detalle']],
      body: sortedLogs.map((entry) => [
        formatDate(entry.fecha),
        entry.tipo.replace('_', ' '),
        entry.titulo,
        (entry.nota || '').slice(0, 140),
      ]),
    });
  }

  const safeName = proyecto.nombre.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'Obra';
  pdf.save(`Informe_Avance_${safeName}_${chileToday()}.pdf`);
}
