import { AIError } from '@/lib/ai/errors';
import type { Actor, Channel, QuoteReply } from '@/lib/obrabot/quotes';
import {
  resolveUnifiedQuote,
  unifiedStageLabel,
  type UnifiedQuoteRef,
} from '@/lib/quotes/unified';

const fold = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const LIST_COMMERCIAL_RE =
  /(?:que|cuales|lista|muestra|ver|dime|tengo)\b.{0,30}\b(?:cotizacion(?:es)?|presupuestos?)\b.{0,35}\b(?:enviad[ao]s?|pendientes?\s+de\s+respuesta|esperando\s+respuesta|en\s+seguimiento|mande\s+al\s+cliente|sin\s+respuesta)\b|^(?:cotizaciones|presupuestos)\s+(?:enviad[ao]s?|en\s+seguimiento|pendientes\s+de\s+respuesta|esperando\s+respuesta)[.!?]*$/i;

const MARK_SENT_RE =
  /(?:marc(?:a|ar)|pon(?:er)?|dej(?:a|ar)|cambi(?:a|ar)|pas(?:a|ar))(?:l[ao])?\b(?![^.\n]*\b(?:obra|proyecto)\b).{0,45}\bcomo\s+enviad[ao]\b|^(?:ya\s+)?(?:envie|mande)\s+(?:la\s+|el\s+|esta\s+|este\s+|esa\s+|ese\s+)?(?:cotizacion|presupuesto)\b/i;

const MARK_REJECTED_RE =
  /(?:marc(?:a|ar)|pon(?:er)?|dej(?:a|ar)|cambi(?:a|ar)|pas(?:a|ar))(?:l[ao])?\b(?![^.\n]*\b(?:obra|proyecto)\b).{0,45}\bcomo\s+rechazad[ao]\b|(?:el\s+cliente\s+|me\s+|la\s+|lo\s+)?rechaz(?:o|aron)\s+(?:la\s+|el\s+|esta\s+|este\s+|esa\s+|ese\s+)?(?:cotizacion|presupuesto)\b/i;

const MARK_ACCEPTED_RE =
  /(?:el\s+cliente\s+|[a-z]+\s+(?:[a-z]+\s+)?)?(?:acepto|aprobo)\s+(?:la\s+|el\s+|esta\s+|este\s+|esa\s+|ese\s+)?(?:cotizacion|presupuesto)\b/i;

const EXPLICIT_REVIEW_UUID_RE =
  /^(?:aprueba|revisa|devuelve|corrige)\s+cotizacion\s+[a-f0-9]{8}-/i;

const formatCLP = (amount: number) => `$${Math.round(amount || 0).toLocaleString('es-CL')}`;

export function isCommercialQuoteStatusCommand(text: string): boolean {
  const clean = fold(text);
  if (!clean || EXPLICIT_REVIEW_UUID_RE.test(clean)) return false;
  return (
    LIST_COMMERCIAL_RE.test(clean) ||
    MARK_SENT_RE.test(clean) ||
    MARK_REJECTED_RE.test(clean) ||
    MARK_ACCEPTED_RE.test(clean)
  );
}

type CommercialCommandKind = 'listar' | 'enviada' | 'rechazada' | 'aceptada';

function detectCommercialKind(text: string): CommercialCommandKind | null {
  const clean = fold(text);
  if (!clean || EXPLICIT_REVIEW_UUID_RE.test(clean)) return null;
  if (LIST_COMMERCIAL_RE.test(clean)) return 'listar';
  if (MARK_SENT_RE.test(clean)) return 'enviada';
  if (MARK_REJECTED_RE.test(clean)) return 'rechazada';
  if (MARK_ACCEPTED_RE.test(clean)) return 'aceptada';
  return null;
}

export async function handleCommercialQuoteStatusCommand(
  db: any,
  actor: Actor,
  channel: Channel,
  text: string,
  recentRefs: UnifiedQuoteRef[] = [],
): Promise<QuoteReply | null> {
  const kind = detectCommercialKind(text);
  if (!kind) return null;
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    throw new AIError(
      'OBRABOT_ADMIN',
      'El seguimiento comercial de cotizaciones está reservado al administrador o supervisor.',
      403,
    );
  }

  if (kind === 'listar') {
    const items: string[] = [];
    const seenDocIds = new Set<string>();

    try {
      const budgetQuery = db
        ?.from?.('presupuestos')
        ?.select?.('id,estado,proyecto_id,cotizacion,updated_at')
        ?.eq?.('empresa_id', actor.empresa_id);
      if (budgetQuery) {
        const filtered =
          typeof budgetQuery.in === 'function'
            ? budgetQuery.in('estado', ['enviada', 'aprobada'])
            : budgetQuery;
        const ordered =
          typeof filtered?.order === 'function'
            ? filtered.order('updated_at', { ascending: false })
            : filtered;
        const limited = typeof ordered?.limit === 'function' ? ordered.limit(20) : ordered;
        const res = await limited;
        if (!res?.error && Array.isArray(res?.data)) {
          for (const row of res.data) {
            if (!row?.cotizacion || row.proyecto_id) continue;
            if (!['enviada', 'aprobada'].includes(row.estado)) continue;
            const docId = row.cotizacion.id || row.id;
            if (seenDocIds.has(docId)) continue;
            seenDocIds.add(docId);
            const total = row.cotizacion.estructura_financiera?.precio_total_con_iva ?? 0;
            const label = row.estado === 'enviada' ? 'Enviada al cliente' : 'Lista para enviar';
            items.push(`• ${row.cotizacion.titulo_proyecto} · ${formatCLP(total)} · ${label}`);
          }
        }
      }
    } catch {
      // Tabla parcial en mocks no bloquea el listado comercial.
    }

    try {
      const revQuery = db
        ?.from?.('obrabot_cotizaciones')
        ?.select?.('id,estado,borrador,actualizado_at')
        ?.eq?.('empresa_id', actor.empresa_id);
      if (revQuery) {
        const filtered = typeof revQuery.eq === 'function' ? revQuery.eq('estado', 'pendiente') : revQuery;
        const ordered =
          typeof filtered?.order === 'function'
            ? filtered.order('actualizado_at', { ascending: false })
            : filtered;
        const limited = typeof ordered?.limit === 'function' ? ordered.limit(10) : ordered;
        const res = await limited;
        if (!res?.error && Array.isArray(res?.data)) {
          for (const row of res.data) {
            if (!row?.borrador) continue;
            const docId = row.borrador.id || row.id;
            if (seenDocIds.has(docId)) continue;
            seenDocIds.add(docId);
            const total = row.borrador.estructura_financiera?.precio_total_con_iva ?? 0;
            items.push(`• ${row.borrador.titulo_proyecto} · ${formatCLP(total)} · ${unifiedStageLabel('pendiente_revision')}`);
          }
        }
      }
    } catch {
      // Tabla parcial en mocks no bloquea el listado comercial.
    }

    if (!items.length) {
      return { respuesta: 'No tienes cotizaciones pendientes de respuesta del cliente.' };
    }
    return {
      respuesta: `Cotizaciones activas sin obra asignada:\n\n${items.slice(0, 12).join('\n')}\n\nPuedes responder «El cliente aceptó [nombre]», «Marca [nombre] como enviada» o «El cliente rechazó [nombre]».`,
    };
  }

  const target = await resolveUnifiedQuote(db, actor, recentRefs, {
    titleHint: text,
    allowCompanyFallback: true,
  });
  if (!target) {
    return {
      respuesta:
        'No encontré qué cotización actualizar. Indica el nombre del proyecto o revisa tus cotizaciones en ObraTrack → Presupuestos.',
    };
  }

  const title = target.cotizacion?.titulo_proyecto || 'Cotización';
  const total = target.cotizacion?.estructura_financiera?.precio_total_con_iva ?? 0;

  if (target.stage === 'pendiente_revision') {
    return {
      respuesta: `La cotización «${title}» aún está pendiente de revisión. Aprúebala primero antes de cambiar su estado comercial.`,
      solicitud: target.reviewId || undefined,
      revision: target.revision || undefined,
    };
  }

  const updateBudgetEstado = async (estado: 'enviada' | 'rechazada' | 'aprobada') => {
    if (target.isImmutableBudget || !target.budgetId) return false;
    const { error } = await db
      .from('presupuestos')
      .update({ estado })
      .eq('empresa_id', actor.empresa_id)
      .eq('id', target.budgetId);
    if (error) {
      throw new AIError('BUDGET_SAVE', 'No pude actualizar el estado de la cotización.', 503);
    }
    return true;
  };

  if (kind === 'aceptada') {
    if (!target.isImmutableBudget && target.budgetId && target.presupuestoEstado !== 'aprobada') {
      await updateBudgetEstado('aprobada');
    }
    const nextHint =
      channel === 'whatsapp'
        ? '¿Quieres que cree la obra ahora con su Carta Gantt y materiales? Responde «Crear obra» o «Vincular a obra».'
        : '¿Quieres crear la obra con esta cotización o vincularla a una obra existente?';
    return {
      respuesta: `¡Excelente! Registré que el cliente aceptó «${title}» (${formatCLP(total)}).\n\n${nextHint}`,
      ...(target.origin === 'obrabot_revision' && target.reviewId
        ? { cotizacionAprobadaId: target.reviewId }
        : target.budgetId
          ? { presupuestoPdfId: target.budgetId }
          : {}),
    };
  }

  const nextStatus = kind === 'enviada' ? 'enviada' : 'rechazada';
  if (!target.isImmutableBudget && target.budgetId) {
    await updateBudgetEstado(nextStatus);
    return {
      respuesta:
        nextStatus === 'enviada'
          ? `Marqué «${title}» (${formatCLP(total)}) como *enviada al cliente*. Cuando te responda, avísame si la aceptó o rechazó.`
          : `Marqué «${title}» (${formatCLP(total)}) como *rechazada*. Quedará archivada en el historial de Presupuestos.`,
    };
  }

  return {
    respuesta:
      nextStatus === 'enviada'
        ? `Anote el seguimiento: «${title}» (${formatCLP(total)}) figura enviada al cliente (versión oficial ObraBot aprobada). Cuando te responda, escribe «El cliente aceptó ${title}» para crear la obra.`
        : `La versión aprobada «${title}» está bloqueada por trazabilidad en ObraBot; puedes crear una nueva revisión corregida o archivarla desde ObraTrack → Presupuestos.`,
  };
}
