'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  Plus,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle2,
  Calendar,
  User,
  ArrowUpRight,
  GanttChartSquare,
  Wallet,
  AlertCircle,
  X,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { Proyecto, Cliente } from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';

export default function ProyectosPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Formulario nuevo proyecto
  const [nombre, setNombre] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [montoCotizado, setMontoCotizado] = useState('');
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);
  const [fechaTermino, setFechaTermino] = useState(
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [descripcion, setDescripcion] = useState('');
  const [actividadesTexto, setActividadesTexto] = useState(
    'Cimientos y Radier (10 días)\nMontaje de Estructura y Muros (15 días)\nInstalaciones y Terminaciones (15 días)'
  );

  const loadData = () => {
    const projs = dataService.getProyectos();
    const cls = dataService.getClientes();
    setProyectos(projs);
    setClientes(cls);
    if (cls.length > 0 && !clienteId) {
      setClienteId(cls[0].id);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Métricas globales
  const proyectosActivos = proyectos.filter((p) => p.estado === 'activo');
  const cotizadoTotal = proyectosActivos.reduce((sum, p) => sum + (Number(p.monto_cotizado) || 0), 0);
  const totalCobrado = proyectosActivos.reduce((sum, p) => sum + (Number(p.total_pagado) || 0), 0);
  const porCobrar = Math.max(0, cotizadoTotal - totalCobrado);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    // Procesar actividades iniciales
    const initialActivities = actividadesTexto
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const daysMatch = line.match(/\((\d+)\s*d[ií]as?\)/i);
        const dias = daysMatch ? parseInt(daysMatch[1], 10) : 7;
        const cleanName = line.replace(/\(\d+\s*d[ií]as?\)/i, '').trim();
        return { nombre: cleanName || line, dias };
      });

    const activeUser = dataService.getActiveUser();

    dataService.createProyecto(
      {
        empresa_id: activeUser.empresa_id,
        cliente_id: clienteId || undefined,
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        fecha_inicio: fechaInicio,
        fecha_termino_estimada: fechaTermino,
        estado: 'activo',
        monto_cotizado: Number(montoCotizado) || 0,
      },
      initialActivities
    );

    setIsModalOpen(false);
    setNombre('');
    setDescripcion('');
    setMontoCotizado('');
    loadData();
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Navbar
        title="Obras & Proyectos"
        subtitle="Panel central de control, avance ponderado y estado financiero"
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-2 transition-all font-heading"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Proyecto</span>
          </button>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Tarjetas de Resumen KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Proyectos Activos */}
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 tracking-wider">
                Proyectos Activos
              </p>
              <h3 className="text-2xl font-bold font-heading text-navy-900 mt-1">
                {proyectosActivos.length}
              </h3>
              <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                {proyectos.length} proyectos en total
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-navy-800 text-obra-orange flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
          </div>

          {/* Cotizado Total */}
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 tracking-wider">
                Cotizado Total
              </p>
              <h3 className="text-xl font-bold font-mono text-navy-900 mt-1">
                {formatCLP(cotizadoTotal)}
              </h3>
              <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                En obras en ejecución
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-obra-orange-light text-obra-orange flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>

          {/* Total Cobrado */}
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 tracking-wider">
                Total Cobrado
              </p>
              <h3 className="text-xl font-bold font-mono text-obra-green mt-1">
                {formatCLP(totalCobrado)}
              </h3>
              <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                {cotizadoTotal > 0 ? Math.round((totalCobrado / cotizadoTotal) * 100) : 0}% recaudado
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-obra-green-light text-obra-green flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          {/* Por Cobrar */}
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 tracking-wider">
                Saldo Por Cobrar
              </p>
              <h3 className="text-xl font-bold font-mono text-obra-red mt-1">
                {formatCLP(porCobrar)}
              </h3>
              <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                Estados de pago pendientes
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-obra-red-light text-obra-red flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

        </div>

        {/* Grid de Proyectos */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-heading text-navy-900 flex items-center gap-2">
              <span>Listado de Obras</span>
              <span className="text-xs font-mono bg-kraft-200 px-2 py-0.5 rounded text-navy-800">
                {proyectos.length}
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {proyectos.map((proj) => {
              const pagado = proj.total_pagado || 0;
              const cotizado = proj.monto_cotizado || 0;
              const percentPago = cotizado > 0 ? Math.min(100, Math.round((pagado / cotizado) * 100)) : 0;
              const avance = proj.porcentaje_avance_ponderado || 0;

              return (
                <div
                  key={proj.id}
                  className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header Obra */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <h3 className="font-heading font-bold text-base text-navy-900 leading-snug">
                          {proj.nombre}
                        </h3>
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          <span>{proj.cliente?.nombre || 'Cliente Particular'}</span>
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-bold font-mono uppercase px-2 py-0.5 rounded ${
                          proj.estado === 'activo'
                            ? 'bg-obra-green-light text-obra-green'
                            : proj.estado === 'terminado'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {proj.estado}
                      </span>
                    </div>

                    {/* Descripción breve */}
                    {proj.descripcion && (
                      <p className="text-xs text-gray-600 line-clamp-2 mb-4 font-sans leading-relaxed">
                        {proj.descripcion}
                      </p>
                    )}

                    {/* Barra de Avance Ponderado */}
                    <div className="space-y-1.5 mb-4">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-gray-600">Avance General (Ponderado)</span>
                        <span className="font-mono text-obra-orange">{avance}%</span>
                      </div>
                      <div className="w-full h-2 bg-kraft-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-obra-orange rounded-full transition-all duration-500"
                          style={{ width: `${avance}%` }}
                        />
                      </div>
                    </div>

                    {/* Estado de Pago (Cotizado vs Pagado) */}
                    <div className="bg-kraft-50 border border-kraft-200/60 rounded-lg p-3 space-y-1.5 mb-4">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-mono">Cotizado:</span>
                        <span className="font-mono font-bold text-navy-900">{formatCLP(cotizado)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-mono">Pagado:</span>
                        <span className="font-mono font-bold text-obra-green">
                          {formatCLP(pagado)} ({percentPago}%)
                        </span>
                      </div>
                      <div className="flex justify-between text-xs pt-1 border-t border-kraft-200/60">
                        <span className="text-gray-500 font-mono">Saldo:</span>
                        <span className="font-mono font-semibold text-obra-red">
                          {formatCLP(proj.saldo_pendiente)}
                        </span>
                      </div>
                    </div>

                    {/* Fechas de Obra */}
                    <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono mb-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {formatDate(proj.fecha_inicio)}
                      </span>
                      <span>→</span>
                      <span>{formatDate(proj.fecha_termino_estimada)}</span>
                    </div>
                  </div>

                  {/* Acciones directas (Gantt & Finanzas) */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-kraft-200">
                    <Link
                      href={`/proyectos/${proj.id}/gantt`}
                      className="py-2 px-3 bg-navy-800 hover:bg-navy-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all font-heading"
                    >
                      <GanttChartSquare className="w-3.5 h-3.5 text-obra-orange" />
                      <span>Carta Gantt</span>
                    </Link>

                    <Link
                      href={`/proyectos/${proj.id}/finanzas`}
                      className="py-2 px-3 bg-kraft-100 hover:bg-kraft-200 text-navy-900 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all font-heading"
                    >
                      <Wallet className="w-3.5 h-3.5 text-navy-800" />
                      <span>Finanzas</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Modal: + Nuevo Proyecto */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-lg text-navy-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-obra-orange" />
                <span>Registrar Nuevo Proyecto</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre de la Obra *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Remodelación Cocina y Quincho"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Cliente *
                </label>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                >
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.telefono || 'Sin fono'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Monto Cotizado (CLP) *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="Ej: 18500000"
                    value={montoCotizado}
                    onChange={(e) => setMontoCotizado(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha Inicio *
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Fecha Término Estimada *
                </label>
                <input
                  type="date"
                  required
                  value={fechaTermino}
                  onChange={(e) => setFechaTermino(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Descripción / Alcance
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles de los trabajos a ejecutar..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Actividades Iniciales (para la Carta Gantt)
                </label>
                <textarea
                  rows={3}
                  value={actividadesTexto}
                  onChange={(e) => setActividadesTexto(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-orange"
                />
                <span className="text-[11px] text-gray-400 font-mono mt-1 block">
                  Escribe una actividad por línea con su duración estimada en días entre paréntesis.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-lg shadow-sm font-heading"
                >
                  Crear Proyecto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
