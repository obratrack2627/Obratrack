import type {
  Actividad,
  Pago,
  Proyecto,
  ReclamoCambioObra,
} from '@/types/database';

export interface CalculoEstadoPagoInput {
  proyecto: Pick<Proyecto, 'id' | 'nombre' | 'monto_cotizado' | 'porcentaje_avance_ponderado'>;
  actividades?: Actividad[];
  pagos?: Pago[];
  cambios?: ReclamoCambioObra[];
  montoPersonalizadoConIva?: number;
  retencionPorcentaje?: number;
}

export interface ResumenEstadoPago {
  numeroCorrelativo: number;
  folio: string;
  montoContratadoVigente: number;
  adicionalesAprobadosMonto: number;
  adicionalesAprobadosCantidad: number;
  porcentajeAvanceFisico: number;
  valorAvanceAcumulado: number;
  totalPagadoAnterior: number;
  saldoPendienteContrato: number;
  cobroSugeridoSegunAvance: number;
  montoBrutoPeriodoConIva: number;
  retencionPorcentaje: number;
  retencionMonto: number;
  liquidoAPagarConIva: number;
  netoPeriodo: number;
  ivaPeriodo: number;
  saldoRemanenteTrasEdp: number;
}

/**
 * Calcula de forma determinística el Estado de Pago (EDP) de una obra en CLP (sin decimales),
 * considerando avance físico de Carta Gantt, pagos anteriores, adicionales aprobados, retención opcional e IVA 19%.
 */
export function calcularEstadoPago(input: CalculoEstadoPagoInput): ResumenEstadoPago {
  const {
    proyecto,
    actividades = [],
    pagos = [],
    cambios = [],
    montoPersonalizadoConIva,
    retencionPorcentaje = 0,
  } = input;

  const pagosValidos = pagos.filter((p) => p.estado !== 'anulado');
  const numeroCorrelativo = pagosValidos.length + 1;
  const folio = `EDP-${String(numeroCorrelativo).padStart(3, '0')}`;

  const montoContratadoVigente = Math.max(0, Math.round(Number(proyecto.monto_cotizado) || 0));

  const cambiosAprobados = cambios.filter((c) => c.estado === 'aprobado' && Number(c.impacto_monto) > 0);
  const adicionalesAprobadosMonto = cambiosAprobados.reduce(
    (sum, c) => sum + Math.round(Number(c.impacto_monto) || 0),
    0
  );

  let porcentajeAvanceFisico = Math.max(
    0,
    Math.min(100, Math.round(Number(proyecto.porcentaje_avance_ponderado) || 0))
  );
  if (actividades.length > 0) {
    const sumAvance = actividades.reduce(
      (acc, act) => acc + Math.max(0, Math.min(100, Number(act.porcentaje_avance) || 0)),
      0
    );
    porcentajeAvanceFisico = Math.round(sumAvance / actividades.length);
  }

  const totalPagadoAnterior = pagosValidos.reduce(
    (sum, p) => sum + Math.max(0, Math.round(Number(p.monto) || 0)),
    0
  );

  const saldoPendienteContrato = Math.max(0, montoContratadoVigente - totalPagadoAnterior);
  const valorAvanceAcumulado = Math.round((montoContratadoVigente * porcentajeAvanceFisico) / 100);

  const cobroSegunAvanceRaw = Math.max(0, valorAvanceAcumulado - totalPagadoAnterior);
  const cobroSugeridoSegunAvance =
    cobroSegunAvanceRaw > 0
      ? Math.min(saldoPendienteContrato, cobroSegunAvanceRaw)
      : saldoPendienteContrato;

  const montoBaseSeleccionado =
    typeof montoPersonalizadoConIva === 'number' && Number.isFinite(montoPersonalizadoConIva) && montoPersonalizadoConIva >= 0
      ? Math.min(saldoPendienteContrato, Math.round(montoPersonalizadoConIva))
      : cobroSugeridoSegunAvance;

  const retencionPct = Math.max(0, Math.min(20, Number(retencionPorcentaje) || 0));
  const retencionMonto = Math.round((montoBaseSeleccionado * retencionPct) / 100);
  const liquidoAPagarConIva = Math.max(0, montoBaseSeleccionado - retencionMonto);

  const netoPeriodo = Math.round(liquidoAPagarConIva / 1.19);
  const ivaPeriodo = Math.max(0, liquidoAPagarConIva - netoPeriodo);
  const saldoRemanenteTrasEdp = Math.max(0, saldoPendienteContrato - liquidoAPagarConIva);

  return {
    numeroCorrelativo,
    folio,
    montoContratadoVigente,
    adicionalesAprobadosMonto,
    adicionalesAprobadosCantidad: cambiosAprobados.length,
    porcentajeAvanceFisico,
    valorAvanceAcumulado,
    totalPagadoAnterior,
    saldoPendienteContrato,
    cobroSugeridoSegunAvance,
    montoBrutoPeriodoConIva: montoBaseSeleccionado,
    retencionPorcentaje: retencionPct,
    retencionMonto,
    liquidoAPagarConIva,
    netoPeriodo,
    ivaPeriodo,
    saldoRemanenteTrasEdp,
  };
}
