import { NextRequest, NextResponse } from 'next/server';
import { supabaseUrl,supabaseAnonKey } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';
import { serverFetch } from '@/lib/server-fetch';

export async function GET(request: NextRequest) {
  const supabase = createClient(supabaseUrl,supabaseAnonKey,{ auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: serverFetch } });
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const nextParam = requestUrl.searchParams.get('next');

  // Si Supabase reportó un error directamente en los query params
  if (error) {
    console.error('Error reportado por Supabase Auth en callback:', error, errorDescription);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'enlace_expirado');
    return NextResponse.redirect(loginUrl);
  }

  // Determinar ruta de destino por defecto según el tipo de flujo
  const isRecovery = type === 'recovery' || nextParam?.includes('actualizar-password');
  const targetPath = isRecovery ? '/actualizar-password' : '/login';

  try {
    let sessionToken: string | null = null;
    let refreshToken: string | null = null;

    // 1. Flujo PKCE moderno de Supabase Auth (código de un solo uso)
    if (code) {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        console.error('Error en exchangeCodeForSession:', exchangeError.message);
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('error', 'enlace_expirado');
        return NextResponse.redirect(loginUrl);
      }
      sessionToken = data.session?.access_token || null;
      refreshToken = data.session?.refresh_token || null;
    } 
    // 2. Flujo clásico de OTP / Token Hash
    else if (tokenHash && type) {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      });

      if (verifyError) {
        console.error('Error en verifyOtp:', verifyError.message);
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('error', 'enlace_expirado');
        return NextResponse.redirect(loginUrl);
      }
      sessionToken = data.session?.access_token || null;
      refreshToken = data.session?.refresh_token || null;
    }

    // Preparar redirección exitosa
    const redirectUrl = new URL(targetPath, request.url);
    if (!isRecovery) {
      redirectUrl.searchParams.set('cuenta_confirmada', 'true');
    }

    if (isRecovery && sessionToken && refreshToken)
      redirectUrl.hash = new URLSearchParams({ access_token: sessionToken, refresh_token: refreshToken, type: 'recovery' }).toString();
    return NextResponse.redirect(redirectUrl);
  } catch (err: any) {
    console.error('Excepción no controlada en /auth/callback:', err);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'error_autenticacion');
    return NextResponse.redirect(loginUrl);
  }
}
