import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'ObraTrack | El copiloto digital del constructor',
  description:
    'Control, Cotizaciones, Costos, Pagos, Avances y Georreferenciación con Inteligencia Artificial (Google Gemini), Google Maps y WhatsApp para constructoras en Chile.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable}`}>
      <body className="min-h-screen bg-kraft-100 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
