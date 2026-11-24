import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { generateAI } from '@/lib/ai/provider';
import { withAIRequest } from '@/lib/ai/usage';

export const dynamic = 'force-dynamic';

async function transcribeHandler(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const plan = await client.from('empresas').select('plan_id').eq('id', user.empresa_id).maybeSingle();
    if (plan.error) throw new AIError('TENANT_REQUIRED', 'No se pudo verificar el plan de tu empresa.', 503);
    if (!['pro', 'pro_ia'].includes(plan.data?.plan_id)) {
      throw new AIError('PLAN_REQUIRED', 'El dictado por voz requiere el Plan Pro o Pro IA.', 403);
    }
    if (Number(request.headers.get('content-length')) > 8500000) {
      throw new AIError('MEDIA_SIZE', 'La nota de voz debe pesar menos de 8 MB.', 413);
    }
    const form = await request.formData().catch(() => null);
    const file = form?.get('audio');
    if (!file || typeof file === 'string' || file.size === 0 || file.size > 8000000) {
      throw new AIError('AI_AUDIO_INVALID', 'Envía una grabación de audio válida de hasta 8 MB.', 422);
    }
    const rawMime = (file.type || 'audio/webm').split(';')[0].trim().toLowerCase();
    if (!rawMime.startsWith('audio/')) {
      throw new AIError('AI_AUDIO_INVALID', 'El archivo enviado no es un formato de audio válido.', 422);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const text = await generateAI(
      'Transcribe literalmente este audio en español de Chile. Devuelve únicamente el texto transcrito, sin agregar explicaciones.',
      {
        image: { mimeType: rawMime, data: bytes.toString('base64') },
        timeoutMs: 15000,
        budgetMs: 20000,
      },
    );
    return NextResponse.json({ texto: text.trim() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorJSON(error);
  }
}

export const POST = withAIRequest(transcribeHandler);
