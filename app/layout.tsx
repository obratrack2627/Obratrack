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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'ObraTrack | El copiloto digital del constructor',
  description:
    'Control, Cotizaciones, Costos, Pagos, Avances y Georreferenciación con ObraBot, Google Maps y WhatsApp para constructoras en Chile.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.svg?v=original-dark', type: 'image/svg+xml' }],
    apple: [
      { url: '/app-icons/obratrack-mobile-v3-180.png', sizes: '180x180', type: 'image/png' },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
