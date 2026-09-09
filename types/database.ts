/**
 * ObraTrack - TypeScript Definitions
 * Interfaces para el modelo de datos de Firebase Cloud Firestore
 */

export type UserRole = 'admin' | 'supervisor' | 'terreno';
export type ProjectStatus = 'activo' | 'terminado' | 'pausado';
export type ActivityStatus = 'pendiente' | 'en_curso' | 'terminada';
export type PaymentMethod = 'transferencia' | 'efectivo' | 'debito';
export type ImprevistoOrigin = 'manual' | 'whatsapp_ia';
export type ReportStatus = 'pendiente' | 'aprobado' | 'rechazado';
export type SubscriptionPlanId = 'gratis' | 'pro' | 'pro_ia';

export interface PlanSuscripcion {
  id: SubscriptionPlanId;
  nombre: string;
  badge: string;
  precioMensualCLP: number;
  precioRangoTexto: string;
  periodo: string;
  usuarioObjetivo: string;
  descripcion: string;
  limiteObrasActivas: number | 'ilimitadas';
  soportaCotizadorIA: boolean;
  soportaWhatsAppIA: boolean;
  soportaRentabilidadAvanzada: boolean;
  soportaAgentesYAutomatizacion: boolean;
  soportaExportacionBoletas: boolean;
  caracteristicas: string[];
  colorAcento: string;
  popular?: boolean;
}

export interface Empresa {
  id: string;
  nombre: string;
  rut: string;
  created_at?: string;
  updated_at?: string;
}

export interface Usuario {
  id: string;
  auth_user_id?: string;
  empresa_id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  telefono_whatsapp: string;
  rut?: string;
  empresa_nombre?: string;
  created_at?: string;
}

export interface Cliente {
  id: string;
  empresa_id: string;
  nombre: string;
  telefono?: string;
  email?: string;
  rut?: string;
  direccion?: string;
  created_at?: string;
}

export interface Proyecto {
  id: string;
  empresa_id: string;
  cliente_id?: string;
  nombre: string;
  descripcion?: string;
  
  // Ubicación Geográfica (Google Maps Chile)
  direccion?: string;
  comuna?: string;
  region?: string;
  latitud?: number;
  longitud?: number;
  lugar_referencia?: string;

  fecha_inicio: string;
  fecha_termino_estimada: string;
  estado: ProjectStatus;
  monto_cotizado: number;
  trabajadores_ids?: string[];
  created_at?: string;
  
  // Relaciones cargadas opcionalmente
  cliente?: Cliente;
  trabajadores?: Usuario[];
  actividades?: Actividad[];
  materiales?: MaterialProyecto[];
  bitacora?: BitacoraEntrada[];
  pagos?: Pago[];
  imprevistos?: Imprevisto[];
  total_pagado?: number;
  total_imprevistos?: number;
  total_materiales?: number;
  saldo_pendiente?: number;
  porcentaje_avance_ponderado?: number;
}

export interface MaterialProyecto {
  id: string;
  proyecto_id: string;
  nombre: string;
  categoria?: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  subtotal: number;
  proveedor?: string;
  comprado: boolean;
  created_at?: string;
}

export interface BitacoraEntrada {
  id: string;
  proyecto_id: string;
  usuario_id?: string;
  autor_nombre: string;
  titulo: string;
  nota: string;
  foto_url?: string;
  fecha: string;
  tipo: 'avance' | 'incidente' | 'clima' | 'entrega_material';
  created_at?: string;
}

export interface Actividad {
  id: string;
  proyecto_id: string;
  nombre: string;
  responsable_id?: string;
  fecha_inicio: string;
  fecha_termino: string;
  porcentaje_avance: number;
  estado: ActivityStatus;
  orden: number;
  created_at?: string;

  // Relaciones
  responsable?: Usuario;
}

export interface Pago {
  id: string;
  proyecto_id: string;
  cliente_id?: string;
  monto: number;
  metodo: PaymentMethod;
  estado?: 'pendiente' | 'completado' | 'anulado';
  fecha: string;
  nota?: string;
  notas?: string;
  comprobante_url?: string;
  created_at?: string;
}

export interface Imprevisto {
  id: string;
  proyecto_id: string;
  actividad_id?: string;
  titulo?: string;
  descripcion: string;
  monto: number;
  monto_adicional?: number;
  estado?: 'pendiente' | 'aprobado' | 'rechazado';
  foto_url?: string;
  fecha: string;
  fecha_reporte?: string;
  origen: ImprevistoOrigin;
  created_at?: string;

  // Relaciones
  actividad?: Actividad;
}

export interface ExtraccionIA {
  actividad_detectada?: string | null;
  avance_porcentaje?: number | null;
  tiene_imprevisto?: boolean;
  imprevisto_descripcion?: string | null;
  imprevisto_monto_estimado?: number | null;
}

export interface ReporteWhatsApp {
  id: string;
  proyecto_id?: string;
  usuario_id?: string;
  mensaje_original?: string;
  transcripcion?: string;
  extraccion_ia: ExtraccionIA;
  estado: ReportStatus;
  fecha: string;
  created_at?: string;

  // Relaciones
  proyecto?: Proyecto;
  usuario?: Usuario;
}

// --- TIPOS PARA COTIZADOR INTELIGENTE & RADAR DE MATERIALES (IA) ---

export interface ItemMaterial {
  nombre: string;
  categoria: string; // 'obra_gruesa' | 'maderas_tableros' | 'techumbre' | 'terminaciones' | 'instalaciones' | 'ferreteria';
  cantidad: number;
  unidad: string; // 'saco' | 'tira' | 'plancha' | 'm2' | 'm3' | 'kg' | 'unidad' | 'litro';
  precio_unitario_estimado: number;
  subtotal: number;
  mejor_tienda: string; // 'Sodimac Constructor' | 'Construmart' | 'Imperial' | 'Red MTS' | 'Easy' | 'Barraca Local';
  precio_mas_barato: number;
  ahorro_estimado: number;
  alternativa_economica?: string;
}

export interface ItemManoObra {
  rol: string; // 'Maestro Mayor' | 'Maestro Carpintero' | 'Albañil' | 'Ayudante / Jornal' | 'Gasfíter' | 'Electricista';
  cantidad_personas: number;
  dias_estimados: number;
  valor_jornal_diario: number;
  subtotal: number;
}

export interface ProveedorComparativa {
  tienda: string;
  categoria_destacada: string;
  nivel_precio: 'mas_barato' | 'promedio' | 'mas_caro' | string;
  descuentos_disponibles?: string;
  ahorro_estimado_total: number;
  ventajas: string[];
}

export interface PartidaGanttSugerida {
  nombre: string;
  dias: number;
  orden: number;
}

export interface EstructuraFinanciera {
  costo_materiales_total: number;
  costo_mano_obra_total: number;
  costo_directo: number;
  gastos_generales_porcentaje: number;
  gastos_generales_monto: number;
  imprevistos_porcentaje: number;
  imprevistos_monto: number;
  margen_utilidad_porcentaje: number;
  margen_utilidad_monto: number;
  precio_sugerido_neto: number;
  iva_19: number;
  precio_total_con_iva: number;
  ahorro_compras_estrategicas: number;
}

export interface RecomendacionCobroCliente {
  precio_minimo_rentable: number;
  precio_sugerido_mercado: number;
  precio_premium_garantia: number;
  estrategia_negociacion: string;
  desglose_por_metro_cuadrado?: number;
  formas_pago_recomendadas: string[];
  justificacion_precio: string;
}

export interface CotizacionEstimacion {
  id: string;
  titulo_proyecto: string;
  tipo_obra: string;
  metros_cuadrados?: number;
  comuna_region: string;
  duracion_dias_estimada: number;
  resumen_ejecutivo: string;
  materiales: ItemMaterial[];
  mano_de_obra: ItemManoObra[];
  estructura_financiera: EstructuraFinanciera;
  radar_proveedores: ProveedorComparativa[];
  actividades_gantt: PartidaGanttSugerida[];
  consejos_experto_pyme: string[];
  recomendacion_cobro?: RecomendacionCobroCliente;
  fecha_creacion: string;
}

export interface MaterialChile {
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precios: {
    construmart?: number;
    imperial?: number;
    sodimac?: number;
    mts?: number;
    barraca?: number;
  };
  mejor_tienda: string;
  precio_minimo: number;
}

export type TipoEventoAgenda =
  | 'visita_terreno'
  | 'reunion_cliente'
  | 'inspeccion_obra'
  | 'vaciado_hormigon'
  | 'entrega_material'
  | 'hito_pago'
  | 'recordatorio';

export interface EventoAgenda {
  id: string;
  titulo: string;
  tipo: TipoEventoAgenda;
  fecha: string; // YYYY-MM-DD
  hora?: string; // HH:MM
  comuna_lugar?: string;
  descripcion?: string;
  proyecto_id?: string;
  proyecto_nombre?: string;
  cliente_nombre?: string;
  completado: boolean;
  origen: 'asistente_ia' | 'manual';
  created_at: string;
}

export type TipoAccionIA =
  | 'crear_proyecto'
  | 'agregar_trabajador'
  | 'asignar_trabajador'
  | 'agendar_visita'
  | 'agendar_evento'
  | 'registrar_pago'
  | 'crear_recordatorio'
  | 'enviar_cotizacion_cliente';

export interface AccionAsistenteIA {
  tipo: TipoAccionIA;
  titulo: string;
  detalles: Record<string, any>;
  resultado_texto: string;
  link_destino?: string;
  link_texto?: string;
  enlace_whatsapp?: string;
  cotizacion?: CotizacionEstimacion;
}

export interface MensajeChatCotizador {
  id: string;
  remitente: 'usuario' | 'agente';
  texto: string;
  timestamp: string;
  sugerencias?: string[];
  accion_ejecutada?: AccionAsistenteIA;
  cotizacion_generada?: CotizacionEstimacion;
}

