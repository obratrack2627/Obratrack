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
    if (!res.ok)
      throw new Error("No se pudo enviar la respuesta por WhatsApp.");
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
