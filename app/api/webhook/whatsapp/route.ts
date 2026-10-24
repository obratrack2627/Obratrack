import { NextRequest, NextResponse } from 'next/server';
import { procesarEventoWhatsAppUnificado } from '@/lib/whatsapp-engine';

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'obratrack_verify_2026';

/**
 * Descarga un archivo multimedia (foto/imagen) desde Meta WhatsApp Cloud API (nivel gratuito Sandbox)
 */
async function descargarMediaMetaWhatsApp(
  mediaId: string,
  accessToken: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    // Paso 1: Obtener URL temporal del media desde Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      console.error('Error consultando metadata media Meta:', await metaRes.text());
      return null;
    }
    const metaJson = await metaRes.json();
    const downloadUrl = metaJson.url;
    const mimeType = metaJson.mime_type || 'image/jpeg';
    if (!downloadUrl) return null;

    // Paso 2: Descargar el binario con el mismo Bearer token
    const binRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!binRes.ok) return null;

    const arrBuf = await binRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrBuf),
      mimeType,
    };
  } catch (err) {
    console.error('Error descargando imagen de Meta WhatsApp:', err);
    return null;
  }
}

/**
 * Envía mensaje de texto (y opcionalmente fotos de avance) de vuelta por Meta WhatsApp Cloud API
 */
async function enviarRespuestaMetaWhatsApp(params: {
  to: string;
  texto: string;
  fotosUrls?: string[];
  accessToken: string;
  phoneNumberId: string;
}) {
  const endpoint = `https://graph.facebook.com/v20.0/${params.phoneNumberId}/messages`;

  // 1. Enviar mensaje principal de texto
  const resTexto = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'text',
      text: { body: params.texto },
    }),
  });

  if (!resTexto.ok) {
    console.error('Error enviando texto Meta Cloud API:', await resTexto.text());
  }

  // 2. Si el cliente solicitó avance y existen fotos públicas en Supabase Storage, adjuntarlas
  if (params.fotosUrls && params.fotosUrls.length > 0) {
    for (const url of params.fotosUrls.slice(0, 2)) {
      if (!url.startsWith('http')) continue;
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: params.to,
          type: 'image',
          image: {
            link: url,
            caption: '📸 Registro fotográfico actualizado en ObraTrack',
          },
        }),
      }).catch((e) => console.warn('Aviso envío imagen WA:', e));
    }
  }
}

/**
 * GET /api/webhook/whatsapp
 * Verificación oficial del Webhook exigida por Meta for Developers (WhatsApp Cloud API Gratis)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  // Si alguien abre la URL en el navegador, mostrar estado operativo amigable
  if (!mode) {
    return NextResponse.json({
      ok: true,
      servicio: 'ObraTrack WhatsApp Cloud API Webhook (Obrero & Cliente + Gemini + Supabase)',
      verify_token_configurado: Boolean(VERIFY_TOKEN),
      cloud_api_configurada: Boolean(
        process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN &&
          process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID
      ),
    });
  }

  return NextResponse.json({ error: 'Token de verificación inválido' }, { status: 403 });
}

/**
 * POST /api/webhook/whatsapp
 * Recibe mensajes reales desde Meta WhatsApp Cloud API (Números de prueba gratuitos / Producción)
 * Enruta inteligentemente entre:
 *  - OBRERO (sube fotos, notas, avisos, accidentes, avances, asistencia -> guarda en Supabase y Web)
 *  - CLIENTE (consulta cómo va su obra -> Gemini consulta Supabase en vivo y responde por WhatsApp)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const value = body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) {
      // Confirmaciones de lectura/entrega de Meta (statuses)
      return NextResponse.json({ status: 'ack_status' }, { status: 200 });
    }

    const senderPhone: string = message.from || '';
    const senderProfileName: string = value?.contacts?.[0]?.profile?.name || '';
    const accessToken = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN || '';
    const phoneNumberId =
      process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID || value?.metadata?.phone_number_id || '';

    let textoMensaje = '';
    let imagenBuffer: Buffer | undefined;
    let imagenMimeType: string | undefined;

    if (message.type === 'text') {
      textoMensaje = message.text?.body || '';
    } else if (message.type === 'image') {
      textoMensaje = message.image?.caption || '';
      const mediaId = message.image?.id;
      if (mediaId && accessToken) {
        const downloaded = await descargarMediaMetaWhatsApp(mediaId, accessToken);
        if (downloaded) {
          imagenBuffer = downloaded.buffer;
          imagenMimeType = downloaded.mimeType;
        }
      }
    } else if (message.type === 'button' || message.type === 'interactive') {
      textoMensaje =
        message.button?.text ||
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        '';
    } else {
      textoMensaje = `[Mensaje ${message.type} recibido por WhatsApp]`;
    }

    const resultado = await procesarEventoWhatsAppUnificado({
      telefonoRemitente: senderPhone,
      nombrePerfilWhatsApp: senderProfileName,
      texto: textoMensaje,
      imagenBuffer,
      imagenMimeType,
    });

    if (accessToken && phoneNumberId && senderPhone) {
      await enviarRespuestaMetaWhatsApp({
        to: senderPhone,
        texto: resultado.respuestaTexto,
        fotosUrls: resultado.fotosRespuesta,
        accessToken,
        phoneNumberId,
      });
    }

    return NextResponse.json(
      {
        status: 'processed',
        rol: resultado.rolDetectado,
        obra: resultado.proyectoAfectado?.nombre || null,
        modulo: resultado.moduloAfectado || null,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error en Webhook Meta WhatsApp:', error);
    return NextResponse.json({ status: 'error', detail: error.message }, { status: 200 });
  }
}
