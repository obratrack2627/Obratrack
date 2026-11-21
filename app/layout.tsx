import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import './globals.css';
import AppShell from '@/components/AppShell';

const spaceGrotesk = localFont({
  src: './fonts/space-grotesk-latin.woff2',
  variable: '--font-space-grotesk',
  weight: '500 700',
  display: 'swap',
});

const inter = localFont({
  src: './fonts/inter-latin.woff2',
  variable: '--font-inter',
  weight: '400 700',
  display: 'swap',
});

const ibmPlexMono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-400-latin.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-500-latin.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-mono-600-latin.woff2', weight: '600', style: 'normal' },
    { path: './fonts/ibm-plex-mono-700-latin.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

const appBaseUrl = (() => {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  try {
    return raw ? new URL(raw) : new URL('https://obratrack-cl.vercel.app');
  } catch {
    return new URL('https://obratrack-cl.vercel.app');
  }
})();

// Respetar el color nativo de barras del sistema en móvil y PWA (InstalledAppTheme).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: appBaseUrl,
  title: 'ObraTrack | El copiloto digital del constructor',
  description:
    'Control, Cotizaciones, Costos, Pagos, Avances y Georreferenciación con ObraBot, Google Maps y WhatsApp para constructoras en Chile.',
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    siteName: 'ObraTrack Chile',
    title: 'ObraTrack | El copiloto digital del constructor',
    description:
      'Cotizador IA determinista, comparador de 5 ferreterías chilenas, Carta Gantt, WhatsApp con ObraBot y Estados de Pago en PDF.',
    images: [
      {
        url: '/app-icons/obratrack-mobile-v3-512.png?v=4',
        width: 512,
        height: 512,
        alt: 'ObraTrack — Gestión de Obras y Cotizador IA',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ObraTrack | El copiloto digital del constructor',
    description:
      'Presupuestos con IA, Radar ferretero en vivo, Carta Gantt, WhatsApp con ObraBot y Estados de Pago en PDF.',
    images: ['/app-icons/obratrack-mobile-v3-512.png?v=4'],
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg?v=20261116', type: 'image/svg+xml' },
      { url: '/app-icons/obratrack-mobile-v3-192.png?v=4', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/app-icons/obratrack-mobile-v3-180.png?v=4', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ObraTrack',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  formatDetection: {
    telephone: false,
  },
};

const themeInitScript = `
(function() {
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.documentElement.classList.add('pwa-installed');
  try {
    var saved = localStorage.getItem('obratrack_theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const nonce=(await headers()).get('x-nonce') || undefined;
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
