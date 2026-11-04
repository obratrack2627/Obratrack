import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyWebSession } from '@/lib/auth/web-session';
import { isSessionJWT } from '@/lib/auth/access';

// Rutas públicas que NO requieren autenticación previa
const PUBLIC_PAGES = [
  '/login',
  '/auth/callback',
  '/actualizar-password',
  '/manifest.webmanifest',
  '/icon.svg',
  '/favicon.ico',
];

// Endpoints de API específicamente públicos (ej. webhooks externos de Meta)
const PUBLIC_API_ROUTES = [
  '/api/auth/session',
  '/api/whatsapp/procesar-envios',
  '/api/webhook/whatsapp', // Webhook entrante de Meta WhatsApp Cloud API
];


export function isValidAuthToken(token?: string): boolean {
  if (!token) return false;
  const trimmed = token.trim();
  if (trimmed.length < 32 || trimmed.length > 4096) return false;
  return isSessionJWT(trimmed);
}

export function sanitizeRedirectPath(path: string | null): string {
  if (!path) return '/dashboard';
  // Prevenir Open Redirect: debe empezar por '/' y NO por '//' o prefijos de protocolo
  if (path.startsWith('/') && !path.startsWith('//') && !path.includes('://')) {
    return path;
  }
  return '/dashboard';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir la landing/página raíz si corresponde o activos estáticos/PWA
  if (
    pathname === '/' ||
    pathname.startsWith('/app-icons/') ||
    PUBLIC_PAGES.some((route) => pathname === route || pathname.startsWith('/_next/'))
  ) {
    return NextResponse.next();
  }

  // Permitir solo las rutas de API expresamente públicas
  if (PUBLIC_API_ROUTES.some((route) => pathname === route)) {
    return NextResponse.next();
  }

  // Verificar estructura de token / identificador de sesión de ObraTrack
  // Cada API valida Auth y el rol mediante authorizeAI; también admite Bearer para móviles.
  if (pathname.startsWith('/api/')) return NextResponse.next();
  const authToken = request.cookies.get('obratrack_auth_token')?.value;
  const isAuthorized = isValidAuthToken(authToken);

  if (!isAuthorized) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'No autorizado. Se requiere sesión activa válida.' },
        { status: 401 }
      );
    }

    const safeRedirect = sanitizeRedirectPath(pathname);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', safeRedirect);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const session = await verifyWebSession(authToken!);
    if (session?.allowed) return NextResponse.next();
    const login = new URL('/login', request.url);
    if (session) login.searchParams.set('error', 'acceso_whatsapp');
    const response = NextResponse.redirect(login);
    response.cookies.delete('obratrack_auth_token');
    return response;
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|app-icons/).*)',
  ],
};
