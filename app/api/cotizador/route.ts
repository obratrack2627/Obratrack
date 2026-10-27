import { NextRequest, NextResponse } from 'next/server';
import { generarCotizacionGemini } from '@/lib/gemini';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/provider';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    await authorizeAI(request);
    let body: any;
    try {
      body = await request.json();
    } catch {
      throw new AIError('INVALID_REQUEST', 'Solicitud no válida.', 400);
    }
    if (typeof body?.descripcion !== 'string' || !body.descripcion.trim())
      throw new AIError(
        'INVALID_REQUEST',
        'Describe el trabajo que quieres cotizar.',
        400,
      );
    const m2 = Number(body.metros_cuadrados ?? 20),
      margen = Number(body.margen_utilidad ?? 30);
    if (
      !Number.isFinite(m2) ||
      m2 <= 0 ||
      !Number.isFinite(margen) ||
      margen < 0 ||
      margen > 200
    )
      throw new AIError(
        'INVALID_REQUEST',
        'Revisa la superficie y el margen de utilidad.',
        400,
      );
    const cotizacion = await generarCotizacionGemini({
      descripcion: body.descripcion.slice(0, 6000),
      tipo_obra: String(body.tipo_obra || 'General').slice(0, 100),
      metros_cuadrados: m2,
      comuna_region: String(body.comuna_region || 'Chile').slice(0, 100),
      margen_utilidad: margen,
      nivel_calidad: String(body.nivel_calidad || 'estandar').slice(0, 50),
    });
    return NextResponse.json({
      success: true,
      source: 'google_gemini_ai',
      cotizacion,
    });
  } catch (error) {
    return errorJSON(error);
  }
}
