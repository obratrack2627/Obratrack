/**
 * ObraTrack - TypeScript Definitions
 * Interfaces para el modelo de datos de Supabase (PostgreSQL 17)
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
  plan_id?: SubscriptionPlanId;
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
  is_dev?: boolean;
  created_at?: string;
}

export interface Cliente {
  id: string;
  empresa_id?: string;
  nombre: string;
  telefono?: string;
  email?: string;
  rut?: string;
  direccion?: string;
  comuna?: string;
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
  reclamos_cambios?: ReclamoCambioObra[];
  documentos?: DocumentoObra[];
  asistencias?: AsistenciaObrero[];
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
  tipo_evento?:
    | 'avance'
    | 'nota'
    | 'aviso'
    | 'incidente'
    | 'accidente'
    | 'solicitud_cambio'
    | 'asistencia'
    | 'consulta_cliente'
    | null;
  prioridad?: 'baja' | 'media' | 'alta' | 'critica' | null;
  materiales_sugeridos?: Array<{
    nombre: string;
    cantidad: number;
    unidad: string;
    precio_unitario: number;
  }>;
  estado_asistencia?: 'presente' | 'atraso' | 'ausente' | 'licencia' | 'permiso' | null;
  hora_entrada?: string | null;
  resumen_ia?: string | null;
}

export interface ReporteWhatsApp {
  id: string;
  proyecto_id?: string;
  empresa_id?: string;
  usuario_id?: string;
  remitente_tipo?: 'obrero' | 'cliente';
  telefono_remitente?: string;
  nombre_remitente?: string;
  mensaje_original?: string;
  transcripcion?: string;
  foto_url?: string;
  respuesta_ia?: string;
  modulo_afectado?: string;
  extraccion_ia: ExtraccionIA;
  estado: ReportStatus;
  fecha: string;
  created_at?: string;

  // Relaciones
  proyecto?: Proyecto;
  usuario?: Usuario;
}

// --- MÓDULO: RECLAMOS, INCIDENCIAS Y SOLICITUDES DE CAMBIO POR OBRA ---

export type TipoReclamoCambio = 'solicitud_cambio' | 'reclamo' | 'incidente' | 'accidente';
export type PrioridadReclamoCambio = 'baja' | 'media' | 'alta' | 'critica';
export type EstadoReclamoCambio = 'pendiente' | 'en_revision' | 'aprobado' | 'rechazado' | 'resuelto';

export interface MaterialRequeridoCambio {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  subtotal: number;
}

export interface ReclamoCambioObra {
  id: string;
  proyecto_id: string;
  empresa_id?: string;
  reportado_por_usuario_id?: string;
  cliente_id?: string;
  tipo: TipoReclamoCambio;
  prioridad: PrioridadReclamoCambio;
  estado: EstadoReclamoCambio;
  titulo: string;
  descripcion: string;
  solicitado_por?: string;
  impacto_monto: number;
  impacto_dias: number;
  materiales_requeridos: MaterialRequeridoCambio[];
  materiales_inyectados: boolean;
  foto_url?: string;
  origen: 'web' | 'whatsapp_ia' | 'cliente';
  resolucion_notas?: string;
  fecha: string;
  created_at?: string;
}

// --- MÓDULO: REPOSITORIO DOCUMENTAL POR OBRA ---

export type CategoriaDocumentoObra =
  | 'contrato'
  | 'plano'
  | 'factura_boleta'
  | 'correo'
  | 'permiso_normativa'
  | 'otro';

export interface DocumentoObra {
  id: string;
  proyecto_id: string;
  empresa_id?: string;
  subido_por_id?: string;
  subido_por_nombre?: string;
  categoria: CategoriaDocumentoObra;
  nombre: string;
  descripcion?: string;
  archivo_url?: string;
  archivo_nombre?: string;
  archivo_tamano?: number;
  mime_type?: string;
  numero_documento?: string;
  proveedor_entidad?: string;
  monto_documento?: number;
  correo_remitente?: string;
  correo_destinatario?: string;
  correo_asunto?: string;
  correo_cuerpo?: string;
  fecha_documento: string;
  created_at?: string;
}

// --- MÓDULO: CONTROL DE ASISTENCIA DE OBREROS ---

export type EstadoAsistencia = 'presente' | 'atraso' | 'ausente' | 'licencia' | 'permiso';

export interface AsistenciaObrero {
  id: string;
  proyecto_id: string;
  empresa_id?: string;
  usuario_id?: string;
  trabajador_nombre: string;
  trabajador_rol?: string;
  fecha: string; // YYYY-MM-DD
  estado: EstadoAsistencia;
  hora_entrada?: string; // HH:MM
  hora_salida?: string; // HH:MM
  horas_trabajadas?: number;
  observacion?: string;
  origen: 'web' | 'whatsapp_ia';
  registrado_por?: string;
  created_at?: string;
}

// --- TIPOS PARA COTIZADOR INTELIGENTE & RADAR DE MATERIALES (IA) ---

export interface ItemMaterial {
  nombre: string;
  categoria: string;
  cantidad: number;
  unidad: string;
  precio_unitario_estimado: number;
  subtotal: number;
  mejor_tienda: string;
  precio_mas_barato: number;
  ahorro_estimado: number;
  alternativa_economica?: string;
}

export interface ItemManoObra {
  rol: string;
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
  cliente_id?: string;
  cliente_nombre?: string;
  cliente_telefono?: string;
  condiciones_pago?: string;
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
  empresa_id?: string;
  usuario_id?: string;
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
  created_at?: string;
}

export type TipoAccionIA =
  | 'crear_proyecto'
  | 'crear_proyecto_completo'
  | 'actualizar_proyecto'
  | 'eliminar_proyecto'
  | 'crear_cliente'
  | 'actualizar_cliente'
  | 'agregar_trabajador'
  | 'asignar_trabajador'
  | 'desasignar_trabajador'
  | 'agendar_visita'
  | 'agendar_evento'
  | 'registrar_pago'
  | 'crear_recordatorio'
  | 'enviar_cotizacion_cliente'
  | 'crear_actividad'
  | 'actualizar_avance'
  | 'registrar_imprevisto'
  | 'agregar_material'
  | 'agregar_materiales'
  | 'crear_bitacora'
  | 'crear_solicitud_cambio'
  | 'registrar_asistencia'
  | 'registrar_documento'
  | 'generar_reporte'
  | 'generar_mensaje_whatsapp'
  | 'enviar_mensaje_equipo'
  | 'solicitar_datos_obra'
  | 'lote_acciones';

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
  pendiente_sincronizacion?: string;
}

export interface MensajeChatProyecto {
  id: string;
  proyecto_id: string;
  empresa_id: string;
  remitente: 'usuario' | 'agente';
  texto: string;
  sugerencias?: string[];
  cotizacion_generada?: CotizacionEstimacion;
  pendiente_sincronizacion?: string;
  accion_ejecutada?: AccionAsistenteIA;
  created_at: string;
}
