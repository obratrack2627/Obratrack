import { AIError } from '@/lib/ai/errors';
import { normalizeQuote } from '@/lib/ai/protocol';
import { findBudget, type BudgetStatus } from '@/lib/presupuestos';
import { matchesQuoteTitleHint, type QuoteEditPatch } from '@/lib/obrabot/quote-edit-natural';
import type { Actor, Channel, QuoteReply, QuoteReview } from '@/lib/obrabot/quotes';
import type { CotizacionEstimacion } from '@/types/database';

export type UnifiedQuoteStage =
  | 'borrador'
  | 'pendiente_revision'
  | 'aprobada'
  | 'enviada'
  | 'aceptada_cliente'
  | 'rechazada'
  | 'anulada'
  | 'vinculada_a_obra';

export type UnifiedQuoteRef =
  | { kind: 'review'; id: string }
  | { kind: 'budget'; id: string };

export type UnifiedQuoteRecord = {
  origin: 'obrabot_revision' | 'presupuesto';
  reviewId: string | null;
  budgetId: string | null;
  documentId: string;
  revision: number | null;
  reviewEstado: 'pendiente' | 'aprobada' | 'devuelta' | null;
  presupuestoEstado: BudgetStatus | null;
  proyectoId: string | null;
  stage: UnifiedQuoteStage;
  updatedAt: string | null;
  cotizacion: CotizacionEstimacion;
  isImmutableBudget: boolean;
};

const UUID_RE = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function deriveUnifiedQuoteStage(input: {
  reviewEstado?: 'pendiente' | 'aprobada' | 'devuelta' | null;
  presupuestoEstado?: BudgetStatus | null;
  proyectoId?: string | null;
  hasDestination?: boolean;
}): UnifiedQuoteStage {
  if (input.proyectoId || input.hasDestination) return 'vinculada_a_obra';
  if (input.reviewEstado === 'pendiente') return 'pendiente_revision';
  if (input.reviewEstado === 'devuelta') return 'borrador';
  if (input.presupuestoEstado) {
    if (input.presupuestoEstado === 'rechazada') return 'rechazada';
    if (input.presupuestoEstado === 'anulada' || input.presupuestoEstado === 'no_elegida') return 'anulada';
    if (input.presupuestoEstado === 'enviada') return 'enviada';
    if (input.presupuestoEstado === 'aprobada') return 'aprobada';
    if (input.presupuestoEstado === 'borrador') return 'borrador';
  }
  if (input.reviewEstado === 'aprobada') return 'aprobada';
  return 'borrador';
}

export function unifiedStageLabel(stage: UnifiedQuoteStage): string {
  switch (stage) {
    case 'borrador':
      return 'Borrador';
    case 'pendiente_revision':
      return 'Pendiente de revisión';
    case 'aprobada':
      return 'Aprobada';
    case 'enviada':
      return 'Enviada al cliente';
    case 'aceptada_cliente':
      return 'Aceptada por cliente';
    case 'rechazada':
      return 'Rechazada';
    case 'anulada':
      return 'Anulada';
    case 'vinculada_a_obra':
      return 'Vinculada a obra';
  }
}

function pushUniqueRef(target: UnifiedQuoteRef[], seen: Set<string>, ref: UnifiedQuoteRef | null) {
  if (!ref || !ref.id) return;
  const normalizedId = ref.kind === 'review' ? ref.id.toLowerCase() : ref.id;
  const key = `${ref.kind}:${normalizedId}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push({ kind: ref.kind, id: normalizedId });
}

function extractRefsFromWhatsAppRow(row: any): UnifiedQuoteRef[] {
  if (!row || typeof row !== 'object') return [];
  const actions = row.acciones;
  const refs: UnifiedQuoteRef[] = [];
  const seen = new Set<string>();

  const archive = actions?.archivo_cotizacion;
  if (archive && typeof archive.id === 'string' && archive.id) {
    if (archive.origen !== 'presupuesto' && UUID_RE.test(archive.id)) {
      pushUniqueRef(refs, seen, { kind: 'review', id: archive.id });
    } else if (archive.origen === 'presupuesto') {
      pushUniqueRef(refs, seen, { kind: 'budget', id: archive.id });
    }
  }

  if (typeof actions?.solicitud_cotizacion === 'string' && UUID_RE.test(actions.solicitud_cotizacion)) {
    pushUniqueRef(refs, seen, { kind: 'review', id: actions.solicitud_cotizacion });
  }

  if (typeof actions?.cotizacion_aprobada_id === 'string' && actions.cotizacion_aprobada_id) {
    pushUniqueRef(
      refs,
      seen,
      UUID_RE.test(actions.cotizacion_aprobada_id)
        ? { kind: 'review', id: actions.cotizacion_aprobada_id }
        : { kind: 'budget', id: actions.cotizacion_aprobada_id },
    );
  }

  for (const field of ['presupuesto_pdf_id', 'presupuesto_seleccion_id', 'presupuesto_cotizacion_id'] as const) {
    if (typeof actions?.[field] === 'string' && actions[field]) {
      pushUniqueRef(refs, seen, { kind: 'budget', id: actions[field] });
    }
  }

  if (typeof row?.cotizacion?.id === 'string' && row.cotizacion.id) {
    pushUniqueRef(refs, seen, { kind: 'budget', id: row.cotizacion.id });
  }

  return refs;
}

export function extractWhatsAppQuoteRefs(
  rows: any[],
  replyContextId?: string,
  options?: { maxAgeMs?: number },
): UnifiedQuoteRef[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  const out: UnifiedQuoteRef[] = [];
  const seen = new Set<string>();

  if (replyContextId) {
    const matched = rows.find((r) => r?.message_id === replyContextId);
    for (const ref of extractRefsFromWhatsAppRow(matched)) {
      pushUniqueRef(out, seen, ref);
    }
    return out;
  }

  const maxAgeMs = options?.maxAgeMs;
  for (const row of rows) {
    if (
      typeof maxAgeMs === 'number' &&
      maxAgeMs > 0 &&
      row?.created_at &&
      Date.now() - Date.parse(row.created_at) > maxAgeMs
    ) {
      continue;
    }
    for (const ref of extractRefsFromWhatsAppRow(row)) {
      pushUniqueRef(out, seen, ref);
    }
  }
  return out;
}

export function extractWebQuoteRefs(
  rawTurns: any[],
  contextBudgetId?: string | null,
): UnifiedQuoteRef[] {
  const out: UnifiedQuoteRef[] = [];
  const seen = new Set<string>();
  const turns = Array.isArray(rawTurns) ? [...rawTurns].reverse() : [];

  for (const turn of turns) {
    if (!turn || (turn.remitente !== 'agente' && turn.rol !== 'model')) continue;
    const details =
      turn.cotizacion_obrabot ||
      (turn.accion_ejecutada?.tipo === 'obrabot_cotizacion' ? turn.accion_ejecutada.detalles : null);
    if (details && typeof details === 'object') {
      if (typeof details.solicitud_cotizacion === 'string' && UUID_RE.test(details.solicitud_cotizacion)) {
        pushUniqueRef(out, seen, { kind: 'review', id: details.solicitud_cotizacion });
      }
      if (typeof details.cotizacion_aprobada_id === 'string' && details.cotizacion_aprobada_id) {
        pushUniqueRef(
          out,
          seen,
          UUID_RE.test(details.cotizacion_aprobada_id)
            ? { kind: 'review', id: details.cotizacion_aprobada_id }
            : { kind: 'budget', id: details.cotizacion_aprobada_id },
        );
      }
      if (typeof details.presupuesto_cotizacion_id === 'string' && details.presupuesto_cotizacion_id) {
        pushUniqueRef(out, seen, { kind: 'budget', id: details.presupuesto_cotizacion_id });
      }
    }
    if (typeof turn?.cotizacion?.id === 'string' && turn.cotizacion.id) {
      pushUniqueRef(out, seen, { kind: 'budget', id: turn.cotizacion.id });
    }
  }

  if (typeof contextBudgetId === 'string' && contextBudgetId.trim()) {
    pushUniqueRef(out, seen, { kind: 'budget', id: contextBudgetId.trim() });
  }

  return out;
}

async function buildRecordFromReview(
  db: any,
  empresaId: string,
  row: {
    id: string;
    estado: 'pendiente' | 'aprobada' | 'devuelta';
    revision: number;
    borrador: CotizacionEstimacion;
    presupuesto_id: string | null;
    actualizado_at?: string | null;
  },
): Promise<UnifiedQuoteRecord> {
  let presupuestoEstado: BudgetStatus | null = null;
  let proyectoId: string | null = null;
  let updatedAt: string | null = row.actualizado_at ?? null;

  if (row.presupuesto_id && typeof db?.from === 'function') {
    try {
      const budgetRes = await db
        .from('presupuestos')
        .select('id,estado,proyecto_id,updated_at')
        .eq('empresa_id', empresaId)
        .eq('id', row.presupuesto_id)
        .maybeSingle();
      if (!budgetRes?.error && budgetRes?.data) {
        presupuestoEstado = (budgetRes.data.estado as BudgetStatus) ?? null;
        proyectoId = budgetRes.data.proyecto_id ?? null;
        updatedAt = budgetRes.data.updated_at ?? updatedAt;
      }
    } catch {
      // Tablas parciales en mocks de prueba no bloquean la resolución.
    }
  }

  const isImmutableBudget = Boolean(row.presupuesto_id?.startsWith('obrabot-v2:'));
  return {
    origin: 'obrabot_revision',
    reviewId: row.id,
    budgetId: row.presupuesto_id ?? null,
    documentId: row.borrador?.id || row.presupuesto_id || row.id,
    revision: row.revision,
    reviewEstado: row.estado,
    presupuestoEstado,
    proyectoId,
    stage: deriveUnifiedQuoteStage({
      reviewEstado: row.estado,
      presupuestoEstado,
      proyectoId,
    }),
    updatedAt,
    cotizacion: row.borrador,
    isImmutableBudget,
  };
}

function buildRecordFromBudget(budget: {
  id: string;
  estado: BudgetStatus;
  proyecto_id: string | null;
  updated_at?: string | null;
  cotizacion: CotizacionEstimacion;
}): UnifiedQuoteRecord {
  const reviewId = budget.id.startsWith('obrabot-v2:') ? budget.id.slice('obrabot-v2:'.length) : null;
  const reviewEstado = reviewId ? 'aprobada' : null;
  return {
    origin: reviewId ? 'obrabot_revision' : 'presupuesto',
    reviewId,
    budgetId: budget.id,
    documentId: budget.cotizacion?.id || budget.id,
    revision: null,
    reviewEstado,
    presupuestoEstado: budget.estado,
    proyectoId: budget.proyecto_id ?? null,
    stage: deriveUnifiedQuoteStage({
      reviewEstado,
      presupuestoEstado: budget.estado,
      proyectoId: budget.proyecto_id ?? null,
    }),
    updatedAt: budget.updated_at ?? null,
    cotizacion: budget.cotizacion,
    isImmutableBudget: Boolean(reviewId),
  };
}

async function loadByRef(
  db: any,
  actor: { id: string; empresa_id: string; rol: string },
  ref: UnifiedQuoteRef,
): Promise<UnifiedQuoteRecord | null> {
  if (ref.kind === 'review') {
    try {
      const query = db
        ?.from?.('obrabot_cotizaciones')
        ?.select?.('id,estado,revision,borrador,presupuesto_id,actualizado_at')
        ?.eq?.('empresa_id', actor.empresa_id)
        ?.eq?.('id', ref.id)
        ?.maybeSingle?.();
      const res = await query;
      if (!res?.error && res?.data?.borrador) {
        return await buildRecordFromReview(db, actor.empresa_id, res.data);
      }
    } catch {
      // Ignorar si obrabot_cotizaciones no está disponible en el mock o si falta el registro.
    }
    return null;
  }

  try {
    const budget = await findBudget(db, actor.empresa_id, ref.id);
    if (budget?.cotizacion) {
      return buildRecordFromBudget(budget);
    }
  } catch {
    // Ignorar si presupuestos no está disponible o falla la lectura secundaria.
  }
  return null;
}

export async function resolveUnifiedQuote(
  db: any,
  actor: { id: string; empresa_id: string; rol: string },
  refs: UnifiedQuoteRef[],
  options?: { titleHint?: string; allowCompanyFallback?: boolean },
): Promise<UnifiedQuoteRecord | null> {
  const uniqueRefs: UnifiedQuoteRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs || []) {
    pushUniqueRef(uniqueRefs, seen, ref);
    if (uniqueRefs.length >= 6) break;
  }

  const loaded: UnifiedQuoteRecord[] = [];
  for (const ref of uniqueRefs) {
    const rec = await loadByRef(db, actor, ref);
    if (rec) loaded.push(rec);
  }

  const titleHint = options?.titleHint?.trim() || '';
  if (titleHint && loaded.length) {
    let best: UnifiedQuoteRecord | null = null;
    let bestScore = 0;
    for (const rec of loaded) {
      const score = matchesQuoteTitleHint(rec.cotizacion?.titulo_proyecto || '', titleHint);
      if (score > bestScore) {
        bestScore = score;
        best = rec;
      }
    }
    if (best && bestScore > 0) return best;
  }

  if (options?.allowCompanyFallback && titleHint && typeof db?.from === 'function') {
    let bestFallback: UnifiedQuoteRecord | null = null;
    let bestScore = 0;
    const seenIds = new Set(loaded.map((r) => r.budgetId || r.reviewId || r.documentId));

    try {
      const revQuery = db
        .from('obrabot_cotizaciones')
        .select('id,estado,revision,borrador,presupuesto_id,actualizado_at')
        .eq('empresa_id', actor.empresa_id)
        .in('estado', ['pendiente', 'aprobada'])
        .order('actualizado_at', { ascending: false });
      const revLimited = typeof revQuery?.limit === 'function' ? revQuery.limit(20) : revQuery;
      const revRes = await revLimited;
      if (!revRes?.error && Array.isArray(revRes?.data)) {
        for (const row of revRes.data) {
          if (!row?.borrador?.titulo_proyecto || seenIds.has(row.id)) continue;
          const score = matchesQuoteTitleHint(row.borrador.titulo_proyecto, titleHint);
          if (score >= 1 && score > bestScore) {
            bestScore = score;
            bestFallback = await buildRecordFromReview(db, actor.empresa_id, row);
          }
        }
      }
    } catch {
      // Mock parcial sin obrabot_cotizaciones.
    }

    try {
      const budQuery = db
        .from('presupuestos')
        .select('id,estado,proyecto_id,updated_at,cotizacion')
        .eq('empresa_id', actor.empresa_id)
        .order('updated_at', { ascending: false });
      const budLimited = typeof budQuery?.limit === 'function' ? budQuery.limit(20) : budQuery;
      const budRes = await budLimited;
      if (!budRes?.error && Array.isArray(budRes?.data)) {
        for (const row of budRes.data) {
          if (!row?.cotizacion?.titulo_proyecto || seenIds.has(row.id)) continue;
          if (['rechazada', 'anulada', 'no_elegida'].includes(row.estado)) continue;
          const score = matchesQuoteTitleHint(row.cotizacion.titulo_proyecto, titleHint);
          if (score >= 1 && score > bestScore) {
            bestScore = score;
            bestFallback = buildRecordFromBudget(row);
          }
        }
      }
    } catch {
      // Mock parcial sin presupuestos.
    }

    if (bestFallback) return bestFallback;
  }

  return loaded[0] || null;
}

export async function applyUnifiedQuoteEdit(
  db: any,
  actor: Actor,
  channel: Channel,
  target: UnifiedQuoteRecord,
  patch: QuoteEditPatch,
  deps: {
    makeDraft: (input: QuoteEditPatch, id: string) => CotizacionEstimacion;
    formatPreview: (row: QuoteReview, channel?: Channel) => string;
    draftId: (actor: Actor, requestId?: string) => string;
    dbError: (error?: { message?: string } | null) => never;
    getQuoteReview: (db: any, actor: Actor, id: string) => Promise<QuoteReview>;
  },
  requestId?: string,
): Promise<QuoteReply & { presupuestoPdfId?: string; cotizacion?: CotizacionEstimacion }> {
  // Caso A: solicitud pendiente en obrabot_cotizaciones -> revisar/corregir misma revisión.
  if (
    target.origin === 'obrabot_revision' &&
    target.reviewId &&
    target.reviewEstado === 'pendiente' &&
    typeof target.revision === 'number'
  ) {
    const draft = deps.makeDraft(patch, target.reviewId);
    const { data, error } = await db.rpc('obrabot_revisar_cotizacion', {
      p_empresa: actor.empresa_id,
      p_actor: actor.id,
      p_id: target.reviewId,
      p_revision: target.revision,
      p_decision: 'corregir',
      p_cambios: draft,
      p_observacion: undefined,
    });
    if (error || !data) deps.dbError(error);
    const updated = data as QuoteReview;
    return {
      respuesta: deps.formatPreview(updated, channel),
      solicitud: updated.id,
      revision: updated.revision,
    };
  }

  // Caso B: obrabot_revision aprobada/devuelta, presupuesto inmutable (obrabot-v2:*), ya vinculado a obra o en estado cerrado
  // -> derivar nueva solicitud pendiente sin romper trazabilidad ni disparar obrabot_destino_presupuesto_guard.
  const isClosedBudget = ['rechazada', 'anulada', 'no_elegida'].includes(target.presupuestoEstado || '');
  if (
    target.origin === 'obrabot_revision' ||
    target.isImmutableBudget ||
    Boolean(target.proyectoId) ||
    isClosedBudget
  ) {
    const newId = deps.draftId(actor, requestId ? `${requestId}:edit` : undefined);
    const draft = deps.makeDraft(patch, newId);
    const { error } = await db.rpc('obrabot_registrar_cotizacion', {
      p_empresa: actor.empresa_id,
      p_actor: actor.id,
      p_id: newId,
      p_origen: channel,
      p_borrador: draft,
    });
    if (error) deps.dbError(error);
    const created = await deps.getQuoteReview(db, actor, newId);
    return {
      respuesta: deps.formatPreview(created, channel),
      solicitud: newId,
      revision: created.revision,
    };
  }

  // Caso C: presupuesto nativo editable en tabla presupuestos.
  if (!target.budgetId) {
    throw new AIError('BUDGET_READ', 'No encontré el identificador del presupuesto a actualizar.', 404);
  }
  const hasPartidas = Array.isArray(patch.partidas_venta) && patch.partidas_venta.length > 0;
  const calculated = normalizeQuote({
    ...target.cotizacion,
    ...patch,
    modo_presupuesto: hasPartidas ? 'precio_acordado' : (target.cotizacion.modo_presupuesto || 'precio_acordado'),
    tratamiento_iva: patch.tratamiento_iva || (target.cotizacion.tratamiento_iva === 'neto' ? 'neto' : 'incluido'),
    materiales: patch.materiales ?? target.cotizacion.materiales ?? [],
    mano_de_obra: patch.mano_de_obra ?? target.cotizacion.mano_de_obra ?? [],
    materiales_considerados: patch.materiales_considerados ?? target.cotizacion.materiales_considerados,
    actividades_gantt: patch.actividades_gantt ?? target.cotizacion.actividades_gantt ?? [],
    hitos_pago: patch.hitos_pago ?? target.cotizacion.hitos_pago,
    resumen_ejecutivo: patch.resumen_ejecutivo ?? target.cotizacion.resumen_ejecutivo,
    condiciones_pago: patch.condiciones_pago ?? target.cotizacion.condiciones_pago,
    duracion_dias_estimada: patch.duracion_dias_estimada ?? target.cotizacion.duracion_dias_estimada,
  });

  const updated: CotizacionEstimacion = {
    ...calculated,
    id: target.cotizacion.id,
    fecha_creacion: target.cotizacion.fecha_creacion,
    ...(patch.plazo_texto ?? target.cotizacion.plazo_texto
      ? { plazo_texto: patch.plazo_texto ?? target.cotizacion.plazo_texto }
      : {}),
  };

  const { error } = await db
    .from('presupuestos')
    .update({ cotizacion: updated })
    .eq('empresa_id', actor.empresa_id)
    .eq('id', target.budgetId);
  if (error) {
    throw new AIError('BUDGET_SAVE', 'No se pudo actualizar el presupuesto. Intenta nuevamente.', 503);
  }

  const pseudoReview: QuoteReview = {
    id: target.budgetId,
    estado: 'aprobada',
    revision: 1,
    borrador: updated,
    presupuesto_id: target.budgetId,
    presupuesto_estado: target.presupuestoEstado ?? 'aprobada',
  };

  return {
    respuesta: deps.formatPreview(pseudoReview, channel),
    presupuestoPdfId: target.budgetId,
    cotizacion: updated,
  };
}
