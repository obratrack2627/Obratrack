export interface PendingCriticalWhatsApp {
  resumen: string;
  actions: any[];
  permissionMessage: string;
  creado_ms: number;
}

export interface WhatsAppUndoSnapshot {
  changed: Record<string, any[]>;
  deleted: Record<string, any[]>;
  resumen: string;
  expira_ms: number;
}

const TEN_MINUTES_MS = 10 * 60 * 1000;
const MAX_UNDO_BYTES = 24000;

const REVERSIBLE_TABLES = [
  'proyectos',
  'clientes',
  'actividades',
  'pagos',
  'materiales_proyecto',
  'bitacora_entradas',
  'imprevistos',
  'reclamos_cambios_obra',
  'documentos_obra',
  'asistencia_obreros',
  'agenda_eventos',
] as const;

export function describePermanentDelete(actions: any[]): string | null {
  if (!Array.isArray(actions) || !actions.length) return null;
  for (const item of actions) {
    if (item?.tipo === 'eliminar_proyecto') {
      return `eliminar permanentemente la obra${item.proyecto_nombre ? ` «${item.proyecto_nombre}»` : ''}`;
    }
    if (item?.tipo === 'eliminar_evento') {
      return `eliminar el compromiso «${item.titulo || 'de la agenda'}»`;
    }
  }
  return null;
}

export function resolvePendingCriticalDecision(text: string): 'confirm' | 'cancel' | null {
  const clean = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.!?¡¿,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    /^(?:si\s+)?(?:confirmo|confirmar|confirmado|dale|procede|adelante|elimina(?:r|lo|la)?|borra(?:r|lo|la)?)(?:\s+(?:eliminacion|borrado|cambio|accion))?$/.test(
      clean,
    )
  ) {
    return 'confirm';
  }
  if (/^(?:no|cancelar|cancela|anular|anula|detener|mejor\s+no)(?:\s+(?:eliminacion|borrado|cambio|accion))?$/.test(clean)) {
    return 'cancel';
  }
  return null;
}

export function isWhatsAppUndoRequest(text: string): boolean {
  const clean = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.!?¡¿,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return /^(?:deshacer|deshaz|revertir|revierte)(?:\s+(?:el\s+)?(?:ultimo\s+)?(?:cambio|registro|accion))?$/.test(clean) ||
    /^(?:anula|anular)\s+(?:el\s+)?ultimo\s+(?:cambio|registro)$/.test(clean);
}

export function buildWhatsAppUndoInverse(
  beforeTables: Record<string, any[]>,
  plan: { changed: Record<string, any[]>; deleted: Record<string, any[]>; result?: any },
  nowMs = Date.now(),
): WhatsAppUndoSnapshot | null {
  if (!plan || (!Object.keys(plan.changed || {}).length && !Object.keys(plan.deleted || {}).length)) {
    return null;
  }
  if (plan.changed?.usuarios?.length || plan.deleted?.usuarios?.length) return null;
  if (
    plan.changed?.documentos_obra?.some((r: any) =>
      ['acta_recepcion', 'cierre_diario'].includes(r?.categoria),
    )
  ) {
    return null;
  }
  if (plan.changed?.imprevistos?.some((r: any) => r?.asistencia_id)) return null;

  const inverseChanged: Record<string, any[]> = {};
  const inverseDeleted: Record<string, any[]> = {};

  for (const table of REVERSIBLE_TABLES) {
    const previousRows = Array.isArray(beforeTables[table]) ? beforeTables[table] : [];
    const byId = new Map(previousRows.map((row: any) => [row.id, row]));

    const upserted = Array.isArray(plan.changed?.[table]) ? plan.changed[table] : [];
    for (const row of upserted) {
      if (!row?.id) continue;
      const old = byId.get(row.id);
      if (old) {
        inverseChanged[table] ||= [];
        inverseChanged[table].push(structuredClone(old));
      } else {
        inverseDeleted[table] ||= [];
        inverseDeleted[table].push({ id: row.id });
      }
    }

    const removed = Array.isArray(plan.deleted?.[table]) ? plan.deleted[table] : [];
    for (const row of removed) {
      const old = (row?.id && byId.get(row.id)) || row;
      if (old?.id) {
        inverseChanged[table] ||= [];
        inverseChanged[table].push(structuredClone(old));
      }
    }
  }

  const hasInverse =
    Object.values(inverseChanged).some((rows) => rows.length > 0) ||
    Object.values(inverseDeleted).some((rows) => rows.length > 0);
  if (!hasInverse) return null;

  const snapshot: WhatsAppUndoSnapshot = {
    changed: inverseChanged,
    deleted: inverseDeleted,
    resumen: String(plan.result?.titulo || 'último cambio').slice(0, 120),
    expira_ms: nowMs + TEN_MINUTES_MS,
  };

  if (JSON.stringify(snapshot).length > MAX_UNDO_BYTES) return null;
  return snapshot;
}
