import { NextRequest, NextResponse } from 'next/server';
import { chatAgenteProyectoGemini } from '@/lib/gemini';
import { supabaseService } from '@/lib/supabase/supabase-service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Validar token/cookie de autenticación
    const authToken = request.cookies.get('obratrack_auth_token')?.value;
    if (!authToken || authToken.trim().length < 8 || !/^[a-zA-Z0-9_\-\.]+$/.test(authToken.trim())) {
      return NextResponse.json(
        { error: 'No autorizado. Se requiere iniciar sesión con una cuenta válida.' },
        { status: 401 }
      );
    }

    const projectId = params.id;
    if (!projectId || typeof projectId !== 'string' || !/^[a-zA-Z0-9_\-]+$/.test(projectId)) {
      return NextResponse.json(
        { error: 'ID de proyecto inválido.' },
        { status: 400 }
      );
    }

    // Prevención de IDOR / BOLA: Validar pertenencia del proyecto al tenant del usuario
    const usuario = await supabaseService.getUsuarioById(authToken.trim());
    if (!usuario) {
      return NextResponse.json(
        { error: 'Sesión no válida o usuario no encontrado.' },
        { status: 401 }
      );
    }

    const proyectoDb = await supabaseService.getProyectoById(projectId);
    if (proyectoDb && proyectoDb.empresa_id && usuario.empresa_id && proyectoDb.empresa_id !== usuario.empresa_id && !usuario.is_dev) {
      return NextResponse.json(
        { error: 'Acceso denegado. No tienes autorización para consultar los datos de esta obra.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { mensaje, historial = [], contexto_proyecto } = body;

    if (!mensaje || typeof mensaje !== 'string' || mensaje.trim().length === 0) {
      return NextResponse.json(
        { error: 'Debe ingresar un mensaje válido.' },
        { status: 400 }
      );
    }

    if (!contexto_proyecto || typeof contexto_proyecto !== 'object') {
      return NextResponse.json(
        { error: 'Falta el contexto del proyecto.' },
        { status: 400 }
      );
    }

    const cleanMensaje = mensaje.trim().slice(0, 1500);

    const formattedHistory = (Array.isArray(historial) ? historial : []).slice(-10).map((h: any) => ({
      rol: h.remitente === 'usuario' ? ('user' as const) : ('model' as const),
      texto: typeof h.texto === 'string' ? h.texto.slice(0, 1500) : '',
    }));

    const resultado = await chatAgenteProyectoGemini({
      historial: formattedHistory,
      mensajeUsuario: cleanMensaje,
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
