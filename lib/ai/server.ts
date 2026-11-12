import { conversationPreferences, withPreferences } from './preferences';
import { contactNameCommand, contactTurns, withNameEditContext } from './contact-name-command';
import { personIntake } from '@/lib/whatsapp/person-intake';
import { pendingPerson, withPersonContext } from './person-context';
import { flattenActions } from './protocol';
import { scopeProjectActions } from './actions';
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
import { isAlternativeRequest } from './prompt';
import { checkActionPermissions } from "./permissions";
import { prepareCampaign, enqueueCampaign } from "@/lib/whatsapp/campaigns";
import { randomUUID } from "node:crypto";
import { canAccessWeb, WEB_ACCESS_ERROR, isSessionJWT } from '@/lib/auth/access';

export async function authorizeAI(request: NextRequest) {
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
  return { client, user: { ...user, rol: user.is_dev === true ? 'admin' : user.rol } };
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
  if (raw.length > 180000)
    throw new AIError(
      "REQUEST_TOO_LARGE",
      "La conversación es demasiado extensa. Inicia una conversación nueva.",
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
  const historial = conversationHistory(body.historial, body.mensaje);
  return { ...body, mensaje: body.mensaje.trim(), historial, historial_original: body.historial };
}

// Dependencias explícitas permiten probar la ruta sin una clave ni una base de producción.
export function createChatHandler(
  deps = {
    authorize: authorizeAI,
    global: chatAsesorObrasGemini,
    project: chatAgenteProyectoGemini,
  },
) {
  return async (request: NextRequest, projectId?: string) => {
    try {
      const { client, user } = await deps.authorize(request);
      const body = await readAIRequest(request);
      const { company, context, service, tables } = await loadAIContext(
        client,
        user,
        { projectsOnly: isProjectDeadlineQuestion(body.mensaje) },
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
      let registrationDraft = pendingPerson(body.historial_original, body.historial, tables.proyectos, projectId);
      const nameCommand = !registrationDraft ? contactNameCommand(body.mensaje, tables.usuarios, contactTurns(body.historial_original), user.id) : null;
      const pendingNameEdit = nameCommand?.pending || null;
      const preferences = conversationPreferences(body.historial_original, user, projectId, body.mensaje);
      const finish = async (result: any, currentId?: string, prepared?: ReturnType<typeof personIntake>) => {
        const registration = prepared || personIntake(flattenActions(result.accion), result.registro_propuesto, registrationDraft, body.mensaje, tables.proyectos, projectId, tables.usuarios);
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
        const broadcast = actions.find(
          (a) => a.tipo === "enviar_mensaje_equipo",
        );
        if (!broadcast) return null;
        if (service.getActivePlan() !== "pro_ia")
          throw new AIError(
            "PLAN_REQUIRED",
            "Los avisos al equipo requieren el plan Pro IA.",
            403,
          );
        const plan = prepareCampaign(
          user,
          broadcast,
          tables.usuarios,
          service.getProyectos(),
          currentId,
        );
        const requestId =
          typeof body.request_id === "string" &&
          /^[a-f0-9-]{36}$/.test(body.request_id)
            ? body.request_id
            : randomUUID();
        const action = await enqueueCampaign(
          client,
          user,
          plan,
          `web:${user.id}:${requestId}`,
          "plataforma",
        );
        return NextResponse.json(withPreferences(withNameEditContext(withPersonContext({
          ...result,
          respuesta: action.resultado_texto,
          accion: null,
          cotizacion: null,
          accion_ejecutada: action,
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
      if(nameCommand?.handled) {
        const result={respuesta:nameCommand.question || 'Voy a corregir el nombre de la ficha.',accion:nameCommand.action || null,cotizacion:null,sugerencias:[]};
        await finish(result,projectId);
        return NextResponse.json(result);
      }
      const localRegistration = personIntake([], null, registrationDraft, body.mensaje, tables.proyectos, projectId, tables.usuarios);
      if (localRegistration.question || localRegistration.actions.length) {
        const result = {respuesta:localRegistration.question || 'Voy a registrar la ficha y su asignación.',accion:null,cotizacion:null,sugerencias:[]};
        await finish(result, projectId, localRegistration);
        return NextResponse.json(result);
      }
      if (isProjectDeadlineQuestion(body.mensaje)) {
        if (projectId && !service.getProyectoById(projectId)) throw new AIError('PROJECT_FORBIDDEN', 'La obra no está disponible para tu cuenta.', 403);
        const verified = projectDeadlineAnswer(body.mensaje, tables.proyectos, projectId);
        if (verified) return NextResponse.json(withPreferences(withNameEditContext(withPersonContext(verified, registrationDraft), pendingNameEdit), preferences.state));
      }
      if (projectId && !service.getProyectoById(projectId)) throw new AIError('PROJECT_FORBIDDEN', 'La obra no está disponible para tu cuenta.', 403);
      const referencedId = conversationProjectId(tables.proyectos, body.mensaje, body.historial, projectId);
      const statusCommand = projectStatusCommand(body.mensaje, tables.proyectos, referencedId, body.historial);
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
      const capability = { preferencias_conversacion: preferences.state.valores, registro_persona: registrationDraft, acciones_habilitadas: company.plan_id === "pro_ia" };
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
      });
      const queued = await finish(result);
      if (queued) return queued;
      if (result.cotizacion) await saveBudget(client, user, result.cotizacion, undefined, isAlternativeRequest(body.mensaje) ? canonicalBudget : null);
      return NextResponse.json(result);
    } catch (error) {
      return errorJSON(error);
    }
  };
}
