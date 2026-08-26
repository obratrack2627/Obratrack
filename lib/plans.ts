import { PlanSuscripcion, SubscriptionPlanId } from '@/types/database';

export const PLANES_SUSCRIPCION: PlanSuscripcion[] = [
  {
    id: 'gratis',
    nombre: 'Plan Gratis',
    badge: 'Inicial',
    precioMensualCLP: 0,
    precioRangoTexto: '$0',
    periodo: '/mes para siempre',
    usuarioObjetivo: 'Maestro independiente que recién prueba la app',
    descripcion:
      'Ideal para digitalizar tu primera obra, ordenar los números y dejar de usar notas de papel o cuadernos.',
    limiteObrasActivas: 1,
    soportaCotizadorIA: false,
    soportaWhatsAppIA: false,
    soportaRentabilidadAvanzada: false,
    soportaAgentesYAutomatizacion: false,
    soportaExportacionBoletas: false,
    colorAcento: '#9A9A9A', // Gris Cemento
    caracteristicas: [
      '1 obra activa a la vez',
      'Georreferenciación en Chile con Google Maps',
      'Directorio de clientes y contactos',
      'Registro de estados de pago y anticipos',
      'Control de gastos básicos e imprevistos',
      'Carta Gantt interactiva con soporte táctil',
      'Acceso móvil y web responsivo',
    ],
  },
  {
    id: 'pro',
    nombre: 'Plan Pro',
    badge: 'Más Popular',
    popular: true,
    precioMensualCLP: 12990,
    precioRangoTexto: '$9.990 – $14.990',
    periodo: '/mes',
    usuarioObjetivo: 'Maestro / contratista habitual',
    descripcion:
      'Para maestros y constructores que necesitan presupuestar en minutos y asegurar su margen de ganancia real con Google Gemini.',
    limiteObrasActivas: 'ilimitadas',
    soportaCotizadorIA: true,
    soportaWhatsAppIA: false,
    soportaRentabilidadAvanzada: true,
    soportaAgentesYAutomatizacion: false,
    soportaExportacionBoletas: true,
    colorAcento: '#FF6A00', // Naranjo Obra
    caracteristicas: [
      'Obras y proyectos ilimitados con Google Maps',
      'Cotizador Inteligente con Google Gemini 2.5 (APU y cubicación en segundos)',
      'Asesor de Cobro al Cliente: "¿Cuánto cobrar?" con 3 niveles de tarifa',
      'Radar comparador de precios en ferreterías chilenas (Sodimac, Construmart, Imperial, MTS, Easy)',
      'Control financiero avanzado con gráficos de rentabilidad',
      'Envío directo de cotizaciones y rutas GPS por WhatsApp',
      'Carga de boletas, facturas y respaldos fotográficos',
    ],
  },
  {
    id: 'pro_ia',
    nombre: 'Plan Pro IA',
    badge: 'Automatización Total',
    precioMensualCLP: 24990,
    precioRangoTexto: '$19.990 – $29.990',
    periodo: '/mes',
    usuarioObjetivo: 'Contratista que maneja varias obras y cuadrillas',
    descripcion:
      'La solución integral impulsada por Google Gemini Pro IA, agentes autónomos y sincronización en tiempo real vía WhatsApp.',
    limiteObrasActivas: 'ilimitadas',
    soportaCotizadorIA: true,
    soportaWhatsAppIA: true,
    soportaRentabilidadAvanzada: true,
    soportaAgentesYAutomatizacion: true,
    soportaExportacionBoletas: true,
    colorAcento: '#6B8F72', // Verde Terreno
    caracteristicas: [
      'Todo lo incluido en el Plan Pro',
      'Recepción y análisis de audios y reportes de terreno con Google Gemini IA',
      'Agente IA que extrae partidas y actualiza la Carta Gantt automáticamente',
      'Detección inteligente de compras e imprevistos desde mensajes de chat',
      'Recordatorios de pago y cobranza automática a clientes por WhatsApp',
      'Chat Asesor de Obras 24/7 con normativas chilenas y análisis de precios',
      'Soporte prioritario y multi-cuadrilla',
    ],
  },
];

export function getPlanDetails(planId: SubscriptionPlanId): PlanSuscripcion {
  return (
    PLANES_SUSCRIPCION.find((p) => p.id === planId) ||
    PLANES_SUSCRIPCION[1] // Default Pro
  );
}
