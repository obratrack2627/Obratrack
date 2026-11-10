import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ObraTrack — Gestión de Obras y Cotizador IA',
    short_name: 'ObraTrack',
    description:
      'Plataforma SaaS de control de obras, presupuestos con IA, Carta Gantt, estados de pago y reportes de terreno para constructoras en Chile.',
    start_url: '/proyectos',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#141A23',
    theme_color: '#FF6A00',
    lang: 'es-CL',
    categories: ['business', 'productivity', 'finance'],
    icons: [
      {
        src: '/app-icons/obratrack-mobile-v3-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/app-icons/obratrack-mobile-v3-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/app-icons/obratrack-mobile-v3-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Mis Obras',
        short_name: 'Obras',
        description: 'Acceder directamente a las obras en curso en terreno',
        url: '/proyectos',
      },
      {
        name: 'Copiloto y Cotizador IA',
        short_name: 'Cotizar',
        description: 'Crear presupuestos y consultar precios de materiales',
        url: '/cotizador',
      },
      {
        name: 'Reportes de Terreno',
        short_name: 'Reportes',
        description: 'Revisar avances y avisos de WhatsApp',
        url: '/reportes',
      },
    ],
  };
}
