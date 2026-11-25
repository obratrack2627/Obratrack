export interface NormalizeTurnActionOptions {
  userRole: string;
  rawText: string;
  activeProjectId?: string | null;
}

/**
 * Normaliza acciones frecuentes propuestas por el modelo para que funcionen
 * de forma idéntica en ObraBot Web y en ObraBot WhatsApp:
 * 1. Convierte `registrar_imprevisto` con monto $0 (o emitido por rol terreno sin monto)
 *    en `crear_bitacora` tipo `incidente`.
 * 2. Si hay una obra activa y `enviar_mensaje_equipo` no especifica destinatarios ni obra,
 *    completa automáticamente `proyecto_id` y `roles_destino`.
 */
export function normalizeTurnAction(act: any, options: NormalizeTurnActionOptions): any {
  if (!act || typeof act !== 'object') return act;
  if (Array.isArray(act)) {
    return act.map((item) => normalizeTurnAction(item, options));
  }
  if (act.tipo === 'lote_acciones' && Array.isArray(act.acciones)) {
    return {
      ...act,
      acciones: act.acciones.map((item: any) => normalizeTurnAction(item, options)),
    };
  }
  if (
    act.tipo === 'registrar_imprevisto' &&
    !act.asistencia_id &&
    !act.categoria_gasto &&
    (options.userRole === 'terreno' || act.monto === 0) &&
    !(typeof act.monto === 'number' && act.monto > 0)
  ) {
    const detail = String(act.descripcion || act.nota || act.observacion || options.rawText || '').trim();
    return {
      tipo: 'crear_bitacora',
      ...(act.proyecto_id ? { proyecto_id: act.proyecto_id } : {}),
      ...(act.proyecto_nombre ? { proyecto_nombre: act.proyecto_nombre } : {}),
      titulo: act.titulo || detail.slice(0, 70) || 'Inconveniente en obra',
      nota: detail || 'Incidencia reportada desde terreno.',
      tipo_bitacora: 'incidente',
      ...(act.fecha ? { fecha: act.fecha } : {}),
    };
  }
  if (
    options.activeProjectId &&
    act.tipo === 'enviar_mensaje_equipo' &&
    !act.proyecto_id &&
    !act.proyecto_nombre &&
    !act.roles_destino?.length &&
    !act.trabajadores_nombres?.length &&
    !act.trabajador_nombre
  ) {
    return {
      ...act,
      proyecto_id: options.activeProjectId,
      roles_destino: ['terreno', 'supervisor'],
    };
  }
  return act;
}
