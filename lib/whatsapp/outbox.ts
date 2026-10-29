import { createClient } from "@supabase/supabase-js";
import { serverFetch } from "@/lib/server-fetch";
import { supabaseUrl } from "@/lib/supabase/client";
import { AIError } from "@/lib/ai/errors";
import { canonicalPhone } from "./meta";
import { createHmac, timingSafeEqual } from "node:crypto";

export function validDispatchSignature(
  at: string,
  signature: string,
  key: string,
  now = Date.now(),
) {
  if (
    !key ||
    !/^\d{10}$/.test(at) ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    Math.abs(now - Number(at) * 1000) > 300000
  )
    return false;
  const expected = createHmac("sha256", key)
    .update("obratrack-dispatch:" + at)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export const avisoTemplate = "obratrack_aviso_equipo";
export function whatsappAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new AIError(
      "WHATSAPP_DATABASE_CONFIG",
      "El servicio de WhatsApp necesita revisar su conexión.",
      503,
    );
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: serverFetch },
  });
}
const graph = () =>
  `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0"}`;
const auth = () => ({
  Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
});
export async function getAvisoTemplate(fetcher: typeof fetch = serverFetch) {
  const account = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!account) return { status: "SIN_CONFIGURAR", name: avisoTemplate };
  const response = await fetcher(
    `${graph()}/${account}/message_templates?name=${avisoTemplate}&fields=name,status,language,category&limit=100`,
    { headers: auth(), signal: AbortSignal.timeout(6000) },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new AIError(
      "WHATSAPP_TEMPLATE",
      "No se pudo consultar la plantilla de avisos en Meta.",
      503,
    );
  const template = body.data?.find(
    (t: any) => t.name === avisoTemplate && t.language === "es",
  );
  return { status: template?.status || "NO_CREADA", name: avisoTemplate };
}
export async function ensureAvisoTemplate(fetcher: typeof fetch = serverFetch) {
  const existing = await getAvisoTemplate(fetcher);
  if (existing.status !== "NO_CREADA") return existing;
  const response = await fetcher(
    `${graph()}/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
    {
      method: "POST",
      headers: auth(),
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        name: avisoTemplate,
        language: "es",
        category: "UTILITY",
        components: [
          {
            type: "BODY",
            text: "Aviso operativo de {{1}}:\n{{2}}\nSi necesitas aclarar este aviso de trabajo, responde a este mensaje.",
            example: {
              body_text: [
                [
                  "Tu equipo de obra",
                  "Mañana la cuadrilla comienza a las 08:00. Recuerda llevar tus elementos de protección.",
                ],
              ],
            },
          },
        ],
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new AIError(
      "WHATSAPP_TEMPLATE_CREATE",
      "Meta no permitió registrar la plantilla operativa. Revisa los permisos de la cuenta.",
      503,
    );
  return { name: avisoTemplate, status: body.status || "PENDING" };
}
export class DispatchError extends Error {
  constructor(
    public code: string,
    public ambiguous = false,
    public transient = false,
  ) {
    super(code);
  }
}
export async function sendTeamMessage(
  job: any,
  message: string,
  company: string,
  useTemplate: boolean,
  fetcher: typeof fetch = serverFetch,
) {
  let response: Response;
  const payload: any = {
    messaging_product: "whatsapp",
    to: job.telefono,
    biz_opaque_callback_data: `obratrack:${job.id}:${job.intentos}`,
  };
  if (useTemplate) {
    payload.type = "template";
    payload.template = {
      name: avisoTemplate,
      language: { code: "es" },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: company.replace(/\s+/g, " ").trim().slice(0, 64),
            },
            { type: "text", text: message.replace(/\s+/g, " ").trim() },
          ],
        },
      ],
    };
  } else {
    payload.type = "text";
    payload.text = { body: `Aviso de ${company}\n${message}` };
  }
  try {
    response = await fetcher(
      `${graph()}/${process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: auth(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    throw new DispatchError("ENVIO_SIN_CONFIRMACION", true);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = Number.isInteger(body.error?.code)
      ? String(body.error.code)
      : `HTTP_${response.status}`;
    throw new DispatchError(
      code,
      false,
      response.status === 429 ||
        response.status >= 500 ||
        ["130429", "131056"].includes(code),
    );
  }
  const id = body.messages?.[0]?.id;
  if (typeof id !== "string" || !id)
    throw new DispatchError("ENVIO_SIN_CONFIRMACION", true);
  return id;
}
const checked = (r: any) => {
  if (r.error)
    throw new AIError(
      "OUTBOX_DATABASE",
      "No se pudo actualizar el estado de los envíos.",
      503,
    );
  return r.data;
};
export async function processOutbox(
  sb: any,
  deps = { send: sendTeamMessage, template: getAvisoTemplate },
) {
  const jobs =
    checked(await sb.rpc("reservar_envios_whatsapp", { p_limite: 6 })) || [];
  if (!jobs.length) return { procesados: 0 };
  let campaigns: any[], companies: any[], recipients: any[], history: any[];
  try {
    campaigns =
      checked(
        await sb
          .from("whatsapp_avisos")
          .select("*")
          .in("id", Array.from(new Set(jobs.map((j: any) => j.aviso_id)))),
      ) || [];
    companies =
      checked(
        await sb
          .from("empresas")
          .select("id,nombre")
          .in("id", Array.from(new Set(jobs.map((j: any) => j.empresa_id)))),
      ) || [];
    recipients =
      checked(
        await sb
          .from("usuarios")
          .select("id,empresa_id,telefono_whatsapp")
          .in("id", jobs.map((j: any) => j.destinatario_id).filter(Boolean)),
      ) || [];
    history =
      checked(
        await sb
          .from("whatsapp_mensajes")
          .select("empresa_id,sender_phone,created_at")
          .in(
            "sender_phone",
            jobs.map((j: any) => j.telefono),
          )
          .gte(
            "created_at",
            new Date(Date.now() - 23.8 * 3600000).toISOString(),
          ),
      ) || [];
  } catch (error) {
    // Todavía no se llamó a Meta: estos trabajos pueden reintentarse sin duplicar un envío.
    for (const job of jobs)
      checked(
        await sb
          .from("whatsapp_envios")
          .update({
            estado: "pendiente",
            proximo_intento: new Date(Date.now() + 60000).toISOString(),
            error_codigo: "LECTURA_PENDIENTE",
            error_detalle:
              "La información del aviso no estuvo disponible. Se reintentará automáticamente.",
          })
          .eq("id", job.id)
          .eq("intentos", job.intentos)
          .eq("estado", "procesando"),
      );
    throw error;
  }
  const open = new Set(
    history.map((h: any) => `${h.empresa_id}:${h.sender_phone}`),
  );
  let templatePromise: Promise<any> | undefined;
  const update = async (job: any, value: any) =>
    checked(
      await sb
        .from("whatsapp_envios")
        .update({ ...value, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("intentos", job.intentos)
        .eq("estado", "procesando"),
    );
  const run = async (job: any) => {
    const recipient = recipients.find(
      (u: any) =>
        u.id === job.destinatario_id && u.empresa_id === job.empresa_id,
    );
    if (
      !recipient ||
      canonicalPhone(recipient.telefono_whatsapp || "") !== job.telefono
    ) {
      await update(job, {
        estado: "fallido",
        error_codigo: "CONTACTO_CAMBIADO",
        error_detalle:
          "La ficha o el teléfono del destinatario cambió. Revisa el equipo antes de reintentar.",
      });
      return;
    }
    const campaign = campaigns.find((a: any) => a.id === job.aviso_id);
    if (!campaign) {
      await update(job, {
        estado: "fallido",
        error_detalle: "El aviso no está disponible.",
      });
      return;
    }
    const useTemplate =
      job.forzar_plantilla || !open.has(`${job.empresa_id}:${job.telefono}`);
    try {
      if (useTemplate) {
        templatePromise ||= deps.template();
        const template = await templatePromise;
        if (template.status !== "APPROVED") {
          await update(job, {
            estado: "esperando_plantilla",
            error_codigo: "PLANTILLA_" + template.status,
            error_detalle:
              template.status === "REJECTED"
                ? "Meta rechazó la plantilla de avisos. El administrador debe revisarla."
                : "El aviso espera la aprobación de la plantilla de Meta.",
            proximo_intento: new Date(Date.now() + 300000).toISOString(),
          });
          return;
        }
      }
      const company =
        companies.find((c: any) => c.id === job.empresa_id)?.nombre ||
        "tu equipo de obra";
      const id = await deps.send(job, campaign.mensaje, company, useTemplate);
      checked(
        await sb.rpc("estado_envio_whatsapp", {
          p_id: job.id,
          p_intento: job.intentos,
          p_meta: id,
          p_estado: "accepted",
          p_codigo: null,
          p_telefono: job.telefono,
        }),
      );
    } catch (error) {
      const e =
        error instanceof DispatchError
          ? error
          : new DispatchError(
              error instanceof AIError ? error.code : "ENVIO_SIN_CONFIRMACION",
              !(error instanceof AIError),
            );
      const retry = e.transient && job.reintentos < 4;
      await update(job, {
        estado: e.ambiguous
          ? "por_verificar"
          : e.code === "131047"
            ? "esperando_plantilla"
            : retry
              ? "pendiente"
              : "fallido",
        forzar_plantilla: job.forzar_plantilla || e.code === "131047",
        reintentos: job.reintentos + (e.transient ? 1 : 0),
        proximo_intento: new Date(
          Date.now() + Math.min(60 * 2 ** job.reintentos, 900) * 1000,
        ).toISOString(),
        error_codigo: e.code,
        error_detalle: e.ambiguous
          ? "El envío no pudo confirmarse. Revisar antes de volver a enviar."
          : e.code === "131030"
            ? "Este teléfono no está habilitado como destinatario del número de prueba de Meta."
            : e.code === "131047"
              ? "Meta requiere una plantilla para iniciar esta conversación."
              : e.code === "190"
                ? "La conexión con Meta necesita renovar su credencial."
                : "No se pudo completar el envío. Revisa la conexión y los permisos.",
      });
    }
  };
  for (let i = 0; i < jobs.length; i += 3)
    await Promise.all(jobs.slice(i, i + 3).map(run));
  // Continuar la cola por lotes sin esperar el siguiente minuto del cron.
  if (jobs.length === 6) {
    const next = await sb.rpc("solicitar_proceso_avisos");
    if (next.error) console.error("whatsapp_dispatch_wakeup_failure");
  }
  return { procesados: jobs.length };
}
export async function receiveDeliveryStatus(sb: any, status: any) {
  if (
    !["sent", "delivered", "read", "failed"].includes(status?.status) ||
    typeof status.id !== "string"
  )
    return;
  const match =
    typeof status.biz_opaque_callback_data === "string"
      ? /^obratrack:([a-f0-9-]{36}):(\d+)$/.exec(
          status.biz_opaque_callback_data,
        )
      : null;
  checked(
    await sb.rpc("estado_envio_whatsapp", {
      p_id: match?.[1] || null,
      p_intento: match ? Number(match[2]) : null,
      p_meta: status.id,
      p_estado: status.status,
      p_codigo: Number.isInteger(status.errors?.[0]?.code)
        ? String(status.errors[0].code)
        : null,
      p_telefono: status.recipient_id || null,
    }),
  );
}
