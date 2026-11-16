import { contentSecurityPolicy } from '@/lib/security-csp';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyWebSession } from '@/lib/auth/web-session';
import { isSessionJWT } from '@/lib/auth/access';

// Rutas públicas que NO requieren autenticación previa
const PUBLIC_PAGES = [
  '/login',
  '/precios',
  '/auth/callback',
  '/actualizar-password',
  '/manifest.webmanifest',
  '/icon.svg',
  '/favicon.ico',
];

// Endpoints de API específicamente públicos (ej. webhooks externos de Meta o Flow)
const PUBLIC_API_ROUTES = [
  '/api/auth/session',
  '/api/whatsapp/procesar-envios',
  '/api/webhook/whatsapp', // Webhook entrante de Meta WhatsApp Cloud API
  '/api/billing/webhook/flow', // Webhook server-to-server de Flow.cl
  '/api/billing/return/flow', // Retorno POST/GET del checkout de Flow.cl
  '/api/billing/reconcile', // Tarea programada protegida por CRON_SECRET
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

async function handleRequest(request: NextRequest, forwardedHeaders: Headers) {
  const { pathname } = request.nextUrl;

  // Permitir la landing/página raíz si corresponde o activos estáticos/PWA
  if (
    pathname === '/' ||
    pathname.startsWith('/app-icons/') ||
    PUBLIC_PAGES.some((route) => pathname === route || pathname.startsWith('/_next/'))
  ) {
    return NextResponse.next({request:{headers:forwardedHeaders}});
  }

  // Permitir solo las rutas de API expresamente públicas
  if (PUBLIC_API_ROUTES.some((route) => pathname === route)) {
    return NextResponse.next({request:{headers:forwardedHeaders}});
  }

  // Verificar estructura de token / identificador de sesión de ObraTrack
  // Cada API valida Auth y el rol mediante authorizeAI; también admite Bearer para móviles.
  if (pathname.startsWith('/api/')) return NextResponse.next({request:{headers:forwardedHeaders}});
  const authToken = request.cookies.get('obratrack_auth_token')?.value;
  const isAuthorized = isValidAuthToken(authToken);

  if (!isAuthorized) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'No autorizado. Se requiere sesión activa válida.' },
        { status: 401 }
      );
    }

    const safeRedirect = sanitizeRedirectPath(pathname + request.nextUrl.search);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', safeRedirect);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const session = await verifyWebSession(authToken!);
    if (session?.allowed) return NextResponse.next({request:{headers:forwardedHeaders}});
    const login = new URL('/login', request.url);
    if (session) login.searchParams.set('error', 'acceso_whatsapp');
    const response = NextResponse.redirect(login);
    response.cookies.delete('obratrack_auth_token');
    return response;
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export async function middleware(request: NextRequest) {
  const nonce=btoa(crypto.randomUUID());
  const policy=contentSecurityPolicy(nonce,process.env.NODE_ENV!=='production');
  const forwarded=new Headers(request.headers);
  forwarded.set('x-nonce',nonce);forwarded.set('Content-Security-Policy',policy);
  const response=await handleRequest(request,forwarded);
  if(request.nextUrl.pathname==='/login' && request.nextUrl.searchParams.get('logout')==='1')response.cookies.delete('obratrack_auth_token');
  response.headers.set('Content-Security-Policy',policy);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|app-icons/).*)',
  ],
};
