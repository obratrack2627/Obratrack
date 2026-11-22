'use client';

import React, { useMemo, useState } from 'react';
import { Check, Copy, FileText, MessageCircle, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { toast } from '@/components/ToastProvider';
import { buildClientProgressWhatsAppText } from '@/lib/client-progress-summary';
import { canonicalPhone } from '@/lib/phone';
import { dataService } from '@/lib/data-service';
import { downloadExecutiveProjectPdf } from '@/lib/reports/executive-project-pdf';
import type { Actividad, BitacoraEntrada, Cliente, Proyecto } from '@/types/database';

export default function ClientWhatsAppSummaryModal({
  proyecto,
  cliente,
  isOpen,
  onClose,
}: {
  proyecto: Proyecto | null;
  cliente?: Cliente | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [incluirCobranza, setIncluirCobranza] = useState(false);
  const [customDraft, setCustomDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const snapshot = useMemo(() => {
    if (!proyecto) return null;
    const actividades: Actividad[] = dataService.getActividades(proyecto.id);
    const bitacora: BitacoraEntrada[] = dataService.getBitacora(proyecto.id);
    const pagos = dataService.getPagos(proyecto.id);
    const totalPagado = pagos
      .filter((p) => !p.estado || p.estado === 'completado')
      .reduce((sum, p) => sum + Number(p.monto || 0), 0);
    const resolvedCliente =
      cliente ||
      (proyecto.cliente_id ? dataService.getClienteById(proyecto.cliente_id) : null) ||
      null;
    const text = buildClientProgressWhatsAppText({
      proyecto,
      cliente: resolvedCliente,
      actividades,
      bitacora,
      incluirCobranza,
      totalPagado,
    });
    return { actividades, bitacora, resolvedCliente, text };
  }, [proyecto, cliente, incluirCobranza]);

  if (!isOpen || !proyecto || !snapshot) return null;

  const messageText = customDraft ?? snapshot.text;
  const phoneDigits = canonicalPhone(snapshot.resolvedCliente?.telefono || '');
  const whatsappUrl = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(messageText)}`
    : `https://wa.me/?text=${encodeURIComponent(messageText)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      toast('Resumen copiado al portapapeles.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('No se pudo copiar automáticamente.');
    }
  };

  const handleDownloadPdf = () => {
    const empresa = dataService.getEmpresa();
    downloadExecutiveProjectPdf({
      proyecto,
      cliente: snapshot.resolvedCliente,
      empresaNombre: empresa?.nombre,
      empresaRut: empresa?.rut,
      empresaLogoUrl: empresa?.logo_url,
      actividades: snapshot.actividades,
      bitacora: snapshot.bitacora,
    });
    toast('Informe Ejecutivo PDF descargado.');
  };

  return (
    <ModalOverlay
      onClose={onClose}
      aria-label="Resumen de avance para el mandante"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95"
      >
        <div className="flex items-start justify-between gap-3 border-b border-kraft-200 dark:border-[#263040] pb-3">
          <div className="min-w-0">
            <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-[#25D366] shrink-0" />
              <span>Resumen de Avance al Mandante</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {proyecto.nombre}
              {snapshot.resolvedCliente?.nombre ? ` · ${snapshot.resolvedCliente.nombre}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-700 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C] px-3.5 py-2.5 text-xs cursor-pointer">
          <div>
            <p className="font-semibold text-navy-900 dark:text-white">
              Incluir estado de cobranza
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Solo muestra monto contratado, abonado y saldo (nunca costos internos ni márgenes).
            </p>
          </div>
          <input
            type="checkbox"
            checked={incluirCobranza}
            onChange={(e) => {
              setIncluirCobranza(e.target.checked);
              setCustomDraft(null);
            }}
            className="w-4 h-4 accent-[#FF6A00] rounded"
          />
        </label>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Mensaje editable para WhatsApp
          </label>
          <textarea
            rows={9}
            value={messageText}
            onChange={(e) => setCustomDraft(e.target.value)}
            className="w-full rounded-xl border border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C] p-3 text-xs font-sans leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-kraft-200 dark:border-[#263040]">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] text-xs font-semibold text-navy-900 dark:text-gray-200 hover:border-[#FF6A00] transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span>Informe PDF</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] text-xs font-semibold text-navy-900 dark:text-gray-200 hover:border-[#FF6A00] transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#1FB857] text-white text-xs font-heading font-bold shadow-sm transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Abrir WhatsApp</span>
            </a>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
