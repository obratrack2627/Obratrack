'use client';

import React, { useState } from 'react';
import { Actividad, Usuario } from '@/types/database';
import { formatDate } from '@/lib/utils';
import {
  CheckCircle2,
  Clock,
  Calendar,
  User,
  Edit3,
  Plus,
  Trash2,
  AlertTriangle,
  X,
  GanttChartSquare,
  LayoutList,
  Check,
  TrendingUp,
} from 'lucide-react';

interface GanttChartProps {
  actividades: Actividad[];
  usuarios: Usuario[];
  onUpdateActivity: (id: string, updates: Partial<Actividad>) => void;
  onDeleteActivity?: (id: string) => void;
  onAddActivity: () => void;
}

export default function GanttChart({
  actividades,
  usuarios,
  onUpdateActivity,
  onDeleteActivity,
  onAddActivity,
}: GanttChartProps) {
  const [selectedActivity, setSelectedActivity] = useState<Actividad | null>(null);
  const [activityToDelete, setActivityToDelete] = useState<Actividad | null>(null);
  const [viewMode, setViewMode] = useState<'gantt' | 'cards'>('gantt');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'pendiente' | 'en_curso' | 'terminada'>('todos');

  // Filtrado de actividades
  const filteredActivities = actividades.filter((act) => {
    if (filterStatus === 'todos') return true;
    return act.estado === filterStatus;
  });

  // Contador de estados
  const counts = {
    todos: actividades.length,
    pendiente: actividades.filter((a) => a.estado === 'pendiente').length,
    en_curso: actividades.filter((a) => a.estado === 'en_curso').length,
    terminada: actividades.filter((a) => a.estado === 'terminada').length,
  };

  // Helper para incremento rápido de avance con un toque
  const handleQuickProgress = (act: Actividad, nuevoAvance: number) => {
    const avanceClamped = Math.min(100, Math.max(0, nuevoAvance));
    const nuevoEstado =
      avanceClamped === 100 ? 'terminada' : avanceClamped > 0 ? 'en_curso' : 'pendiente';

    onUpdateActivity(act.id, {
      porcentaje_avance: avanceClamped,
      estado: nuevoEstado,
    });
  };

  // Si no hay partidas registradas
  if (actividades.length === 0) {
    return (
      <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-12 text-center shadow-sm">
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 font-sans">
          No hay partidas registradas en la Carta Gantt aún.
        </p>
        <button
          onClick={onAddActivity}
          className="px-4 py-2 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl font-heading inline-flex items-center gap-1.5 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>+ Agregar Primera Partida</span>
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
      {/* Barra de Herramientas Superior: Selector de Vista & Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#141A23] p-3 sm:p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
        {/* Toggle de Vista: Cronograma vs Tarjetas Móviles */}
        <div className="flex items-center gap-1.5 bg-kraft-100 dark:bg-[#1E2530] p-1 rounded-xl self-start sm:self-auto border border-kraft-200 dark:border-[#2A3444]">
          <button
            type="button"
            onClick={() => setViewMode('gantt')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
              viewMode === 'gantt'
                ? 'bg-white dark:bg-[#141A23] text-navy-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-navy-900 dark:hover:text-white'
            }`}
          >
            <GanttChartSquare className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span>Gantt Gráfico</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
              viewMode === 'cards'
                ? 'bg-white dark:bg-[#141A23] text-navy-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-navy-900 dark:hover:text-white'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5 text-[#6B8F72]" />
            <span>Tarjetas de Faena</span>
          </button>
        </div>

        {/* Filtros Rápidos por Estado */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs font-heading font-bold">
          <button
            type="button"
            onClick={() => setFilterStatus('todos')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              filterStatus === 'todos'
                ? 'bg-navy-900 dark:bg-white text-white dark:text-navy-900 font-extrabold shadow-sm'
                : 'bg-kraft-100 dark:bg-[#1E2530] text-gray-600 dark:text-gray-300 hover:bg-kraft-200'
            }`}
          >
            Todas ({counts.todos})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('pendiente')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              filterStatus === 'pendiente'
                ? 'bg-gray-600 text-white shadow-sm'
                : 'bg-kraft-100 dark:bg-[#1E2530] text-gray-600 dark:text-gray-400 hover:bg-kraft-200'
            }`}
          >
            Pendientes ({counts.pendiente})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('en_curso')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              filterStatus === 'en_curso'
                ? 'bg-[#FF6A00] text-white shadow-sm'
                : 'bg-[#FF6A00]/10 text-[#FF6A00] hover:bg-[#FF6A00]/20'
            }`}
          >
            En Curso ({counts.en_curso})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('terminada')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              filterStatus === 'terminada'
                ? 'bg-[#6B8F72] text-white shadow-sm'
                : 'bg-[#6B8F72]/10 text-[#6B8F72] hover:bg-[#6B8F72]/20'
            }`}
          >
            Terminadas ({counts.terminada})
          </button>

          <button
            type="button"
            onClick={onAddActivity}
            className="ml-auto sm:ml-2 px-3 py-1 bg-[#FF6A00] hover:bg-[#E55F00] text-white rounded-lg text-xs font-bold font-heading flex items-center gap-1 shadow-sm shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nueva Partida</span>
          </button>
        </div>
      </div>

      {/* VISTA 1: CRONOGRAMA GANTT HORIZONTAL (ESCRITORIO / TABLETS) */}
      {viewMode === 'gantt' && (
        <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto w-full">
            <div className="min-w-[680px]">
              {/* Cabecera de la tabla / Gantt */}
              <div className="grid grid-cols-12 bg-navy-900 text-white text-xs font-mono font-semibold py-3 px-4 border-b border-navy-800">
                <div className="col-span-4 sm:col-span-3">Actividad / Partida</div>
                <div className="col-span-2 hidden sm:block">Responsable</div>
                <div className="col-span-2 sm:col-span-2">Fechas</div>
                <div className="col-span-1 sm:col-span-1 text-center">% Avance</div>
                <div className="col-span-4 sm:col-span-4 pl-4">Línea de Tiempo (Gantt)</div>
                <div className="col-span-1 sm:col-span-0 text-right hidden sm:block"></div>
              </div>

              {/* Filas de Actividades */}
              <div className="divide-y divide-kraft-200/80 dark:divide-[#263040]">
                {filteredActivities.map((act, idx) => {
                  const start = new Date(act.fecha_inicio).getTime();
                  const end = new Date(act.fecha_termino).getTime();
                  const offsetDays = Math.max(0, Math.round((start - minTime) / (1000 * 60 * 60 * 24)));
                  const durationDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));

                  const leftPercent = (offsetDays / totalDays) * 100;
                  const widthPercent = Math.min(100 - leftPercent, (durationDays / totalDays) * 100);

                  let statusColor = 'bg-gray-400';
                  let statusBadge = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
                  if (act.estado === 'en_curso') {
                    statusColor = 'bg-[#FF6A00]';
                    statusBadge = 'bg-[#FF6A00]/15 text-[#FF6A00] border border-[#FF6A00]/30';
                  } else if (act.estado === 'terminada') {
                    statusColor = 'bg-[#6B8F72]';
                    statusBadge = 'bg-[#6B8F72]/15 text-[#6B8F72] border border-[#6B8F72]/30';
                  }

                  return (
                    <div
                      key={act.id}
                      className="grid grid-cols-12 items-center py-3.5 px-4 text-xs hover:bg-kraft-50/80 dark:hover:bg-[#1E2530]/60 transition-colors group"
                    >
                      {/* Nombre y orden */}
                      <div className="col-span-4 sm:col-span-3 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-kraft-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span
                            className="font-semibold text-navy-900 dark:text-white truncate cursor-pointer hover:text-[#FF6A00]"
                            title={act.nombre}
                            onClick={() => setSelectedActivity(act)}
                          >
                            {act.nombre}
                          </span>
                        </div>
                        <span className={`inline-block text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded mt-1 ${statusBadge}`}>
                          {act.estado.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Responsable */}
                      <div className="col-span-2 hidden sm:flex items-center gap-1.5 text-gray-600 dark:text-gray-300 truncate">
                        <div className="w-6 h-6 rounded-full bg-navy-700 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                          {act.responsable?.nombre?.charAt(0) || 'T'}
                        </div>
                        <span className="truncate">{act.responsable?.nombre || 'Sin asignar'}</span>
                      </div>

                      {/* Fechas */}
                      <div className="col-span-2 sm:col-span-2 text-[11px] font-mono text-gray-500 dark:text-gray-400">
                        <div>{formatDate(act.fecha_inicio)}</div>
                        <div>{formatDate(act.fecha_termino)}</div>
                      </div>

                      {/* % Avance & Control rápido */}
                      <div className="col-span-1 sm:col-span-1 text-center">
                        <button
                          onClick={() => setSelectedActivity(act)}
                          className="font-mono font-bold text-xs text-navy-900 dark:text-gray-200 hover:text-[#FF6A00] underline decoration-dotted"
                          title="Haga clic para editar detalle"
                        >
                          {act.porcentaje_avance}%
                        </button>
                      </div>

                      {/* Barra Horizontal Gantt */}
                      <div className="col-span-4 sm:col-span-4 pl-4 relative h-8 flex items-center">
                        <div className="w-full h-3 bg-kraft-100 dark:bg-gray-800 rounded-full relative overflow-hidden">
                          {/* Barra de duración */}
                          <div
                            style={{
                              left: `${leftPercent}%`,
                              width: `${Math.max(8, widthPercent)}%`,
                            }}
                            className={`absolute top-0 bottom-0 ${statusColor} rounded-full flex items-center justify-end px-1 shadow-sm cursor-pointer hover:brightness-110`}
                            onClick={() => setSelectedActivity(act)}
                            title={`${act.nombre}: ${durationDays} días (${act.porcentaje_avance}% avance)`}
                          >
                            <span className="text-[9px] font-mono font-bold text-white drop-shadow">
                              {act.porcentaje_avance}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Acciones de Edición en Hover */}
                      <div className="col-span-1 sm:col-span-0 text-right hidden sm:flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedActivity(act)}
                          className="p-1 text-gray-400 hover:text-[#FF6A00] rounded transition-colors"
                          title="Editar partida"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VISTA 2: TARJETAS DE FAENA / AGENDA MÓVIL (100% ERGONÓMICA EN TERRENO) */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredActivities.map((act, idx) => {
            return (
              <div
                key={act.id}
                className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 shadow-sm hover:border-[#FF6A00]/50 transition-all space-y-3"
              >
                {/* Cabecera Tarjeta: Número, Nombre y Estado */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-lg bg-[#FF6A00]/10 text-[#FF6A00] font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="font-heading font-black text-sm text-navy-900 dark:text-white leading-tight">
                        {act.nombre}
                      </h4>
                      <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                        {formatDate(act.fecha_inicio)} al {formatDate(act.fecha_termino)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                      act.estado === 'terminada'
                        ? 'bg-[#6B8F72]/15 text-[#6B8F72] border border-[#6B8F72]/30'
                        : act.estado === 'en_curso'
                        ? 'bg-[#FF6A00]/15 text-[#FF6A00] border border-[#FF6A00]/30'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {act.estado.replace('_', ' ')}
                  </span>
                </div>

                {/* Barra de Progreso Visual */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-gray-500">Avance reportado:</span>
                    <strong className="text-[#FF6A00]">{act.porcentaje_avance}%</strong>
                  </div>
                  <div className="w-full bg-kraft-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        act.porcentaje_avance === 100
                          ? 'bg-[#6B8F72]'
                          : act.porcentaje_avance > 0
                          ? 'bg-[#FF6A00]'
                          : 'bg-gray-300 dark:bg-gray-700'
                      }`}
                      style={{ width: `${act.porcentaje_avance}%` }}
                    />
                  </div>
                </div>

                {/* Responsable asignado */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-kraft-100 dark:border-gray-800 text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-1.5 truncate">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{act.responsable?.nombre || 'Sin maestro asignado'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedActivity(act)}
                    className="text-[#FF6A00] font-heading font-bold text-xs hover:underline flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Editar</span>
                  </button>
                </div>

                {/* Botones de Actualización Rápida en Faena (1 Toque) */}
                <div className="grid grid-cols-4 gap-1.5 pt-1 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => handleQuickProgress(act, (act.porcentaje_avance || 0) + 25)}
                    className="py-1.5 px-1 bg-kraft-100 dark:bg-[#1E2530] hover:bg-kraft-200 text-navy-900 dark:text-white rounded-lg font-bold text-center border border-kraft-200 dark:border-[#263040]"
                    title="Aumentar 25%"
                  >
                    +25%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickProgress(act, 50)}
                    className="py-1.5 px-1 bg-kraft-100 dark:bg-[#1E2530] hover:bg-kraft-200 text-navy-900 dark:text-white rounded-lg font-bold text-center border border-kraft-200 dark:border-[#263040]"
                    title="Fijar en 50%"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickProgress(act, 75)}
                    className="py-1.5 px-1 bg-kraft-100 dark:bg-[#1E2530] hover:bg-kraft-200 text-navy-900 dark:text-white rounded-lg font-bold text-center border border-kraft-200 dark:border-[#263040]"
                    title="Fijar en 75%"
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickProgress(act, 100)}
                    className="py-1.5 px-1 bg-[#6B8F72] hover:bg-[#5A7C60] text-white rounded-lg font-bold text-center shadow-sm flex items-center justify-center gap-1"
                    title="Terminada al 100%"
                  >
                    <Check className="w-3 h-3" />
                    <span>100%</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Edición Completa de Partida */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-kraft-200 dark:border-gray-800">
              <h3 className="font-heading font-black text-lg text-navy-900 dark:text-white">
                Editar Partida de Faena
              </h3>
              <button
                onClick={() => setSelectedActivity(null)}
                className="p-1 rounded-lg text-gray-400 hover:bg-kraft-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                  Nombre de la Actividad
                </label>
                <input
                  type="text"
                  value={selectedActivity.nombre}
                  onChange={(e) =>
                    setSelectedActivity({
                      ...selectedActivity,
                      nombre: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-kraft-50 dark:bg-[#1E2530] border border-kraft-200 dark:border-[#263040] rounded-xl text-xs font-medium text-navy-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Porcentaje de Avance
                  </label>
                  <span className="font-mono font-bold text-xs text-[#FF6A00]">
                    {selectedActivity.porcentaje_avance}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={selectedActivity.porcentaje_avance}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    const newStatus =
                      val === 100 ? 'terminada' : val > 0 ? 'en_curso' : 'pendiente';
                    setSelectedActivity({
                      ...selectedActivity,
                      porcentaje_avance: val,
                      estado: newStatus,
                    });
                  }}
                  className="w-full accent-[#FF6A00]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
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
                    className="w-full px-3 py-2 bg-kraft-50 dark:bg-[#1E2530] border border-kraft-200 dark:border-[#263040] rounded-xl text-xs text-navy-900 dark:text-white"
                  >
                    <option value="pendiente">Pendiente (Gris)</option>
                    <option value="en_curso">En Curso (Naranja)</option>
                    <option value="terminada">Terminada (Verde)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Responsable
                  </label>
                  <select
                    value={selectedActivity.responsable_id || ''}
                    onChange={(e) =>
                      setSelectedActivity({
                        ...selectedActivity,
                        responsable_id: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-kraft-50 dark:bg-[#1E2530] border border-kraft-200 dark:border-[#263040] rounded-xl text-xs text-navy-900 dark:text-white"
                  >
                    <option value="">-- Sin asignar --</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} ({u.rol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Fecha Inicio
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
                    className="w-full px-2.5 py-2 bg-kraft-50 dark:bg-[#1E2530] border border-kraft-200 dark:border-[#263040] rounded-xl text-xs font-mono text-navy-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Fecha Término
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
                    className="w-full px-2.5 py-2 bg-kraft-50 dark:bg-[#1E2530] border border-kraft-200 dark:border-[#263040] rounded-xl text-xs font-mono text-navy-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-4 border-t border-kraft-200 dark:border-gray-800">
                {onDeleteActivity ? (
                  <button
                    type="button"
                    onClick={() => {
                      const toDel = selectedActivity;
                      setSelectedActivity(null);
                      setActivityToDelete(toDel);
                    }}
                    className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl font-semibold transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedActivity(null)}
                    className="px-3.5 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateActivity(selectedActivity.id, {
                        nombre: selectedActivity.nombre,
                        porcentaje_avance: selectedActivity.porcentaje_avance,
                        estado: selectedActivity.estado,
                        responsable_id: selectedActivity.responsable_id,
                        fecha_inicio: selectedActivity.fecha_inicio,
                        fecha_termino: selectedActivity.fecha_termino,
                      });
                      setSelectedActivity(null);
                    }}
                    className="px-4 py-2 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl font-heading shadow-sm"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmación Eliminación */}
      {activityToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-heading font-black text-base text-navy-900 dark:text-white">
                ¿Eliminar esta partida?
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Se eliminará "{activityToDelete.nombre}" del cronograma de la Carta Gantt.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActivityToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteActivity) onDeleteActivity(activityToDelete.id);
                  setActivityToDelete(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl font-heading shadow-sm"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
