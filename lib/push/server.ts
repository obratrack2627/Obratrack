import webPush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const PUSH_ICON_PATH = "/app-icons/obratrack-mobile-v3-192.png";

export const PUSH_CATEGORIES = [
  "inicio_plazos",
  "incidentes_bitacora",
  "asignaciones_tareas",
  "materiales",
  "seguridad_clima",
  "cierre_diario",
] as const;

export type PushCategory = (typeof PUSH_CATEGORIES)[number];
export type PushPreferences = Record<PushCategory, boolean>;

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  inicio_plazos: true,
  incidentes_bitacora: true,
  asignaciones_tareas: true,
  materiales: true,
  seguridad_clima: true,
  cierre_diario: true,
};

export interface PushPayloadInput {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  categoria?: PushCategory | "general";
  requireInteraction?: boolean;
}

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

let cachedVapid: VapidConfig | null = null;

export function sanitizePushPreferences(raw: unknown): PushPreferences {
  const result = { ...DEFAULT_PUSH_PREFERENCES };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const key of PUSH_CATEGORIES) {
    if (typeof (raw as Record<string, unknown>)[key] === "boolean") {
      result[key] = Boolean((raw as Record<string, unknown>)[key]);
    }
  }
  return result;
}

export function buildPushPayload(input: PushPayloadInput) {
  const safeUrl =
    typeof input.url === "string" && input.url.startsWith("/") ? input.url : "/dashboard";
  return {
    title: String(input.title || "ObraTrack").slice(0, 120),
    body: String(input.body || "").slice(0, 260),
    icon: PUSH_ICON_PATH,
    badge: PUSH_ICON_PATH,
    url: safeUrl,
    tag: String(input.tag || `obratrack-${input.categoria || "aviso"}`).slice(0, 100),
    categoria: input.categoria || "general",
    requireInteraction: Boolean(input.requireInteraction),
  };
}

export async function getVapidConfig(sb?: any): Promise<VapidConfig | null> {
  const envPublic = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
  const envPrivate = (process.env.VAPID_PRIVATE_KEY || "").trim();
  const envSubject = (process.env.VAPID_SUBJECT || "mailto:soporte@obratrack.cl").trim();
  if (envPublic && envPrivate) {
    return { subject: envSubject, publicKey: envPublic, privateKey: envPrivate };
  }
  if (cachedVapid) return cachedVapid;

  const admin = sb || (() => {
    try {
      return getSupabaseAdmin();
    } catch {
      return null;
    }
  })();
  if (!admin) return null;

  try {
    const existing = await admin
      .from("push_vapid_config")
      .select("subject,public_key,private_key")
      .eq("id", "default")
      .maybeSingle();
    if (existing?.data?.public_key && existing?.data?.private_key) {
      cachedVapid = {
        subject: existing.data.subject || envSubject,
        publicKey: existing.data.public_key,
        privateKey: existing.data.private_key,
      };
      return cachedVapid;
    }
    const keys = webPush.generateVAPIDKeys();
    const inserted = await admin
      .from("push_vapid_config")
      .upsert(
        {
          id: "default",
          subject: envSubject,
          public_key: keys.publicKey,
          private_key: keys.privateKey,
        },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .select("subject,public_key,private_key")
      .maybeSingle();
    if (inserted?.data?.public_key && inserted?.data?.private_key) {
      cachedVapid = {
        subject: inserted.data.subject || envSubject,
        publicKey: inserted.data.public_key,
        privateKey: inserted.data.private_key,
      };
      return cachedVapid;
    }
    const reread = await admin
      .from("push_vapid_config")
      .select("subject,public_key,private_key")
      .eq("id", "default")
      .maybeSingle();
    if (reread?.data?.public_key && reread?.data?.private_key) {
      cachedVapid = {
        subject: reread.data.subject || envSubject,
        publicKey: reread.data.public_key,
        privateKey: reread.data.private_key,
      };
      return cachedVapid;
    }
    cachedVapid = { subject: envSubject, publicKey: keys.publicKey, privateKey: keys.privateKey };
    return cachedVapid;
  } catch {
    return null;
  }
}

export function resetCachedVapidForTest() {
  cachedVapid = null;
}

export interface SendPushParams {
  empresaId: string;
  userIds?: string[];
  roles?: Array<"admin" | "supervisor" | "terreno">;
  excludeUserIds?: string[];
  categoria?: PushCategory | "general";
  payload: PushPayloadInput;
}

export async function sendPushToUsers(
  sb: any,
  params: SendPushParams,
  sender: typeof webPush.sendNotification = webPush.sendNotification.bind(webPush),
): Promise<{ attempted: number; sent: number; deactivated: number }> {
  const admin = sb || (() => {
    try {
      return getSupabaseAdmin();
    } catch {
      return null;
    }
  })();
  if (!admin || !params.empresaId) return { attempted: 0, sent: 0, deactivated: 0 };

  const vapid = await getVapidConfig(admin);
  if (!vapid) return { attempted: 0, sent: 0, deactivated: 0 };

  let query = admin
    .from("push_suscripciones")
    .select("id,usuario_id,rol,endpoint,p256dh,auth,preferencias")
    .eq("empresa_id", params.empresaId)
    .eq("activo", true);

  if (params.userIds?.length) {
    query = query.in("usuario_id", params.userIds);
  }
  if (params.roles?.length) {
    query = query.in("rol", params.roles);
  }

  const { data: subs, error } = await query;
  if (error || !Array.isArray(subs) || !subs.length) {
    return { attempted: 0, sent: 0, deactivated: 0 };
  }

  const excluded = new Set(params.excludeUserIds || []);
  const category = params.categoria || params.payload.categoria;
  const targets = subs.filter((s: any) => {
    if (excluded.has(s.usuario_id)) return false;
    if (category && category !== "general" && PUSH_CATEGORIES.includes(category as PushCategory)) {
      const prefs = sanitizePushPreferences(s.preferencias);
      if (prefs[category as PushCategory] === false) return false;
    }
    return Boolean(s.endpoint && s.p256dh && s.auth);
  });

  if (!targets.length) return { attempted: 0, sent: 0, deactivated: 0 };

  const encoded = JSON.stringify(buildPushPayload({ ...params.payload, categoria: category }));
  const deadIds: string[] = [];
  const sentIds: string[] = [];

  await Promise.allSettled(
    targets.map(async (sub: any) => {
      try {
        await sender(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          encoded,
          {
            TTL: 60 * 60 * 12,
            vapidDetails: {
              subject: vapid.subject,
              publicKey: vapid.publicKey,
              privateKey: vapid.privateKey,
            },
          },
        );
        sentIds.push(sub.id);
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          deadIds.push(sub.id);
        }
      }
    }),
  );

  if (deadIds.length && typeof admin.from === "function") {
    try {
      await admin
        .from("push_suscripciones")
        .update({ activo: false, updated_at: new Date().toISOString() })
        .in("id", deadIds);
    } catch {
      // Ignorar fallo al marcar endpoints vencidos.
    }
  }
  if (sentIds.length && typeof admin.from === "function") {
    try {
      await admin
        .from("push_suscripciones")
        .update({ last_sent_at: new Date().toISOString() })
        .in("id", sentIds);
    } catch {
      // Ignorar fallo al actualizar marca de envío.
    }
  }

  return {
    attempted: targets.length,
    sent: sentIds.length,
    deactivated: deadIds.length,
  };
}

export async function sendPushIdempotent(
  sb: any,
  dedupKey: string,
  params: SendPushParams,
  sender?: typeof webPush.sendNotification,
): Promise<{ skipped: boolean; sent: number }> {
  const admin = sb || getSupabaseAdmin();
  if (!admin) return { skipped: true, sent: 0 };

  try {
    const existing = await admin
      .from("notificaciones_push_enviadas")
      .select("dedup_key")
      .eq("dedup_key", dedupKey)
      .maybeSingle();
    if (existing?.data?.dedup_key) {
      return { skipped: true, sent: 0 };
    }
  } catch {
    return { skipped: true, sent: 0 };
  }

  const res = await sendPushToUsers(admin, params, sender);
  const built = buildPushPayload({ ...params.payload, categoria: params.categoria || params.payload.categoria });

  try {
    await admin.from("notificaciones_push_enviadas").upsert(
      {
        dedup_key: dedupKey,
        empresa_id: params.empresaId,
        usuario_id: params.userIds?.length === 1 ? params.userIds[0] : null,
        categoria: String(built.categoria),
        titulo: built.title,
        cuerpo: built.body,
        url: built.url,
        enviadas: res.sent,
      },
      { onConflict: "dedup_key", ignoreDuplicates: true },
    );
  } catch {
    // Registro de auditoría best-effort.
  }

  return { skipped: false, sent: res.sent };
}
