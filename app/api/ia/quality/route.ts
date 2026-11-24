import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { scheduleQualityEvent } from '@/lib/ai/quality-server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request, { adminOnly: true });
    const db = getSupabaseAdmin() || client;
    const { data, error } = await db
      .from('obrabot_quality_events')
      .select('kind,code,recovered,attempt,channel,created_at')
      .eq('empresa_id', user.empresa_id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json({
        total_eventos: 0,
        recuperados_automaticamente: 0,
        tasa_recuperacion_pct: 100,
        correcciones_usuario: 0,
        cancelaciones: 0,
        fallos_proveedor: 0,
        por_canal: { web: 0, whatsapp: 0 },
      });
    }
    const rows = data || [];
    const invalidOrProvider = rows.filter((r: any) => r.kind === 'invalid_action' || r.kind === 'provider_failure');
    const recovered = invalidOrProvider.filter((r: any) => r.recovered === true).length;
    const recoveryRate = invalidOrProvider.length
      ? Math.round((recovered / invalidOrProvider.length) * 100)
      : 100;
    return NextResponse.json(
      {
        total_eventos: rows.length,
        recuperados_automaticamente: recovered,
        tasa_recuperacion_pct: recoveryRate,
        correcciones_usuario: rows.filter((r: any) => r.kind === 'user_correction').length,
        cancelaciones: rows.filter((r: any) => r.kind === 'action_cancelled').length,
        fallos_proveedor: rows.filter((r: any) => r.kind === 'provider_failure' && !r.recovered).length,
        por_canal: {
          web: rows.filter((r: any) => r.channel === 'web').length,
          whatsapp: rows.filter((r: any) => r.channel === 'whatsapp').length,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorJSON(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const body = await request.json();
    if (body.kind === 'thumbs_up') {
      return NextResponse.json({ ok: true }, { status: 202 });
    }
    if (body.kind === 'thumbs_down') {
      scheduleQualityEvent(client, user, { kind: 'user_correction', code: 'USER_CORRECTION' });
      return NextResponse.json({ ok: true }, { status: 202 });
    }
    if (!['action_cancelled', 'execution_failure'].includes(body.kind)) {
      return NextResponse.json({ error: 'Evento no admitido.' }, { status: 422 });
    }
    scheduleQualityEvent(client, user, {
      kind: body.kind,
      code: body.kind === 'action_cancelled' ? 'ACTION_CANCELLED' : 'EXECUTION_FAILED',
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    return errorJSON(error);
  }
}
