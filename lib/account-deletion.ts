import type { SupabaseClient } from '@supabase/supabase-js';
import { AIError } from '@/lib/ai/errors';
import { cancelCompanySubscription } from '@/lib/billing/service';
import type { FlowGateway } from '@/lib/billing/flow';
import type { UserRole } from '@/types/database';

export const DEMO_EMPRESA_ID = 'e1111111-1111-4111-a111-111111111111';

const COMPANY_STORAGE_BUCKETS = [
  'documentos-obra',
  'bitacora-fotos',
  'whatsapp-evidencias',
] as const;

const CLOUD_LEDGER_BUCKET = 'obratrack-cloud-db';

export interface DeleteAccountActor {
  id: string;
  empresa_id: string;
  rol: UserRole | string;
  nombre?: string | null;
  email?: string | null;
  is_dev?: boolean;
}

export interface DeleteAccountResult {
  scope: 'company' | 'user';
  empresa_id: string;
  deleted_auth_users: number;
}

function companyLedgerPath(empresaId: string): string {
  const clean = (empresaId || DEMO_EMPRESA_ID).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ledgers/v2_${clean}.json`;
}

async function listBucketPaths(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<string[]> {
  if (depth > 4) return [];
  const storage = admin.storage?.from?.(bucket);
  if (!storage || typeof storage.list !== 'function') return [];

  const paths: string[] = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const { data, error } = await storage.list(prefix, { limit: pageSize, offset });
    if (error || !Array.isArray(data) || data.length === 0) break;

    for (const item of data) {
      if (!item?.name) continue;
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        const nested = await listBucketPaths(admin, bucket, fullPath, depth + 1);
        paths.push(...nested);
      } else {
        paths.push(fullPath);
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return paths;
}

async function removePathsInBatches(
  admin: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const storage = admin.storage?.from?.(bucket);
  if (!storage || typeof storage.remove !== 'function') return;

  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    await storage.remove(batch).catch(() => {});
  }
}

async function cleanupStorageBeforeDelete(
  admin: SupabaseClient,
  scope: 'company' | 'user',
  empresaId: string,
  userId: string,
): Promise<void> {
  if (scope === 'company') {
    await Promise.all(
      COMPANY_STORAGE_BUCKETS.map(async (bucket) => {
        const paths = await listBucketPaths(admin, bucket, empresaId);
        await removePathsInBatches(admin, bucket, paths);
      }),
    );
    await removePathsInBatches(admin, CLOUD_LEDGER_BUCKET, [companyLedgerPath(empresaId)]);
    return;
  }

  const workerEvidencePaths = await listBucketPaths(
    admin,
    'whatsapp-evidencias',
    `${empresaId}/${userId}`,
  );
  await removePathsInBatches(admin, 'whatsapp-evidencias', workerEvidencePaths);
}

/**
 * Elimina definitivamente la cuenta del usuario (y su empresa completa si es el único admin),
 * cancelando suscripciones recurrentes, borrando archivos en Storage, registros DB en cascada y Auth.
 */
export async function deleteAccountForUser(params: {
  admin: SupabaseClient;
  user: DeleteAccountActor;
  flow: FlowGateway | null;
}): Promise<DeleteAccountResult> {
  const { admin, user, flow } = params;

  if (user.empresa_id === DEMO_EMPRESA_ID || user.is_dev === true) {
    throw new AIError(
      'ACCOUNT_DELETE_PROTECTED',
      'Las cuentas de demostración o desarrollo no se pueden eliminar desde el perfil.',
      403,
    );
  }

  const { data: teamRows, error: teamError } = await admin
    .from('usuarios')
    .select('id,rol')
    .eq('empresa_id', user.empresa_id);

  if (teamError) {
    throw new AIError('DATABASE_READ', 'No se pudo verificar el estado del equipo antes de eliminar.', 503);
  }

  const otherAdmins = Array.isArray(teamRows)
    ? teamRows.filter((row: any) => row.id !== user.id && row.rol === 'admin')
    : [];
  const expectedScope: 'company' | 'user' =
    user.rol === 'admin' && otherAdmins.length === 0 ? 'company' : 'user';

  if (expectedScope === 'company' && flow) {
    const { data: activeSub } = await admin
      .from('suscripciones')
      .select('id,estado,plan_id,cancel_at_period_end,gateway_subscription_id')
      .eq('empresa_id', user.empresa_id)
      .eq('estado', 'active')
      .maybeSingle();

    if (
      activeSub &&
      activeSub.plan_id !== 'gratis' &&
      !activeSub.cancel_at_period_end &&
      activeSub.gateway_subscription_id &&
      !String(activeSub.gateway_subscription_id).startsWith('sim-')
    ) {
      await cancelCompanySubscription({
        admin,
        flow,
        actor: {
          id: user.id,
          empresa_id: user.empresa_id,
          rol: user.rol as UserRole,
          is_dev: user.is_dev,
          email: user.email || undefined,
          nombre: user.nombre || '',
        },
      });
    }
  }

  await cleanupStorageBeforeDelete(admin, expectedScope, user.empresa_id, user.id);

  const { data: rpcResult, error: rpcError } = await admin.rpc('eliminar_cuenta_usuario', {
    p_usuario_id: user.id,
  });

  if (rpcError) {
    const msg = rpcError.message || '';
    if (msg.includes('ACCOUNT_DELETE_PROTECTED')) {
      throw new AIError(
        'ACCOUNT_DELETE_PROTECTED',
        'Las cuentas de demostración o desarrollo no se pueden eliminar desde el perfil.',
        403,
      );
    }
    if (msg.includes('ACCOUNT_NOT_FOUND')) {
      throw new AIError('ACCOUNT_NOT_FOUND', 'La cuenta ya no existe en el sistema.', 404);
    }
    throw new AIError('ACCOUNT_DELETE_FAILED', 'No se pudieron eliminar los datos de tu cuenta.', 500);
  }

  const scope: 'company' | 'user' = rpcResult?.scope === 'company' ? 'company' : 'user';
  const authIds: string[] = Array.isArray(rpcResult?.auth_user_ids)
    ? rpcResult.auth_user_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    : [];

  let deletedAuthUsers = 0;
  for (const authId of authIds) {
    const { error: authDelErr } = await admin.auth.admin.deleteUser(authId);
    if (!authDelErr) {
      deletedAuthUsers += 1;
    } else if (!/not found/i.test(authDelErr.message || '')) {
      console.error('account_delete_auth_user_error', { message: authDelErr.message });
    }
  }

  return {
    scope,
    empresa_id: user.empresa_id,
    deleted_auth_users: deletedAuthUsers,
  };
}
