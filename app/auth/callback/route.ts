import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

function sanitizeRedirectPath(path: string | null, defaultPath = '/dashboard'): string {
  if (!path) return defaultPath;
  if (path.startsWith('/') && !path.startsWith('//') && !path.includes('://')) {
    return path;
  }
  return defaultPath;
}

export async function GET(request: NextRequest) {
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
  const defaultTarget = isRecovery ? '/actualizar-password' : '/dashboard';
  const targetPath = sanitizeRedirectPath(nextParam, defaultTarget);

  try {
    let authUserId: string | null = null;

    // 1. Flujo PKCE moderno de Supabase Auth (código de un solo uso)
    if (code) {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        console.error('Error en exchangeCodeForSession:', exchangeError.message);
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('error', 'enlace_expirado');
        return NextResponse.redirect(loginUrl);
      }
      authUserId = data.user?.id || data.session?.user?.id || null;
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
      authUserId = data.user?.id || data.session?.user?.id || null;
    }

    // Preparar redirección exitosa
    const redirectUrl = new URL(targetPath, request.url);
    if (!isRecovery) {
      redirectUrl.searchParams.set('cuenta_confirmada', 'true');
    }

    const response = NextResponse.redirect(redirectUrl);

    // Si se obtuvo usuario autenticado, sincronizar cookie de sesión de ObraTrack
    if (authUserId) {
      response.cookies.set('obratrack_auth_token', authUserId, {
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 días
        sameSite: 'lax',
        httpOnly: false,
      });
    }

    return response;
  } catch (err: any) {
    console.error('Excepción no controlada en /auth/callback:', err);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'error_autenticacion');
    return NextResponse.redirect(loginUrl);
  }
}
