import type { PaymentMethod } from "./database";

export const CATEGORIAS = [
  "Materiales",
  "Mano de obra",
  "Transporte",
  "Herramientas",
  "Maquinaria",
  "Servicios externos",
  "Otros",
] as const;
export type CategoriaCosto = (typeof CATEGORIAS)[number];
export const ESTADOS_COTIZACION = [
  "Borrador",
  "Enviada",
  "Modificada",
  "Aprobada",
  "Rechazada",
] as const;
export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];
export const ETAPAS_OBRA = [
  "Esperando anticipo",
  "Planificación",
  "En ejecución",
  "Terminaciones",
  "Pendiente de pago",
  "Finalizada",
] as const;
export type EtapaObra = (typeof ETAPAS_OBRA)[number];
export interface LineaCotizacion {
  id: string;
  partida: string;
  descripcion: string;
  categoria: CategoriaCosto;
  cantidad: number;
  unidad: string;
  precio: number;
}
export interface CotizacionObra {
  id: string;
  empresa_id: string;
  cliente_id: string;
  titulo: string;
  direccion: string;
  fecha: string;
  visita: string;
  observaciones: string;
  estado: EstadoCotizacion;
  lineas: LineaCotizacion[];
  margen: number;
  iva: boolean;
  condiciones_pago: string;
  fecha_inicio: string;
  fecha_termino: string;
  proyecto_id?: string;
  revision: number;
  updated_at: string;
}
export interface GastoObra {
  id: string;
  fecha: string;
  proveedor: string;
  monto: number;
  categoria: CategoriaCosto;
  partida: string;
  descripcion: string;
  metodo: PaymentMethod;
  comprobante?: string;
}
export interface JornadaObra {
  id: string;
  trabajador_id: string;
  trabajador: string;
  fecha: string;
  jornadas: number;
  valor_diario: number;
  actividad: string;
}
export interface AdicionalObra {
  id: string;
  descripcion: string;
  materiales: number;
  mano_obra: number;
  fecha: string;
  estado: "Borrador" | "Enviado" | "Aprobado" | "Ejecutado" | "Cobrado";
  aprobacion: string;
}
export interface EstadoPagoObra {
  id: string;
  numero: number;
  fecha: string;
  vencimiento: string;
  monto: number;
  motivo: string;
  avance: number;
  estado: "Pendiente" | "Solicitado" | "Pagado";
  fecha_pago?: string;
  comprobante?: string;
}
export interface ActividadObra {
  id: string;
  partida: string;
  nombre: string;
  responsable_id: string;
  inicio: string;
  termino: string;
  avance: number;
  costo: number;
  observaciones: string;
  estado: "Pendiente" | "En ejecución" | "Terminada" | "Bloqueada";
}
export interface RegistroObra {
  id: string;
  fecha: string;
  partida: string;
  actividad_id: string;
  descripcion: string;
  observaciones: string;
  fotos: string[];
}
export interface GestionObra {
  proyecto_id: string;
  empresa_id: string;
  etapa: EtapaObra;
  gastos: GastoObra[];
  jornadas: JornadaObra[];
  adicionales: AdicionalObra[];
  estados_pago: EstadoPagoObra[];
  actividades: ActividadObra[];
  bitacora: RegistroObra[];
  cierre?: {
    fecha: string;
    observaciones: string;
    documentos: string[];
    resumen?: {
      contrato: number;
      adicionales: number;
      valor: number;
      recibido: number;
      saldo: number;
      gastos: number;
      manoObra: number;
      utilidad: number;
      caja: number;
      credito: number;
      avance: number;
      avanceFinanciero: number;
      utilidadProyectada: number;
      desfase: boolean;
    };
  };
  revision: number;
  updated_at: string;
}
