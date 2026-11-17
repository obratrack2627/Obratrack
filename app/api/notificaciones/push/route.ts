import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase/client";
import { serverFetch } from "@/lib/server-fetch";
import { isSessionJWT } from "@/lib/auth/access";
import { AIError } from "@/lib/ai/errors";
import { errorJSON } from "@/lib/ai/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_PUSH_PREFERENCES,
  getVapidConfig,
  sanitizePushPreferences,
  sendPushToUsers,
} from "@/lib/push/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function pushErrorResponse(error: unknown) {
  if(error instanceof AIError)return errorJSON(error);
  // Never expose subscription endpoints, keys or provider response bodies.
  console.error('push_request_failed',{type:error instanceof Error?error.name:'unknown'});
  return NextResponse.json({code:'PUSH_INTERNAL',error:'No se pudo completar la solicitud de notificaciones. Intenta nuevamente.'},{status:503});
}

async function authorizePushActor(request: NextRequest) {
  const authorization = (request.headers.get("authorization") || "").trim().split(/\s+/);
  const bearer =
    authorization.length === 2 && authorization[0].toLowerCase() === "bearer"
      ? authorization[1]
      : request.cookies.get("obratrack_auth_token")?.value;

  if (
    authorization.length === 1 &&
    ["POST", "PATCH", "DELETE", "PUT"].includes(request.method) &&
    request.headers.get("origin") &&
    request.headers.get("origin") !== request.nextUrl.origin
  ) {
    throw new AIError("ORIGIN_FORBIDDEN", "El origen de la solicitud no está permitido.", 403);
  }
  if (!bearer || (authorization.length === 1 && !isSessionJWT(bearer))) {
    throw new AIError("AUTH_REQUIRED", "Inicia sesión nuevamente para configurar alertas.", 401);
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: serverFetch, headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data, error } = await client.auth.getUser(bearer);
  if (error || !data.user) {
    throw new AIError("AUTH_REQUIRED", "Tu sesión no es válida o expiró.", 401);
  }
  const { data: user, error: profileError } = await client
    .from("usuarios")
    .select("id,empresa_id,rol,nombre,is_dev")
    .or(`id.eq.${data.user.id},auth_user_id.eq.${data.user.id}`)
    .maybeSingle();

  if (profileError || !user?.empresa_id) {
    throw new AIError("TENANT_REQUIRED", "Tu cuenta no tiene una empresa asociada.", 403);
  }
  if (!["admin", "supervisor", "terreno"].includes(user.rol) && user.is_dev !== true) {
    throw new AIError("ROLE_FORBIDDEN", "Tu perfil no tiene acceso a notificaciones.", 403);
  }
  const effectiveRole = user.is_dev === true && user.rol !== "terreno" && user.rol !== "supervisor" ? "admin" : user.rol;
  return { client, user: { ...user, rol: effectiveRole as "admin" | "supervisor" | "terreno" } };
}

export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authorizePushActor(request);
    const admin = getSupabaseAdmin();
    const vapid = await getVapidConfig(admin);
    const db = admin || client;

    let subs: any[] = [];
    let schemaReady = true;
    try {
      const { data, error } = await db
        .from("push_suscripciones")
        .select("id,endpoint,preferencias,activo,updated_at")
        .eq("empresa_id", user.empresa_id)
        .eq("usuario_id", user.id)
        .eq("activo", true);
      if (error) schemaReady = false;
      else subs = data || [];
    } catch {
      schemaReady = false;
    }

    const endpoint = request.nextUrl.searchParams.get("endpoint");
    const current = endpoint ? subs.find((s) => s.endpoint === endpoint) : subs[0];
    const hasEnvVapid = Boolean(
      (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim() &&
        (process.env.VAPID_PRIVATE_KEY || "").trim(),
    );
    const diagnostic = !schemaReady
      ? "missing_migration"
      : !vapid?.publicKey && !admin && !hasEnvVapid
        ? "missing_service_role"
        : !vapid?.publicKey
          ? "vapid_unavailable"
          : null;

    return NextResponse.json(
      {
        configured: Boolean(vapid?.publicKey) && schemaReady,
        schema_ready: schemaReady,
        admin_ready: Boolean(admin),
        diagnostic,
        publicKey: vapid?.publicKey || null,
        subscribed: endpoint ? Boolean(current) : subs.length > 0,
        activeCount: subs.length,
        preferences: sanitizePushPreferences(current?.preferencias || DEFAULT_PUSH_PREFERENCES),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return pushErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { client, user } = await authorizePushActor(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new AIError("INVALID_REQUEST", "Datos de notificación inválidos.", 400);
    }

    const admin = getSupabaseAdmin();
    const db = admin || client;

    if (body.action === "test") {
      const testRes = await sendPushToUsers(db, {
        empresaId: user.empresa_id,
        userIds: [user.id],
        categoria: "general",
        payload: {
          title: "Notificaciones activas · ObraTrack",
          body: `Hola ${(user.nombre || "Constructor").split(" ")[0]}, recibirás tus avisos de obra directo aquí.`,
          url: user.rol === "terreno" ? "/proyectos" : "/dashboard",
          tag: "obratrack-test",
        },
      });
      if (!testRes.sent) {
        throw new AIError(
          "PUSH_NOT_DELIVERED",
          "Activa primero las notificaciones en este dispositivo antes de probar.",
          422,
        );
      }
      return NextResponse.json({ ok: true, sent: testRes.sent });
    }

    if (body.action === "preferences") {
      const prefs = sanitizePushPreferences(body.preferencias);
      const { error } = await db
        .from("push_suscripciones")
        .update({ preferencias: prefs, updated_at: new Date().toISOString() })
        .eq("empresa_id", user.empresa_id)
        .eq("usuario_id", user.id)
        .eq("activo", true);
      if (error) {
        throw new AIError("PUSH_PREF_SAVE", "No se pudieron guardar tus preferencias.", 503);
      }
      return NextResponse.json({ ok: true, preferences: prefs });
    }

    const sub = body.subscription;
    const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint.trim() : "";
    const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh.trim() : "";
    const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth.trim() : "";

    if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !p256dh || !auth) {
      throw new AIError("INVALID_SUBSCRIPTION", "Suscripción Web Push incompleta.", 400);
    }

    const prefs = sanitizePushPreferences(body.preferencias);
    const { error } = await db.from("push_suscripciones").upsert(
      {
        empresa_id: user.empresa_id,
        usuario_id: user.id,
        rol: user.rol,
        endpoint,
        p256dh,
        auth,
        user_agent: String(request.headers.get("user-agent") || "").slice(0, 300) || null,
        preferencias: prefs,
        activo: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      throw new AIError(
        "PUSH_SUBSCRIBE_SAVE",
        "No se pudo activar la suscripción push. Verifica que la migración de Supabase esté aplicada.",
        503,
      );
    }

    return NextResponse.json({ ok: true, subscribed: true, preferences: prefs });
  } catch (error) {
    return pushErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { client, user } = await authorizePushActor(request);
    const body = await request.json().catch(() => ({}));
    const admin = getSupabaseAdmin();
    const db = admin || client;

    let query = db
      .from("push_suscripciones")
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq("empresa_id", user.empresa_id)
      .eq("usuario_id", user.id);

    if (typeof body?.endpoint === "string" && body.endpoint.trim()) {
      query = query.eq("endpoint", body.endpoint.trim());
    }
    const { error } = await query;
    if (error) {
      throw new AIError("PUSH_UNSUBSCRIBE", "No se pudo desactivar la notificación.", 503);
    }
    return NextResponse.json({ ok: true, subscribed: false });
  } catch (error) {
    return pushErrorResponse(error);
  }
}
