'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  GanttChartSquare,
  Wallet,
  Calendar,
  Building2,
  CheckCircle2,
  X,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import GanttChart from '@/components/GanttChart';
import { dataService } from '@/lib/data-service';
import { Proyecto, Actividad, Usuario } from '@/types/database';
import { formatDate } from '@/lib/utils';

export default function ProyectoGanttPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Formulario nueva actividad
  const [nombreActividad, setNombreActividad] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);
  const [fechaTermino, setFechaTermino] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  const loadData = () => {
    if (!projectId) return;
    const proj = dataService.getProyectoById(projectId);
    const acts = dataService.getActividades(projectId);
    const users = dataService.getUsuarios();

    setProyecto(proj);
    setActividades(acts);
    setUsuarios(users);
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleUpdateActivity = (actId: string, updates: Partial<Actividad>) => {
    dataService.updateActividad(actId, updates);
    loadData();
  };

  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreActividad.trim()) return;

    dataService.createActividad({
      proyecto_id: projectId,
      nombre: nombreActividad.trim(),
      responsable_id: responsableId || undefined,
      fecha_inicio: fechaInicio,
      fecha_termino: fechaTermino,
      porcentaje_avance: 0,
      estado: 'pendiente',
      orden: actividades.length + 1,
    });

    setIsAddModalOpen(false);
    setNombreActividad('');
    loadData();
  };

  if (!proyecto) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Cargando proyecto...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Navbar
        title={`Carta Gantt: ${proyecto.nombre}`}
        subtitle={`Cronograma de partidas • ${proyecto.cliente?.nombre || 'Cliente'}`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/proyectos/${projectId}/finanzas`}
              className="px-3 py-2 bg-white border border-kraft-200 text-navy-900 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 hover:bg-kraft-50"
            >
              <Wallet className="w-3.5 h-3.5 text-navy-800" />
              <span>Ver Finanzas</span>
            </Link>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 font-heading"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Partida</span>
            </button>
          </div>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Sub-Header con Resumen y Navegación */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-kraft-200 p-4 rounded-xl shadow-sm">
          <Link
            href="/proyectos"
            className="text-xs font-semibold text-gray-600 hover:text-navy-900 flex items-center gap-1 font-heading"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Proyectos</span>
          </Link>

          <div className="flex items-center gap-4 text-xs font-mono text-gray-600">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />
              <span>Pendiente</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-obra-orange inline-block" />
              <span>En Curso</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-obra-green inline-block" />
              <span>Terminada</span>
            </div>
          </div>
        </div>

        {/* Componente Gantt Interactivo */}
        <GanttChart
          actividades={actividades}
          usuarios={usuarios}
          onUpdateActivity={handleUpdateActivity}
          onAddActivity={() => setIsAddModalOpen(true)}
        />

      </div>

      {/* Modal: + Nueva Actividad */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-obra-orange" />
                <span>Agregar Partida a la Gantt</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddActivity} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre de la Actividad / Partida *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Enfierradura de Vigas de Fundación"
                  value={nombreActividad}
                  onChange={(e) => setNombreActividad(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Responsable Asignado
                </label>
                <select
                  value={responsableId}
                  onChange={(e) => setResponsableId(e.target.value)}
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
                    Fecha Inicio *
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full px-2 py-1.5 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha Término *
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaTermino}
                    onChange={(e) => setFechaTermino(e.target.value)}
                    className="w-full px-2 py-1.5 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-obra-orange text-white text-xs font-semibold rounded-lg font-heading shadow-sm"
                >
                  Guardar Partida
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
