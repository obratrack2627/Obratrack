import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
  '/api/whatsapp/procesar-envios',
  '/api/webhook/whatsapp', // Webhook entrante de Meta WhatsApp Cloud API
];

const UUID_SESSION_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT_SESSION_REGEX =
  /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

export function isValidAuthToken(token?: string): boolean {
  if (!token) return false;
  const trimmed = token.trim();
  if (trimmed.length < 32 || trimmed.length > 4096) return false;
  return UUID_SESSION_REGEX.test(trimmed) || JWT_SESSION_REGEX.test(trimmed);
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
    PUBLIC_PAGES.some((route) => pathname === route || pathname.startsWith('/_next/'))
  ) {
    return NextResponse.next();
  }

  // Permitir solo las rutas de API expresamente públicas
  if (PUBLIC_API_ROUTES.some((route) => pathname === route)) {
    return NextResponse.next();
  }

  // Verificar estructura de token / identificador de sesión de ObraTrack
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)',
  ],
};
