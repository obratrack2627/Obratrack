import type { Actividad, BitacoraEntrada, Cliente, Proyecto } from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';

export interface BuildClientProgressWhatsAppParams {
  proyecto: Proyecto;
  cliente?: Cliente | null;
  actividades: Actividad[];
  bitacora: BitacoraEntrada[];
  incluirCobranza?: boolean;
  totalPagado?: number;
}

/**
 * Construye un mensaje de avance seguro para enviar al mandante por WhatsApp.
 * Nunca expone costos internos de materiales, jornales, imprevistos ni márgenes.
 */
export function buildClientProgressWhatsAppText(
  params: BuildClientProgressWhatsAppParams,
): string {
  const { proyecto, cliente, actividades, bitacora, incluirCobranza = false, totalPagado } = params;
  const avance = Math.max(0, Math.min(100, Math.round(Number(proyecto.porcentaje_avance_ponderado) || 0)));
  const completedCount = actividades.filter((a) => Number(a.porcentaje_avance) >= 100 || a.estado === 'terminada').length;
  const activeActs = actividades.filter((a) => Number(a.porcentaje_avance) < 100);
  const location = [proyecto.direccion, proyecto.comuna].filter(Boolean).join(', ');
  const greetingName = cliente?.nombre ? `Hola ${cliente.nombre.split(' ')[0]},` : 'Hola,';

  const lines: string[] = [
    `${greetingName} te compartimos el estado de avance de *${proyecto.nombre}*:`,
    ...(location ? [`Ubicación: ${location}`] : []),
    `Avance general: *${avance}%* (${completedCount}/${actividades.length} partidas completadas)`,
    ...(proyecto.fecha_termino_estimada
      ? [`Entrega estimada: ${formatDate(proyecto.fecha_termino_estimada)}`]
      : []),
  ];

  if (activeActs.length > 0) {
    lines.push('', '*Partidas en ejecución / próximas:*');
    for (const act of activeActs.slice(0, 4)) {
      const pct = Math.max(0, Math.min(100, Math.round(Number(act.porcentaje_avance) || 0)));
      lines.push(`- ${act.nombre}: ${pct}%`);
    }
  }

  const recentLogs = [...bitacora]
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .slice(0, 3);
  if (recentLogs.length > 0) {
    lines.push('', '*Últimos hitos en terreno:*');
    for (const entry of recentLogs) {
      lines.push(`- ${formatDate(entry.fecha)}: ${entry.titulo}`);
    }
  }

  if (incluirCobranza) {
    const cotizado = Math.round(Number(proyecto.monto_cotizado) || 0);
    const pagado = Math.round(Number(totalPagado ?? proyecto.total_pagado) || 0);
    const saldo = Math.max(0, cotizado - pagado);
    lines.push(
      '',
      '*Estado de pagos:*',
      `- Monto contratado: ${formatCLP(cotizado)}`,
      `- Abonado a la fecha: ${formatCLP(pagado)}`,
      `- Saldo por cubrir: ${formatCLP(saldo)}`,
    );
  }

  lines.push('', 'Cualquier consulta quedamos atentos. Enviado desde ObraTrack.');
  return lines.join('\n');
}
