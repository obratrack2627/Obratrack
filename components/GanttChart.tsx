'use client';

import React, { useState } from 'react';
import { Actividad, Usuario } from '@/types/database';
import { formatDate } from '@/lib/utils';
import { CheckCircle2, Clock, Calendar, User, Edit3, Plus } from 'lucide-react';

interface GanttChartProps {
  actividades: Actividad[];
  usuarios: Usuario[];
  onUpdateActivity: (id: string, updates: Partial<Actividad>) => void;
  onAddActivity: () => void;
}

export default function GanttChart({
  actividades,
  usuarios,
  onUpdateActivity,
  onAddActivity,
}: GanttChartProps) {
  const [selectedActivity, setSelectedActivity] = useState<Actividad | null>(null);

  // Calcular rango general de fechas de la obra
  if (actividades.length === 0) {
    return (
      <div className="bg-white border border-kraft-200 rounded-xl p-12 text-center">
        <p className="text-gray-500 text-sm mb-4">No hay actividades registradas en la Carta Gantt aún.</p>
        <button
          onClick={onAddActivity}
          className="px-4 py-2 bg-obra-orange text-white text-xs font-semibold rounded-lg font-heading inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Agregar Primera Partida</span>
        </button>
      </div>
    );
  }

  // Encontrar fecha mínima y máxima para calcular la escala
  const startDates = actividades.map((a) => new Date(a.fecha_inicio).getTime());
  const endDates = actividades.map((a) => new Date(a.fecha_termino).getTime());
  const minTime = Math.min(...startDates);
  const maxTime = Math.max(...endDates);
  const totalDays = Math.max(1, Math.round((maxTime - minTime) / (1000 * 60 * 60 * 24)));

  return (
    <div className="space-y-4">
      {/* Vista de Gantt / Cronograma Visual */}
      <div className="bg-white border border-kraft-200 rounded-xl overflow-hidden shadow-sm">
        
        {/* Cabecera de la tabla / Gantt */}
        <div className="grid grid-cols-12 bg-navy-800 text-white text-xs font-mono font-semibold py-3 px-4 border-b border-navy-700">
          <div className="col-span-4 sm:col-span-3">Actividad / Partida</div>
          <div className="col-span-2 hidden sm:block">Responsable</div>
          <div className="col-span-2 sm:col-span-2">Fechas</div>
          <div className="col-span-2 sm:col-span-1 text-center">% Avance</div>
          <div className="col-span-4 sm:col-span-4 pl-4">Línea de Tiempo (Gantt)</div>
        </div>

        {/* Filas de Actividades */}
        <div className="divide-y divide-kraft-200/80">
          {actividades.map((act, idx) => {
            const start = new Date(act.fecha_inicio).getTime();
            const end = new Date(act.fecha_termino).getTime();
            const offsetDays = Math.max(0, Math.round((start - minTime) / (1000 * 60 * 60 * 24)));
            const durationDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));

            const leftPercent = (offsetDays / totalDays) * 100;
            const widthPercent = Math.min(100 - leftPercent, (durationDays / totalDays) * 100);

            let statusColor = 'bg-gray-400';
            let statusBadge = 'bg-gray-100 text-gray-700';
            if (act.estado === 'en_curso') {
              statusColor = 'bg-obra-orange';
              statusBadge = 'bg-obra-orange-light text-obra-orange';
            } else if (act.estado === 'terminada') {
              statusColor = 'bg-obra-green';
              statusBadge = 'bg-obra-green-light text-obra-green';
            }

            return (
              <div
                key={act.id}
                className="grid grid-cols-12 items-center py-3.5 px-4 text-xs hover:bg-kraft-50/80 transition-colors"
              >
                {/* Nombre y orden */}
                <div className="col-span-4 sm:col-span-3 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-kraft-100 text-gray-600 font-mono text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-navy-900 truncate" title={act.nombre}>
                      {act.nombre}
                    </span>
                  </div>
                  <span className={`inline-block text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded mt-1 ${statusBadge}`}>
                    {act.estado.replace('_', ' ')}
                  </span>
                </div>

                {/* Responsable */}
                <div className="col-span-2 hidden sm:flex items-center gap-1.5 text-gray-600 truncate">
                  <div className="w-6 h-6 rounded-full bg-navy-700 text-white font-bold text-[10px] flex items-center justify-center">
                    {act.responsable?.nombre.charAt(0) || 'T'}
                  </div>
                  <span className="truncate">{act.responsable?.nombre || 'Sin asignar'}</span>
                </div>

                {/* Fechas */}
                <div className="col-span-2 sm:col-span-2 text-[11px] font-mono text-gray-500">
                  <div>{formatDate(act.fecha_inicio)}</div>
                  <div>{formatDate(act.fecha_termino)}</div>
                </div>

                {/* % Avance & Control rápido */}
                <div className="col-span-2 sm:col-span-1 text-center">
                  <button
                    onClick={() => setSelectedActivity(act)}
                    className="font-mono font-bold text-xs text-navy-900 hover:text-obra-orange underline decoration-dotted"
                  >
                    {act.porcentaje_avance}%
                  </button>
                </div>

                {/* Barra Horizontal Gantt */}
                <div className="col-span-4 sm:col-span-4 pl-4 relative h-8 flex items-center">
                  <div className="w-full h-3 bg-kraft-100 rounded-full relative overflow-hidden">
                    {/* Barra de duración */}
                    <div
                      style={{
                        left: `${leftPercent}%`,
                        width: `${Math.max(8, widthPercent)}%`,
                      }}
                      className={`absolute top-0 bottom-0 ${statusColor} rounded-full flex items-center justify-end px-1 shadow-sm cursor-pointer hover:brightness-110`}
                      onClick={() => setSelectedActivity(act)}
                      title={`${act.nombre}: ${act.porcentaje_avance}% (${formatDate(act.fecha_inicio)} - ${formatDate(act.fecha_termino)})`}
                    >
                      {/* Avance interno sombreado */}
                      <div
                        style={{ width: `${100 - act.porcentaje_avance}%` }}
                        className="h-full bg-black/25 absolute right-0 top-0 bottom-0 rounded-r-full pointer-events-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal / Editor Rápido de Actividad */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <h3 className="font-heading font-bold text-base text-navy-900 mb-4 flex items-center justify-between">
              <span>Actualizar Partida: {selectedActivity.nombre}</span>
              <button
                onClick={() => setSelectedActivity(null)}
                className="text-gray-400 hover:text-gray-700 text-sm"
              >
                ✕
              </button>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Porcentaje de Avance ({selectedActivity.porcentaje_avance}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={selectedActivity.porcentaje_avance}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setSelectedActivity({
                      ...selectedActivity,
                      porcentaje_avance: val,
                      estado: val === 100 ? 'terminada' : val > 0 ? 'en_curso' : 'pendiente',
                    });
                  }}
                  className="w-full accent-obra-orange cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Estado
                </label>
                <select
                  value={selectedActivity.estado}
                  onChange={(e) =>
                    setSelectedActivity({
                      ...selectedActivity,
                      estado: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs"
                >
                  <option value="pendiente">Pendiente (Gris)</option>
                  <option value="en_curso">En Curso (Naranja)</option>
                  <option value="terminada">Terminada (Verde)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Responsable Asignado
                </label>
                <select
                  value={selectedActivity.responsable_id || ''}
                  onChange={(e) =>
                    setSelectedActivity({
                      ...selectedActivity,
                      responsable_id: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs"
                >
                  <option value="">-- Sin asignar --</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} ({u.rol})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Inicio
                  </label>
                  <input
                    type="date"
                    value={selectedActivity.fecha_inicio}
                    onChange={(e) =>
                      setSelectedActivity({
                        ...selectedActivity,
                        fecha_inicio: e.target.value,
                      })
                    }
                    className="w-full px-2 py-1.5 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Término
                  </label>
                  <input
                    type="date"
                    value={selectedActivity.fecha_termino}
                    onChange={(e) =>
                      setSelectedActivity({
                        ...selectedActivity,
                        fecha_termino: e.target.value,
                      })
                    }
                    className="w-full px-2 py-1.5 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setSelectedActivity(null)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateActivity(selectedActivity.id, {
                      porcentaje_avance: selectedActivity.porcentaje_avance,
                      estado: selectedActivity.estado,
                      responsable_id: selectedActivity.responsable_id,
                      fecha_inicio: selectedActivity.fecha_inicio,
                      fecha_termino: selectedActivity.fecha_termino,
                    });
                    setSelectedActivity(null);
                  }}
                  className="px-4 py-1.5 bg-obra-orange text-white text-xs font-semibold rounded-lg font-heading shadow-sm"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
