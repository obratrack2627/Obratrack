'use client';
import ModalOverlay from '@/components/ModalOverlay';

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  MessageCircle,
  Printer,
  Download,
  X,
} from 'lucide-react';
import Logo from './Logo';
import { dataService } from '@/lib/data-service';
import { calcularEstadoPago } from '@/lib/edp-calculator';
import { formatCLP, formatDate, formatThousands, parseThousands } from '@/lib/utils';
import type {
  Actividad,
  Cliente,
  Pago,
  Proyecto,
  ReclamoCambioObra,
} from '@/types/database';

interface EstadoPagoPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  proyecto: Proyecto;
  cliente?: Cliente | null;
  actividades: Actividad[];
  pagos: Pago[];
  cambios: ReclamoCambioObra[];
  onRegistrarPago?: (monto: number, nota: string) => void;
}

export default function EstadoPagoPdfModal({
  isOpen,
  onClose,
  proyecto,
  cliente,
  actividades,
  pagos,
  cambios,
  onRegistrarPago,
}: EstadoPagoPdfModalProps) {
  const [modoCobro, setModoCobro] = useState<'avance' | 'personalizado'>('avance');
  const [montoCustomInput, setMontoCustomInput] = useState('');
  const [retencionPct, setRetencionPct] = useState<number>(0);
  const [observacionEdp, setObservacionEdp] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const emisor = typeof window !== 'undefined' ? dataService.getActiveUser() : null;

  const resumen = useMemo(() => {
    const customAmount =
      modoCobro === 'personalizado' && montoCustomInput.trim()
        ? parseThousands(montoCustomInput)
        : undefined;
    return calcularEstadoPago({
      proyecto,
      actividades,
      pagos,
      cambios,
      montoPersonalizadoConIva: customAmount,
      retencionPorcentaje: retencionPct,
    });
  }, [proyecto, actividades, pagos, cambios, modoCobro, montoCustomInput, retencionPct]);

  if (!isOpen) return null;

  const fechaEmision = new Date().toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const handleDownload = async () => {
    setDownloading(true); setDownloadError('');
    try {
      const { paymentPdf } = await import('@/lib/payments/pdf');
      paymentPdf({ nombre: proyecto.nombre, cliente: cliente?.nombre || 'Por definir', fecha: fechaEmision, resumen, actividades, observacion: observacionEdp }).save(`ObraTrack_${resumen.folio}_${proyecto.id}.pdf`);
    } catch { setDownloadError('No se pudo descargar el PDF. Reintenta.'); }
    finally { setDownloading(false); }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const cleanPhone = (cliente?.telefono || '').replace(/[^0-9]/g, '');
    const msg =
      `📑 *ESTADO DE PAGO ${resumen.folio} — OBRATRACK*\n` +
      `📅 *Fecha:* ${fechaEmision}\n` +
      `🏗️ *Obra:* ${proyecto.nombre}\n` +
      `👤 *Mandante:* ${cliente?.nombre || 'Cliente Particular'}\n\n` +
      `📊 *Avance promedio de partidas:* ${resumen.porcentajeAvanceFisico}%\n` +
      `💼 *Contrato Vigente (IVA incl.):* ${formatCLP(resumen.montoContratadoVigente)}\n` +
      `✅ *Pagos Anteriores:* ${formatCLP(resumen.totalPagadoAnterior)}\n` +
      (resumen.retencionMonto > 0
        ? `🛡️ *Retención (${resumen.retencionPorcentaje}%):* -${formatCLP(resumen.retencionMonto)}\n`
        : '') +
      `\n💰 *NETO DEL MONTO A PAGAR:* ${formatCLP(resumen.netoPeriodo)}\n` +
      `🏛️ *IVA (19%):* ${formatCLP(resumen.ivaPeriodo)}\n` +
      `🔥 *LÍQUIDO A PAGAR EN ESTE EDP:* *${formatCLP(resumen.liquidoAPagarConIva)}*\n` +
      `📌 *Saldo restante tras este pago:* ${formatCLP(resumen.saldoRemanenteTrasEdp)}\n` +
      (observacionEdp.trim() ? `\n📝 *Nota:* ${observacionEdp.trim()}\n` : '') +
      `\nEmitido por ${emisor?.empresa_nombre || 'Constructora'} en ObraTrack.`;
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleRegistrarIngreso = () => {
    if (!onRegistrarPago || resumen.liquidoAPagarConIva <= 0) return;
    const glosa = `${resumen.folio} (${resumen.porcentajeAvanceFisico}% avance)${
      observacionEdp.trim() ? ` - ${observacionEdp.trim()}` : ''
    }`;
    onRegistrarPago(resumen.liquidoAPagarConIva, glosa);
    onClose();
  };

  return (
    <ModalOverlay onClose={onClose}
      id="obratrack-edp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Estado de Pago de Obra"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-navy-950/80 backdrop-blur-sm overflow-y-auto"
    >
      <style jsx global>{`
        @media print {
          body > *:not(#obratrack-edp-overlay) {
            display: none !important;
          }
          #obratrack-edp-overlay {
            position: static !important;
            display: block !important;
            overflow: visible !important;
            height: auto !important;
            background: white !important;
            padding: 0 !important;
            backdrop-filter: none !important;
          }
          #obratrack-edp-pdf {
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            margin: 0 !important;
            background: white !important;
            color: #111827 !important;
          }
          #obratrack-edp-pdf tr {
            break-inside: avoid;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-4xl my-auto rounded-2xl overflow-hidden shadow-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] max-h-[92dvh] flex flex-col">
        {downloadError && <p role="alert" className="p-3 text-red-700 bg-red-50">{downloadError}</p>}
        {/* Barra Superior Interactiva (Oculta al imprimir) */}
        <div className="print:hidden px-4 sm:px-6 py-3.5 bg-[#141A23] text-white border-b border-[#263040] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading font-bold text-sm sm:text-base flex items-center gap-2 text-white">
              <FileSpreadsheet className="w-4 h-4 text-[#FF6A00]" />
              <span>Generador de Estado de Pago ({resumen.folio})</span>
            </h3>
            <p className="text-[11px] text-gray-300">
              Ajusta el cobro y descarga el PDF para el mandante.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF6A00] hover:bg-[#e55f00] text-white text-xs font-bold shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'Generando…' : 'Descargar PDF'}</span>
            </button>
            <button type="button" onClick={handlePrint} className="p-2 rounded-lg bg-white/10" aria-label="Imprimir estado de pago"><Printer className="w-4 h-4" /></button>
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#1fb855] text-white text-xs font-bold shadow-sm transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
            {onRegistrarPago && resumen.liquidoAPagarConIva > 0 && (
              <button
                type="button"
                onClick={handleRegistrarIngreso}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#6B8F72] hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Registrar como Pagado</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar modal de Estado de Pago"
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Controles rápidos de configuración del EDP (Ocultos al imprimir) */}
        <div className="print:hidden px-4 sm:px-6 py-3 bg-kraft-100 dark:bg-[#0B0F14] border-b border-kraft-200 dark:border-[#263040] grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-mono font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Modalidad de Cobro
            </label>
            <select
              value={modoCobro}
              onChange={(e) => {
                const next = e.target.value as 'avance' | 'personalizado';
                setModoCobro(next);
                if (next === 'personalizado' && !montoCustomInput) {
                  setMontoCustomInput(formatThousands(resumen.cobroSugeridoSegunAvance));
                }
              }}
              className="w-full rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] px-2.5 py-1.5 text-xs"
            >
              <option value="avance">Según Avance Gantt ({resumen.porcentajeAvanceFisico}%)</option>
              <option value="personalizado">Monto Pactado Manual</option>
            </select>
          </div>

          <div>
            <label className="block font-mono font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Monto Bruto EDP (CLP)
            </label>
            <input
              type="text"
              disabled={modoCobro !== 'personalizado'}
              value={
                modoCobro === 'personalizado'
                  ? montoCustomInput
                  : formatThousands(resumen.cobroSugeridoSegunAvance)
              }
              onChange={(e) => setMontoCustomInput(formatThousands(e.target.value))}
              className="w-full rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] px-2.5 py-1.5 font-mono font-bold text-xs disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block font-mono font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Retención Garantía
            </label>
            <select
              value={retencionPct}
              onChange={(e) => setRetencionPct(Number(e.target.value))}
              className="w-full rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] px-2.5 py-1.5 text-xs font-mono"
            >
              <option value={0}>0% (Sin retención)</option>
              <option value={5}>5% Retención</option>
              <option value={10}>10% Retención</option>
            </select>
          </div>

          <div>
            <label className="block font-mono font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Glosa / Hito de Cobro
            </label>
            <input
              type="text"
              placeholder="Ej: Término obra gruesa"
              value={observacionEdp}
              onChange={(e) => setObservacionEdp(e.target.value)}
              className="w-full rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] px-2.5 py-1.5 text-xs"
            />
          </div>
        </div>

        {/* Hoja Imprimible A4 (Siempre fondo papel claro para PDF limpio) */}
        <div className="overflow-y-auto p-3 sm:p-6 bg-gray-100 dark:bg-[#0B0F14] print:p-0 print:bg-white">
          <div
            id="obratrack-edp-pdf"
            style={{ backgroundColor: '#ffffff', color: '#111827' }}
            className="pdf-paper mx-auto max-w-3xl bg-white text-gray-900 rounded-xl shadow-md p-6 sm:p-8 space-y-6 border border-gray-200"
          >
            {/* Encabezado Documento */}
            <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b-2 border-[#FF6A00]">
              <div className="space-y-1">
                <Logo size="md" theme="light" />
                <p className="text-xs font-bold text-gray-800 pt-1">
                  {emisor?.empresa_nombre || 'Constructora ObraTrack'}
                </p>
                {emisor?.rut && (
                  <p className="text-[11px] font-mono text-gray-600">RUT: {emisor.rut}</p>
                )}
                {emisor?.email && (
                  <p className="text-[11px] text-gray-600">Contacto: {emisor.email}</p>
                )}
              </div>

              <div className="text-right bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                <p className="text-[11px] font-mono uppercase tracking-wider text-[#FF6A00] font-bold">
                  ESTADO DE PAGO DE OBRA
                </p>
                <p className="text-xl font-mono font-extrabold text-gray-900 mt-0.5">
                  N.° {resumen.folio}
                </p>
                <p className="text-[11px] font-mono text-gray-600 mt-1">
                  Fecha emisión: {fechaEmision}
                </p>
              </div>
            </div>

            {/* Ficha Mandante y Obra */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase font-bold text-gray-500">
                  Datos de la Obra
                </p>
                <p className="font-bold text-sm text-gray-900">{proyecto.nombre}</p>
                <p className="text-gray-700">
                  Ubicación:{' '}
                  {[proyecto.direccion, proyecto.comuna, proyecto.region]
                    .filter(Boolean)
                    .join(', ') || 'Chile'}
                </p>
                <p className="font-mono text-gray-600">
                  Plazo: {formatDate(proyecto.fecha_inicio)} al{' '}
                  {formatDate(proyecto.fecha_termino_estimada)}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase font-bold text-gray-500">
                  Mandante / Cliente
                </p>
                <p className="font-bold text-sm text-gray-900">
                  {cliente?.nombre || 'Cliente Particular'}
                </p>
                {cliente?.rut && <p className="font-mono text-gray-700">RUT: {cliente.rut}</p>}
                {cliente?.telefono && <p className="text-gray-700">Tel: {cliente.telefono}</p>}
                {cliente?.email && <p className="text-gray-700">Email: {cliente.email}</p>}
              </div>
            </div>

            {/* Detalle de Avance por Partida (Carta Gantt) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-mono uppercase font-bold text-gray-800">
                  1. Respaldo de Avance Físico de Partidas
                </h4>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Avance Ponderado Total: {resumen.porcentajeAvanceFisico}%
                </span>
              </div>

              {actividades.length === 0 ? (
                <p className="text-xs text-gray-500 border rounded-lg p-3">
                  Avance general reportado en obra: {resumen.porcentajeAvanceFisico}%.
                </p>
              ) : (
                <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                  <thead style={{ backgroundColor: '#141A23', color: '#ffffff' }}>
                    <tr>
                      <th className="p-2 text-left font-semibold">#</th>
                      <th className="p-2 text-left font-semibold">Partida / Hito Constructivo</th>
                      <th className="p-2 text-left font-semibold">Estado</th>
                      <th className="p-2 text-right font-semibold">% Avance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actividades.map((act, idx) => (
                      <tr key={act.id} className="border-t border-gray-200">
                        <td className="p-2 font-mono text-gray-500">{idx + 1}</td>
                        <td className="p-2 font-medium text-gray-900">{act.nombre}</td>
                        <td className="p-2 capitalize text-gray-600">
                          {act.estado.replace('_', ' ')}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-gray-900">
                          {act.porcentaje_avance}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Cuadro Financiero del Estado de Pago */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="space-y-2 text-xs bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h4 className="font-mono uppercase font-bold text-gray-700">
                  2. Historial Contractual
                </h4>
                <div className="flex justify-between">
                  <span className="text-gray-600">Presupuesto Vigente (IVA incl.):</span>
                  <span className="font-mono font-bold text-gray-900">
                    {formatCLP(resumen.montoContratadoVigente)}
                  </span>
                </div>
                {resumen.adicionalesAprobadosCantidad > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>
                      Incluye {resumen.adicionalesAprobadosCantidad} adicional(es) aprobado(s):
                    </span>
                    <span className="font-mono">
                      {formatCLP(resumen.adicionalesAprobadosMonto)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Valorización Avance ({resumen.porcentajeAvanceFisico}%):
                  </span>
                  <span className="font-mono font-semibold text-gray-900">
                    {formatCLP(resumen.valorAvanceAcumulado)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Menos Pagos / Anticipos Previos:</span>
                  <span className="font-mono font-semibold text-emerald-700">
                    -{formatCLP(resumen.totalPagadoAnterior)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-300 font-bold">
                  <span className="text-gray-800">Saldo tras este Estado de Pago:</span>
                  <span className="font-mono text-gray-900">
                    {formatCLP(resumen.saldoRemanenteTrasEdp)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs bg-orange-50/70 p-4 rounded-xl border-2 border-[#FF6A00]/40">
                <h4 className="font-mono uppercase font-bold text-[#FF6A00]">
                  3. Liquidación Período Actual ({resumen.folio})
                </h4>
                <div className="flex justify-between">
                  <span className="text-gray-700">Monto Bruto Estado de Pago:</span>
                  <span className="font-mono font-semibold text-gray-900">
                    {formatCLP(resumen.montoBrutoPeriodoConIva)}
                  </span>
                </div>
                {resumen.retencionMonto > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <span>Retención de Garantía ({resumen.retencionPorcentaje}%):</span>
                    <span className="font-mono">-{formatCLP(resumen.retencionMonto)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-orange-200">
                  <span className="text-gray-700">Neto del monto a pagar:</span>
                  <span className="font-mono text-gray-900">{formatCLP(resumen.netoPeriodo)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">IVA (19%):</span>
                  <span className="font-mono text-gray-900">{formatCLP(resumen.ivaPeriodo)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t-2 border-[#FF6A00] text-sm font-extrabold">
                  <span className="text-gray-900">TOTAL LÍQUIDO A PAGAR:</span>
                  <span className="font-mono text-[#FF6A00]">
                    {formatCLP(resumen.liquidoAPagarConIva)}
                  </span>
                </div>
              </div>
            </div>

            {observacionEdp.trim() && (
              <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3">
                <span className="font-mono font-bold uppercase text-gray-600">Observaciones: </span>
                <span className="text-gray-800">{observacionEdp.trim()}</span>
              </div>
            )}

            {/* Firmas de Conformidad */}
            <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs text-gray-600">
              <div className="border-t border-gray-400 pt-2">
                <p className="font-bold text-gray-900">
                  {emisor?.empresa_nombre || 'Contratista / Constructora'}
                </p>
                <p>Firma y Timbre Emisor</p>
              </div>
              <div className="border-t border-gray-400 pt-2">
                <p className="font-bold text-gray-900">
                  {cliente?.nombre || 'Mandante / Recepción Conforme'}
                </p>
                <p>Aprobación Estado de Pago {resumen.folio}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
