import { NextRequest, NextResponse } from 'next/server';
import { chatAsistenteClienteWhatsAppGemini } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mensaje,
      historial = [],
      cliente_autenticado = null,
      clientes_disponibles = [],
    } = body;

    if (!mensaje || typeof mensaje !== 'string') {
      return NextResponse.json(
        { error: 'Debe proporcionar un mensaje del cliente.' },
        { status: 400 }
      );
    }

    const formattedHistory = (historial || []).map((h: any) => ({
      rol: h.remitente === 'cliente' || h.rol === 'user' ? ('user' as const) : ('model' as const),
      texto: h.texto,
    }));

    const result = await chatAsistenteClienteWhatsAppGemini({
      historial: formattedHistory,
      mensajeCliente: mensaje,
      clienteAutenticado: cliente_autenticado,
      clientesRegistrados: clientes_disponibles,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error en /api/webhook/whatsapp/cliente:', error);
    return NextResponse.json(
      {
        respuesta:
          'Hola, en este momento estamos procesando tu solicitud de seguimiento. Por favor reintenta en unos instantes.',
      },
      { status: 500 }
    );
  }
}
