import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase/client";
import { AIError, aiErrorResponse } from "./errors";
import { serverFetch } from "@/lib/server-fetch";
import { chatAsesorObrasGemini, chatAgenteProyectoGemini } from "@/lib/gemini";
import { loadAIContext } from "./context";
import { saveBudget } from "@/lib/presupuestos";
import { checkActionPermissions } from "./permissions";
import { prepareCampaign, enqueueCampaign } from "@/lib/whatsapp/campaigns";
import { randomUUID } from "node:crypto";

export async function authorizeAI(request: NextRequest) {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer)
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
    .select("id,empresa_id,rol,nombre")
    .or(`id.eq.${data.user.id},auth_user_id.eq.${data.user.id}`)
    .maybeSingle();
  if (profileError || !user?.empresa_id)
    throw new AIError(
      "TENANT_REQUIRED",
      "Tu cuenta no tiene una empresa disponible para gestionar obras.",
      403,
    );
  return { client, user };
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
  const historial = (Array.isArray(body.historial) ? body.historial : [])
    .slice(-12)
    .filter((h: any) => typeof h?.texto === "string")
    .map((h: any) => ({
      rol: h.remitente === "usuario" ? ("user" as const) : ("model" as const),
      texto: h.texto.slice(0, 4000),
    }));
  return { ...body, mensaje: body.mensaje.trim(), historial };
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
      const { context, service, tables } = await loadAIContext(client, user);
      const finish = async (result: any, currentId?: string) => {
        const actions = checkActionPermissions(
          user,
          result.accion,
          body.mensaje,
        );
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
        return NextResponse.json({
          ...result,
          respuesta: action.resultado_texto,
          accion: null,
          cotizacion: null,
          accion_ejecutada: action,
        });
      };
      if (!["admin", "supervisor", "terreno"].includes(user.rol))
        throw new AIError(
          "ROLE_FORBIDDEN",
          "Tu cuenta no tiene acceso al asistente de obras.",
          403,
        );
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
            cotizacion_actual: body.contexto_cotizacion || null,
          },
        });
        const queued = await finish(result, projectId);
        if (queued) return queued;
        if (result.cotizacion)
          await saveBudget(client, user, result.cotizacion, projectId);
        return NextResponse.json(result);
      }
      const result = await deps.global(body.historial, body.mensaje, {
        ...context,
        cotizacion_actual: body.contexto_cotizacion || null,
      });
      const queued = await finish(result);
      if (queued) return queued;
      if (result.cotizacion) await saveBudget(client, user, result.cotizacion);
      return NextResponse.json(result);
    } catch (error) {
      return errorJSON(error);
    }
  };
}
