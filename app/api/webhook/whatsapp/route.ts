import {
  getWhatsAppStatus,
  createWhatsAppWebhook,
} from "@/lib/whatsapp/webhook";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = getWhatsAppStatus;
export const POST = createWhatsAppWebhook();
