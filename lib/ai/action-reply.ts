import { formatCLP } from '@/lib/utils';
// Se usa después de preparar la operación; el canal solo la entrega cuando confirma el guardado.
export function actionReply(result: any): string {
  if (!result) return '';
  if (result.tipo === 'lote_acciones') {
    return (result.detalles?.acciones || []).map(actionReply).filter(Boolean).join('\n\n');
  }
  if (result.tipo === 'actualizar_proyecto') return result.resultado_texto || 'Actualicé los datos de la obra.';
  if (result.tipo === 'enviar_mensaje_equipo') return result.resultado_texto;
  if (result.tipo === 'crear_proyecto') return `Creé la obra ${result.detalles?.nombre || ''}.${typeof result.detalles?.monto_cotizado === 'number' ? ` El presupuesto es ${formatCLP(result.detalles.monto_cotizado)}.` : ''}`;
  if (['actualizar_cliente','actualizar_trabajador'].includes(result.tipo)) return `Actualicé los datos de ${result.detalles?.nombre || 'la ficha'}.\n${result.resultado_texto || ''}`;
  if (result.tipo === 'generar_mensaje_whatsapp') return `Preparé el texto, pero todavía no se ha enviado.\n\n${result.detalles?.mensaje || result.resultado_texto || ''}`;
  const titles: Record<string, string> = {
    crear_proyecto: 'Creé la obra', eliminar_proyecto: 'Eliminé la obra', crear_cliente: 'Registré el cliente',
    actualizar_cliente: 'Actualicé los datos del cliente', actualizar_trabajador: 'Actualicé los datos del trabajador',
    agregar_trabajador: 'Registré el trabajador', agregar_trabajadores: 'Registré los trabajadores',
    asignar_trabajador: 'Actualicé la asignación del equipo', asignar_trabajadores: 'Actualicé la asignación del equipo', desasignar_trabajador: 'Retiré la asignación del trabajador',
    crear_actividad: 'Agregué la partida al Gantt', actualizar_avance: 'Registré el avance', agregar_material: 'Añadí el material a la obra', agregar_materiales: 'Añadí los materiales a la obra',
    registrar_imprevisto: 'Registré el imprevisto', registrar_pago: 'Registré el pago', crear_bitacora: 'Guardé el registro en la bitácora', generar_reporte: 'Preparé el reporte',
    agendar_visita: 'Agendé la visita', agendar_evento: 'Agendé el evento', crear_solicitud_cambio: 'Registré la solicitud de cambio', registrar_asistencia: 'Registré la asistencia', registrar_documento: 'Guardé el documento en la obra',
  };
  return [titles[result.tipo] ? titles[result.tipo] + '.' : 'Guardé los cambios solicitados.', result.resultado_texto].filter(Boolean).join('\n');
}
