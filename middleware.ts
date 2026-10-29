import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas públicas que NO requieren autenticación previa
const PUBLIC_PAGES = ['/login', '/auth/callback', '/actualizar-password', '/icon.svg', '/favicon.ico'];

// Endpoints de API específicamente públicos (ej. webhooks externos de Meta)
const PUBLIC_API_ROUTES = [
  '/api/whatsapp/procesar-envios',
  '/api/webhook/whatsapp', // Webhook entrante de Meta WhatsApp Cloud API
];

function isValidAuthToken(token?: string): boolean {
  if (!token) return false;
  const trimmed = token.trim();
  // Validar longitud mínima y evitar tokens triviales o dummy
  if (trimmed.length < 8) return false;
  // Solo permitir caracteres seguros (alfanuméricos, guiones, guion bajo)
  return /^[a-zA-Z0-9_\-\.]+$/.test(trimmed);
}

function sanitizeRedirectPath(path: string | null): string {
  if (!path) return '/dashboard';
  // Prevenir Open Redirect: debe empezar por '/' y NO por '//' o prefijos de protocolo
  if (path.startsWith('/') && !path.startsWith('//') && !path.includes('://')) {
    return path;
  }
  return '/dashboard';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir la landing/página raíz si corresponde o activos estáticos
  if (pathname === '/' || PUBLIC_PAGES.some((route) => pathname === route || pathname.startsWith('/_next/'))) {
    return NextResponse.next();
  }

  // Permitir solo las rutas de API expresamente públicas
  if (PUBLIC_API_ROUTES.some((route) => pathname === route)) {
    return NextResponse.next();
  }

  // Verificar token / cookie de sesión de ObraTrack
  const authToken = request.cookies.get('obratrack_auth_token')?.value;
  const isAuthorized = isValidAuthToken(authToken);

  // Si no está autorizado
  if (!isAuthorized) {
    // Si la petición es hacia la API, responder 401 JSON en vez de redirección HTML
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
    /*
     * Proteger todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico, icon.svg (iconos)
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
};
