import { setAIUsageActor } from './usage';
import { scheduleKnowledgeIndex } from './rag-index';
import { retrieveReferences,ragEligible } from './rag';
import { learnApuCommand } from './apu-learning';
import { scheduleQualityEvent } from './quality-server';
import { turnQualityEvent } from './quality';
import { conversationPreferences, withPreferences } from './preferences';
import { contactNameCommand, contactTurns, withNameEditContext } from './contact-name-command';
import { personIntake } from '@/lib/whatsapp/person-intake';
import { pendingPerson, withPersonContext } from './person-context';
import { flattenActions } from './protocol';
import { scopeProjectActions, prepareActionPlan } from './actions';
import { projectStatusCommand } from './project-status-command';
import { conversationProjectId } from './project-reference';
import { isProjectDeadlineQuestion, projectDeadlineAnswer } from './project-deadlines';
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase/client";
import { AIError, aiErrorResponse } from "./errors";
import { serverFetch } from "@/lib/server-fetch";
import { chatAsesorObrasGemini, chatAgenteProyectoGemini } from "@/lib/gemini";
import { loadAIContext } from "./context";
import { saveBudget, findBudget, type Presupuesto } from "@/lib/presupuestos";
import { conversationHistory } from './conversation';
import { operationsContext } from './operations-context';
import {
  isAlternativeRequest,
  isQuoteRequest,
  isQuoteRevision,
  hasOtherWorkBeyondDeadline,
  hasOtherWorkBeyondStatus,
} from './prompt';
import { checkActionPermissions } from "./permissions";
import { prepareCampaign, enqueueCampaign } from "@/lib/whatsapp/campaigns";
import { randomUUID } from "node:crypto";
import { AsyncResource } from "node:async_hooks";
import { canAccessWeb, WEB_ACCESS_ERROR, isSessionJWT } from '@/lib/auth/access';
import { handleQuoteTurn, isQuoteWorkflow, tryNaturalQuoteEdit, type QuoteReply } from '@/lib/obrabot/quotes';
import { classifyTurnIntent, shouldUseSemanticIntentRouter } from './intent-router';
import { looksLikeNaturalQuoteEdit } from '@/lib/obrabot/quote-edit-natural';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/admin';
import { validateFileContent } from '@/lib/supabase/file-validation';
import { isDestinationCommand, isDestinationContinuation } from '@/lib/obrabot/quote-destination';
import { isQuoteExcelRequest, isQuotePdfRequest } from '@/lib/obrabot/whatsapp';
import { normalizeTurnAction } from './normalize-turn-action';
import { loadRecentCrossChannelTurns } from './cross-channel-context';

export async function authorizeAI(request: NextRequest, options?: { adminOnly?: boolean }) {
  const authorization = (request.headers.get('authorization') || '').trim().split(/\s+/);
  const bearer = authorization.length === 2 && authorization[0].toLowerCase() === 'bearer' ? authorization[1] : request.cookies.get('obratrack_auth_token')?.value;
  if (authorization.length === 1 && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method)
    && request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin)
    throw new AIError('ORIGIN_FORBIDDEN', 'El origen de la solicitud no está permitido.', 403);
  if (!bearer || (authorization.length === 1 && !isSessionJWT(bearer)))
    throw new AIError(
      "AUTH_REQUIRED",
      "Inicia sesión nuevamente para usar el asistente.",
      401,
    );
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: serverFetch,
      headers: { Authorization: `Bearer ${bearer}` },
    },
  });
  const { data, error } = await client.auth.getUser(bearer);
  if (error || !data.user)
    throw new AIError(
      "AUTH_REQUIRED",
      "Tu sesión no es válida o expiró. Inicia sesión nuevamente.",
      401,
    );
  const { data: user, error: profileError } = await client
    .from("usuarios")
    .select("id,empresa_id,rol,nombre,is_dev")
    .or(`id.eq.${data.user.id},auth_user_id.eq.${data.user.id}`)
    .maybeSingle();
  if (profileError || !user?.empresa_id)
    throw new AIError(
      "TENANT_REQUIRED",
      "Tu cuenta no tiene una empresa disponible para gestionar obras.",
      403,
    );
  if (!canAccessWeb(user)) throw new AIError('WEB_ROLE_FORBIDDEN', WEB_ACCESS_ERROR, 403);
  if (options?.adminOnly && user.rol !== 'admin') throw new AIError('OBRABOT_ADMIN', 'Esta acción está reservada al administrador.', 403);
  setAIUsageActor(user);
  return { client, user: { ...user, rol_original: user.rol, rol: user.is_dev === true ? 'admin' : user.rol } };
}

export function errorJSON(error: unknown) {
  const result = aiErrorResponse(error);
  return NextResponse.json(
    { error: result.error, code: result.code },
    { status: result.status },
  );
}

export async function readAIRequest(request: NextRequest) {
  const raw = await request.text();
  const maxBytes = raw.includes('"imagen"') ? 4500000 : 180000;
  if (raw.length > maxBytes)
    throw new AIError(
      "REQUEST_TOO_LARGE",
      "La conversación o imagen adjunta es demasiado extensa. Reduce su tamaño o inicia una conversación nueva.",
      413,
    );
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AIError(
      "INVALID_REQUEST",
      "El mensaje no tiene un formato válido.",
      400,
    );
  }
  if (!body || typeof body.mensaje !== "string" || !body.mensaje.trim())
    throw new AIError(
      "INVALID_REQUEST",
      "Escribe un mensaje para el asistente.",
      400,
    );
  if (body.mensaje.length > 6000)
    throw new AIError(
      "MESSAGE_TOO_LONG",
      "Divide el mensaje en instrucciones más breves (hasta 6000 caracteres).",
      400,
    );
  let imagen: { mimeType: string; data: string } | undefined;
  if (body.imagen != null) {
    const mime = typeof body.imagen?.mimeType === 'string' ? body.imagen.mimeType.trim() : '';
    const b64 = typeof body.imagen?.data === 'string' ? body.imagen.data.trim() : '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !b64 || b64.length > 4100000) {
      throw new AIError('AI_IMAGE_INVALID', 'Adjunta una imagen JPG, PNG o WebP de hasta 3 MB.', 422);
    }
    const bytes = Buffer.from(b64, 'base64');
    if (!bytes.length || bytes.length > 3000000) {
      throw new AIError('AI_IMAGE_INVALID', 'Adjunta una imagen JPG, PNG o WebP de hasta 3 MB.', 422);
    }
    await validateFileContent(bytes, mime);
    imagen = { mimeType: mime, data: bytes.toString('base64') };
  }
  const historial = conversationHistory(body.historial, body.mensaje);
  return { ...body, mensaje: body.mensaje.trim(), historial, historial_original: body.historial, imagen };
}

// Dependencias explícitas permiten probar la ruta sin una clave ni una base de producción.
function needsSavedBudgets(message: string, history: { texto: string }[], projectId?: string) {
  if (projectId) return true;
  if (history.some((m) => /cotiz|presupuest|alternativ|opci/i.test(m.texto || ""))) return true;
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(?:presupuest\w*|cotizac\w*|cotiz(?:a(?:mos|ste|ron)|ad[oa])|alternativ\w*|opci(?:on|ones)|anterior\w*|previ\w*|pasad\w*|ultim\w*|recuerd\w*|acuerd\w*|memoria|guardad\w*|ayer|sesion|repite|repetir|igual|parecid\w*|similar|basad\w*|retoma|continua)\b/.test(text);
}

export function createChatHandler(
  deps = {
    authorize: authorizeAI,
    global: chatAsesorObrasGemini,
    project: chatAgenteProyectoGemini,
  },
) {
  const runChat = async (request: NextRequest, projectId?: string, onStage?: (label: string) => void): Promise<NextResponse> => {
    try {
      onStage?.('Verificando sesión y permisos…');
      const { client, user } = await deps.authorize(request);
      const body = await readAIRequest(request);
      const actor = { ...user, rol: user.rol_original ?? user.rol };
      const rawTurns = Array.isArray(body.historial_original) ? body.historial_original : [];
      const extractQuoteDetails = (m: any) => m?.cotizacion_obrabot || (m?.accion_ejecutada?.tipo === 'obrabot_cotizacion' ? m.accion_ejecutada.detalles : null);
      const recentWebQuoteDetails = [...rawTurns]
        .reverse()
        .filter((m: any) => (m?.remitente === 'agente' || m?.rol === 'model') && extractQuoteDetails(m))
        .map((m: any) => extractQuoteDetails(m) || {});
      const lastWebTurn = [...rawTurns].reverse().find((m: any) => m?.remitente === 'agente' || m?.rol === 'model');
      const lastQuoteDetails = extractQuoteDetails(lastWebTurn);
      const webImmediateQuote = Boolean(lastQuoteDetails);
      const pendingWebQuote = lastQuoteDetails && typeof lastQuoteDetails.solicitud_cotizacion === 'string' && typeof lastQuoteDetails.revision_cotizacion === 'number'
        ? { id: lastQuoteDetails.solicitud_cotizacion as string, revision: lastQuoteDetails.revision_cotizacion as number }
        : null;
      const shortWebApprove = Boolean(
        pendingWebQuote &&
          /^(?:s[ií],?\s*)?(?:aprueba|aprobar|aprobada|confirmo)(?:\s+(?:la\s+|esta\s+)?cotizaci[oó]n)?[.!]?$/i.test(body.mensaje.trim()),
      );
      const recentWebQuoteIds = recentWebQuoteDetails
        .map((d: any) => d.solicitud_cotizacion || d.cotizacion_aprobada_id)
        .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
      const webFileFormat: 'pdf' | 'excel' | null = !body.imagen
        ? isQuotePdfRequest(body.mensaje)
          ? 'pdf'
          : isQuoteExcelRequest(body.mensaje)
            ? 'excel'
            : null
        : null;
      if (webFileFormat) {
        const formatLabel = webFileFormat === 'excel' ? 'Excel' : 'PDF';
        const approvedReviewId = recentWebQuoteDetails
          .map((d: any) => d.cotizacion_aprobada_id)
          .find((v: unknown): v is string => typeof v === 'string' && v.length > 0);
        const pendingReviewId = recentWebQuoteDetails
          .map((d: any) => d.solicitud_cotizacion)
          .find((v: unknown): v is string => typeof v === 'string' && v.length > 0);
        const contextBudgetId = typeof body.contexto_cotizacion?.id === 'string' ? body.contexto_cotizacion.id : null;

        if (approvedReviewId) {
          if (actor.rol !== 'admin') throw new AIError('OBRABOT_ADMIN', `El ${formatLabel} de la cotización está disponible para el administrador.`, 403);
          return NextResponse.json({
            respuesta: `Aquí tienes el ${formatLabel} de la cotización aprobada.`,
            accion: null,
            cotizacion: null,
            sugerencias: [],
            accion_ejecutada: {
              tipo: 'obrabot_cotizacion',
              titulo: `Cotización en ${formatLabel}`,
              resultado_texto: 'Haz clic en el botón para descargar el archivo.',
              detalles: { cotizacion_aprobada_id: approvedReviewId },
              link_destino: `/api/obrabot/cotizaciones/${encodeURIComponent(approvedReviewId)}?formato=${webFileFormat}`,
              link_texto: `Descargar ${formatLabel}`,
            },
          }, { headers: { 'Cache-Control': 'private, no-store' } });
        }
        if (pendingReviewId && !contextBudgetId) {
          return NextResponse.json({
            respuesta: `Esta cotización necesita aprobación antes de descargarse en ${formatLabel}. Puedes aprobarla aquí o en la bandeja.`,
            accion: null,
            cotizacion: null,
            sugerencias: ['Aprobar cotización', 'Cotizaciones pendientes'],
          }, { headers: { 'Cache-Control': 'private, no-store' } });
        }
        if (contextBudgetId) {
          return NextResponse.json({
            respuesta: `Aquí tienes el ${formatLabel} de la cotización.`,
            accion: null,
            cotizacion: null,
            sugerencias: [],
            accion_ejecutada: {
              tipo: 'obrabot_cotizacion',
              titulo: `Cotización en ${formatLabel}`,
              resultado_texto: 'Haz clic en el botón para descargar el archivo.',
              detalles: { presupuesto_cotizacion_id: contextBudgetId },
              link_destino: `/api/obrabot/cotizaciones/${encodeURIComponent(contextBudgetId)}?formato=${webFileFormat}&origen=presupuesto`,
              link_texto: `Descargar ${formatLabel}`,
            },
          }, { headers: { 'Cache-Control': 'private, no-store' } });
        }
      }
      const hasSavedQuoteEditHint =
        recentWebQuoteIds.length > 0 ||
        (/\b(?:cotizaci[oó]n|presupuesto)\b/i.test(body.mensaje) &&
          !/\b(?:de\s+la\s+obra|del\s+proyecto)\b/i.test(body.mensaje));
      const webNaturalQuoteEdit =
        actor.rol === 'admin' &&
        hasSavedQuoteEditHint &&
        looksLikeNaturalQuoteEdit(body.mensaje) &&
        Boolean(getSupabaseAdmin());
      const quoteWorkflow = isQuoteWorkflow(body.mensaje) || shortWebApprove;
      const quoteDestinationCmd = isDestinationCommand(body.mensaje);
      const explicitDestinationUuid = /[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/i.test(body.mensaje);
      const quoteCommand = quoteWorkflow || (quoteDestinationCmd && (actor.rol === 'admin' || explicitDestinationUuid));
      const destinationContinuation = actor.rol === 'admin' && isDestinationContinuation(body.mensaje) && getSupabaseAdmin();
      const buildWebQuoteResponse = (reply: QuoteReply, planId?: string) => {
        const file = reply.archivo;
        return NextResponse.json({
          respuesta: reply.respuesta, accion: null, cotizacion: null,
          sugerencias: file
            ? (planId === 'pro_ia' ? ['Crear obra', 'Vincular a obra'] : [])
            : reply.solicitud && reply.revision
              ? ['Aprobar cotización', 'Cotizaciones pendientes']
              : [],
          ...(file ? { accion_ejecutada: {
            tipo: 'obrabot_cotizacion', titulo: 'Cotización aprobada', resultado_texto: 'Archivo listo para descargar.',
            detalles: { cotizacion_aprobada_id: file.id },
            link_destino: `/api/obrabot/cotizaciones/${file.id}?formato=${file.formato}`,
            link_texto: file.formato === 'excel' ? 'Descargar Excel' : 'Descargar PDF',
          } } : reply.solicitud && reply.revision ? { accion_ejecutada: {
            tipo: 'obrabot_cotizacion', titulo: 'Cotización lista para revisión', resultado_texto: 'Puedes aprobarla aquí con un clic o revisarla en la bandeja.',
            detalles: { solicitud_cotizacion: reply.solicitud, revision_cotizacion: reply.revision },
            link_destino: '/cotizador#cotizaciones-obrabot', link_texto: 'Abrir bandeja de revisión',
          } } : reply.obra ? { accion_ejecutada: {
            tipo: 'obrabot_destino_cotizacion', titulo: 'Gestión de obra', resultado_texto: 'Obra disponible en ObraTrack.', detalles: {},
            link_destino: `/proyectos/${encodeURIComponent(reply.obra)}/presupuestos`, link_texto: 'Ver obra',
          } } : {}),
        }, { headers: { 'Cache-Control': 'private, no-store' } });
      };
      if (quoteCommand || destinationContinuation || webNaturalQuoteEdit) {
        if (actor.rol !== 'admin') throw new AIError('OBRABOT_ADMIN', 'Esta acción está reservada al administrador.', 403);
        const plan = await client.from('empresas').select('plan_id').eq('id', actor.empresa_id).maybeSingle();
        if (plan.error) throw new AIError('OBRABOT_QUOTE_DB', 'No pude verificar el plan de la empresa.', 503);
        if (!['pro', 'pro_ia'].includes(plan.data?.plan_id)) throw new AIError('PLAN_REQUIRED', 'ObraBot requiere el plan Pro o Pro IA.', 403);
        const requestId = typeof body.request_id === 'string' && body.request_id.length <= 100 ? body.request_id : undefined;
        const effectiveMsg = shortWebApprove && pendingWebQuote
          ? `aprueba cotización ${pendingWebQuote.id} ${pendingWebQuote.revision}`
          : body.mensaje;
        const reply = webNaturalQuoteEdit && !quoteCommand
          ? await tryNaturalQuoteEdit(requireSupabaseAdmin(), actor, 'plataforma', body.mensaje, recentWebQuoteIds, webImmediateQuote, requestId)
          : await handleQuoteTurn(requireSupabaseAdmin(), actor, 'plataforma', effectiveMsg, requestId, undefined, { permiteVincular: plan.data?.plan_id === 'pro_ia' });
        if (reply) return buildWebQuoteResponse(reply, plan.data?.plan_id);
      }
      if (
        !quoteCommand &&
        !destinationContinuation &&
        !webNaturalQuoteEdit &&
        actor.rol === 'admin' &&
        Boolean(getSupabaseAdmin()) &&
        shouldUseSemanticIntentRouter(body.mensaje, {
          channel: 'web',
          rol: actor.rol,
          hasPendingQuoteReview: Boolean(pendingWebQuote),
          hasActiveQuote: recentWebQuoteIds.length > 0,
        })
      ) {
        const semantic = await classifyTurnIntent(body.mensaje, {
          channel: 'web',
          rol: actor.rol,
          hasPendingQuoteReview: Boolean(pendingWebQuote),
          hasActiveQuote: recentWebQuoteIds.length > 0,
        });
        const supportedWebSemantic = semantic && semantic.confidence !== 'baja' && (
          semantic.intent === 'editar_cotizacion' ||
          (semantic.intent === 'aprobar_cotizacion' && Boolean(pendingWebQuote)) ||
          (semantic.intent === 'descargar_archivo_cotizacion' && Boolean(recentWebQuoteIds[0]))
        );
        if (semantic && supportedWebSemantic) {
          const plan = await client.from('empresas').select('plan_id').eq('id', actor.empresa_id).maybeSingle();
          if (plan.error) throw new AIError('OBRABOT_QUOTE_DB', 'No pude verificar el plan de la empresa.', 503);
          if (!['pro', 'pro_ia'].includes(plan.data?.plan_id)) throw new AIError('PLAN_REQUIRED', 'ObraBot requiere el plan Pro o Pro IA.', 403);
          const requestId = typeof body.request_id === 'string' && body.request_id.length <= 100 ? body.request_id : undefined;
          let semanticReply: QuoteReply | null = null;
          if (semantic.intent === 'editar_cotizacion') {
            semanticReply = await tryNaturalQuoteEdit(requireSupabaseAdmin(), actor, 'plataforma', body.mensaje, recentWebQuoteIds, webImmediateQuote, requestId, semantic);
          } else if (semantic.intent === 'aprobar_cotizacion' && pendingWebQuote) {
            semanticReply = await handleQuoteTurn(requireSupabaseAdmin(), actor, 'plataforma', `aprueba cotización ${pendingWebQuote.id} ${pendingWebQuote.revision}`, requestId, undefined, { permiteVincular: plan.data?.plan_id === 'pro_ia' });
          } else if (semantic.intent === 'descargar_archivo_cotizacion' && recentWebQuoteIds[0]) {
            const fmt = semantic.formato_archivo === 'excel' ? 'excel' : 'pdf';
            semanticReply = await handleQuoteTurn(requireSupabaseAdmin(), actor, 'plataforma', `${fmt} cotización ${recentWebQuoteIds[0]}`, requestId, undefined, { permiteVincular: plan.data?.plan_id === 'pro_ia' });
          }
          if (semanticReply) return buildWebQuoteResponse(semanticReply, plan.data?.plan_id);
        }
      }
      const deadlineOnly =
        isProjectDeadlineQuestion(body.mensaje) &&
        !hasOtherWorkBeyondDeadline(body.mensaje);
      onStage?.('Cargando contexto de tus obras…');
      const { company, context, service, tables } = await loadAIContext(
        client,
        user,
        {
          projectsOnly: deadlineOnly,
          includeBudgets: needsSavedBudgets(body.mensaje, body.historial, projectId),
        },
      );
      if (!company)
        throw new AIError(
          "TENANT_REQUIRED",
          "No se pudo confirmar el plan de tu empresa. Intenta nuevamente.",
          503,
        );
      if (!["pro", "pro_ia"].includes(company.plan_id))
        throw new AIError(
          "PLAN_REQUIRED",
          "El asistente de IA requiere el Plan Pro o Plan Pro IA.",
          403,
        );
      const registrationProjectId = conversationProjectId(tables.proyectos, body.mensaje, body.historial, projectId);
      let registrationDraft = pendingPerson(body.historial_original, body.historial, tables.proyectos, registrationProjectId);
      if (registrationDraft?.asignacion && (isQuoteRequest(body.mensaje) || isQuoteRevision(body.mensaje) || isAlternativeRequest(body.mensaje))) registrationDraft = null;
      const nameCommand = !registrationDraft ? contactNameCommand(body.mensaje, tables.usuarios, contactTurns(body.historial_original), user.id) : null;
      const pendingNameEdit = nameCommand?.pending || null;
      const onQualityEvent = (event: import('./quality').QualityEvent) => scheduleQualityEvent(client,user,event);
      const feedback = turnQualityEvent(body.mensaje,body.historial,!!registrationDraft);
      if(feedback)onQualityEvent(feedback);
      const validateResult = (result: any) => {
        // Prevalidación pura sobre copias: jamás guardar ni encolar en un reintento.
        const candidate = structuredClone(result);
        const activeCtxId = conversationProjectId(tables.proyectos, body.mensaje, body.historial, projectId);
        if (candidate.accion) {
          candidate.accion = normalizeTurnAction(candidate.accion, {
            userRole: user.rol,
            rawText: body.mensaje,
            activeProjectId: activeCtxId,
          });
        }
        const registration = personIntake(flattenActions(candidate.accion), candidate.registro_propuesto, registrationDraft, body.mensaje, tables.proyectos, registrationProjectId, tables.usuarios);
        const scoped = scopeProjectActions(registration.actions, activeCtxId, tables.proyectos, projectId);
        const actions = checkActionPermissions(user, scoped, body.mensaje);
        if ((actions.length || registration.prepared || registration.question && registration.draft) && company.plan_id !== 'pro_ia')
          throw new AIError('PLAN_REQUIRED', 'Los cambios por ObraBot requieren Pro IA.', 403);
        try {
          prepareActionPlan(actions, { proyectos: tables.proyectos, clientes: tables.clientes, actividades: tables.actividades || [], usuarios: tables.usuarios, agenda: tables.agenda_eventos || [] }, projectId);
        } catch (error) {
          if (error instanceof AIError) throw error;
          throw new AIError('ACTION_PLAN_INVALID', error instanceof Error ? error.message : 'Revisa las referencias de las acciones.', 422);
        }
      };
      const preferences = conversationPreferences(body.historial_original, user, projectId, body.mensaje);
      const finish = async (result: any, currentId?: string, prepared?: ReturnType<typeof personIntake>) => {
        const activeCtxId = conversationProjectId(tables.proyectos, body.mensaje, body.historial, projectId);
        if (result.accion) {
          result.accion = normalizeTurnAction(result.accion, {
            userRole: user.rol,
            rawText: body.mensaje,
            activeProjectId: activeCtxId,
          });
        }
        const registration = prepared || personIntake(flattenActions(result.accion), result.registro_propuesto, registrationDraft, body.mensaje, tables.proyectos, registrationProjectId, tables.usuarios);
        if ((registration.prepared || (registration.question && registration.draft)) && company.plan_id !== 'pro_ia') throw new AIError('PLAN_REQUIRED', 'Los registros y cambios por ObraBot requieren Pro IA.', 403);
        if ((registration.prepared || (registration.question && registration.draft)) && user.rol === 'terreno') throw new AIError('ACTION_FORBIDDEN', 'Solo administradores y supervisores pueden registrar personas.', 403);
        registrationDraft = registration.draft;
        const scoped = scopeProjectActions(registration.actions, conversationProjectId(tables.proyectos, body.mensaje, body.historial, projectId), tables.proyectos, projectId);
        result.accion = scoped.length === 1 ? scoped[0] : scoped.length ? {tipo:'lote_acciones',acciones:scoped} : null;
        if (registration.question) result.respuesta = registration.question;
        Object.assign(result, withNameEditContext(withPersonContext(result, registrationDraft), pendingNameEdit, !!nameCommand?.handled || !!(nameCommand && 'clear' in nameCommand && nameCommand.clear)));
        Object.assign(result, withPreferences(result, preferences.state));
        const actions = checkActionPermissions(
          user,
          result.accion,
          body.mensaje,
        );
        if (actions.length && company.plan_id !== "pro_ia")
          throw new AIError(
            "PLAN_REQUIRED",
            "Puedes cotizar y consultar precios con Pro. Los cambios por el copiloto requieren Pro IA.",
            403,
          );
        result.accion = actions.length === 1 ? actions[0] : actions.length ? { tipo: 'lote_acciones', acciones: actions } : null;
        validateResult(result);
        const broadcasts = actions.filter(
          (a) => a.tipo === "enviar_mensaje_equipo",
        );
        if (!broadcasts.length) return null;
        if (service.getActivePlan() !== "pro_ia")
          throw new AIError(
            "PLAN_REQUIRED",
            "Los avisos al equipo requieren el plan Pro IA.",
            403,
          );
        const requestId =
          typeof body.request_id === "string" &&
          /^[a-f0-9-]{36}$/.test(body.request_id)
            ? body.request_id
            : randomUUID();
        const broadcastActions = [];
        for (let index = 0; index < broadcasts.length; index++) {
          const broadcast = broadcasts[index];
          const plan = prepareCampaign(
            user,
            broadcast,
            tables.usuarios,
            service.getProyectos(),
            currentId,
          );
          const enqueued = await enqueueCampaign(
            client,
            user,
            plan,
            `web:${user.id}:${requestId}${index ? `:${index}` : ""}`,
            "plataforma",
          );
          broadcastActions.push(enqueued);
        }
        const broadcastText = broadcastActions
          .map((item) => item.resultado_texto)
          .filter(Boolean)
          .join("\n\n");
        const remaining = actions.filter(
          (a) => a.tipo !== "enviar_mensaje_equipo",
        );
        if (remaining.length) {
          result.accion =
            remaining.length === 1
              ? remaining[0]
              : { tipo: "lote_acciones", acciones: remaining };
          result.aviso_equipo = broadcastActions[0];
          result.respuesta_adicional = [
            typeof result.respuesta_adicional === "string"
              ? result.respuesta_adicional
              : "",
            broadcastText,
          ]
            .filter(Boolean)
            .join("\n\n");
          result.respuesta = [
            typeof result.respuesta_consulta === "string"
              ? result.respuesta_consulta
              : "",
            result.respuesta,
            broadcastText,
          ]
            .filter(Boolean)
            .filter((part, idx, list) => list.indexOf(part) === idx)
            .join("\n\n");
          return null;
        }
        return NextResponse.json(withPreferences(withNameEditContext(withPersonContext({
          ...result,
          respuesta: [
            typeof result.respuesta_consulta === "string"
              ? result.respuesta_consulta
              : "",
            broadcastText,
          ]
            .filter(Boolean)
            .join("\n\n"),
          accion: null,
          cotizacion: null,
          accion_ejecutada: broadcastActions[0],
        }, registrationDraft), pendingNameEdit), preferences.state));
      };
      if (!["admin", "supervisor", "terreno"].includes(user.rol))
        throw new AIError(
          "ROLE_FORBIDDEN",
          "Tu cuenta no tiene acceso al asistente de obras.",
          403,
        );
      if (projectId && !service.getProyectoById(projectId)) throw new AIError('PROJECT_FORBIDDEN', 'La obra no está disponible para tu cuenta.', 403);
      if (preferences.respuesta) return NextResponse.json(withPreferences(withNameEditContext(withPersonContext({respuesta:preferences.respuesta,accion:null,cotizacion:null,sugerencias:[]},registrationDraft),pendingNameEdit),preferences.state));
      const apuLesson = await learnApuCommand(client, user, body.mensaje, 'web');
      if (apuLesson.handled) return NextResponse.json(withPreferences(withNameEditContext(withPersonContext({respuesta:apuLesson.respuesta || 'Rendimiento guardado.',accion:null,cotizacion:null,sugerencias:[]},registrationDraft),pendingNameEdit),preferences.state));
      if(nameCommand?.handled) {
        const result={respuesta:nameCommand.question || 'Voy a corregir el nombre de la ficha.',accion:nameCommand.action || null,cotizacion:null,sugerencias:[]};
        await finish(result,projectId);
        return NextResponse.json(result);
      }
      const localRegistration = personIntake([], null, registrationDraft, body.mensaje, tables.proyectos, registrationProjectId, tables.usuarios);
      if (localRegistration.question || localRegistration.actions.length) {
        const result = {respuesta:localRegistration.question || 'Voy a registrar la ficha y su asignación.',accion:null,cotizacion:null,sugerencias:[]};
        await finish(result, projectId, localRegistration);
        return NextResponse.json(result);
      }
      if (deadlineOnly) {
        if (projectId && !service.getProyectoById(projectId)) throw new AIError('PROJECT_FORBIDDEN', 'La obra no está disponible para tu cuenta.', 403);
        const verified = projectDeadlineAnswer(body.mensaje, tables.proyectos, projectId);
        if (verified) return NextResponse.json(withPreferences(withNameEditContext(withPersonContext(verified, registrationDraft), pendingNameEdit), preferences.state));
      }
      if (projectId && !service.getProyectoById(projectId)) throw new AIError('PROJECT_FORBIDDEN', 'La obra no está disponible para tu cuenta.', 403);
      const referencedId = conversationProjectId(tables.proyectos, body.mensaje, body.historial, projectId);
      const statusCommand = !hasOtherWorkBeyondStatus(body.mensaje)
        ? projectStatusCommand(body.mensaje, tables.proyectos, referencedId, body.historial)
        : null;
      if (statusCommand) {
        if (projectId && statusCommand.accion && statusCommand.accion.proyecto_id !== projectId) throw new AIError('PROJECT_CONTEXT', 'Estás en el chat de otra obra. Abre la obra indicada o usa la consulta general para cambiar su estado.', 422);
        await finish(statusCommand, projectId);
        return NextResponse.json(statusCommand);
      }
      let canonicalBudget: Presupuesto | null = null;
      const budgetContext = async (scope?: string) => {
        const id = body.contexto_cotizacion?.id;
        if (typeof id !== "string" || id.length > 200) return null;
        const data = await findBudget(client, user.empresa_id, id);
        if (scope && data?.proyecto_id && data.proyecto_id !== scope)
          throw new AIError(
            "BUDGET_FORBIDDEN",
            "Ese presupuesto pertenece a otra obra. Selecciona el presupuesto de esta obra.",
            403,
          );
        canonicalBudget = data;
        return data?.cotizacion || null;
      };
      if(ragEligible(body.mensaje,user.rol)){onStage?.('Consultando referencias y precios…');scheduleKnowledgeIndex(user.empresa_id);}
      const [semanticReferences, crossChannelTurns] = await Promise.all([
        retrieveReferences(client, body.mensaje, user.rol),
        loadRecentCrossChannelTurns(getSupabaseAdmin() || client, actor, 'web'),
      ]);
      onStage?.('Generando propuesta con ObraBot…');
      const capability = {
        referencias_semanticas: semanticReferences,
        ...(crossChannelTurns.length ? { actividad_reciente_whatsapp: crossChannelTurns } : {}),
        preferencias_conversacion: preferences.state.valores,
        registro_persona: registrationDraft,
        acciones_habilitadas: company.plan_id === "pro_ia",
      };
        const genOptions = body.imagen ? { validateResult, onQualityEvent, image: body.imagen } : { validateResult, onQualityEvent };
        if (projectId) {
          if (!/^[a-zA-Z0-9_-]+$/.test(projectId))
            throw new AIError("PROJECT_INVALID", "La obra no es válida.", 400);
          const data = service.getProyectoById(projectId);
          if (!data)
            throw new AIError(
              "PROJECT_FORBIDDEN",
              "La obra no está disponible para tu cuenta.",
              403,
            );
          const result = await deps.project({
            historial: body.historial,
            mensajeUsuario: body.mensaje,
            contextoProyecto: {
              ...data,
              cotizacion_actual: await budgetContext(projectId),
            },
            options: genOptions,
            contextoDB: { ...context, ...capability, operacion_obra: operationsContext(tables, projectId, user.rol, body.mensaje), cliente_actual: user.rol === 'terreno' ? null : tables.clientes.find((c) => c.id === data.cliente_id) || null },
          });
          const queued = await finish(result, projectId);
          if (queued) return queued;
          if (result.cotizacion)
            await saveBudget(client, user, result.cotizacion, projectId, isAlternativeRequest(body.mensaje) ? canonicalBudget : null);
          return NextResponse.json(result);
        }
        const result = await deps.global(body.historial, body.mensaje, {
          ...context,
          ...capability,
          proyecto_actual: tables.proyectos.find(project => project.id === referencedId) || null,
          operacion_obra: operationsContext(tables, undefined, user.rol, body.mensaje),
          cotizacion_actual: await budgetContext(),
        }, genOptions);
      const queued = await finish(result);
      if (queued) return queued;
      if (result.cotizacion) await saveBudget(client, user, result.cotizacion, undefined, isAlternativeRequest(body.mensaje) ? canonicalBudget : null);
      return NextResponse.json(result);
    } catch (error) {
      return errorJSON(error);
    }
  };

  return async (request: NextRequest, projectId?: string) => {
    const wantsStream = (request.headers.get('accept') || '').includes('text/event-stream');
    if (!wantsStream) return runChat(request, projectId);

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const sendEvent = async (event: string, data: unknown) => {
      try {
        await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      } catch {
        // Cliente desconectado o abortado.
      }
    };

    const pump = AsyncResource.bind(async () => {
      try {
        const res = await runChat(request, projectId, (stage) => {
          void sendEvent('stage', { stage });
        });
        const payload = await res.json().catch(() => ({ error: 'Respuesta no válida del servidor.' }));
        if (!res.ok || payload?.error) {
          await sendEvent('error', { error: payload?.error || 'No se pudo completar la solicitud.', code: payload?.code });
          return;
        }
        const fullText = typeof payload.respuesta === 'string' ? payload.respuesta : '';
        if (fullText.length > 0) {
          const step = Math.max(18, Math.ceil(fullText.length / 16));
          for (let i = 0; i < fullText.length; i += step) {
            await sendEvent('delta', { text: fullText.slice(0, i + step) });
            await new Promise((r) => setTimeout(r, 12));
          }
        }
        await sendEvent('done', payload);
      } catch (err) {
        const mapped = aiErrorResponse(err);
        await sendEvent('error', { error: mapped.error, code: mapped.code });
      } finally {
        try { await writer.close(); } catch {}
      }
    });
    void pump();

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'private, no-cache, no-store, no-transform',
        Connection: 'keep-alive',
      },
    });
  };
}
