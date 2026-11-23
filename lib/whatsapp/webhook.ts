import { notifyReview } from './conversation-progress';
import { obrabotWhatsAppFile } from '@/lib/obrabot/whatsapp';
import {deliverReplyOnce} from './reply-delivery';
import {splitWhatsAppMessage} from './format';
import { isAIConfigured } from '@/lib/ai/provider';
import { aiErrorResponse } from "@/lib/ai/errors";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverFetch } from "@/lib/server-fetch";
import { processPersonalMessage } from "@/lib/whatsapp/assistant";
import { DEFAULT_WHATSAPP_BURST, type WhatsAppBurstConfig } from "@/lib/whatsapp/burst";
import { sendMetaText, sendMetaInteractive, sendMetaDocument, validMetaSignature } from "@/lib/whatsapp/meta";
import { buildWhatsAppInteractivePayload } from "./interactive";
import { dailyCloseDocument } from './daily-close-document';
import { quotePdfDocument } from './quote-document';
import { receiveDeliveryStatus } from "./outbox";

export function whatsappConfigured() {
  return Boolean(
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
      process.env.WHATSAPP_APP_SECRET &&
      process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN &&
      process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      isAIConfigured(),
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
  deps: {
    process: typeof processPersonalMessage;
    send: typeof sendMetaText;
    sendInteractive?: typeof sendMetaInteractive;
    sendDocument?: typeof sendMetaDocument;
    client: () => any;
    burst?: WhatsAppBurstConfig;
  } = {
    process: processPersonalMessage,
    send: sendMetaText,
    sendInteractive: sendMetaInteractive,
    sendDocument: sendMetaDocument,
    burst: DEFAULT_WHATSAPP_BURST,
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
    let stage = "initialize";
    let messageId: string | undefined;
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
          for (const status of value.statuses || []) {
            stage = "delivery_status";
            await receiveDeliveryStatus(sb, status);
          }
          for (const message of value.messages || []) {
            messageId = message.id;
            console.info('whatsapp_message_received', { messageId, type: message.type });
            if (Date.now() > deadline)
              throw new Error("El lote continuará en el siguiente intento.");
            stage = "process";
            const processOptions =
              deps.burst || deps.process === processPersonalMessage
                ? { burst: deps.burst ?? DEFAULT_WHATSAPP_BURST }
                : undefined;
            const result = processOptions
              ? await deps.process(sb, message, processOptions as any)
              : await deps.process(sb, message);
            if ('ignorado' in result && result.ignorado) continue;
            if (result.acciones?.silencio_humano) continue;
            if (!result.sent_at) {
              notifyReview(sb, result);
              let deliveryComplete=true;
              const sendOnce=async(part:string,send:()=>Promise<unknown>)=>{
                try{const accepted=await deliverReplyOnce(sb,result,message.id,part,send);if(!accepted)deliveryComplete=false;}
                catch(error){deliveryComplete=false;throw error;}
              };
              stage = "send";
              const interactive =
                deps.sendInteractive && !result.acciones?.pausa_humana
                  ? (('interactive' in result && result.interactive) || buildWhatsAppInteractivePayload(result))
                  : null;
              if (interactive && result.respuesta.length <= 1024) {
                await sendOnce('text:0', () => deps.sendInteractive!(message.from, interactive, result.respuesta));
              } else {
                for (const [index, part] of splitWhatsAppMessage(result.respuesta).entries())
                  await sendOnce(`text:${index}`, () => deps.send(message.from, part));
                if (interactive) {
                  await sendOnce('interactive:0', () => deps.sendInteractive!(message.from, interactive));
                }
              }
              if (deps.sendDocument) {
                if (result.acciones?.archivo_cotizacion) {
                  stage = 'obrabot_quote_file';
                  const file = await obrabotWhatsAppFile(sb, result, message.from);
                  if (file) await sendOnce(`obrabot_quote:${file.mime}`, () => deps.sendDocument!(message.from, file.bytes, file.filename, file.caption, file.mime));
                }
                stage = 'daily_close_pdf';
                try {
                  const document = await dailyCloseDocument(sb, result, message.from);
                  if (document) await sendOnce(stage,()=>deps.sendDocument!(message.from,document.bytes,document.filename,document.caption));
                } catch (docError) {
                  console.error("whatsapp_document_send_failure", {
                    stage,
                    code: aiErrorResponse(docError).code,
                  });
                  await sendOnce('daily_close_notice',()=>deps.send(message.from,'El cierre quedó guardado en ObraTrack, pero no pude enviar el PDF aquí. Descárgalo desde Documentos.')).catch(()=>{});
                }
                stage = 'quote_pdf';
                try {
                  const document = await quotePdfDocument(sb, result, message.from);
                  if (document) await sendOnce(stage,()=>deps.sendDocument!(message.from,document.bytes,document.filename,document.caption));
                } catch (docError) {
                  console.error("whatsapp_document_send_failure", {
                    stage,
                    code: aiErrorResponse(docError).code,
                  });
                  const notice = result.acciones?.presupuesto_pdf_id
                    ? 'No pude adjuntar el PDF aquí. Puedes volver a pedirme la cotización en PDF o descargarla en ObraTrack → Presupuestos.'
                    : 'La cotización quedó aprobada en ObraTrack, pero no pude enviar el PDF aquí. Descárgalo desde ObraTrack → Presupuestos.';
                  await sendOnce('quote_notice', () => deps.send(message.from, notice)).catch(() => {});
                }
              }
              if (result.persistido && deliveryComplete) {
                stage = "confirm_delivery";
                const { error } = await sb
                  .from("whatsapp_mensajes")
                  .update({ sent_at: new Date().toISOString() })
                  .eq("message_id", message.id);
                if (error) {
                  console.error("whatsapp_confirm_delivery_failure", {
                    messageId: message.id,
                  });
                }
              }
            }
          }
        }
      return NextResponse.json({ received: true });
    } catch (error) {
      const { code } = aiErrorResponse(error);
      console.error("whatsapp_failure", { stage, code, messageId });
      // Meta reintentará; los mensajes guardados no vuelven a ejecutar pagos u otras acciones.
      return NextResponse.json(
        {
          error: "No se pudo completar el mensaje. Se reintentará.",
          code,
          stage,
        },
        { status: 503 },
      );
    }
  };
}
