import type {
  BillingCycle,
  PaidPlanId,
  PlanSuscripcion,
  SubscriptionPlanId,
} from '@/types/database';

export const ANNUAL_DISCOUNT_RATE = 0.15;

export interface PlanPricingBreakdown {
  planId: PaidPlanId;
  nombre: string;
  ciclo: BillingCycle;
  precioMensualBaseCLP: number;
  precioEfectivoMensualCLP: number;
  montoCobroCLP: number;
  ahorroAnualCLP: number;
  duracionDias: number;
}

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
      '1 obra en curso a la vez',
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
      'Para maestros y constructores que necesitan presupuestar en minutos y asegurar su margen de ganancia real con ObraBot.',
    limiteObrasActivas: 'ilimitadas',
    soportaCotizadorIA: true,
    soportaWhatsAppIA: false,
    soportaRentabilidadAvanzada: true,
    soportaAgentesYAutomatizacion: false,
    soportaExportacionBoletas: true,
    colorAcento: '#FF6A00', // Naranjo Obra
    caracteristicas: [
      'Obras y proyectos ilimitados con Google Maps',
      'Cotizador con IA, APU y cubicación',
      'Asesor de Cobro al Cliente: "¿Cuánto cobrar?" con 3 niveles de tarifa',
      'Estimaciones de materiales y proveedores de referencia',
      'Control financiero avanzado con gráficos de rentabilidad',
      'Cotizaciones en PDF y rutas para compartir por WhatsApp',
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
      'La solución integral con ObraBot, agentes autónomos y sincronización en tiempo real vía WhatsApp.',
    limiteObrasActivas: 'ilimitadas',
    soportaCotizadorIA: true,
    soportaWhatsAppIA: true,
    soportaRentabilidadAvanzada: true,
    soportaAgentesYAutomatizacion: true,
    soportaExportacionBoletas: true,
    colorAcento: '#6B8F72', // Verde Terreno
    caracteristicas: [
      'Todo lo incluido en el Plan Pro',
      'Recepción y análisis de audios y reportes de terreno con ObraBot',
      'Agente IA que extrae partidas y actualiza la Carta Gantt automáticamente',
      'Detección inteligente de compras e imprevistos desde mensajes de chat',
      'Registro de pagos, avances y fotos desde WhatsApp',
      'Copiloto para consultar y gestionar tus obras',
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

/** Valida si un identificador corresponde a un plan pagado comercializable. */
export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return value === 'pro' || value === 'pro_ia';
}

/**
 * Calcula los montos oficiales en CLP para un plan pagado y ciclo de cobro.
 * Fuente única compartida entre el frontend (/planes) y la validación del servidor.
 */
export function getPlanPricing(planId: PaidPlanId, ciclo: BillingCycle): PlanPricingBreakdown {
  const plan = PLANES_SUSCRIPCION.find((p) => p.id === planId);
  if (!plan || plan.precioMensualCLP <= 0) {
    throw new Error(`Plan sin tarifa comercial: ${planId}`);
  }

  const base = plan.precioMensualCLP;
  if (ciclo === 'anual') {
    const precioEfectivoMensualCLP = Math.round((base * (1 - ANNUAL_DISCOUNT_RATE)) / 10) * 10;
    const montoCobroCLP = precioEfectivoMensualCLP * 12;
    return {
      planId,
      nombre: plan.nombre,
      ciclo,
      precioMensualBaseCLP: base,
      precioEfectivoMensualCLP,
      montoCobroCLP,
      ahorroAnualCLP: base * 12 - montoCobroCLP,
      duracionDias: 365,
    };
  }

  return {
    planId,
    nombre: plan.nombre,
    ciclo,
    precioMensualBaseCLP: base,
    precioEfectivoMensualCLP: base,
    montoCobroCLP: base,
    ahorroAnualCLP: 0,
    duracionDias: 30,
  };
}
