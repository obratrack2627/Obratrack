import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { recordSecurityEvent, type SecurityEventType } from '@/lib/security/audit-log';

export const dynamic = 'force-dynamic';

const CLIENT_ALLOWED_EVENTS = new Set<SecurityEventType>([
  'privacy.pii_revealed',
  'export.backup_json',
  'export.excel_report',
]);

export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    if (user.rol !== 'admin') {
      throw new AIError('ROLE_FORBIDDEN', 'Solo administradores pueden consultar el registro de auditoría.', 403);
    }

    const db = getSupabaseAdmin() || client;
    const { data, error } = await db
      .from('security_audit_logs')
      .select('id,actor_id,event_type,resource_type,resource_id,outcome,metadata,created_at')
      .eq('empresa_id', user.empresa_id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { events: [], available: false },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    return NextResponse.json(
      { events: data || [], available: true },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorJSON(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const body = await request.json().catch(() => ({}));
    const eventType = body?.event_type as SecurityEventType;

    if (!CLIENT_ALLOWED_EVENTS.has(eventType)) {
      throw new AIError('INVALID_AUDIT_EVENT', 'Tipo de evento de auditoría no permitido.', 400);
    }

    const db = getSupabaseAdmin() || client;
    await recordSecurityEvent(db, {
      empresaId: user.empresa_id,
      actorId: user.id,
      eventType,
      resourceType: typeof body?.resource_type === 'string' ? body.resource_type.slice(0, 60) : null,
      resourceId: typeof body?.resource_id === 'string' ? body.resource_id.slice(0, 120) : null,
      outcome: 'success',
      metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorJSON(error);
  }
}
