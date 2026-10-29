import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverFetch } from "@/lib/server-fetch";
import { processPersonalMessage } from "@/lib/whatsapp/assistant";
import { sendMetaText, validMetaSignature } from "@/lib/whatsapp/meta";

export function whatsappConfigured() {
  return Boolean(
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
      process.env.WHATSAPP_APP_SECRET &&
      process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN &&
      process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.GEMINI_API_KEY,
  );
}
export async function getWhatsAppStatus(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (!params.has("hub.mode"))
    return NextResponse.json({
      ok: true,
      cloud_api_configurada: whatsappConfigured(),
      verify_token_configurado: Boolean(
        process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      ),
      numero: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || null,
    });
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (
    token &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === token &&
    params.get("hub.challenge")
  )
    return new NextResponse(params.get("hub.challenge"), { status: 200 });
  return NextResponse.json(
    { error: "Verificación inválida." },
    { status: 403 },
  );
}
export function createWhatsAppWebhook(
  deps = {
    process: processPersonalMessage,
    send: sendMetaText,
    client: () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: serverFetch },
        },
      ),
  },
) {
  return async (request: NextRequest) => {
    if (!whatsappConfigured())
      return NextResponse.json(
        { error: "Canal de WhatsApp pendiente de configuración." },
        { status: 503 },
      );
    const raw = await request.text();
    if (raw.length > 1500000)
      return NextResponse.json(
        { error: "Solicitud demasiado grande." },
        { status: 413 },
      );
    if (
      !validMetaSignature(
        raw,
        request.headers.get("x-hub-signature-256"),
        process.env.WHATSAPP_APP_SECRET!,
      )
    )
      return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }
    if (body.object !== "whatsapp_business_account")
      return NextResponse.json({ received: true });
    try {
      const sb = deps.client();
      const deadline = Date.now() + 45000;
      for (const entry of body.entry || [])
        for (const change of entry.changes || []) {
          const value = change.value;
          if (
            value?.metadata?.phone_number_id !==
            process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID
          )
            continue;
          for (const message of value.messages || []) {
            if (Date.now() > deadline)
              throw new Error("El lote continuará en el siguiente intento.");
            const result = await deps.process(sb, message);
            if (!result.sent_at) {
              await deps.send(message.from, result.respuesta);
              if (result.persistido) {
                const { error } = await sb
                  .from("whatsapp_mensajes")
                  .update({ sent_at: new Date().toISOString() })
                  .eq("message_id", message.id);
                if (error) throw new Error("No se confirmó el envío.");
              }
            }
          }
        }
      return NextResponse.json({ received: true });
    } catch {
      // Meta reintentará; los mensajes guardados no vuelven a ejecutar pagos u otras acciones.
      return NextResponse.json(
        { error: "No se pudo completar el mensaje. Se reintentará." },
        { status: 503 },
      );
    }
  };
}
