import { NextRequest, NextResponse } from 'next/server';
import { procesarEventoWhatsAppUnificado } from '@/lib/whatsapp-engine';

/**
 * POST /api/webhook/whatsapp/simulador
 * Conecta el Simulador Dual Web (Modo Obrero con Fotos + Modo Cliente)
 * directamente al mismo motor de IA Gemini y base de datos real en Supabase.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let modoForzado: 'obrero' | 'cliente' = 'obrero';
    let texto = '';
    let telefono = '+56911112222';
    let proyectoForzadoId: string | undefined;
    let clienteForzadoId: string | undefined;
    let obreroForzadoNombre: string | undefined;
    let empresaId: string | undefined;
    let historialPrevio: { rol: 'user' | 'model'; texto: string }[] = [];
    let imagenBuffer: Buffer | undefined;
    let imagenMimeType: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      modoForzado = (formData.get('modo') as string) === 'cliente' ? 'cliente' : 'obrero';
      texto = (formData.get('texto') as string) || '';
      telefono = (formData.get('telefono') as string) || '+56911112222';
      proyectoForzadoId = (formData.get('proyectoId') as string) || undefined;
      clienteForzadoId = (formData.get('clienteId') as string) || undefined;
      obreroForzadoNombre = (formData.get('obreroNombre') as string) || undefined;
      empresaId = (formData.get('empresaId') as string) || undefined;

      const histStr = formData.get('historial') as string | null;
      if (histStr) {
        try {
          historialPrevio = JSON.parse(histStr);
        } catch {
          historialPrevio = [];
        }
      }

      const file = formData.get('foto') as File | null;
      if (file && file.size > 0) {
        const ab = await file.arrayBuffer();
        imagenBuffer = Buffer.from(ab);
        imagenMimeType = file.type || 'image/jpeg';
      }
    } else {
      const body = await request.json();
      modoForzado = body.modo === 'cliente' ? 'cliente' : 'obrero';
      texto = body.texto || '';
      telefono = body.telefono || '+56911112222';
      proyectoForzadoId = body.proyectoId || undefined;
      clienteForzadoId = body.clienteId || undefined;
      obreroForzadoNombre = body.obreroNombre || undefined;
      empresaId = body.empresaId || undefined;
      historialPrevio = Array.isArray(body.historial) ? body.historial : [];
    }

    const resultado = await procesarEventoWhatsAppUnificado({
      telefonoRemitente: telefono,
      texto,
      modoForzado,
      proyectoForzadoId,
      clienteForzadoId,
      obreroForzadoNombre,
      empresaId,
      imagenBuffer,
      imagenMimeType,
      historialPrevio,
    });

    return NextResponse.json({
      success: true,
      ...resultado,
    });
  } catch (err: any) {
    console.error('Error en /api/webhook/whatsapp/simulador:', err);
    return NextResponse.json(
      { error: err.message || 'Error procesando mensaje de WhatsApp.' },
      { status: 500 }
    );
  }
}
