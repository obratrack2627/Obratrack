'use client';

import { Cliente, Proyecto } from '@/types/database';

export default function ClientProjectAssignments({ proyectos, clientes, selected, onChange }: {
  proyectos: Proyecto[];
  clientes: Cliente[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-gray-700 dark:text-gray-200">Obras asociadas</legend>
      <p className="text-xs text-gray-500">Puedes seleccionar varias obras. Si una ya tiene cliente, la selección lo reemplazará.</p>
      {proyectos.length ? (
        <div className="max-h-44 overflow-y-auto rounded-xl border border-kraft-200 dark:border-[#263040] divide-y divide-kraft-200 dark:divide-[#263040]">
          {proyectos.map(obra => (
            <label key={obra.id} className="flex items-start gap-2 p-3 text-xs cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[#FF6A00]" checked={selected.includes(obra.id)} onChange={e => onChange(e.target.checked ? [...selected, obra.id] : selected.filter(id => id !== obra.id))} />
              <span className="min-w-0 break-words">{obra.nombre}<span className="block text-gray-500">{clientes.find(c => c.id === obra.cliente_id)?.nombre || 'Sin cliente asignado'}</span></span>
            </label>
          ))}
        </div>
      ) : <p className="text-xs text-gray-500">Todavía no hay obras. Puedes asociarlas después.</p>}
    </fieldset>
  );
}
