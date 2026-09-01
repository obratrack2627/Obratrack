'use client';

import React, { useRef } from 'react';
import {
  Printer,
  X,
  Building2,
  DollarSign,
  FileText,
  MessageCircle,
  HardHat,
} from 'lucide-react';
import { CotizacionEstimacion } from '@/types/database';

interface CotizacionPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  cotizacion: CotizacionEstimacion | null;
  clienteNombre?: string;
  clienteRut?: string;
  clienteTelefono?: string;
  contratistaEmpresa?: string;
  contratistaRut?: string;
  contratistaTelefono?: string;
}

export default function CotizacionPdfModal({
  isOpen,
  onClose,
  cotizacion,
  clienteNombre = 'Carlos Henríquez',
  clienteRut = '15.482.910-3',
  clienteTelefono = '+56 9 8765 4321',
  contratistaEmpresa = 'Constructora & Servicios SpA',
  contratistaRut = '77.892.314-K',
  contratistaTelefono = '+56 9 1234 5678',
}: CotizacionPdfModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !cotizacion) return null;

  const fechaHoy = new Date().toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const folio = cotizacion.id.replace('cot-', 'COT-').slice(0, 12).toUpperCase();

  const precioTotal = cotizacion.estructura_financiera?.precio_total_con_iva || 1500000;
  const precioNeto = cotizacion.estructura_financiera?.precio_sugerido_neto || Math.round(precioTotal / 1.19);
  const iva = cotizacion.estructura_financiera?.iva_19 || Math.round(precioNeto * 0.19);
  const costoDirecto = cotizacion.estructura_financiera?.costo_directo || Math.round(precioNeto * 0.7);
  const gastosGenerales = cotizacion.estructura_financiera?.gastos_generales_monto || Math.round(costoDirecto * 0.1);
  const imprevistos = cotizacion.estructura_financiera?.imprevistos_monto || Math.round(costoDirecto * 0.05);
  const utilidad = cotizacion.estructura_financiera?.margen_utilidad_monto || (precioNeto - costoDirecto - gastosGenerales - imprevistos);

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const resumenTexto = `🏗️ *PROPUESTA FORMAL DE COTIZACIÓN - OBRATRACK*
📄 *Folio:* #${folio}
📅 *Fecha:* ${fechaHoy}

Estimado(a) *${clienteNombre}*, le comparto el presupuesto oficial para:
📌 *Proyecto:* ${cotizacion.titulo_proyecto}
📍 *Ubicación:* ${cotizacion.comuna_region || 'Chile'}
⏱️ *Plazo Estimado:* ${cotizacion.duracion_dias_estimada} días hábiles

💰 *RESUMEN COMERCIAL:*
• Costo Materiales & Cubicaciones: $${(cotizacion.estructura_financiera?.costo_materiales_total || 0).toLocaleString('es-CL')} CLP
• Mano de Obra Cuadrilla Especialista: $${(cotizacion.estructura_financiera?.costo_mano_obra_total || 0).toLocaleString('es-CL')} CLP
• *TOTAL PROPUESTA CON IVA:* *$${precioTotal.toLocaleString('es-CL')} CLP*

📋 *CALENDARIO DE PAGOS:*
1️⃣ 40% Anticipo (Materiales e inicio de faena): $${Math.round(precioTotal * 0.4).toLocaleString('es-CL')} CLP
2️⃣ 30% Avance 50% de obra: $${Math.round(precioTotal * 0.3).toLocaleString('es-CL')} CLP
3️⃣ 20% Terminaciones: $${Math.round(precioTotal * 0.2).toLocaleString('es-CL')} CLP
4️⃣ 10% Recepción y entrega conforme: $${Math.round(precioTotal * 0.1).toLocaleString('es-CL')} CLP

Emitido por: *${contratistaEmpresa}* (Tel: ${contratistaTelefono})
Sistema de Control y Trazabilidad ObraTrack.`;

    const cleanPhone = clienteTelefono.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(resumenTexto)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-navy-950/80 backdrop-blur-sm overflow-y-auto">
      {/* Botones de acción flotantes superiores */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 print:hidden">
        <button
          onClick={handleShareWhatsApp}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-heading font-bold text-xs shadow-xl transition-all cursor-pointer"
        >
          <MessageCircle className="w-4 h-4" />
          <span>Enviar por WhatsApp</span>
        </button>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2.5 bg-obra-orange hover:bg-orange-600 text-white rounded-2xl font-heading font-bold text-xs shadow-xl transition-all cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimir / Descargar PDF</span>
        </button>

        <button
          onClick={onClose}
          className="p-2.5 bg-white/90 hover:bg-white text-navy-900 rounded-2xl shadow-xl transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* DOCUMENTO PDF / HOJA FORMAL MEMBRETADA (Formato Carta / A4) */}
      {/* ========================================================================= */}
      <div
        ref={printAreaRef}
        className="w-full max-w-4xl bg-white text-navy-900 rounded-3xl shadow-2xl overflow-hidden my-8 print:my-0 print:rounded-none print:shadow-none print:w-full print:max-w-none print:text-black font-sans text-xs border border-kraft-200"
      >
        {/* Cabecera Membretada Oficial */}
        <div className="bg-navy-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b-4 border-obra-orange print:bg-navy-900 print:text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-obra-orange flex items-center justify-center text-white shadow-md font-heading font-black text-xl">
              OT
            </div>
            <div>
              <h1 className="font-heading font-black text-xl tracking-tight text-white flex items-center gap-2">
                <span>OBRATRACK</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-orange-200 font-mono">
                  SaaS Chile
                </span>
              </h1>
              <p className="text-[11px] text-gray-300">
                Plataforma de Control de Faenas & Cubicaciones con IA
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right font-mono space-y-1">
            <div className="text-[10px] text-obra-orange font-bold uppercase tracking-widest">
              PROPUESTA OFICIAL DE COTIZACIÓN
            </div>
            <div className="font-heading font-bold text-sm text-white">
              FOLIO: #{folio}
            </div>
            <div className="text-[11px] text-gray-300">
              Fecha de Emisión: {fechaHoy}
            </div>
            <div className="text-[10px] text-emerald-400 font-sans">
              ✓ Validez de la oferta: 15 días corridos
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Bloque de Identificación de Partes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-kraft-50 border border-kraft-200">
            {/* Contratista / Emisor */}
            <div className="space-y-1.5 border-b sm:border-b-0 sm:border-r border-kraft-200 pb-3 sm:pb-0 sm:pr-4">
              <div className="text-[10px] font-mono font-bold uppercase text-obra-orange flex items-center gap-1">
                <HardHat className="w-3.5 h-3.5" />
                <span>DATOS DEL CONTRATISTA (EMISOR)</span>
              </div>
              <div className="font-heading font-bold text-sm text-navy-900">
                {contratistaEmpresa}
              </div>
              <div className="text-gray-600 text-[11px] space-y-0.5 font-mono">
                <p>RUT: {contratistaRut}</p>
                <p>Teléfono: {contratistaTelefono}</p>
                <p>Región: Metropolitana / Cobertura Nacional</p>
              </div>
            </div>

            {/* Mandante / Cliente */}
            <div className="space-y-1.5 sm:pl-2">
              <div className="text-[10px] font-mono font-bold uppercase text-navy-700 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-obra-orange" />
                <span>DATOS DEL MANDANTE (CLIENTE)</span>
              </div>
              <div className="font-heading font-bold text-sm text-navy-900">
                {clienteNombre}
              </div>
              <div className="text-gray-600 text-[11px] space-y-0.5 font-mono">
                <p>RUT: {clienteRut}</p>
                <p>Ubicación: {cotizacion.comuna_region || 'Santiago, Chile'}</p>
                <p>Teléfono: {clienteTelefono}</p>
              </div>
            </div>
          </div>

          {/* Resumen del Proyecto */}
          <div className="space-y-2">
            <h2 className="font-heading font-bold text-sm text-navy-900 flex items-center gap-2 border-b border-kraft-200 pb-1">
              <FileText className="w-4 h-4 text-obra-orange" />
              <span>1. DESCRIPCIÓN & ALCANCE DE LOS TRABAJOS</span>
            </h2>
            <div className="bg-white p-3 rounded-xl border border-kraft-200 text-gray-700 leading-relaxed text-[11px]">
              <p className="font-bold text-navy-900 mb-1">
                Proyecto: {cotizacion.titulo_proyecto} ({cotizacion.metros_cuadrados || 0} m²)
              </p>
              <p>{cotizacion.resumen_ejecutivo || 'Ejecución completa de faena según especificaciones técnicas, cubicación de materiales certificados en distribuidores oficiales y mano de obra calificada.'}</p>
              <p className="mt-2 font-mono text-[10px] text-gray-500">
                • Plazo de ejecución estimado: <strong>{cotizacion.duracion_dias_estimada} días hábiles</strong> a contar del pago de anticipo.
              </p>
            </div>
          </div>

          {/* Tabla de Materiales */}
          <div className="space-y-2">
            <h2 className="font-heading font-bold text-sm text-navy-900 flex items-center justify-between border-b border-kraft-200 pb-1">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-obra-orange" />
                <span>2. CUBICACIÓN Y PRESUPUESTO DE MATERIALES</span>
              </div>
              <span className="text-[10px] font-mono text-gray-500">
                Radar ferreterías chilenas
              </span>
            </h2>

            <div className="overflow-x-auto rounded-xl border border-kraft-200">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-navy-900 text-white font-mono text-[10px] uppercase">
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Material / Insumo Certificado</th>
                    <th className="p-2.5 text-center">Cant.</th>
                    <th className="p-2.5 text-center">Unidad</th>
                    <th className="p-2.5 text-right">P. Unitario</th>
                    <th className="p-2.5 text-right">Subtotal</th>
                    <th className="p-2.5">Proveedor Sugerido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-kraft-100 font-sans">
                  {(cotizacion.materiales || []).map((mat, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-kraft-50/50'}>
                      <td className="p-2 font-mono text-gray-400 text-center">{idx + 1}</td>
                      <td className="p-2 font-medium text-navy-900">{mat.nombre}</td>
                      <td className="p-2 text-center font-mono font-bold">{mat.cantidad}</td>
                      <td className="p-2 text-center font-mono text-gray-600">{mat.unidad}</td>
                      <td className="p-2 text-right font-mono text-gray-600">
                        ${(mat.precio_mas_barato || mat.precio_unitario_estimado || 0).toLocaleString('es-CL')}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-navy-900">
                        ${(mat.subtotal || 0).toLocaleString('es-CL')}
                      </td>
                      <td className="p-2 font-mono text-[10px] text-emerald-700">
                        {mat.mejor_tienda || 'Ferretería Especializada'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-kraft-100 font-heading font-bold text-navy-900">
                    <td colSpan={5} className="p-2.5 text-right font-mono text-xs">
                      SUBTOTAL MATERIALES (NETO):
                    </td>
                    <td className="p-2.5 text-right font-mono text-xs text-navy-950">
                      ${(cotizacion.estructura_financiera?.costo_materiales_total || 0).toLocaleString('es-CL')} CLP
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Tabla de Mano de Obra */}
          <div className="space-y-2">
            <h2 className="font-heading font-bold text-sm text-navy-900 flex items-center justify-between border-b border-kraft-200 pb-1">
              <div className="flex items-center gap-2">
                <HardHat className="w-4 h-4 text-obra-orange" />
                <span>3. MANO DE OBRA & CUADRILLA ESPECIALIZADA</span>
              </div>
              <span className="text-[10px] font-mono text-gray-500">
                Jornales de faena Chile
              </span>
            </h2>

            <div className="overflow-x-auto rounded-xl border border-kraft-200">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-navy-900 text-white font-mono text-[10px] uppercase">
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Especialidad / Rol en Faena</th>
                    <th className="p-2.5 text-center">Cuadrilla</th>
                    <th className="p-2.5 text-center">Días Estimados</th>
                    <th className="p-2.5 text-right">Valor Jornal</th>
                    <th className="p-2.5 text-right">Subtotal Mano Obra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-kraft-100 font-sans">
                  {(cotizacion.mano_de_obra || []).map((mo, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-kraft-50/50'}>
                      <td className="p-2 font-mono text-gray-400 text-center">{idx + 1}</td>
                      <td className="p-2 font-medium text-navy-900">{mo.rol}</td>
                      <td className="p-2 text-center font-mono font-bold">{mo.cantidad_personas} persona(s)</td>
                      <td className="p-2 text-center font-mono text-gray-600">{mo.dias_estimados} días</td>
                      <td className="p-2 text-right font-mono text-gray-600">
                        ${(mo.valor_jornal_diario || 0).toLocaleString('es-CL')}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-navy-900">
                        ${(mo.subtotal || 0).toLocaleString('es-CL')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-kraft-100 font-heading font-bold text-navy-900">
                    <td colSpan={5} className="p-2.5 text-right font-mono text-xs">
                      SUBTOTAL MANO DE OBRA (NETO):
                    </td>
                    <td className="p-2.5 text-right font-mono text-xs text-navy-950">
                      ${(cotizacion.estructura_financiera?.costo_mano_obra_total || 0).toLocaleString('es-CL')} CLP
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Resumen Financiero y Liquidación */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 pt-2">
            {/* Modalidad de Pago */}
            <div className="sm:col-span-7 space-y-3">
              <h3 className="font-heading font-bold text-xs text-navy-900 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-obra-orange" />
                <span>4. CALENDARIO DE PAGOS ACORDADO (40 / 30 / 20 / 10)</span>
              </h3>

              <div className="space-y-2 font-sans text-[11px]">
                <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-between">
                  <div>
                    <strong className="text-orange-950 block">1️⃣ 40% Anticipo Inicial:</strong>
                    <span className="text-gray-600 text-[10px]">Compra de materiales y traslado de cuadrilla</span>
                  </div>
                  <span className="font-mono font-bold text-navy-900">
                    ${Math.round(precioTotal * 0.4).toLocaleString('es-CL')} CLP
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-kraft-50 border border-kraft-200 flex items-center justify-between">
                  <div>
                    <strong className="text-navy-900 block">2️⃣ 30% Avance 50% Obra Gruesa:</strong>
                    <span className="text-gray-600 text-[10px]">Término de estructura base o colocación</span>
                  </div>
                  <span className="font-mono font-bold text-navy-900">
                    ${Math.round(precioTotal * 0.3).toLocaleString('es-CL')} CLP
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-kraft-50 border border-kraft-200 flex items-center justify-between">
                  <div>
                    <strong className="text-navy-900 block">3️⃣ 20% Terminaciones e Instalaciones:</strong>
                    <span className="text-gray-600 text-[10px]">Fraguado, remates finos y pruebas</span>
                  </div>
                  <span className="font-mono font-bold text-navy-900">
                    ${Math.round(precioTotal * 0.2).toLocaleString('es-CL')} CLP
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <div>
                    <strong className="text-emerald-950 block">4️⃣ 10% Recepción Conforme:</strong>
                    <span className="text-gray-600 text-[10px]">Entrega de llaves y conformidad del mandante</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-900">
                    ${Math.round(precioTotal * 0.1).toLocaleString('es-CL')} CLP
                  </span>
                </div>
              </div>
            </div>

            {/* Cuadro de Liquidación Total */}
            <div className="sm:col-span-5 bg-navy-900 text-white p-5 rounded-2xl space-y-3 font-mono text-[11px] print:bg-navy-900 print:text-white">
              <h3 className="font-heading font-bold text-xs text-orange-300 uppercase tracking-widest border-b border-navy-700 pb-1.5">
                LIQUIDACIÓN COMERCIAL
              </h3>

              <div className="space-y-1.5 text-gray-300">
                <div className="flex justify-between">
                  <span>Costos Directos:</span>
                  <span className="text-white">${costoDirecto.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Gastos Generales (10%):</span>
                  <span className="text-white">${gastosGenerales.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Imprevistos de Faena (5%):</span>
                  <span className="text-white">${imprevistos.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Utilidad / Honorarios:</span>
                  <span className="text-white">${utilidad.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-navy-700 font-bold text-white">
                  <span>VALOR NETO:</span>
                  <span>${precioNeto.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>I.V.A. (19%):</span>
                  <span>${iva.toLocaleString('es-CL')}</span>
                </div>
              </div>

              <div className="pt-2 border-t-2 border-obra-orange flex items-center justify-between text-sm font-heading font-black text-white">
                <span>TOTAL PROPUESTA:</span>
                <span className="text-obra-orange text-base">${precioTotal.toLocaleString('es-CL')} CLP</span>
              </div>
            </div>
          </div>

          {/* Firmas de Aceptación */}
          <div className="pt-10 grid grid-cols-2 gap-12 font-mono text-[10px] text-center print:pt-14">
            <div className="border-t border-navy-900 pt-2 space-y-0.5">
              <p className="font-bold text-navy-900">{contratistaEmpresa}</p>
              <p className="text-gray-500">RUT: {contratistaRut} • Firma Contratista</p>
            </div>

            <div className="border-t border-navy-900 pt-2 space-y-0.5">
              <p className="font-bold text-navy-900">{clienteNombre}</p>
              <p className="text-gray-500">RUT: {clienteRut} • Firma de Aceptación Mandante</p>
            </div>
          </div>

          {/* Pie de página con verificación ObraTrack */}
          <div className="pt-6 border-t border-kraft-200 flex items-center justify-between text-[9px] font-mono text-gray-400">
            <span>Generado con ObraTrack Copiloto IA • Google Gemini 2.5/3.7 Engine</span>
            <span>Folio: #{folio} • Validez 15 días</span>
          </div>
        </div>
      </div>
    </div>
  );
}
