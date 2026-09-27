import { NextRequest, NextResponse } from 'next/server';
import { chatAsistenteClienteWhatsAppGemini } from '@/lib/gemini';
import { supabaseService } from '@/lib/supabase/supabase-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Validar token/cookie de autenticación
    const authToken = request.cookies.get('obratrack_auth_token')?.value;
    if (!authToken || authToken.trim().length < 8 || !/^[a-zA-Z0-9_\-\.]+$/.test(authToken.trim())) {
      return NextResponse.json(
        { error: 'No autorizado. Se requiere iniciar sesión con una cuenta válida.' },
        { status: 401 }
      );
    }

    const usuario = await supabaseService.getUsuarioById(authToken.trim());
    if (!usuario) {
      return NextResponse.json(
        { error: 'Sesión no válida o usuario no encontrado.' },
        { status: 401 }
      );
    }

    // Regla de Negocio: Obtener el plan real de la empresa desde la base de datos (PostgreSQL)
    let realPlanId = 'gratis';
    if (usuario.is_dev) {
      realPlanId = 'pro_ia';
    } else if (usuario.empresa_id) {
      const empresa = await supabaseService.getEmpresaById(usuario.empresa_id);
      realPlanId = empresa?.plan_id || 'gratis';
    }

    if (realPlanId === 'gratis') {
      return NextResponse.json({
        respuesta:
          '¡Hola! 👋 El servicio automatizado de atención y seguimiento de obras por WhatsApp con Inteligencia Artificial está disponible para constructoras a partir del *Plan Pro* de ObraTrack.\n\nPor favor contacta directamente a tu contratista o solicita que active el Plan Pro en la plataforma.',
      });
    }

    const body = await request.json();
    const {
      mensaje,
      historial = [],
      cliente_autenticado = null,
      clientes_disponibles = [],
    } = body;

    if (!mensaje || typeof mensaje !== 'string' || mensaje.trim().length === 0) {
      return NextResponse.json(
        { error: 'Debe proporcionar un mensaje del cliente válido.' },
        { status: 400 }
      );
    }

    const cleanMensaje = mensaje.trim().slice(0, 1500);

    const formattedHistory = (Array.isArray(historial) ? historial : []).slice(-10).map((h: any) => ({
      rol: h.remitente === 'cliente' || h.rol === 'user' ? ('user' as const) : ('model' as const),
      texto: typeof h.texto === 'string' ? h.texto.slice(0, 1500) : '',
    }));

    const result = await chatAsistenteClienteWhatsAppGemini({
      historial: formattedHistory,
      mensajeCliente: cleanMensaje,
      clienteAutenticado: cliente_autenticado,
      clientesRegistrados: Array.isArray(clientes_disponibles) ? clientes_disponibles.slice(0, 50) : [],
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
