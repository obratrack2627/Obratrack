import { AIError } from "@/lib/ai/errors";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverFetch } from "@/lib/server-fetch";
import { splitWhatsAppMessage } from "./format";
import { canonicalPhone } from '@/lib/phone';
export { canonicalPhone } from '@/lib/phone';

export function validMetaSignature(
  raw: string,
  signature: string | null,
  secret: string,
) {
  if (!secret || !signature || !/^sha256=[a-f\d]{64}$/.test(signature))
    return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return timingSafeEqual(
    Buffer.from(signature.slice(7), "hex"),
    Buffer.from(expected, "hex"),
  );
}
const version = () => process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
// Solo se devuelve desde la ruta autenticada de administración/supervisión.
// Permite detectar un número reemplazado sin revelar el token ni errores de Meta.
async function diagnoseMetaNumber(fetcher: typeof fetch) {
  const token = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN!;
  const app = process.env.META_APP_ID;
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!app || !secret) return null;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const response = await fetcher(
      `https://graph.facebook.com/${version()}/debug_token?input_token=${encodeURIComponent(token)}`,
      {
        headers: { Authorization: `Bearer ${app}|${secret}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    const info = (await response.json().catch(() => null))?.data;
    if (!response.ok || !info) return null;
    if (info.app_id !== app)
      return { aplicacion_coincide: false };
    if (!info.is_valid) return { token_vigente: false };
    const targets = (info.granular_scopes || [])
      .filter((s: any) =>
        ["whatsapp_business_management", "whatsapp_business_messaging"].includes(s.scope),
      )
      .flatMap((s: any) => s.target_ids || []);
    const accounts = Array.from(new Set<string>([
      ...targets,
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    ].filter((id): id is string => typeof id === "string" && /^\d+$/.test(id)))).slice(0, 4);
    const results = await Promise.all(accounts.map(async (id) => {
      try {
        const res = await fetcher(
          `https://graph.facebook.com/${version()}/${id}/phone_numbers?fields=id`,
          { headers, signal: AbortSignal.timeout(5000) },
        );
        const body = await res.json().catch(() => null);
        return res.ok && Array.isArray(body?.data)
          ? body.data.filter((p: any) => /^\d+$/.test(p.id)).map((p: any) => String(p.id))
          : [];
      } catch { return []; }
    }));
    return {
      token_vigente: true,
      aplicacion_coincide: true,
      permisos: Array.isArray(info.scopes) ? info.scopes.filter((s: unknown) =>
        s === "whatsapp_business_messaging" || s === "whatsapp_business_management") : [],
      otros_numeros_disponibles: results.flat().length > 0,
      numero_configurado_accesible: results.flat().includes(process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID),
    };
  } catch { return null; }
}
export async function checkMetaConnection(fetcher: typeof fetch = serverFetch) {
  const token = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
  const phone = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
  if (!token || !phone)
    return {
      estado: "sin_configurar",
      mensaje: "La conexión de WhatsApp está pendiente de configurar.",
    };
  try {
    const response = await fetcher(
      `https://graph.facebook.com/${version()}/${phone}?fields=id`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    const body = await response.json().catch(() => null);
    if (response.ok && body?.id === phone) {
      // Leer el número no demuestra que la credencial pueda enviar mensajes.
      let messaging: "concedido" | "pendiente" | "no_verificado" =
        "no_verificado";
      try {
        const permissions = await fetcher(
          `https://graph.facebook.com/${version()}/me/permissions`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          },
        );
        const result = await permissions.json().catch(() => null);
        if (permissions.ok && Array.isArray(result?.data))
          messaging = result.data.some(
            (p: any) =>
              p.permission === "whatsapp_business_messaging" &&
              p.status === "granted",
          )
            ? "concedido"
            : "pendiente";
      } catch {}
      const account = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
      const app = process.env.META_APP_ID;
      if (messaging !== "pendiente" && account && app) {
        try {
          const subscription = await fetcher(
            `https://graph.facebook.com/${version()}/${account}/subscribed_apps`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) },
          );
          const result = await subscription.json().catch(() => null);
          if (subscription.ok && Array.isArray(result?.data) &&
              !result.data.some((s: any) => s.whatsapp_business_api_data?.id === app))
            return {
              estado: "webhook_pendiente",
              permisos_mensajeria: messaging,
              mensaje: "El número está disponible, pero su cuenta de WhatsApp todavía no está suscrita a la aplicación de ObraTrack. Activa la suscripción del webhook para recibir mensajes.",
            };
        } catch {}
      }
      return {
        estado:
          messaging === "pendiente" ? "permisos_pendientes" : "disponible",
        permisos_mensajeria: messaging,
        mensaje:
          messaging === "pendiente"
            ? "La credencial puede consultar Meta, pero le falta whatsapp_business_messaging. Genera una credencial con ese permiso y acceso al número de ObraTrack."
            : "El número está disponible en Meta. La entrega de cada aviso se confirma por separado.",
      };
    }
    if (body?.error?.code === 190)
      return {
        estado: "renovar_conexion",
        mensaje:
          "La credencial de WhatsApp venció o dejó de ser válida. El administrador debe renovarla.",
      };
    if ([10, 200].includes(body?.error?.code))
      return {
        estado: "permisos_pendientes",
        mensaje:
          "La conexión de WhatsApp necesita revisar los permisos en Meta.",
      };
    const diagnostico = await diagnoseMetaNumber(fetcher);
    if (diagnostico?.token_vigente === false)
      return {
        estado: "renovar_conexion",
        mensaje: "La credencial de WhatsApp venció o dejó de ser válida. El administrador debe renovarla.",
      };
    if (diagnostico?.aplicacion_coincide === false)
      return {
        estado: "configuracion_incorrecta",
        mensaje: "El token pertenece a otra aplicación de Meta. Revisa la aplicación, su secreto y el webhook antes de conectar el número.",
        diagnostico,
      };
    if (diagnostico?.otros_numeros_disponibles &&
        !diagnostico.numero_configurado_accesible)
      return {
        estado: "numero_desactualizado",
        mensaje: "El token es válido, pero corresponde a otro número de WhatsApp. Actualiza el número de ObraTrack y su cuenta en la configuración del servidor.",
        diagnostico,
      };
    return {
      estado: "no_disponible",
      mensaje: "Meta no pudo confirmar el acceso al número configurado. Revisa el Phone Number ID, la cuenta de WhatsApp y los permisos del token.",
      ...(diagnostico ? { diagnostico } : {}),
    };
  } catch {
    return {
      estado: "no_verificado",
      mensaje: "No se pudo comprobar la conexión de WhatsApp en este momento.",
    };
  }
}
export async function activateMetaWebhook(fetcher: typeof fetch = serverFetch) {
  const token = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
  const phone = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
  const account = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const app = process.env.META_APP_ID;
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!token || !phone || !account || !app || !secret)
    throw new AIError("WHATSAPP_CONFIGURATION", "Completa la configuración de WhatsApp antes de activar la recepción.", 503);
  const base = `https://graph.facebook.com/${version()}`;
  const headers = { Authorization: `Bearer ${token}` };
  const subscribed = (body: any) => Array.isArray(body?.data) &&
    body.data.some((s: any) => s.whatsapp_business_api_data?.id === app);
  const read = async (url: string, auth = headers) => {
    const response = await fetcher(url, { headers: auth, signal: AbortSignal.timeout(5000) });
    return { ok: response.ok, body: await response.json().catch(() => null) };
  };
  try {
    const [debug, numbers, subscription] = await Promise.all([
      read(`${base}/debug_token?input_token=${encodeURIComponent(token)}`, { Authorization: `Bearer ${app}|${secret}` }),
      read(`${base}/${account}/phone_numbers?fields=id`),
      read(`${base}/${account}/subscribed_apps`),
    ]);
    if (!debug.ok || !debug.body?.data?.is_valid || debug.body.data.app_id !== app)
      throw new AIError("WHATSAPP_APPLICATION", "El token, el App Secret y la aplicación deben corresponder a la misma aplicación de Meta y estar vigentes.", 503);
    const scopes = debug.body.data.scopes || [];
    if (!scopes.includes("whatsapp_business_messaging") || !scopes.includes("whatsapp_business_management"))
      throw new AIError("WHATSAPP_PERMISSIONS", "El token necesita whatsapp_business_messaging y whatsapp_business_management para activar la recepción de mensajes.", 503);
    if (!numbers.ok || !Array.isArray(numbers.body?.data) || !numbers.body.data.some((p: any) => p.id === phone))
      throw new AIError("WHATSAPP_ACCOUNT", "El número configurado no pertenece a la cuenta de WhatsApp accesible con este token. Revisa ambos identificadores y sus permisos.", 503);
    if (!subscription.ok || !Array.isArray(subscription.body?.data))
      throw new AIError("WHATSAPP_SUBSCRIPTION_READ", "Meta no permitió comprobar la suscripción. Revisa los permisos de administración del token.", 503);
    if (!subscribed(subscription.body)) {
      // Sin parámetros de cliente: solo se suscribe la cuenta y aplicación ya configuradas.
      const response = await fetcher(`${base}/${account}/subscribed_apps`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: "{}", signal: AbortSignal.timeout(5000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true)
        throw new AIError("WHATSAPP_SUBSCRIPTION_WRITE", "Meta no permitió activar la recepción. Revisa el permiso de administración y el acceso del token a esta cuenta.", 503);
      const verified = await read(`${base}/${account}/subscribed_apps`);
      if (!verified.ok || !subscribed(verified.body))
        throw new AIError("WHATSAPP_SUBSCRIPTION_VERIFY", "Meta todavía no confirma la suscripción. Vuelve a comprobar la conexión antes de enviar instrucciones.", 503);
    }
    return {
      estado: "disponible",
      permisos_mensajeria: "concedido",
      mensaje: "La cuenta de WhatsApp está suscrita a ObraTrack y tiene permiso de mensajería. La entrega se confirma con cada mensaje.",
    };
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError("WHATSAPP_CONNECTION", "No se pudo comprobar la conexión con Meta. Intenta nuevamente.", 503);
  }
}
export async function sendMetaText(to: string, text: string) {
  const token = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
  const phone = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
  // WhatsApp limita cada texto a 4096 caracteres. Conservar todo el detalle en varios mensajes.
  for (const part of splitWhatsAppMessage(text)) {
    const res = await serverFetch(
      `https://graph.facebook.com/${version()}/${phone}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: part },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const providerCode = Number.isInteger(body.error?.code)
        ? body.error.code
        : "UNKNOWN";
      throw new AIError(
        `WHATSAPP_SEND_${providerCode}`,
        "No se pudo enviar la respuesta por WhatsApp.",
        503,
      );
    }
  }
}
export async function sendMetaDocument(to: string, bytes: ArrayBuffer, filename: string, caption: string) {
  const token = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
  const phone = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
  if (!token || !phone || !canonicalPhone(to)) throw new AIError('WHATSAPP_NOT_CONFIGURED', 'No se pudo preparar el envío del documento.', 503);
  const headers = { Authorization: `Bearer ${token}` };
  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('type', 'application/pdf');
  form.set('file', new Blob([bytes], { type: 'application/pdf' }), filename);
  const upload = await serverFetch(`https://graph.facebook.com/${version()}/${phone}/media`, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(6000) });
  const media = await upload.json().catch(() => null);
  if (!upload.ok || !/^\d+$/.test(String(media?.id || ''))) throw new AIError('WHATSAPP_DOCUMENT_UPLOAD', 'No se pudo adjuntar el PDF del cierre.', 503);
  const sent = await serverFetch(`https://graph.facebook.com/${version()}/${phone}/messages`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(6000),
    body: JSON.stringify({ messaging_product: 'whatsapp', to: canonicalPhone(to), type: 'document', document: { id: media.id, filename, caption: caption.slice(0, 1024) } }),
  });
  if (!sent.ok) throw new AIError('WHATSAPP_DOCUMENT_SEND', 'No se pudo enviar el PDF del cierre.', 503);
}
export async function downloadMetaMedia(id: string) {
  if (!/^[\d]+$/.test(id)) throw new AIError('MEDIA_INVALID', 'Reenvía el archivo; su identificador no es válido.', 422);
  const headers = {
    Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN}`,
  };
  const metadata = await serverFetch(
    `https://graph.facebook.com/${version()}/${id}`,
    { headers },
  );
  if (!metadata.ok) throw new Error("No se pudo consultar el adjunto.");
  const data = await metadata.json();
  const url = new URL(data.url);
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "lookaside.fbsbx.com" ||
      url.hostname.endsWith(".fbcdn.net") ||
      url.hostname === "graph.facebook.com"
    )
  )
    throw new Error("Origen de adjunto no permitido.");
  if (
    data.file_size > 10 * 1024 * 1024 ||
    (!/^(audio|image)\//.test(data.mime_type || '') && !['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(data.mime_type))
  )
    throw new AIError('MEDIA_FORMAT', 'Envía JPG, PNG, WebP, PDF, Word o Excel de hasta 10 MB. También se admiten notas de voz.', 422);
  const res = await serverFetch(url, { headers });
  if (!res.ok) throw new Error("No se pudo descargar el adjunto.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!res.body) throw new Error("Adjunto vacío.");
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 10 * 1024 * 1024) {
      await reader.cancel();
      throw new AIError('MEDIA_SIZE', 'El archivo debe ocupar hasta 10 MB.', 422);
    }
    chunks.push(value);
  }
  return {
    mimeType: data.mime_type.split(";")[0].trim(),
    data: Buffer.concat(chunks).toString("base64"),
  };
}
