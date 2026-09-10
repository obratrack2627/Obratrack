import { NextRequest, NextResponse } from 'next/server';
import { chatAgenteProyectoGemini } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body = await request.json();
    const { mensaje, historial = [], contexto_proyecto } = body;

    if (!mensaje || typeof mensaje !== 'string') {
      return NextResponse.json(
        { error: 'Debe ingresar un mensaje.' },
        { status: 400 }
      );
    }

    if (!contexto_proyecto) {
      return NextResponse.json(
        { error: 'Falta el contexto del proyecto.' },
        { status: 400 }
      );
    }

    const formattedHistory = (historial || []).map((h: any) => ({
      rol: h.remitente === 'usuario' ? ('user' as const) : ('model' as const),
      texto: h.texto,
    }));

    const resultado = await chatAgenteProyectoGemini({
      historial: formattedHistory,
      mensajeUsuario: mensaje,
      contextoProyecto: {
        ...contexto_proyecto,
        id: projectId,
      },
    });

    return NextResponse.json({
      respuesta: resultado.respuesta,
      accion: resultado.accion || null,
      sugerencias: resultado.sugerencias || [
        '¿Cuánto saldo nos queda por cobrar?',
        '¿Cómo vamos con la Carta Gantt?',
        'Redactar informe para el mandante',
      ],
    });
  } catch (error: any) {
    console.error('Error en /api/proyectos/[id]/chat:', error);
    return NextResponse.json(
      { error: error?.message || 'Error en el asistente del proyecto' },
      { status: 500 }
    );
  }
}
