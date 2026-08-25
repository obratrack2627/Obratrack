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
  BookOpen,
  Camera,
  Trash2,
  Tag,
  Users,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import GanttChart from '@/components/GanttChart';
import { dataService } from '@/lib/data-service';
import { Proyecto, Actividad, Usuario, BitacoraEntrada } from '@/types/database';
import { formatDate } from '@/lib/utils';

export default function ProyectoGanttPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [bitacora, setBitacora] = useState<BitacoraEntrada[]>([]);
  
  // Modales
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBitacoraModalOpen, setIsBitacoraModalOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // Formulario nueva actividad
  const [nombreActividad, setNombreActividad] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);
  const [fechaTermino, setFechaTermino] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  // Formulario bitácora
  const [tituloBitacora, setTituloBitacora] = useState('');
  const [notaBitacora, setNotaBitacora] = useState('');
  const [fotoBitacora, setFotoBitacora] = useState('');
  const [tipoBitacora, setTipoBitacora] = useState<'avance' | 'incidente' | 'clima' | 'entrega_material'>('avance');
  const [fechaBitacora, setFechaBitacora] = useState(new Date().toISOString().split('T')[0]);

  const loadData = () => {
    if (!projectId) return;
    const proj = dataService.getProyectoById(projectId);
    const acts = dataService.getActividades(projectId);
    const users = dataService.getUsuarios();
    const bits = dataService.getBitacora(projectId);

    setProyecto(proj);
    setActividades(acts);
    setUsuarios(users);
    setBitacora(bits);
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
    setResponsableId('');
    loadData();
  };

  const handleAddBitacora = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tituloBitacora.trim()) return;

    const activeUser = dataService.getActiveUser();

    dataService.createBitacoraEntrada({
      proyecto_id: projectId,
      usuario_id: activeUser.id,
      autor_nombre: activeUser.nombre,
      titulo: tituloBitacora.trim(),
      nota: notaBitacora.trim(),
      foto_url: fotoBitacora.trim() || undefined,
      fecha: fechaBitacora,
      tipo: tipoBitacora,
    });

    setIsBitacoraModalOpen(false);
    setTituloBitacora('');
    setNotaBitacora('');
    setFotoBitacora('');
    loadData();
  };

  const handleDeleteBitacora = (id: string) => {
    dataService.deleteBitacoraEntrada(id);
    loadData();
  };

  if (!proyecto) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen text-gray-500 font-sans">
        <p>Cargando Carta Gantt...</p>
        <Link href="/proyectos" className="mt-4 text-xs font-bold text-obra-orange hover:underline">
          &larr; Volver al listado de proyectos
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Navbar
        title={`Carta Gantt: ${proyecto.nombre}`}
        subtitle={`Planificación semanal, asignación de cuadrillas y bitácora de obra`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBitacoraModalOpen(true)}
              className="px-3 py-1.5 bg-white border border-kraft-200 hover:bg-kraft-50 text-navy-900 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 font-heading"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#FF6A00]" />
              <span>+ Bitácora Diaria</span>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-1.5 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 font-heading"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Partida</span>
            </button>
            <Link
              href={`/proyectos/${proyecto.id}/finanzas`}
              className="px-3 py-1.5 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-semibold rounded-lg flex items-center gap-1.5 font-heading"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Finanzas</span>
            </Link>
            <Link
              href="/proyectos"
              className="px-3 py-1.5 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-semibold rounded-lg flex items-center gap-1.5 font-heading"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver</span>
            </Link>
          </div>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Componente Gantt Interactivo */}
        <GanttChart
          actividades={actividades}
          usuarios={usuarios}
          onUpdateActivity={handleUpdateActivity}
          onAddActivity={() => setIsAddModalOpen(true)}
        />

        {/* Sección Bitácora Diaria de Obra y Registro Fotográfico */}
        <div className="bg-white border border-kraft-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-kraft-200">
            <div>
              <h3 className="font-heading font-black text-lg text-navy-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-obra-orange" />
                <span>Bitácora de Terreno & Evidencias</span>
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-0.5">
                Historial cronológico de avances, eventos climáticos, recepción de materiales y fotos de obra.
              </p>
            </div>
            
            <button
              onClick={() => setIsBitacoraModalOpen(true)}
              className="px-3.5 py-2 bg-navy-800 hover:bg-navy-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 font-heading self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5 text-obra-orange" />
              <span>Nueva Entrada de Bitácora</span>
            </button>
          </div>

          {bitacora.length === 0 ? (
            <div className="py-8 text-center text-gray-400 font-sans space-y-2">
              <Camera className="w-8 h-8 mx-auto text-gray-300" />
              <p className="text-xs">No hay registros en la bitácora de esta obra aún.</p>
              <button
                onClick={() => setIsBitacoraModalOpen(true)}
                className="text-xs font-bold text-obra-orange hover:underline"
              >
                + Registrar el primer reporte diario
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bitacora.map((entry) => {
                const tipoBadge =
                  entry.tipo === 'avance'
                    ? 'bg-emerald-100 text-emerald-800'
                    : entry.tipo === 'incidente'
                    ? 'bg-red-100 text-red-800'
                    : entry.tipo === 'clima'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800';

                return (
                  <div
                    key={entry.id}
                    className="p-4 rounded-xl border border-kraft-200 bg-kraft-50/50 hover:bg-white transition-all space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-[10px] font-bold font-mono uppercase px-2 py-0.5 rounded-full ${tipoBadge}`}>
                          {entry.tipo.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-mono text-gray-400">
                          {formatDate(entry.fecha)}
                        </span>
                      </div>

                      <h4 className="font-heading font-bold text-sm text-navy-900 leading-snug">
                        {entry.titulo}
                      </h4>

                      <p className="text-xs text-gray-600 font-sans leading-relaxed">
                        {entry.nota}
                      </p>

                      {entry.foto_url && (
                        <button
                          type="button"
                          onClick={() => setPreviewPhoto(entry.foto_url || null)}
                          className="w-full h-32 rounded-lg border border-kraft-200 overflow-hidden relative group mt-2"
                        >
                          <img
                            src={entry.foto_url}
                            alt="Evidencia fotográfica"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </button>
                      )}
                    </div>

                    <div className="pt-2 border-t border-kraft-200 flex items-center justify-between text-[11px] text-gray-400 font-mono">
                      <span>Por: {entry.autor_nombre}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteBitacora(entry.id)}
                        className="text-gray-400 hover:text-red-600 p-1"
                        title="Eliminar entrada"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Modal: + Agregar Partida / Actividad */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-obra-orange" />
                <span>Agregar Nueva Partida / Tarea</span>
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddActivity} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre de la Partida *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Instalación de Porcelanato 60x60"
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
                  <option value="">Sin asignar / Cuadrilla General</option>
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
                    Fecha Inicio
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
                    Fecha Término
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
                  className="px-4 py-2 bg-obra-orange text-white text-xs font-bold rounded-xl font-heading shadow-sm hover:bg-obra-orange-hover"
                >
                  Agregar Partida
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: + Nueva Entrada de Bitácora */}
      {isBitacoraModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-obra-orange" />
                <span>Nueva Entrada de Bitácora</span>
              </h3>
              <button onClick={() => setIsBitacoraModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddBitacora} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Título del Reporte *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Hormigonado de losa completado sin novedades"
                  value={tituloBitacora}
                  onChange={(e) => setTituloBitacora(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Tipo de Evento
                  </label>
                  <select
                    value={tipoBitacora}
                    onChange={(e) => setTipoBitacora(e.target.value as any)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs"
                  >
                    <option value="avance">Avance de Partida</option>
                    <option value="incidente">Incidente / Problema</option>
                    <option value="clima">Clima / Lluvia</option>
                    <option value="entrega_material">Recepción de Material</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaBitacora}
                    onChange={(e) => setFechaBitacora(e.target.value)}
                    className="w-full px-2 py-1.5 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Observaciones / Detalle
                </label>
                <textarea
                  rows={3}
                  placeholder="Se vertieron 12m3 de hormigón H-25, cuadrilla de 4 operarios..."
                  value={notaBitacora}
                  onChange={(e) => setNotaBitacora(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  URL Fotografía de Terreno (Opcional)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={fotoBitacora}
                  onChange={(e) => setFotoBitacora(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsBitacoraModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-obra-orange text-white text-xs font-bold rounded-xl font-heading shadow-sm hover:bg-obra-orange-hover"
                >
                  Guardar en Bitácora
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Vista previa de Foto */}
      {previewPhoto && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-4 overflow-hidden relative shadow-2xl animate-in zoom-in-95">
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 right-3 p-1 rounded-full bg-black/50 text-white hover:bg-black"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={previewPhoto} alt="Evidencia fotográfica" className="w-full h-auto max-h-[75vh] object-contain rounded-lg" />
          </div>
        </div>
      )}

    </div>
  );
}
