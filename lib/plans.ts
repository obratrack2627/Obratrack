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
      'Directorio de clientes y contactos',
      'Registro de estados de pago y anticipos',
      'Control de gastos básicos e imprevistos',
      'Carta Gantt básica',
      'Acceso móvil y web',
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
      'Para maestros y constructores que necesitan presupuestar en minutos y asegurar su margen de ganancia real.',
    limiteObrasActivas: 'ilimitadas',
    soportaCotizadorIA: true,
    soportaWhatsAppIA: false,
    soportaRentabilidadAvanzada: true,
    soportaAgentesYAutomatizacion: false,
    soportaExportacionBoletas: true,
    colorAcento: '#FF6A00', // Naranjo Obra
    caracteristicas: [
      'Obras y proyectos ilimitados',
      'Cotizador Inteligente con OpenAI GPT-4o (APU y cubicación)',
      'Módulo "¿Cuánto cobrar?" con margen neto asegurado',
      'Radar comparador de precios en ferreterías chilenas (Sodimac, Construmart, Imperial, MTS, Easy)',
      'Control financiero avanzado con gráficos de rentabilidad',
      'Carga de boletas, facturas y respaldos fotográficos',
      'Exportación de cotizaciones y reportes financieros',
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
      'La solución completa con agentes autónomos de IA y sincronización en tiempo real vía WhatsApp Cloud API.',
    limiteObrasActivas: 'ilimitadas',
    soportaCotizadorIA: true,
    soportaWhatsAppIA: true,
    soportaRentabilidadAvanzada: true,
    soportaAgentesYAutomatizacion: true,
    soportaExportacionBoletas: true,
    colorAcento: '#6B8F72', // Verde Terreno
    caracteristicas: [
      'Todo lo incluido en el Plan Pro',
      'Recepción y transcripción de audios de terreno vía WhatsApp con OpenAI Whisper',
      'Agente IA que extrae partidas y actualiza la Carta Gantt automáticamente',
      'Detección inteligente de compras e imprevistos desde mensajes de chat',
      'Recordatorios de pago y cobranza automática a clientes por WhatsApp',
      'Búsqueda semántica con pgvector para partidas y normativas chilenas',
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
