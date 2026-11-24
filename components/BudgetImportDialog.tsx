'use client';

import { useRef, useState } from 'react';
import { AlertCircle, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Sparkles, Upload, X } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import { aiHeaders } from '@/lib/ai/client';
import type { CotizacionEstimacion } from '@/types/database';

export interface ImportedBudgetSummary {
  archivo: string;
  metodo: 'planilla' | 'texto' | 'ia';
  partidas: number;
  materiales: number;
  mano_de_obra: number;
  tratamiento_iva: 'incluido' | 'neto';
}

const ACCEPTED_FILES = '.pdf,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp';
const MAX_SIZE_BYTES = 3 * 1024 * 1024;

export default function BudgetImportDialog({
  projectId,
  projectName,
  clientName,
  projectLocation,
  onClose,
  onImported,
}: {
  projectId?: string;
  projectName?: string;
  clientName?: string;
  projectLocation?: string;
  onClose: () => void;
  onImported: (quote: CotizacionEstimacion, summary: ImportedBudgetSummary) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ivaPreference, setIvaPreference] = useState<'auto' | 'incluido' | 'neto'>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSelectFile = (candidate: File | null) => {
    setError('');
    if (!candidate) return;
    if (candidate.size > MAX_SIZE_BYTES) {
      setError('El archivo supera los 3 MB permitidos. Reduce su tamaño o sube un PDF/Excel más liviano.');
      return;
    }
    setFile(candidate);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const headers = await aiHeaders();
      const form = new FormData();
      form.set('archivo', file);
      form.set('tratamiento_iva', ivaPreference);
      if (projectId) form.set('proyecto_id', projectId);
      if (projectName) form.set('titulo_obra', projectName);
      if (clientName) form.set('cliente_nombre', clientName);
      if (projectLocation) form.set('ubicacion', projectLocation);

      const response = await fetch('/api/presupuestos/importar', {
        method: 'POST',
        headers: { Authorization: headers.Authorization },
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.cotizacion) {
        throw new Error(data.error || 'No se pudieron extraer los datos del presupuesto.');
      }
      onImported(data.cotizacion as CotizacionEstimacion, data.resumen as ImportedBudgetSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar el archivo.');
    } finally {
      setBusy(false);
    }
  };

  const fileIcon = (() => {
    if (!file) return <Upload className="w-6 h-6 text-obra-orange" />;
    if (file.type.startsWith('image/')) return <ImageIcon className="w-6 h-6 text-obra-orange" />;
    if (/\.xlsx$|\.csv$/i.test(file.name)) return <FileSpreadsheet className="w-6 h-6 text-emerald-600" />;
    return <FileText className="w-6 h-6 text-obra-orange" />;
  })();

  return (
    <ModalOverlay
      onClose={busy ? () => {} : onClose}
      aria-label="Importar presupuesto desde archivo"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-3xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-navy-900 via-[#151D2B] to-navy-900 text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8A3D] flex items-center justify-center text-white shadow-md shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading font-bold text-base text-white truncate">
                Importar presupuesto
              </h2>
              <p className="text-xs text-gray-300 truncate">
                Extrae materiales y montos al formato de ObraTrack
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar importación"
            className="p-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleSelectFile(e.dataTransfer.files?.[0] || null);
            }}
            className={`rounded-2xl border-2 border-dashed p-5 text-center transition-all ${
              dragging
                ? 'border-obra-orange bg-orange-50/70 dark:bg-[#FF6A00]/10'
                : file
                  ? 'border-emerald-400/70 bg-emerald-50/40 dark:bg-emerald-950/20'
                  : 'border-kraft-300 dark:border-[#2E3A4D] bg-kraft-50/60 dark:bg-[#0F141C] hover:border-obra-orange/60'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_FILES}
              disabled={busy}
              aria-label="Archivo de presupuesto"
              className="hidden"
              onChange={(e) => {
                handleSelectFile(e.target.files?.[0] || null);
                e.target.value = '';
              }}
            />

            <div className="mx-auto w-12 h-12 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] flex items-center justify-center shadow-xs mb-3">
              {fileIcon}
            </div>

            {file ? (
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-navy-900 dark:text-white break-all">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {Math.max(1, Math.round(file.size / 1024))} KB · Listo para extraer
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-obra-orange hover:underline"
                >
                  Cambiar archivo
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-navy-900 dark:text-white">
                  Arrastra tu presupuesto aquí o selecciónalo
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  PDF, Excel (.xlsx), CSV o foto (JPG, PNG, WebP) · máx. 3 MB
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="mt-1 inline-flex items-center gap-2 rounded-xl bg-white dark:bg-[#141A23] border border-kraft-300 dark:border-[#2F3B4E] hover:border-obra-orange px-4 py-2 text-xs font-bold text-navy-900 dark:text-white shadow-xs transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-obra-orange" />
                  <span>Elegir archivo</span>
                </button>
              </div>
            )}
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">
              ¿Cómo vienen los precios en el archivo?
            </span>
            <select
              aria-label="IVA del archivo importado"
              disabled={busy}
              value={ivaPreference}
              onChange={(e) => setIvaPreference(e.target.value as 'auto' | 'incluido' | 'neto')}
              className="w-full rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0F141C] px-3.5 py-2.5 text-xs sm:text-sm text-navy-900 dark:text-gray-100 focus:border-obra-orange focus:outline-none focus:ring-2 focus:ring-obra-orange/15"
            >
              <option value="auto">Detectar automáticamente del documento</option>
              <option value="incluido">Los precios ya incluyen IVA</option>
              <option value="neto">Los precios son netos (sumar 19% IVA)</option>
            </select>
          </label>

          <div className="rounded-xl bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200/80 dark:border-[#263040] px-3.5 py-2.5 text-xs text-gray-600 dark:text-gray-300 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-obra-orange shrink-0 mt-0.5" />
            <p>
              Extraeremos las partidas, materiales y montos al editor de ObraTrack para que puedas revisarlos, ajustarlos si quieres y guardar la cotización en tu obra.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-kraft-100 dark:border-[#222B3A]">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-kraft-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!file || busy}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#F97316] hover:from-[#E55F00] hover:to-[#EA580C] px-4 py-2 text-xs sm:text-sm font-heading font-bold text-white shadow-md shadow-obra-orange/25 transition-all disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Extrayendo datos…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Extraer y traspasar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </ModalOverlay>
  );
}
