import { AIError } from "@/lib/ai/errors";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverFetch } from "@/lib/server-fetch";

export function canonicalPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 8) digits = `569${digits}`;
  else if (digits.length === 9 && digits.startsWith("9"))
    digits = `56${digits}`;
  return /^\d{10,15}$/.test(digits) ? digits : "";
}
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
export async function sendMetaText(to: string, text: string) {
  const token = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
  const phone = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
  // WhatsApp limita cada texto a 4096 caracteres. Conservar todo el detalle en varios mensajes.
  for (let offset = 0; offset < text.length; offset += 4000) {
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
          text: { body: text.slice(offset, offset + 4000) },
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
export async function downloadMetaMedia(id: string) {
  if (!/^[\d]+$/.test(id)) throw new Error("Adjunto no válido.");
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
    !/^(audio|image)\//.test(data.mime_type || "")
  )
    throw new Error("Adjunto demasiado grande o formato no admitido.");
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
      throw new Error("Adjunto demasiado grande.");
    }
    chunks.push(value);
  }
  return {
    mimeType: data.mime_type.split(";")[0].trim(),
    data: Buffer.concat(chunks).toString("base64"),
  };
}
