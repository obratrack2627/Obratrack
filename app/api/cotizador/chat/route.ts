import { NextRequest, NextResponse } from 'next/server';
import { chatAsesorObrasGemini } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mensaje, historial = [], contexto_cotizacion } = body;

    if (!mensaje || typeof mensaje !== 'string') {
      return NextResponse.json(
        { error: 'Debe ingresar una pregunta o mensaje.' },
        { status: 400 }
      );
    }

    const formattedHistory = (historial || []).map((h: any) => ({
      rol: h.remitente === 'usuario' ? ('user' as const) : ('model' as const),
      texto: h.texto,
    }));

    let contextualPrompt = mensaje;
    if (contexto_cotizacion) {
      contextualPrompt = `[Contexto de Obra actual: ${contexto_cotizacion.titulo_proyecto} en ${
        contexto_cotizacion.comuna_region || 'Chile'
      }, Total Neto: $${contexto_cotizacion.estructura_financiera?.precio_sugerido_neto?.toLocaleString(
        'es-CL'
      )} CLP]\n\nPregunta: ${mensaje}`;
    }

    const { respuesta, sugerencias } = await chatAsesorObrasGemini(
      formattedHistory,
      contextualPrompt
    );

    return NextResponse.json({
      respuesta,
      sugerencias: sugerencias || [
        '¿Dónde comprar materiales más baratos en Chile?',
        '¿Cuánto cobrar por mano de obra?',
        '¿Cómo estructurar el pago en 40/30/20/10?',
      ],
    });
  } catch (error: any) {
    console.error('Error en /api/cotizador/chat:', error);
    return NextResponse.json(
      { error: error?.message || 'Error en el asistente' },
      { status: 500 }
    );
  }
}
