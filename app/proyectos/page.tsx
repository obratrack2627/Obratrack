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
  Trash2,
  AlertTriangle,
  Edit3,
  HardHat,
  FolderPlus,
  Sparkles,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { Proyecto, Cliente, SubscriptionPlanId, ProjectStatus } from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';
import { getPlanDetails } from '@/lib/plans';
import PlanSwitcherModal from '@/components/PlanSwitcherModal';

export default function ProyectosPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [projectToDelete, setProjectToDelete] = useState<Proyecto | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  // Formulario editar proyecto
  const [editingProject, setEditingProject] = useState<Proyecto | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editClienteId, setEditClienteId] = useState('');
  const [editMontoCotizado, setEditMontoCotizado] = useState('');
  const [editFechaInicio, setEditFechaInicio] = useState('');
  const [editFechaTermino, setEditFechaTermino] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editEstado, setEditEstado] = useState<ProjectStatus>('activo');

  const loadData = () => {
    const projs = dataService.getProyectos();
    const cls = dataService.getClientes();
    const plan = dataService.getActivePlan();
    setProyectos(projs);
    setClientes(cls);
    setActivePlan(plan);
    if (cls.length > 0 && !clienteId) {
      setClienteId(cls[0].id);
    }
  };

  useEffect(() => {
    loadData();
    const handler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    window.addEventListener('obratrack_plan_changed', handler);
    return () => window.removeEventListener('obratrack_plan_changed', handler);
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
    setToastMessage(`Obra "${nombre.trim()}" creada exitosamente.`);
    loadData();
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleOpenEdit = (proj: Proyecto) => {
    setEditingProject(proj);
    setEditNombre(proj.nombre);
    setEditClienteId(proj.cliente_id || (clientes.length > 0 ? clientes[0].id : ''));
    setEditMontoCotizado(String(proj.monto_cotizado || ''));
    setEditFechaInicio(proj.fecha_inicio);
    setEditFechaTermino(proj.fecha_termino_estimada);
    setEditDescripcion(proj.descripcion || '');
    setEditEstado(proj.estado);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !editNombre.trim()) return;

    dataService.updateProyecto(editingProject.id, {
      nombre: editNombre.trim(),
      cliente_id: editClienteId || undefined,
      monto_cotizado: Number(editMontoCotizado) || 0,
      fecha_inicio: editFechaInicio,
      fecha_termino_estimada: editFechaTermino,
      descripcion: editDescripcion.trim(),
      estado: editEstado,
    });

    setEditingProject(null);
    setToastMessage(`Obra "${editNombre.trim()}" actualizada exitosamente.`);
    loadData();
    setTimeout(() => setToastMessage(null), 3000);
  };

  const confirmDelete = () => {
    if (!projectToDelete) return;
    dataService.deleteProyecto(projectToDelete.id);
    setToastMessage(`Obra "${projectToDelete.nombre}" eliminada exitosamente.`);
    setProjectToDelete(null);
    loadData();
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <PlanSwitcherModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />

      <Navbar
        title="Obras & Proyectos"
        subtitle="Panel central de control, avance ponderado y estado financiero"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E5DFC9] text-xs font-mono text-gray-700 hover:border-[#FF6A00] transition-colors shadow-sm"
            >
              <span className="w-2 h-2 rounded-full bg-[#FF6A00]"></span>
              <span>{getPlanDetails(activePlan).nombre}</span>
            </button>
            <button
              onClick={() => {
                if (activePlan === 'gratis' && proyectosActivos.length >= 1) {
                  setIsPlanModalOpen(true);
                } else {
                  setIsModalOpen(true);
                }
              }}
              className="px-4 py-2.5 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2 transition-all font-heading"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Proyecto</span>
            </button>
          </div>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Banner Informativo si está en Plan Gratis y llegó al límite */}
        {activePlan === 'gratis' && proyectosActivos.length >= 1 && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-xs font-bold font-heading">
                  Límite del Plan Gratis alcanzado ({proyectosActivos.length}/1 Obra Activa)
                </p>
                <p className="text-[11px] text-amber-800 font-sans">
                  Para gestionar obras ilimitadas, desbloquear el Cotizador con IA y el comparador de precios, activa el <strong>Plan Pro</strong>.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="px-3.5 py-1.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-sm transition-colors whitespace-nowrap"
            >
              ⚡ Simular Plan Pro en Demo
            </button>
          </div>
        )}
        
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

          {proyectos.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-[#E5DFC9] rounded-3xl p-10 text-center max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-[#FAF8F5] border border-[#E5DFC9] flex items-center justify-center mx-auto text-[#FF6A00]">
                <HardHat className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-heading font-black text-xl text-[#1E1E1E]">
                  Aún no has registrado ninguna obra
                </h3>
                <p className="text-xs text-gray-500 font-sans mt-1.5 max-w-md mx-auto leading-relaxed">
                  Comienza agregando tu primer proyecto simulado con su fecha, cliente y actividades para la Carta Gantt.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 font-heading"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear Primera Obra</span>
                </button>
                <Link
                  href="/cotizador"
                  className="w-full sm:w-auto px-5 py-2.5 bg-white border border-[#E5DFC9] hover:bg-[#FAF8F5] text-[#1E1E1E] text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 font-heading"
                >
                  <Sparkles className="w-4 h-4 text-[#FF6A00]" />
                  <span>Ir al Cotizador IA</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {proyectos.map((proj) => {
                const pagado = proj.total_pagado || 0;
                const cotizado = proj.monto_cotizado || 0;
                const percentPago = cotizado > 0 ? Math.min(100, Math.round((pagado / cotizado) * 100)) : 0;
                const avance = proj.porcentaje_avance_ponderado || 0;

                return (
                  <div
                    key={proj.id}
                    className="bg-white border border-kraft-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Header Obra */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="overflow-hidden">
                          <h3 className="font-heading font-bold text-base text-navy-900 leading-snug truncate">
                            {proj.nombre}
                          </h3>
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 truncate">
                            <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{proj.cliente?.nombre || 'Cliente Particular'}</span>
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0">
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
                          
                          {/* Botón Editar Obra */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(proj)}
                            className="p-1.5 text-gray-400 hover:text-[#FF6A00] hover:bg-[#FF6A00]/10 rounded-lg transition-colors"
                            title="Editar obra"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Botón Eliminar Obra */}
                          <button
                            type="button"
                            onClick={() => setProjectToDelete(proj)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar obra"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
                          <span className="text-gray-600">Avance General</span>
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
          )}
        </div>

      </div>

      {/* Modal: + Nuevo Proyecto */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in-95">
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
                  placeholder="Ej: Ampliación Quincho & Terraza Ugarte"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Cliente
                  </label>
                  <select
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                  >
                    <option value="">Cliente Particular / Sin registrar</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Monto Cotizado (CLP)
                  </label>
                  <input
                    type="number"
                    placeholder="15000000"
                    value={montoCotizado}
                    onChange={(e) => setMontoCotizado(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha de Inicio
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha Término Estimada
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaTermino}
                    onChange={(e) => setFechaTermino(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
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

      {/* Modal: Editar Proyecto */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-lg text-navy-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-obra-orange" />
                <span>Editar Obra</span>
              </h3>
              <button
                onClick={() => setEditingProject(null)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre de la Obra *
                </label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Cliente
                  </label>
                  <select
                    value={editClienteId}
                    onChange={(e) => setEditClienteId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                  >
                    <option value="">Cliente Particular / Sin registrar</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Estado de la Obra
                  </label>
                  <select
                    value={editEstado}
                    onChange={(e) => setEditEstado(e.target.value as ProjectStatus)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                  >
                    <option value="activo">Activo (En Ejecución)</option>
                    <option value="terminado">Terminado (Entregado)</option>
                    <option value="pausado">Pausado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Monto Cotizado (CLP)
                </label>
                <input
                  type="number"
                  value={editMontoCotizado}
                  onChange={(e) => setEditMontoCotizado(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha de Inicio
                  </label>
                  <input
                    type="date"
                    required
                    value={editFechaInicio}
                    onChange={(e) => setEditFechaInicio(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha Término Estimada
                  </label>
                  <input
                    type="date"
                    required
                    value={editFechaTermino}
                    onChange={(e) => setEditFechaTermino(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Descripción / Alcance
                </label>
                <textarea
                  rows={2}
                  value={editDescripcion}
                  onChange={(e) => setEditDescripcion(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-lg shadow-sm font-heading"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación: Eliminar Proyecto */}
      {projectToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="font-heading font-black text-xl text-[#1E1E1E]">
                ¿Eliminar esta obra?
              </h3>
              <p className="text-sm font-bold text-[#FF6A00]">
                "{projectToDelete.nombre}"
              </p>
              <p className="text-xs text-gray-500 font-sans mt-2 leading-relaxed">
                Esta acción eliminará de forma permanente el proyecto, su Carta Gantt asociada, sus estados de pago y sus registros de imprevistos.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-heading font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-heading font-bold transition-colors shadow-md flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, Eliminar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1E1E1E] text-white px-4 py-3 rounded-2xl shadow-xl border border-gray-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-5 h-5 text-[#6B8F72] shrink-0" />
          <span className="text-xs font-heading font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
