import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { authorizeAI } from '@/lib/ai/server';
import type { BillingActor } from './service';

/** Autentica la solicitud web actual reutilizando el guardia multi-tenant y de roles web. */
export async function resolveBillingActor(request: NextRequest): Promise<BillingActor> {
  const { user } = await authorizeAI(request);
  return {
    id: user.id,
    empresa_id: user.empresa_id,
    rol: user.rol,
    nombre: user.nombre,
    is_dev: user.is_dev,
  };
}

/** Extrae de forma segura el token enviado por Flow desde query string, form o JSON. */
export async function extractFlowToken(request: NextRequest): Promise<string | null> {
  const fromQuery = request.nextUrl.searchParams.get('token')?.trim();
  if (fromQuery && fromQuery.length <= 256) return fromQuery;
  if (request.method === 'GET') return null;

  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  try {
    if (contentType.includes('application/json')) {
      const json = (await request.json()) as { token?: unknown } | null;
      const token = typeof json?.token === 'string' ? json.token.trim() : '';
      return token && token.length <= 256 ? token : null;
    }

    const raw = await request.text();
    if (!raw) return null;
    if (contentType.includes('application/x-www-form-urlencoded') || raw.includes('token=')) {
      const params = new URLSearchParams(raw);
      const token = params.get('token')?.trim() || '';
      return token && token.length <= 256 ? token : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Valida de forma constante el Bearer CRON_SECRET para tareas programadas internas. */
export function isAuthorizedCronSecret(request: NextRequest): boolean {
  const expected = (process.env.CRON_SECRET || '').trim();
  if (!expected) return false;
  const authHeader = (request.headers.get('authorization') || '').trim();
  const [scheme, token] = authHeader.split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token) return false;

  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
