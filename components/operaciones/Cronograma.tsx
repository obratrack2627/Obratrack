import type { ActividadObra } from "@/types/operaciones";
import { formatDate } from "@/lib/utils";

export function Cronograma({ actividades }: { actividades: ActividadObra[] }) {
  if (!actividades.length) return null;
  const inicio = Math.min(...actividades.map((a) => Date.parse(a.inicio)));
  const termino = Math.max(...actividades.map((a) => Date.parse(a.termino)));
  const duracion = Math.max(86400000, termino - inicio + 86400000);
  return (
    <details className="mt-5">
      <summary className="cursor-pointer text-sm font-medium">
        Ver cronograma
      </summary>
      <div className="overflow-x-auto mt-4 pb-3">
        <div className="min-w-[600px] space-y-3">
          <div className="flex justify-between text-xs op-muted ml-40">
            <span>
              {formatDate(new Date(inicio).toISOString().slice(0, 10))}
            </span>
            <span>
              {formatDate(new Date(termino).toISOString().slice(0, 10))}
            </span>
          </div>
          {actividades.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-[150px_1fr] gap-3 items-center"
            >
              <span
                className="text-xs truncate"
                title={`${a.partida} · ${a.nombre}`}
              >
                {a.partida} · {a.nombre}
              </span>
              <div className="relative h-7 rounded bg-gray-100 dark:bg-white/5">
                <div
                  title={`${a.nombre}: ${a.avance} % · ${a.inicio} a ${a.termino}`}
                  className="absolute h-full bg-[#6B8F72]/30 rounded overflow-hidden"
                  style={{
                    left: `${((Date.parse(a.inicio) - inicio) / duracion) * 100}%`,
                    width: `${((Date.parse(a.termino) - Date.parse(a.inicio) + 86400000) / duracion) * 100}%`,
                  }}
                >
                  <div
                    className="h-full bg-[#6B8F72]"
                    style={{ width: `${a.avance}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
