import { NextRequest, NextResponse } from 'next/server';
import { chatAsesorObrasGemini } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Validar token/cookie de autenticación
    const authToken = request.cookies.get('obratrack_auth_token')?.value;
    if (!authToken || authToken.trim().length < 8 || !/^[a-zA-Z0-9_\-\.]+$/.test(authToken.trim())) {
      return NextResponse.json(
        { error: 'No autorizado. Se requiere iniciar sesión para usar el asistente.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { mensaje, historial = [], contexto_cotizacion, contexto_db } = body;

    if (!mensaje || typeof mensaje !== 'string' || mensaje.trim().length === 0) {
      return NextResponse.json(
        { error: 'Debe ingresar una pregunta o mensaje válido.' },
        { status: 400 }
      );
    }

    const cleanMensaje = mensaje.trim().slice(0, 1500);

    const formattedHistory = (Array.isArray(historial) ? historial : []).slice(-10).map((h: any) => ({
      rol: h.remitente === 'usuario' ? ('user' as const) : ('model' as const),
      texto: typeof h.texto === 'string' ? h.texto.slice(0, 1500) : '',
    }));

    let contextualPrompt = cleanMensaje;
    if (contexto_cotizacion && typeof contexto_cotizacion === 'object') {
      const titulo = typeof contexto_cotizacion.titulo_proyecto === 'string'
        ? contexto_cotizacion.titulo_proyecto.slice(0, 100)
        : 'Proyecto';
      const comuna = typeof contexto_cotizacion.comuna_region === 'string'
        ? contexto_cotizacion.comuna_region.slice(0, 50)
        : 'Chile';
      const monto = Number(contexto_cotizacion.estructura_financiera?.precio_sugerido_neto || 0);

      contextualPrompt = `[Contexto de Obra actual: ${titulo} en ${comuna}, Total Neto: $${monto.toLocaleString('es-CL')} CLP]\n\nPregunta: ${cleanMensaje}`;
    }

    const { respuesta, accion, sugerencias } = await chatAsesorObrasGemini(
      formattedHistory,
      contextualPrompt,
      contexto_db
    );

    return NextResponse.json({
      respuesta,
      accion: accion || null,
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
