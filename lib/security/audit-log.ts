import { sanitizeErrorForLog, sanitizeLogData } from '@/lib/privacy/mask';

export type SecurityEventType =
  | 'auth.session_established'
  | 'auth.session_cleared'
  | 'privacy.pii_revealed'
  | 'export.backup_json'
  | 'export.excel_report'
  | 'team.member_created'
  | 'team.role_changed'
  | 'billing.checkout_created'
  | 'billing.subscription_canceled';

export interface SecurityAuditInput {
  empresaId: string;
  actorId?: string | null;
  eventType: SecurityEventType;
  resourceType?: string | null;
  resourceId?: string | null;
  outcome?: 'success' | 'denied' | 'error';
  metadata?: Record<string, unknown>;
}

/**
 * Registra eventos de seguridad en Supabase de forma resiliente (ISO/IEC 27002 A.8.15).
 * Nunca interrumpe la operación principal si la tabla aún no existe o en mocks de pruebas.
 */
export async function recordSecurityEvent(
  db: any,
  input: SecurityAuditInput,
): Promise<void> {
  if (!db || typeof db.from !== 'function' || !input.empresaId) return;
  try {
    const safeMetadata = input.metadata ? sanitizeLogData(input.metadata) : {};
    await db.from('security_audit_logs').insert({
      empresa_id: input.empresaId,
      actor_id: input.actorId || null,
      event_type: input.eventType,
      resource_type: input.resourceType || null,
      resource_id: input.resourceId || null,
      outcome: input.outcome || 'success',
      metadata: safeMetadata,
    });
  } catch {
    // No propagar errores de telemetría/auditoría para no bloquear flujos críticos.
  }
}

export function logServerError(
  tag: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const safeError = sanitizeErrorForLog(error);
  const safeCtx = context ? sanitizeLogData(context) : undefined;
  console.error(tag, safeCtx ? { ...safeError, context: safeCtx } : safeError);
}
