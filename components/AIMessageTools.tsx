'use client';
import { useState } from 'react';
import type { CotizacionEstimacion } from '@/types/database';
import { retryAIWrite, isAIWriteConfirmed } from '@/lib/ai/execute';
import CotizacionPdfModal from './CotizacionPdfModal';

export default function AIMessageTools({
  message,
}: {
  message: {
    cotizacion_generada?: CotizacionEstimacion;
    pendiente_sincronizacion?: string;
  };
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(
      message.pendiente_sincronizacion &&
        isAIWriteConfirmed(message.pendiente_sincronizacion)
        ? 'Guardado en Supabase.'
        : '',
    );
  return (
    <>
      {message.cotizacion_generada && (
        <button
          type="button"
          className="mt-2 px-3 py-2 bg-[#FF6A00] text-white rounded-lg text-xs font-bold"
          onClick={() => setOpen(true)}
        >
          Ver cotización / PDF
        </button>
      )}
      {message.pendiente_sincronizacion && !status.startsWith('Guardado') && (
        <button
          type="button"
          disabled={busy}
          className="mt-2 px-3 py-2 border border-orange-400 rounded-lg text-xs font-bold"
          onClick={async () => {
            setBusy(true);
            try {
              await retryAIWrite(message.pendiente_sincronizacion!);
              setStatus('Guardado en Supabase.');
            } catch (error) {
              setStatus((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Guardando…' : 'Reintentar guardado'}
        </button>
      )}
      {status && (
        <p role="status" className="text-xs mt-2">
          {status}
        </p>
      )}
      {message.cotizacion_generada && (
        <CotizacionPdfModal
          isOpen={open}
          onClose={() => setOpen(false)}
          cotizacion={message.cotizacion_generada}
          clienteNombre={message.cotizacion_generada.cliente_nombre}
          clienteTelefono={message.cotizacion_generada.cliente_telefono}
        />
      )}
    </>
  );
}
