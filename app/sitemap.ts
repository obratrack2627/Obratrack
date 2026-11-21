import type { MetadataRoute } from 'next';

function resolveSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  try {
    return (raw ? new URL(raw) : new URL('https://obratrack-cl.vercel.app')).origin;
  } catch {
    return 'https://obratrack-cl.vercel.app';
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = resolveSiteUrl();
  const lastModified = new Date('2026-11-21T00:00:00.000Z');
  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/precios`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];
}
