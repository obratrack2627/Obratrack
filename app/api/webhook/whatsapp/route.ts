import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { chatAsistenteClienteWhatsAppGemini } from '@/lib/gemini';
import { dataService } from '@/lib/data-service';

export const dynamic = 'force-dynamic';

function escapeXml(unsafe: string) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Valida la firma criptográfica HMAC-SHA256 enviada por Meta en la cabecera X-Hub-Signature-256.
 */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // Si no está configurado el secreto en variables de entorno, emitir advertencia
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const signature = signatureHeader.slice(7);
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

// ==============================================================================
// 1. GET: Verificación de Webhook para WhatsApp Cloud API (Meta Oficial)
// ==============================================================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!expectedToken) {
    console.warn('WHATSAPP_WEBHOOK_VERIFY_TOKEN no está configurado en las variables de entorno.');
    return NextResponse.json(
      { error: 'Servicio de webhook no configurado' },
      { status: 500 }
    );
  }

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('✅ Webhook de Meta WhatsApp Cloud API verificado exitosamente');
    return new Response(challenge || '', { status: 200 });
  }

  return NextResponse.json({ error: 'Token de verificación inválido' }, { status: 403 });
}

// ==============================================================================
// 2. POST: Recepción y Respuesta en Vivo con Google Gemini (Meta & Twilio)
// ==============================================================================
export async function POST(request: NextRequest) {
  try {
    let cleanPhone = '';
    let bodyText = '';
    let isMetaCloud = false;

    const contentType = request.headers.get('content-type') || '';

    // CASO A: Meta WhatsApp Cloud API (JSON Payload)
    if (contentType.includes('application/json')) {
      isMetaCloud = true;
      const rawBody = await request.text();

      // Validación criptográfica de la firma de Meta
      const signature = request.headers.get('x-hub-signature-256');
      if (!verifyMetaSignature(rawBody, signature)) {
        console.warn('Firma X-Hub-Signature-256 no válida o ausente en petición a webhook.');
        return NextResponse.json({ error: 'Firma de webhook no válida' }, { status: 401 });
      }

      let jsonBody: any = {};
      try {
        jsonBody = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: 'JSON malformado' }, { status: 400 });
      }

      const entry = jsonBody.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const message = change?.messages?.[0];

      if (!message) {
        return NextResponse.json({ status: 'ignored_status_update' }, { status: 200 });
      }

      cleanPhone = message.from ? '+' + message.from : '';
      if (message.type === 'text') {
        bodyText = message.text?.body || '';
      }
    }
    // CASO B: Twilio WhatsApp Webhook (Form Data)
    else {
      const formData = await request.formData();
      const fromRaw = formData.get('From') as string;
      bodyText = (formData.get('Body') as string) || '';
      cleanPhone = (fromRaw || '').replace('whatsapp:', '').trim();
    }

    if (!cleanPhone && !bodyText) {
      return NextResponse.json({ error: 'Datos de mensaje insuficientes' }, { status: 400 });
    }

    // 1. Buscar si en el mensaje del cliente viene un RUT o Nombre explícito para autenticación estricta
    let clienteFicha = null;
    const matchRutONombre = dataService.buscarClientePorRutONombre(bodyText);

    if (matchRutONombre) {
      clienteFicha = dataService.obtenerFichaCompletaCliente(matchRutONombre.id);
    }

    const clientesDisponibles = dataService.getClientes().map((c) => ({
      id: c.id,
      nombre: c.nombre,
      rut: c.rut,
    }));

    // Generar respuesta conversacional con Google Gemini
    const aiResult = await chatAsistenteClienteWhatsAppGemini({
      historial: [],
      mensajeCliente: bodyText,
      clienteAutenticado: clienteFicha,
      clientesRegistrados: clientesDisponibles,
    });

    const respuestaTexto = aiResult.respuesta || '¡Hola! Recibimos tu mensaje en ObraTrack.';

    // Si es Meta Cloud API y tenemos token, responder enviando mensaje vía Graph API
    if (isMetaCloud) {
      const metaToken = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;

      if (metaToken && phoneNumberId && cleanPhone) {
        try {
          // 1. Enviar mensaje de texto con Gemini
          await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${metaToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: cleanPhone.replace('+', ''),
              type: 'text',
              text: { body: respuestaTexto },
            }),
          });

          // 2. Si Gemini incluyó fotos de la obra, enviarlas al WhatsApp del cliente
          if (aiResult.fotos && aiResult.fotos.length > 0) {
            for (const fotoUrl of aiResult.fotos.slice(0, 2)) {
              await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${metaToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: cleanPhone.replace('+', ''),
                  type: 'image',
                  image: { link: fotoUrl },
                }),
              });
            }
          }
        } catch (metaSendErr) {
          console.error('Error enviando mensaje por Meta Graph API:', metaSendErr);
        }
      }

      return NextResponse.json({
        status: 'success',
        respuesta: respuestaTexto,
        fotos: aiResult.fotos || [],
      });
    }

    // Si es Twilio: responder inmediatamente con TwiML XML
    const fotoTag =
      aiResult.fotos && aiResult.fotos.length > 0
        ? `<Media>${aiResult.fotos[0]}</Media>`
        : '';

    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>
        <Body>${escapeXml(respuestaTexto)}</Body>
        ${fotoTag}
    </Message>
</Response>`;

    return new Response(twimlResponse, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error: any) {
    console.error('Error en webhook de WhatsApp:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
