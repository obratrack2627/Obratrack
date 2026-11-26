import { learnApuCommand } from './apu-learning';
import { projectDeadlineAnswer } from './project-deadlines';
import { projectStatusCommand } from './project-status-command';
import { hasOtherWorkBeyondStatus } from './prompt';
import { extractQuoteGanttTasks, extractQuoteMaterials } from '@/lib/quotes/project-bridge';
import { handleQuoteTurn, tryNaturalQuoteEdit, type Actor, type QuoteReply } from '@/lib/obrabot/quotes';
import type { SemanticIntentResult } from './intent-router';
import type { UnifiedQuoteRef } from '@/lib/quotes/unified';
import type { CotizacionEstimacion } from '@/types/database';

const foldText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export type ApplyQuoteToProjectResult = {
  actions: any[];
  summary: string;
  addedPartidas: number;
  addedMaterials: number;
  montoTotal: number;
  needsTeam: boolean;
};

/**
 * Construye el lote determinista para aplicar una cotización (monto, partidas Gantt y materiales)
 * sobre una obra existente. Compartido por WhatsApp y Web para mantener paridad 1:1.
 */
export function buildApplyQuoteToProjectPlan(input: {
  quote: CotizacionEstimacion;
  project: { id: string; nombre: string; trabajadores_ids?: string[] | null };
  existingActivities: any[];
  existingMaterials: any[];
  teamFollowUp?: string;
}): ApplyQuoteToProjectResult {
  const { quote, project, existingActivities, existingMaterials, teamFollowUp } = input;
  const montoTotal = quote.estructura_financiera?.precio_total_con_iva ?? 0;
  const actions: any[] = [
    {
      tipo: 'actualizar_proyecto',
      proyecto_id: project.id,
      monto_cotizado: montoTotal,
    },
  ];

  let addedPartidas = 0;
  const ganttTasks = extractQuoteGanttTasks(quote);
  if (existingActivities.length === 0 && ganttTasks.length > 0) {
    actions.push({
      tipo: 'crear_actividad',
      proyecto_id: project.id,
      partidas: ganttTasks,
    });
    addedPartidas = ganttTasks.length;
  }

  let addedMaterials = 0;
  const existingMatNames = new Set(
    (existingMaterials || [])
      .filter((m: any) => m?.proyecto_id === project.id)
      .map((m: any) => foldText(m?.nombre || '')),
  );
  const quoteMaterials = extractQuoteMaterials(quote).filter(
    (m) => !existingMatNames.has(foldText(m.nombre)),
  );
  if (quoteMaterials.length > 0) {
    actions.push({
      tipo: 'agregar_materiales',
      proyecto_id: project.id,
      materiales: quoteMaterials,
    });
    addedMaterials = quoteMaterials.length;
  }

  const partsSummary = [
    `el presupuesto quedó en $${montoTotal.toLocaleString('es-CL')}`,
    addedPartidas ? `cargué ${addedPartidas} partidas en la Carta Gantt` : '',
    addedMaterials ? `agregué ${addedMaterials} materiales` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const needsTeam = !(project.trabajadores_ids && project.trabajadores_ids.length > 0);
  const summary = `Apliqué la cotización a «${project.nombre}»: ${partsSummary}.${
    needsTeam && teamFollowUp ? `\n\n${teamFollowUp}` : ''
  }`;

  return {
    actions,
    summary,
    addedPartidas,
    addedMaterials,
    montoTotal,
    needsTeam,
  };
}

/**
 * Resuelve comandos deterministas de operación (plazos, estado de obra, aprendizaje APU)
 * compartidos entre WhatsApp y Web sin invocar el LLM.
 */
export async function resolveSharedDeterministicTurn(input: {
  db: any;
  user: any;
  channel: 'web' | 'whatsapp';
  text: string;
  projects: any[];
  deadlineProjects?: any[];
  activeProjectId?: string | null;
  history: { rol: 'user' | 'model'; texto: string }[];
  allowDeadline?: boolean;
  allowStatus?: boolean;
  allowApu?: boolean;
}) {
  const deadlineReply =
    input.allowDeadline !== false
      ? projectDeadlineAnswer(
          input.text,
          input.deadlineProjects || input.projects,
          input.activeProjectId || undefined,
        )
      : null;

  const statusReply =
    input.allowStatus !== false && !hasOtherWorkBeyondStatus(input.text)
      ? projectStatusCommand(
          input.text,
          input.projects,
          input.activeProjectId || null,
          input.history,
        )
      : null;

  const apuLesson =
    input.allowApu !== false
      ? await learnApuCommand(input.db, input.user, input.text, input.channel)
      : { handled: false };

  const apuReply = apuLesson.handled
    ? {
        respuesta: apuLesson.respuesta || 'Rendimiento guardado.',
        accion: null,
        cotizacion: null,
        sugerencias: [],
      }
    : null;

  return {
    deadlineReply,
    statusReply,
    apuReply,
  };
}

/**
 * Resuelve acciones semánticas de cotización para el canal Web de forma unificada,
 * soportando tanto revisiones (`obrabot_cotizaciones`) como presupuestos (`presupuestos`).
 */
export async function resolveWebSemanticQuoteAction(params: {
  db: any;
  actor: Actor;
  message: string;
  requestId?: string;
  permiteVincular: boolean;
  semantic: SemanticIntentResult;
  recentWebQuoteIds: string[];
  recentWebQuoteRefs: UnifiedQuoteRef[];
  webImmediateQuote: boolean;
  pendingWebQuote: { id: string; revision: number } | null;
}): Promise<QuoteReply | null> {
  const {
    db,
    actor,
    message,
    requestId,
    permiteVincular,
    semantic,
    recentWebQuoteIds,
    recentWebQuoteRefs,
    webImmediateQuote,
    pendingWebQuote,
  } = params;

  if (semantic.intent === 'editar_cotizacion') {
    return tryNaturalQuoteEdit(
      db,
      actor,
      'plataforma',
      message,
      recentWebQuoteIds,
      webImmediateQuote,
      requestId,
      semantic,
      recentWebQuoteRefs,
    );
  }

  if (semantic.intent === 'aprobar_cotizacion' && pendingWebQuote) {
    return handleQuoteTurn(
      db,
      actor,
      'plataforma',
      `aprueba cotización ${pendingWebQuote.id} ${pendingWebQuote.revision}`,
      requestId,
      undefined,
      { permiteVincular },
    );
  }

  if (semantic.intent === 'descargar_archivo_cotizacion' && recentWebQuoteRefs.length > 0) {
    const fmt = semantic.formato_archivo === 'excel' ? 'excel' : 'pdf';
    const primaryRef = recentWebQuoteRefs[0];
    if (primaryRef.kind === 'review') {
      return handleQuoteTurn(
        db,
        actor,
        'plataforma',
        `${fmt} cotización ${primaryRef.id}`,
        requestId,
        undefined,
        { permiteVincular },
      );
    }
    return {
      respuesta: `Aquí tienes el ${fmt === 'excel' ? 'Excel' : 'PDF'} de la cotización.`,
      ...(fmt === 'excel'
        ? { archivo: { id: primaryRef.id, formato: 'excel' as const, origen: 'presupuesto' as const } }
        : { presupuestoPdfId: primaryRef.id }),
    };
  }

  return null;
}
