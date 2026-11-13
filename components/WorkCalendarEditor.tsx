"use client";
import { useState } from "react";
export default function WorkCalendarEditor({
  days,
  excluded,
  onChange,
}: {
  days: number[];
  excluded: string[];
  onChange: (days: number[], excluded: string[]) => void;
}) {
  const [date, setDate] = useState("");
  return (
    <details className="rounded-xl border border-kraft-200 p-3 dark:border-gray-700">
      <summary className="cursor-pointer text-sm font-semibold">
        Calendario de la obra
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-gray-500">
          Los adicionales se calculan solo en los días seleccionados, excluyendo
          las fechas indicadas.
        </p>
        <div className="flex flex-wrap gap-3">
          {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(
            (label, index) => (
              <label key={label} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={days.includes(index)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...days, index].sort((a,b)=>a-b)
                      : days.filter((day) => day !== index);
                    if (next.length) onChange(next, excluded);
                  }}
                  className="accent-[#FF6A00]"
                />
                {label}
              </label>
            ),
          )}
        </div>
        <label className="block text-xs font-semibold">
          Feriado o día sin trabajo
          <input
            aria-label="Día no laborable"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 block min-w-0 max-w-full rounded-lg border border-kraft-200 bg-transparent p-2"
          />
        </label>
        <button
          type="button"
          disabled={!date}
          className="text-xs font-semibold text-[#FF6A00] disabled:opacity-50"
          onClick={() => {
            onChange(days, Array.from(new Set([...excluded, date])).sort((a,b)=>a.localeCompare(b)));
            setDate("");
          }}
        >
          Añadir fecha sin trabajo
        </button>
        <div className="flex flex-wrap gap-2">
          {excluded.map((value) => (
            <button
              type="button"
              key={value}
              aria-label={`Quitar día no laborable ${value}`}
              onClick={() =>
                onChange(
                  days,
                  excluded.filter((item) => item !== value),
                )
              }
              className="rounded-md bg-kraft-100 px-2 py-1 text-xs dark:bg-gray-800"
            >
              {value.split("-").reverse().join("/")} ×
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
