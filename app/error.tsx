'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('ObraTrack UI boundary error:', error?.name || 'Error', error?.digest || '');
  }, [error]);

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#E1D5CB] dark:border-[#263040] bg-white dark:bg-[#141A23] p-8 text-center shadow-lg space-y-5">
        <div className="flex justify-center">
          <Logo variant="horizontal" size="md" />
        </div>
        <div className="inline-flex items-center rounded-full bg-red-500/10 px-3 py-1 text-xs font-mono font-bold text-red-600 dark:text-red-400">
          Ocurrió un inconveniente
        </div>
        <h1 className="text-xl font-black font-heading text-[#1E1E1E] dark:text-white">
          No pudimos cargar esta vista
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          Tus datos guardados permanecen seguros. Intenta recargar esta pantalla o regresa al Centro de Mando.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-xl bg-[#FF6A00] hover:bg-[#E55F00] px-5 py-2.5 text-sm font-bold text-white transition-colors"
          >
            Reintentar
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-[#E1D5CB] dark:border-[#263040] px-5 py-2.5 text-sm font-semibold text-[#1E1E1E] dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            Ir al Centro de Mando
          </Link>
        </div>
      </div>
    </div>
  );
}
