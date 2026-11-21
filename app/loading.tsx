export default function Loading() {
  return (
    <div
      className="flex-1 flex items-center justify-center p-8 min-h-[50vh]"
      role="status"
      aria-live="polite"
      aria-label="Cargando contenido"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#E1D5CB] border-t-[#FF6A00] dark:border-[#263040] dark:border-t-[#FF6A00]" />
        <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
          Cargando ObraTrack…
        </p>
      </div>
    </div>
  );
}
