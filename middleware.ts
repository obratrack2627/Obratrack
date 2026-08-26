import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas públicas que NO requieren autenticación previa
const PUBLIC_ROUTES = ['/login', '/api/', '/icon.svg', '/_next/', '/favicon.ico'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir acceso libre a rutas públicas, assets y endpoints de API
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route)) || pathname === '/') {
    return NextResponse.next();
  }

  // Verificar token / cookie de sesión de ObraTrack (Firebase Auth)
  const authToken = request.cookies.get('obratrack_auth_token')?.value;

  // Si no hay sesión activa y la ruta requiere autenticación, redirigir a login
  if (!authToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
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
