'use client';

import React, { useRef, useState } from 'react';
import {
  Download,
  Printer,
  X,
  MessageCircle,
  User,
  Briefcase,
  FileText,
  DollarSign,
  MapPin,
  Phone,
  Mail,
  Globe,
  Loader2,
} from 'lucide-react';
import { CotizacionEstimacion } from '@/types/database';
import Logo from './Logo';

interface CotizacionPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  cotizacion: CotizacionEstimacion | null;
  clienteNombre?: string;
  clienteContacto?: string;
  clienteEmail?: string;
  clienteTelefono?: string;
}

export default function CotizacionPdfModal({
  isOpen,
  onClose,
  cotizacion,
  clienteNombre = 'Carlos Henríquez',
  clienteContacto = 'Ing. Juan Pérez',
  clienteEmail = 'juan.perez@constructora.com',
  clienteTelefono = '+56 9 8765 4321',
}: CotizacionPdfModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  if (!isOpen || !cotizacion) return null;

  const fechaHoy = new Date();
  const fechaEmision = fechaHoy.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const fechaValidezObj = new Date(fechaHoy.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fechaValidez = fechaValidezObj.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const folioNum = cotizacion.id.replace(/\D/g, '').slice(-6).padStart(6, '0') || '298506';

  const totalConIva = cotizacion.estructura_financiera?.precio_total_con_iva || 720818;
  const subtotalNeto = cotizacion.estructura_financiera?.precio_sugerido_neto || Math.round(totalConIva / 1.19);
  const iva = cotizacion.estructura_financiera?.iva_19 || Math.round(subtotalNeto * 0.19);

  // Unificar partidas combinando materiales y mano de obra
  const partidasItems: Array<{
    nombre: string;
    descripcion: string;
    unidad: string;
    cantidad: number | string;
    precioUnit: number;
    total: number;
  }> = [];

  (cotizacion.materiales || []).forEach((mat) => {
    partidasItems.push({
      nombre: mat.nombre,
      descripcion: mat.alternativa_economica || `Material certificado en ${mat.mejor_tienda || 'Construmart'}`,
      unidad: mat.unidad || 'un',
      cantidad: mat.cantidad || 1,
      precioUnit: mat.precio_mas_barato || mat.precio_unitario_estimado || 0,
      total: mat.subtotal || 0,
    });
  });

  (cotizacion.mano_de_obra || []).forEach((mo) => {
    partidasItems.push({
      nombre: `Mano de Obra: ${mo.rol}`,
      descripcion: `Cuadrilla de ${mo.cantidad_personas} persona(s) por ${mo.dias_estimados} días`,
      unidad: 'gl',
      cantidad: 1,
      precioUnit: mo.subtotal || 0,
      total: mo.subtotal || 0,
    });
  });

  // Si no hay partidas suficientes, poblar con las partidas de la cotización
  if (partidasItems.length === 0) {
    partidasItems.push({
      nombre: cotizacion.titulo_proyecto,
      descripcion: cotizacion.resumen_ejecutivo,
      unidad: 'gl',
      cantidad: 1,
      precioUnit: subtotalNeto,
      total: subtotalNeto,
    });
  }

  // Carga dinámica de html2pdf.js desde CDN para exportar el PDF con exactitud visual 1:1
  const loadHtml2Pdf = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).html2pdf) {
        return resolve((window as any).html2pdf);
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.integrity = 'sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd47TXJWtAtUnHg40H9g50HDA50zyNDkcFIcGT8GTSajGCUgYOcxCpCSFZFYg==';
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve((window as any).html2pdf);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Descarga directa del archivo PDF preservando todos los colores, logo y banner naranja
  const handleDownloadPdf = async () => {
    if (!printAreaRef.current) return;
    setIsGeneratingPdf(true);

    try {
      const html2pdf = await loadHtml2Pdf();
      const element = printAreaRef.current;
      const opt = {
        margin: [4, 4, 4, 4], // mm
        filename: `Cotizacion_ObraTrack_${folioNum}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          scrollY: 0,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
        },
      };

      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.warn('html2pdf fallback to print dialog:', err);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const cleanPhone = clienteTelefono.replace(/[^0-9]/g, '');
    const msg = `🏗️ *COTIZACIÓN OFICIAL OBRATRACK*\n📄 *N.°:* ${folioNum}\n📅 *Fecha:* ${fechaEmision}\n\nEstimado(a) *${clienteNombre}*,\nLe compartimos la propuesta formal para:\n📌 *${cotizacion.titulo_proyecto}*\n📍 *Ubicación:* ${cotizacion.comuna_region || 'Santiago, Chile'}\n\n💰 *SUBTOTAL:* $${subtotalNeto.toLocaleString('es-CL')}\n🏛️ *IVA (19%):* $${iva.toLocaleString('es-CL')}\n🔥 *TOTAL:* *$${totalConIva.toLocaleString('es-CL')} CLP*\n\n📋 *Condiciones de pago:* 40% anticipo • 30% en ejecución • 30% contra entrega conforme.\n\nEmitido por ObraTrack.`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-navy-950/80 backdrop-blur-sm overflow-y-auto">
      {/* Reglas de impresión para forzar colores y fondos exactos */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            background: white !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Botones de acción flotantes (ocultos al imprimir) */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 print:hidden">
        <button
          onClick={handleShareWhatsApp}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl font-heading font-bold text-xs shadow-lg transition-all cursor-pointer"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Enviar por WhatsApp</span>
        </button>

        <button
          onClick={handleDownloadPdf}
          disabled={isGeneratingPdf}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white rounded-xl font-heading font-bold text-xs shadow-lg transition-all cursor-pointer disabled:opacity-75"
        >
          {isGeneratingPdf ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span>{isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
        </button>

        <button
          onClick={handlePrint}
          className="hidden sm:flex items-center gap-2 px-3 py-2.5 bg-navy-800 hover:bg-navy-700 text-white rounded-xl font-heading font-bold text-xs shadow-lg transition-all cursor-pointer"
          title="Imprimir"
        >
          <Printer className="w-4 h-4" />
        </button>

        <button
          onClick={onClose}
          className="p-2.5 bg-white/95 hover:bg-white text-gray-800 rounded-xl shadow-lg transition-all cursor-pointer"
          title="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* DOCUMENTO FORMAL DE COTIZACIÓN - IDENTIDAD VISUAL 1:1 OBRATRACK */}
      {/* ========================================================================= */}
      <div
        ref={printAreaRef}
        id="obratrack-cotizacion-pdf"
        className="w-full max-w-4xl bg-white text-gray-900 rounded-2xl shadow-2xl overflow-hidden my-6 p-6 sm:p-10 border border-gray-200 font-sans print:m-0 print:p-8 print:shadow-none print:w-full print:max-w-none print:rounded-none print:border-none"
      >
        {/* Encabezado: Logo ObraTrack a la izquierda | Folio & Fecha a la derecha */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-gray-100">
          <div className="flex-1">
            <Logo variant="horizontal" withDescriptor={true} size="md" />
          </div>

          <div className="border-l-2 border-[#FF6A00] pl-5 sm:pl-6 text-left sm:text-right min-w-[200px]">
            <h1 className="font-heading font-black text-2xl sm:text-3xl tracking-wide text-gray-900 uppercase">
              COTIZACIÓN
            </h1>
            <div className="font-mono text-sm font-bold text-gray-900 mt-1">
              <span className="text-[#FF6A00]">N.°</span> {folioNum}
            </div>
            <div className="font-mono text-[11px] text-gray-500 mt-0.5">
              FECHA: <span className="text-gray-800 font-semibold">{fechaEmision}</span>
            </div>
            <div className="font-mono text-[11px] text-gray-500">
              VÁLIDA HASTA: <span className="text-gray-800 font-semibold">{fechaValidez}</span>
            </div>
          </div>
        </div>

        {/* Tarjetas de Cliente y Proyecto (2 Columnas con fondo suave) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {/* Tarjeta CLIENTE */}
          <div className="bg-[#FBFBFA] border border-gray-200/80 rounded-xl p-4 sm:p-5 space-y-2">
            <div className="flex items-center gap-2 text-[#FF6A00] font-heading font-extrabold text-xs uppercase tracking-wider">
              <User className="w-4 h-4" />
              <span>CLIENTE</span>
            </div>
            <div className="text-xs space-y-1 text-gray-700 font-sans">
              <div className="flex">
                <span className="font-bold text-gray-900 w-20 shrink-0">Nombre:</span>
                <span className="text-gray-800 font-medium truncate">{clienteNombre}</span>
              </div>
              <div className="flex">
                <span className="font-bold text-gray-900 w-20 shrink-0">Contacto:</span>
                <span className="text-gray-800 truncate">{clienteContacto}</span>
              </div>
              <div className="flex">
                <span className="font-bold text-gray-900 w-20 shrink-0">Email:</span>
                <span className="text-gray-800 truncate">{clienteEmail}</span>
              </div>
              <div className="flex">
                <span className="font-bold text-gray-900 w-20 shrink-0">Teléfono:</span>
                <span className="text-gray-800 font-mono">{clienteTelefono}</span>
              </div>
            </div>
          </div>

          {/* Tarjeta PROYECTO */}
          <div className="bg-[#FBFBFA] border border-gray-200/80 rounded-xl p-4 sm:p-5 space-y-2">
            <div className="flex items-center gap-2 text-[#FF6A00] font-heading font-extrabold text-xs uppercase tracking-wider">
              <Briefcase className="w-4 h-4" />
              <span>PROYECTO</span>
            </div>
            <div className="text-xs space-y-1 text-gray-700 font-sans">
              <div className="flex">
                <span className="font-bold text-gray-900 w-36 shrink-0">Nombre del proyecto:</span>
                <span className="text-gray-800 font-bold truncate">{cotizacion.titulo_proyecto}</span>
              </div>
              <div className="flex">
                <span className="font-bold text-gray-900 w-36 shrink-0">Ubicación:</span>
                <span className="text-gray-800 truncate">{cotizacion.comuna_region || 'Santiago, Chile'}</span>
              </div>
              <div className="flex">
                <span className="font-bold text-gray-900 w-36 shrink-0">Descripción:</span>
                <span className="text-gray-800 line-clamp-2">
                  {cotizacion.resumen_ejecutivo || `Ejecución de faena (${cotizacion.metros_cuadrados || 15} m²)`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Texto introductorio */}
        <p className="text-xs text-gray-600 mt-6 mb-3">
          A continuación, presentamos nuestra cotización según los requerimientos del proyecto.
        </p>

        {/* Tabla Principal de Partidas e Ítems */}
        <div className="w-full overflow-x-auto rounded-xl border border-gray-200 shadow-2xs">
          <table className="w-full text-left border-collapse text-xs min-w-[620px]">
            <thead>
              <tr className="bg-[#1E1E1E] text-white font-heading font-bold text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3 text-center w-16">ÍTEM</th>
                <th className="py-3 px-4">DESCRIPCIÓN</th>
                <th className="py-3 px-3 text-center w-20">UNIDAD</th>
                <th className="py-3 px-3 text-center w-20">CANT.</th>
                <th className="py-3 px-4 text-right w-32">PRECIO UNIT.</th>
                <th className="py-3 px-4 text-right w-36">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/80 font-sans text-xs">
              {partidasItems.map((item, idx) => (
                <tr
                  key={idx}
                  className={idx % 2 === 0 ? 'bg-white hover:bg-gray-50/50' : 'bg-[#FAFAFA] hover:bg-gray-50/50'}
                >
                  <td className="py-3 px-3 text-center font-mono font-bold text-[#FF6A00]">
                    {String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-gray-900">{item.nombre}</div>
                    {item.descripcion && (
                      <div className="text-[10px] text-gray-500 mt-0.5">{item.descripcion}</div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-gray-600 font-medium">
                    {item.unidad}
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-gray-800">
                    {typeof item.cantidad === 'number'
                      ? item.cantidad.toLocaleString('es-CL')
                      : item.cantidad}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-gray-700">
                    $ {Math.round(item.precioUnit).toLocaleString('es-CL')}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                    $ {Math.round(item.total).toLocaleString('es-CL')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sección Inferior: Observaciones & Condiciones (Izq) | Liquidación & Firma (Der) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-6 items-start">
          {/* Columna Izquierda (6 columnas): Observaciones y Condiciones de Pago */}
          <div className="md:col-span-6 space-y-5">
            {/* Observaciones */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#FF6A00] font-heading font-extrabold text-xs uppercase tracking-wide">
                <FileText className="w-4 h-4" />
                <span>OBSERVACIONES</span>
              </div>
              <ul className="text-[11px] text-gray-600 space-y-1 pl-5 list-disc font-sans leading-relaxed">
                <li>Los precios incluyen IVA y cotización de materiales con retiro o despacho.</li>
                <li>
                  Los plazos de ejecución serán definidos según el cronograma de obra (estimado en{' '}
                  <strong>{cotizacion.duracion_dias_estimada || 3} días hábiles</strong>).
                </li>
              </ul>
            </div>

            {/* Condiciones de Pago */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#FF6A00] font-heading font-extrabold text-xs uppercase tracking-wide">
                <DollarSign className="w-4 h-4" />
                <span>CONDICIONES DE PAGO</span>
              </div>
              <p className="text-[11px] text-gray-700 font-sans">
                40% de anticipo • 30% en ejecución de obra gruesa • 30% contra entrega conforme
              </p>
              <p className="text-[10px] text-gray-500 font-mono">
                Transferencia bancaria o estado de pago según contrato.
              </p>
            </div>
          </div>

          {/* Columna Derecha (6 columnas): Cuadro de Totales y Firma */}
          <div className="md:col-span-6 space-y-6">
            {/* Tabla de Subtotal, IVA y Banner Naranja de Total */}
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="flex justify-between items-center py-2.5 px-4 bg-white border-b border-gray-100 text-xs font-mono">
                <span className="font-heading font-bold text-gray-700 uppercase">SUBTOTAL</span>
                <span className="font-bold text-gray-900">$ {subtotalNeto.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-4 bg-white border-b border-gray-100 text-xs font-mono">
                <span className="font-heading font-bold text-gray-700 uppercase">IVA (19%)</span>
                <span className="font-bold text-gray-900">$ {iva.toLocaleString('es-CL')}</span>
              </div>
              {/* Banner Total Oficial Naranja */}
              <div className="flex justify-between items-center py-3.5 px-5 bg-[#FF6A00] text-white font-heading font-black">
                <span className="text-sm tracking-wider uppercase">TOTAL</span>
                <span className="text-lg sm:text-xl font-mono tracking-tight">
                  $ {totalConIva.toLocaleString('es-CL')}
                </span>
              </div>
            </div>

            {/* Firma y Sello ObraTrack */}
            <div className="pt-2 text-center">
              <div className="w-56 mx-auto border-t border-gray-300 pt-2 space-y-0.5">
                <p className="text-[11px] text-gray-600 font-sans">Firma y Sello</p>
                <p className="font-heading font-extrabold text-xs text-[#FF6A00] tracking-wide">
                  ObraTrack
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Membretado Oficial */}
        <div className="border-t-2 border-[#FF6A00] pt-4 mt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] text-gray-500 font-sans relative">
          <div className="flex items-center gap-2 text-left">
            <div className="w-6 h-6 rounded-full bg-orange-50 border border-[#FF6A00]/30 flex items-center justify-center text-[#FF6A00] shrink-0">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <div>
              <strong className="text-gray-800 block">ObraTrack - Software de gestión para constructoras</strong>
              <span>Santiago Centro, Región Metropolitana, Chile</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-1 font-mono text-[10px]">
            <span className="flex items-center gap-1 text-gray-700">
              <Phone className="w-3 h-3 text-[#FF6A00]" /> +56 9 8765 4321
            </span>
            <span className="flex items-center gap-1 text-gray-700">
              <Mail className="w-3 h-3 text-[#FF6A00]" /> contacto@obratrack.cl
            </span>
            <span className="flex items-center gap-1 text-gray-700">
              <Globe className="w-3 h-3 text-[#FF6A00]" /> www.obratrack.cl
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
