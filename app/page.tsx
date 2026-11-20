import type { Metadata } from 'next';
import LandingPage from '@/components/LandingPage';

export const metadata: Metadata = {
  title: 'ObraTrack | El Copiloto Digital del Constructor en Chile',
  description:
    'Presupuestos con IA y cálculo determinista, Radar en vivo entre Sodimac, Construmart, Easy, Imperial y Dimaco, Carta Gantt, WhatsApp con ObraBot y Estados de Pago en PDF con tu membrete. Desde $12.990 CLP IVA incluido.',
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    siteName: 'ObraTrack Chile',
    title: 'ObraTrack | El Copiloto Digital del Constructor',
    description:
      'Cotizador IA determinista, comparador de 5 ferreterías chilenas, Carta Gantt, WhatsApp con ObraBot y Estados de Pago en PDF.',
  },
};

export default function Home() {
  return <LandingPage />;
}
