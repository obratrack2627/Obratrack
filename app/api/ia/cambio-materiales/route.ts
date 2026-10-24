import { NextRequest, NextResponse } from 'next/server';
import { sugerirMaterialesCambioGemini } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { titulo, descripcion, nombreObra } = body;

    if (!titulo && !descripcion) {
      return NextResponse.json(
        { error: 'Debes indicar el título o descripción de la nueva necesidad.' },
        { status: 400 }
      );
    }

    const resultado = await sugerirMaterialesCambioGemini({
      titulo: titulo || 'Solicitud adicional',
      descripcion: descripcion || titulo,
      nombreObra,
    });

    return NextResponse.json({
      success: true,
      ...resultado,
    });
  } catch (err: any) {
    console.error('Error en /api/ia/cambio-materiales:', err);
    return NextResponse.json(
      { error: err.message || 'Error calculando materiales con IA.' },
      { status: 500 }
    );
  }
}
