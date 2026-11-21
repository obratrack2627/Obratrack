import type { MetadataRoute } from 'next';

function resolveSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  try {
    return (raw ? new URL(raw) : new URL('https://obratrack-cl.vercel.app')).origin;
  } catch {
    return 'https://obratrack-cl.vercel.app';
  }
}

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/precios'],
        disallow: [
          '/dashboard',
          '/proyectos',
          '/clientes',
          '/equipo',
          '/cotizador',
          '/asistencia',
          '/reportes',
          '/planes',
          '/login',
          '/actualizar-password',
          '/auth',
          '/api',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
