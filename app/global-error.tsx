'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#FAF8F5] text-[#1E1E1E] dark:bg-[#0B121B] dark:text-white flex items-center justify-center p-6 font-sans antialiased">
        <div className="w-full max-w-md rounded-2xl border border-[#E1D5CB] bg-white p-8 text-center shadow-lg space-y-4">
          <p className="text-xs font-mono font-bold uppercase tracking-wider text-[#FF6A00]">
            ObraTrack
          </p>
          <h1 className="text-xl font-bold">Error inesperado en la aplicación</h1>
          <p className="text-sm text-gray-600">
            Presiona el botón para intentar recuperar la sesión o vuelve a cargar el sitio.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-xl bg-[#FF6A00] px-5 py-2.5 text-sm font-bold text-white"
            >
              Reintentar
            </button>
            <a
              href="/dashboard"
              className="rounded-xl border border-[#E1D5CB] px-5 py-2.5 text-sm font-semibold text-[#1E1E1E]"
            >
              Ir al inicio
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
