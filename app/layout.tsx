import type { Metadata } from 'next';
import { Space_Grotesk, Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['500', '600', '700'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'ObraTrack | El copiloto digital del constructor',
  description:
    'Control, Cotizaciones, Costos, Pagos y Avances de Obra con Inteligencia Artificial (OpenAI) y WhatsApp para constructoras en Chile.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable}`}>
      <body className="min-h-screen bg-kraft-100 antialiased flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 flex flex-col min-h-screen w-full md:pl-64 transition-all">
          {children}
        </main>
      </body>
    </html>
  );
}
