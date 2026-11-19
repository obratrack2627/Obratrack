import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/client';
import { serverFetch } from '@/lib/server-fetch';
import { normalizeRutKey } from '@/lib/auth/registration-validation';

export const dynamic = 'force-dynamic';

const GENERIC_AUTH_ERROR = 'Correo, RUT o contraseña incorrectos.';

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    const publicOrigin = host ? `${request.nextUrl.protocol}//${host}` : request.nextUrl.origin;
    if (origin && origin !== publicOrigin) {
      return NextResponse.json(
        { error: 'El origen de la solicitud no está permitido.' },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      rut?: unknown;
      password?: unknown;
    } | null;

    const cleanRut = normalizeRutKey(typeof body?.rut === 'string' ? body.rut : '');
    const password = typeof body?.password === 'string' ? body.password : '';

    if (cleanRut.length < 7 || !password) {
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json(
        { code: 'RUT_LOGIN_UNAVAILABLE', error: 'Ingresa con tu correo electrónico en este entorno.' },
        { status: 503 },
      );
    }

    const address = request.headers.get('x-vercel-forwarded-for')?.split(',').at(-1)?.trim() || 'shared';
    const clientKey = createHmac(
      'sha256',
      process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-only',
    )
      .update(address)
      .digest('hex');

    let resolvedEmail: string | null = null;
    const rpcResult = await admin.rpc('resolver_email_login_rut', {
      p_key: clientKey,
      p_rut: cleanRut,
    });

    if (rpcResult.error?.message?.includes('LOGIN_RUT_RATE_LIMIT')) {
      return NextResponse.json(
        { error: 'Demasiados intentos de inicio de sesión. Espera unos minutos e intenta nuevamente.' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    if (!rpcResult.error) {
      resolvedEmail = typeof rpcResult.data === 'string' && rpcResult.data.trim()
        ? rpcResult.data.trim().toLowerCase()
        : null;
    } else {
      // Compatibilidad temporal si la migración SQL del RPC aún no se aplica en el entorno.
      const formattedRut =
        cleanRut.length >= 2
          ? `${cleanRut.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${cleanRut.slice(-1)}`
          : cleanRut;
      const simpleDashRut =
        cleanRut.length >= 2 ? `${cleanRut.slice(0, -1)}-${cleanRut.slice(-1)}` : cleanRut;
      const { data: candidates } = await admin
        .from('usuarios')
        .select('rut,email,email_acceso,auth_user_id')
        .in('rut', Array.from(new Set([formattedRut, simpleDashRut, cleanRut, formattedRut.toLowerCase(), simpleDashRut.toLowerCase()])))
        .limit(5);
      const matched = (candidates || []).find(
        (u: any) => normalizeRutKey(u.rut) === cleanRut && (u.email_acceso || u.email),
      );
      resolvedEmail = matched ? String(matched.email_acceso || matched.email).trim().toLowerCase() : null;
    }

    if (!resolvedEmail) {
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: serverFetch },
    });

    const { data, error } = await authClient.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });

    if (error || !data.session?.access_token || !data.session?.refresh_token) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('email not confirmed')) {
        return NextResponse.json(
          { error: 'Tu correo electrónico aún no ha sido confirmado. Revisa tu bandeja de entrada.' },
          { status: 401 },
        );
      }
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    return NextResponse.json(
      {
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }
}
