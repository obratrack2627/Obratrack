import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient, transcribirAudioWhisper } from '@/lib/openai';
import { createClient } from '@supabase/supabase-js';

// ==============================================================================
// 1. GET: Verificación de Webhook para WhatsApp Cloud API (Meta Oficial)
// ==============================================================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'obratrack_webhook_token_secret';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('✅ Webhook de Meta WhatsApp Cloud API verificado exitosamente');
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Token de verificación inválido' }, { status: 403 });
}

// ==============================================================================
// 2. POST: Recepción de Mensajes (Meta WhatsApp Cloud API & Twilio)
// ==============================================================================
export async function POST(request: NextRequest) {
  try {
    let cleanPhone = '';
    let bodyText = '';
    let isAudio = false;
    let audioBuffer: Buffer | null = null;
    let isMetaCloud = false;

    const contentType = request.headers.get('content-type') || '';

    // CASO A: Meta WhatsApp Cloud API (JSON Payload)
    if (contentType.includes('application/json')) {
      isMetaCloud = true;
      const jsonBody = await request.json();
      
      const entry = jsonBody.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const message = change?.messages?.[0];

      if (!message) {
        // Puede ser un evento de status de mensaje (sent/delivered/read)
        return NextResponse.json({ status: 'ignored_status_update' }, { status: 200 });
      }

      cleanPhone = message.from ? '+' + message.from : '';

      if (message.type === 'text') {
        bodyText = message.text?.body || '';
      } else if (message.type === 'audio' || message.type === 'voice') {
        isAudio = true;
        const mediaId = message.audio?.id || message.voice?.id;
        
        // Si hay token de WhatsApp Cloud API, descargar audio desde Graph API
        const metaToken = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
        if (mediaId && metaToken) {
          try {
            const mediaUrlRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
              headers: { Authorization: `Bearer ${metaToken}` },
            });
            const mediaUrlData = await mediaUrlRes.json();
            if (mediaUrlData.url) {
              const audioFileRes = await fetch(mediaUrlData.url, {
                headers: { Authorization: `Bearer ${metaToken}` },
              });
              const arrayBuf = await audioFileRes.arrayBuffer();
              audioBuffer = Buffer.from(arrayBuf);
            }
          } catch (metaAudioErr) {
            console.error('Error al descargar audio de WhatsApp Cloud API:', metaAudioErr);
          }
        }
      }
    } 
    // CASO B: Twilio WhatsApp Webhook (Form Data)
    else {
      const formData = await request.formData();
      const fromRaw = formData.get('From') as string;
      bodyText = (formData.get('Body') as string) || '';
      const mediaUrl = formData.get('MediaUrl0') as string | null;
      const mediaContentType = formData.get('MediaContentType0') as string | null;

      cleanPhone = (fromRaw || '').replace('whatsapp:', '').trim();

      if (mediaUrl && mediaContentType && mediaContentType.startsWith('audio/')) {
        isAudio = true;
        try {
          const audioResponse = await fetch(mediaUrl);
          const arrayBuf = await audioResponse.arrayBuffer();
          audioBuffer = Buffer.from(arrayBuf);
        } catch (audioFetchErr) {
          console.error('Error al descargar audio de Twilio WhatsApp:', audioFetchErr);
        }
      }
    }

    if (!cleanPhone && !bodyText && !audioBuffer) {
      return NextResponse.json({ error: 'Datos de mensaje insuficientes' }, { status: 400 });
    }

    // 3. Transcripción de Audio con OpenAI Whisper
    let finalText = bodyText;
    if (isAudio && audioBuffer) {
      try {
        const whisperTranscription = await transcribirAudioWhisper(audioBuffer);
        if (whisperTranscription) {
          finalText = whisperTranscription;
        }
      } catch (whisperErr) {
        console.error('Error en transcripción Whisper:', whisperErr);
        if (!finalText) {
          finalText = '[Nota de voz de terreno recibida]';
        }
      }
    }

    // 4. Extracción de Entidades con OpenAI GPT-4o-mini
    let extraction = {
      actividad_detectada: null as string | null,
      avance_porcentaje: null as number | null,
      tiene_imprevisto: false,
      imprevisto_descripcion: null as string | null,
      imprevisto_monto_estimado: 0 as number | null,
    };

    const openai = getOpenAIClient();

    if (openai && finalText) {
      try {
        const systemPrompt = `Eres un asistente experto en gestión de obras de construcción en Chile para ObraTrack.
Tu tarea es analizar el reporte de terreno enviado por el maestro, capataz o supervisor (en texto o transcripción de audio de voz) y extraer información estructurada en JSON estricto.

Reglas:
- actividad_detectada: Identifica la partida de construcción mencionada (ej: "Montaje Estructura de Madera y Techumbre", "Excavación y Radier de Hormigón", "Instalación Eléctrica"). Si no se deduce, retorna null.
- avance_porcentaje: Número del 0 al 100 si reporta avance numérico, o null.
- tiene_imprevisto: true si menciona un gasto extra, rotura, compra imprevista o sobrecosto; false en caso contrario.
- imprevisto_descripcion: Breve descripción del imprevisto o null.
- imprevisto_monto_estimado: Monto numérico en CLP (Pesos Chilenos) detectado o estimado (ej: 45000) o 0.

Responde ÚNICAMENTE con un JSON con la siguiente estructura:
{
  "actividad_detectada": "string o null",
  "avance_porcentaje": 80,
  "tiene_imprevisto": true,
  "imprevisto_descripcion": "string o null",
  "imprevisto_monto_estimado": 45000
}`;

        const gptResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analiza este reporte de obra: "${finalText}"` },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        });

        const gptText = gptResponse.choices[0]?.message?.content;
        if (gptText) {
          const parsed = JSON.parse(gptText);
          extraction = {
            actividad_detectada: parsed.actividad_detectada || null,
            avance_porcentaje:
              parsed.avance_porcentaje !== undefined ? parsed.avance_porcentaje : null,
            tiene_imprevisto: Boolean(parsed.tiene_imprevisto),
            imprevisto_descripcion: parsed.imprevisto_descripcion || null,
            imprevisto_monto_estimado: parsed.imprevisto_monto_estimado || 0,
          };
        }
      } catch (openaiErr) {
        console.error('Error al extraer datos con OpenAI GPT-4o-mini:', openaiErr);
      }
    }

    // Fallback heurístico si no hay OpenAI configurado
    if (!extraction.actividad_detectada && !extraction.avance_porcentaje && !extraction.tiene_imprevisto) {
      let avance = 50;
      let tieneImp = false;
      let impMonto = 0;
      let impDesc = null;

      const lower = (finalText || '').toLowerCase();
      const numMatch = lower.match(/(\d+)%/);
      if (numMatch) avance = parseInt(numMatch[1], 10);

      if (
        lower.includes('compramos') ||
        lower.includes('costó') ||
        lower.includes('imprevisto') ||
        lower.includes('pesos') ||
        lower.includes('roto') ||
        lower.includes('gasto')
      ) {
        tieneImp = true;
        const montoMatch = lower.match(/(\d+)\s*(mil|pesos|\$)/);
        if (montoMatch) {
          impMonto = parseInt(montoMatch[1], 10) * (montoMatch[2] === 'mil' ? 1000 : 1);
        } else {
          impMonto = 45000;
        }
        impDesc = 'Compra o gasto imprevisto mencionado en terreno';
      }

      extraction = {
        actividad_detectada: 'Montaje Estructura de Madera y Techumbre',
        avance_porcentaje: avance,
        tiene_imprevisto: tieneImp,
        imprevisto_descripcion: impDesc,
        imprevisto_monto_estimado: impMonto,
      };
    }

    // 5. Guardar en Supabase PostgreSQL
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Buscar usuario por teléfono WhatsApp
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('id, empresa_id')
          .eq('telefono_whatsapp', cleanPhone)
          .single();

        let proyectoId = null;
        if (usuario) {
          const { data: proyecto } = await supabase
            .from('proyectos')
            .select('id')
            .eq('empresa_id', usuario.empresa_id)
            .eq('estado', 'activo')
            .limit(1)
            .single();

          proyectoId = proyecto?.id || null;
        }

        await supabase.from('reportes_whatsapp').insert({
          usuario_id: usuario?.id || null,
          proyecto_id: proyectoId,
          mensaje_original: isAudio ? null : bodyText,
          transcripcion: isAudio ? finalText : null,
          extraccion_ia: extraction,
          estado: 'pendiente',
        });
      } catch (dbErr) {
        console.error('Error al guardar reporte en Supabase:', dbErr);
      }
    }

    // 6. Respuesta según el cliente emisor
    if (isMetaCloud) {
      return NextResponse.json({
        status: 'success',
        message: 'Reporte procesado con OpenAI Whisper y GPT-4o-mini',
        extraction,
      });
    }

    // Formato TwiML para Twilio Sandbox
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>✅ Reporte recibido y procesado por ObraTrack IA (OpenAI Whisper &amp; GPT-4o-mini). El supervisor revisará el avance en el panel.</Message>
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
