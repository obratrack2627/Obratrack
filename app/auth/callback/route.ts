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
    // 1. Flujo PKCE moderno de Supabase Auth: el code_verifier vive en el cliente (localStorage),
    // por lo que el intercambio debe completarse en la vista destino sin filtrar tokens en Location.
    if (code) {
      const redirectUrl = new URL(targetPath, request.url);
      redirectUrl.searchParams.set('code', code);
      if (!isRecovery) {
        redirectUrl.searchParams.set('cuenta_confirmada', 'true');
      }
      return NextResponse.redirect(redirectUrl);
    }

    // 2. Flujo clásico de OTP / Token Hash
    if (tokenHash && type) {
      if (isRecovery) {
        // Delegar verifyOtp al cliente en /actualizar-password sin exponer access_token/refresh_token en Location.
        const redirectUrl = new URL('/actualizar-password', request.url);
        redirectUrl.searchParams.set('token_hash', tokenHash);
        redirectUrl.searchParams.set('type', type);
        return NextResponse.redirect(redirectUrl);
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      });

      if (verifyError) {
        console.error('Error en verifyOtp:', verifyError.message);
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('error', 'enlace_expirado');
        return NextResponse.redirect(loginUrl);
      }
    }

    // Preparar redirección exitosa
    const redirectUrl = new URL(targetPath, request.url);
    if (!isRecovery) {
      redirectUrl.searchParams.set('cuenta_confirmada', 'true');
    }
    return NextResponse.redirect(redirectUrl);
  } catch (err: any) {
    console.error('Excepción no controlada en /auth/callback:', err);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'error_autenticacion');
    return NextResponse.redirect(loginUrl);
  }
}
