'use client';
import { csvCell } from '@/lib/work-calendar';
import { chileToday } from '@/lib/ai/project-deadlines';

import CompactSummary from '@/components/CompactSummary';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ClipboardCheck,
  UserCheck,
  UserX,
  Clock,
  Building2,
  Calendar,
  Download,
  ArrowRight,
  Smartphone,
  Sparkles,
  Search,
  FileSpreadsheet,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { toast } from '@/components/ToastProvider';
import { aggregateMonthlyAttendance } from '@/lib/attendance-monthly';
import { downloadMonthlyAttendanceExcel } from '@/lib/excel-export';
import { dataService } from '@/lib/data-service';
import { Proyecto, AsistenciaObrero } from '@/types/database';
import { formatDate } from '@/lib/utils';

export default function ControlAsistenciaGlobalPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaObrero[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState(chileToday());
  const [viewMode, setViewMode] = useState<'diario' | 'mensual'>('diario');
  const [mesFiltro, setMesFiltro] = useState(chileToday().slice(0, 7));
  const [obraFiltro, setObraFiltro] = useState('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | 'presente' | 'atraso' | 'ausente'>('todos');

  const showToast = (msg: string, tone: 'success' | 'info' | 'error' = 'info') => {
    toast(msg, tone);
  };

  const loadData = () => {
    setProyectos(dataService.getProyectos());
    setAsistencias(dataService.getAsistencias());
  };

  useEffect(() => {
    loadData();
    const params = new URLSearchParams(window.location.search);
    if (params.get('vista') === 'mensual') {
      setViewMode('mensual');
    }
    const onSync = () => loadData();
    window.addEventListener('obratrack_cloud_synced', onSync);
    return () => window.removeEventListener('obratrack_cloud_synced', onSync);
  }, []);

  const handleMarcarObraCompleta = async (proyectoId: string) => {
    const hoy = chileToday();
    const fechaObjetivo = fechaFiltro || hoy;
    if (fechaObjetivo > hoy) {
      showToast('No puedes marcar asistencia en una fecha futura.');
      return;
    }
    try {
      const regs = dataService.marcarCuadrillaPresente(proyectoId, fechaObjetivo, '', '');
      loadData();
      if (regs.length === 0) {
        showToast('No hay trabajadores asignados en esta obra para pasar lista.');
        return;
      }
      try {
        await dataService.confirmarCambios();
        showToast(`✅ ${regs.length} obreros marcados presentes en la obra seleccionada.`);
      } catch (syncError) {
        showToast(
          syncError instanceof Error
            ? syncError.message
            : `✅ ${regs.length} obreros marcados localmente; pendiente de sincronización.`,
        );
      } finally {
        loadData();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo registrar la asistencia.');
    }
  };

  const monthlyFilteredRows = React.useMemo(() => {
    const base = aggregateMonthlyAttendance(asistencias, proyectos, mesFiltro, obraFiltro);
    const q = searchTerm.toLowerCase().trim();
    if (!q) return base;
    return base.filter(
      (r) =>
        r.trabajador.toLowerCase().includes(q) ||
        r.cargo.toLowerCase().includes(q) ||
        r.obras.some((o) => o.toLowerCase().includes(q)),
    );
  }, [asistencias, proyectos, mesFiltro, obraFiltro, searchTerm]);

  const handleExportarMensualExcel = async () => {
    if (monthlyFilteredRows.length === 0) {
      showToast('No hay marcajes registrados en el mes seleccionado.', 'info');
      return;
    }
    try {
      await downloadMonthlyAttendanceExcel(
        monthlyFilteredRows,
        mesFiltro,
        dataService.getEmpresa()?.nombre,
      );
      showToast(`Planilla mensual ${mesFiltro} descargada en Excel.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo generar el Excel mensual.', 'error');
    }
  };

  const handleExportarConsolidado = () => {
    if (viewMode === 'mensual') {
      if (monthlyFilteredRows.length === 0) {
        showToast('No hay registros mensuales de asistencia para exportar.', 'info');
        return;
      }
      const headers = ['Mes', 'Trabajador', 'Cargo', 'Presentes', 'Atrasos', 'Ausencias', 'Licencias/Permisos', 'Días', 'Horas', 'Obras'];
      const rows = monthlyFilteredRows.map((r) =>
        [
          mesFiltro,
          r.trabajador,
          r.cargo,
          r.presentes,
          r.atrasos,
          r.ausentes,
          r.licenciasPermisos,
          r.totalDias,
          r.totalHoras,
          r.obras.join(' · '),
        ]
          .map(csvCell)
          .join(','),
      );
      const csv = '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Consolidado_Mensual_Asistencia_${mesFiltro}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('Resumen mensual CSV descargado.', 'success');
      return;
    }

    if (asistenciasFiltradas.length === 0) {
      showToast('No hay registros de asistencia para exportar.', 'info');
      return;
    }
    const headers = ['Fecha', 'Obra', 'Trabajador', 'Cargo', 'Estado', 'Entrada', 'Salida', 'Horas', 'Origen'];
    const rows = asistenciasFiltradas.map((a) => [
      a.fecha, proyectos.find(p=>p.id===a.proyecto_id)?.nombre || a.proyecto_id,
      a.trabajador_nombre, a.trabajador_rol || '', a.estado, a.hora_entrada || '',
      a.hora_salida || '', a.horas_trabajadas || 0, a.origen,
    ].map(csvCell).join(','));
    const csv = '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Consolidado_Asistencia_ObraTrack_${fechaFiltro}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const asistenciasBase = asistencias.filter((a) => {
    const matchFecha = !fechaFiltro || a.fecha === fechaFiltro;
    const matchObra = obraFiltro === 'todas' || a.proyecto_id === obraFiltro;
    return matchFecha && matchObra;
  });

  const asistenciasFiltradas = asistenciasBase.filter((a) => {
    const matchEstado =
      estadoFiltro === 'todos' ||
      (estadoFiltro === 'presente' && a.estado === 'presente') ||
      (estadoFiltro === 'atraso' && a.estado === 'atraso') ||
      (estadoFiltro === 'ausente' && (a.estado === 'ausente' || a.estado === 'licencia' || a.estado === 'permiso'));
    const q = searchTerm.toLowerCase().trim();
    const obraNombre = (proyectos.find((p) => p.id === a.proyecto_id)?.nombre || '').toLowerCase();
    const matchQuery =
      !q ||
      a.trabajador_nombre.toLowerCase().includes(q) ||
      (a.trabajador_rol || '').toLowerCase().includes(q) ||
      obraNombre.includes(q);
    return matchEstado && matchQuery;
  });

  const presentesHoy = asistenciasBase.filter(
    (a) => a.estado === 'presente' || a.estado === 'atraso'
  ).length;
  const atrasosHoy = asistenciasBase.filter(
    (a) => a.estado === 'atraso'
  ).length;
  const ausenciasHoy = asistenciasBase.filter(
    (a) => a.estado === 'ausente' || a.estado === 'licencia' || a.estado === 'permiso'
  ).length;
  const mesActivo = viewMode === 'mensual' ? mesFiltro : (fechaFiltro || chileToday()).slice(0, 7);
  const totalHorasMes = asistencias
    .filter(
      (a) =>
        (obraFiltro === 'todas' || a.proyecto_id === obraFiltro) &&
        (a.fecha || '').startsWith(mesActivo)
    )
    .reduce((acc, a) => acc + (Number(a.horas_trabajadas) || 0), 0);

  const activeProjects = proyectos.filter((p) => p.estado === 'activo');
  const presentesPorProyecto = new Map<string, number>();
  for (const a of asistencias) {
    if (a.fecha === fechaFiltro && (a.estado === 'presente' || a.estado === 'atraso')) {
      presentesPorProyecto.set(a.proyecto_id, (presentesPorProyecto.get(a.proyecto_id) || 0) + 1);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[var(--bg-page)] pb-16">
      <Navbar
        title="Asistencia"
        subtitle="Asistencia diaria y consolidado mensual de tus obras."
        action={
          <div className="flex items-center gap-2">
            {viewMode === 'mensual' && (
              <button
                type="button"
                onClick={handleExportarMensualExcel}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] hover:border-[#FF6A00] text-navy-900 dark:text-white text-xs font-heading font-bold shadow-sm transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#6B8F72]" />
                <span className="hidden sm:inline">Excel (.xlsx)</span>
              </button>
            )}
            <button
              onClick={handleExportarConsolidado}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#E05E00] text-white text-xs font-heading font-bold shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Exportar asistencia</span>
            </button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* KPIs Globales */}
        <CompactSummary><div className="workspace-metrics grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#141A23] p-4 sm:p-5 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">Obreros Presentes ({formatDate(fechaFiltro)})</span>
              <div className="w-8 h-8 rounded-lg bg-obra-green-light dark:bg-obra-green/15 text-[#6B8F72] flex items-center justify-center shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-heading font-bold text-navy-900 dark:text-white">
              {presentesHoy}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">En todas las faenas activas</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 sm:p-5 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">Atrasos del Día</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-heading font-bold text-navy-900 dark:text-white">
              {atrasosHoy}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Ingreso posterior al horario</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 sm:p-5 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">Ausencias / Licencias</span>
              <div className="w-8 h-8 rounded-lg bg-red-500/15 text-red-500 flex items-center justify-center shrink-0">
                <UserX className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-heading font-bold text-navy-900 dark:text-white">
              {ausenciasHoy}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Sin ingreso en jornada seleccionada</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 sm:p-5 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">Horas-Hombre Totales</span>
              <div className="w-8 h-8 rounded-lg bg-obra-orange-light dark:bg-obra-orange/15 text-[#FF6A00] flex items-center justify-center shrink-0">
                <ClipboardCheck className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-heading font-bold text-navy-900 dark:text-white">
              {totalHorasMes.toFixed(1)} h
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Horas registradas</p>
          </div>
        </div></CompactSummary>

        {/* Acceso Rápido a Planilla por Obra (Vista en Lista) */}
        <div className="space-y-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white">
              Acceso Rápido a Planilla por Obra
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              {activeProjects.length}{' '}
              {activeProjects.length === 1 ? 'obra activa' : 'obras activas'}
            </span>
          </div>

          <div className="bg-white dark:bg-[#141A23] rounded-2xl border border-kraft-200 dark:border-[#263040] px-4 py-3 sm:px-5 shadow-sm overflow-x-auto">
            {activeProjects.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                No hay obras activas registradas para pasar asistencia.
              </div>
            ) : (
              <>
                <div className="hidden md:grid md:grid-cols-12 gap-3 items-center pb-2 border-b border-kraft-200 dark:border-[#263040] text-[11px] font-mono uppercase text-gray-500 dark:text-gray-400">
                  <div className="md:col-span-4">Obra</div>
                  <div className="md:col-span-2">Comuna</div>
                  <div className="md:col-span-2">Asistencia</div>
                  <div className="md:col-span-4 md:text-right">Acciones</div>
                </div>
                <ul className="divide-y divide-kraft-200/70 dark:divide-[#263040] text-xs">
                  {activeProjects.map((p) => {
                    const asisObraHoy = presentesPorProyecto.get(p.id) || 0;

                    return (
                      <li
                        key={p.id}
                        className="py-2.5 transition-colors hover:bg-kraft-50/50 dark:hover:bg-[#1A222D]/40"
                      >
                        <div className="flex flex-col gap-2 md:grid md:grid-cols-12 md:gap-3 md:items-center min-w-0">
                          <div className="md:col-span-4 min-w-0 font-semibold text-navy-900 dark:text-white truncate">
                            {p.nombre}
                          </div>
                          <div className="md:col-span-2 min-w-0 text-gray-500 dark:text-gray-400 truncate">
                            {p.comuna || 'Chile'}
                          </div>
                          <div className="md:col-span-2 min-w-0">
                            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold">
                              {asisObraHoy} presentes hoy
                            </span>
                          </div>
                          <div className="md:col-span-4 flex flex-wrap items-center md:justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleMarcarObraCompleta(p.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-700 text-emerald-800 hover:text-white dark:bg-emerald-950/50 dark:text-emerald-300 text-[11px] font-semibold transition-colors whitespace-nowrap"
                            >
                              ✓ Pasar lista 1 clic
                            </button>
                            <Link
                              href={`/proyectos/${p.id}/asistencia`}
                              className="inline-flex items-center gap-1 rounded-lg border border-kraft-200 dark:border-[#2C3748] px-2.5 py-1 text-[11px] font-semibold text-[#C2410C] dark:text-obra-orange hover:bg-orange-50 dark:hover:bg-[#FF6A00]/10 transition-colors whitespace-nowrap"
                            >
                              <span>Abrir planilla</span>
                              <ArrowRight className="w-3 h-3 shrink-0" />
                            </Link>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Barra Unificada de Búsqueda y Filtros de Asistencia */}
        <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-kraft-100 dark:border-[#1E2530]">
            <div
              role="tablist"
              aria-label="Modo de vista de asistencia"
              className="inline-flex items-center rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0F141C] p-1 gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'diario'}
                onClick={() => setViewMode('diario')}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-all ${
                  viewMode === 'diario'
                    ? 'bg-navy-900 dark:bg-obra-orange text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-navy-900 dark:hover:text-white'
                }`}
              >
                Diario
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'mensual'}
                onClick={() => setViewMode('mensual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-all ${
                  viewMode === 'mensual'
                    ? 'bg-navy-900 dark:bg-obra-orange text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-navy-900 dark:hover:text-white'
                }`}
              >
                Resumen Mensual
              </button>
            </div>
            <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
              {viewMode === 'diario'
                ? `${asistenciasFiltradas.length} marcaje(s)`
                : `${monthlyFilteredRows.length} trabajador(es) en ${mesFiltro}`}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por trabajador, cargo u obra..."
                className="w-full h-10 pl-10 pr-8 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] rounded-xl text-xs text-navy-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-obra-orange focus:bg-white dark:focus:bg-[#141A23] transition-colors font-sans"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full hover:bg-kraft-200 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-center text-xs transition-colors"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0 min-w-0">
              <div className="flex items-center gap-1.5 h-10 bg-kraft-50 dark:bg-[#0F141C] px-3 rounded-xl border border-kraft-200 dark:border-[#263040] min-w-0">
                <Calendar className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
                {viewMode === 'diario' ? (
                  <input
                    type="date"
                    aria-label="Filtrar por fecha"
                    max={chileToday()}
                    value={fechaFiltro}
                    onChange={(e) => setFechaFiltro(e.target.value || chileToday())}
                    className="bg-transparent text-xs font-mono text-navy-900 dark:text-white focus:outline-none min-w-0"
                  />
                ) : (
                  <input
                    type="month"
                    aria-label="Filtrar resumen mensual por mes"
                    value={mesFiltro}
                    onChange={(e) => setMesFiltro(e.target.value || chileToday().slice(0, 7))}
                    className="bg-transparent text-xs font-mono text-navy-900 dark:text-white focus:outline-none min-w-0"
                  />
                )}
              </div>

              <select
                aria-label="Filtrar asistencia por obra"
                value={obraFiltro}
                onChange={(e) => setObraFiltro(e.target.value)}
                className="h-10 px-3 rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0F141C] text-xs font-medium text-navy-900 dark:text-white truncate min-w-0 max-w-full sm:w-52"
              >
                <option value="todas">Todas las obras</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {viewMode === 'diario' && (
          <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-kraft-100 dark:border-[#1E2530] min-w-0">
            <div
              role="tablist"
              aria-label="Filtrar asistencia por estado"
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full pb-1 sm:pb-0 -mx-1 px-1"
            >
              {(
                [
                  {
                    value: 'todos',
                    label: 'Todos',
                    count: asistenciasBase.length,
                    dot: 'bg-gray-400',
                    activeClass:
                      'bg-navy-900 text-white border-navy-900 dark:bg-white dark:text-navy-900 dark:border-white shadow-sm',
                  },
                  {
                    value: 'presente',
                    label: 'Presentes',
                    count: asistenciasBase.filter((a) => a.estado === 'presente').length,
                    dot: 'bg-obra-green',
                    activeClass: 'bg-obra-green text-white border-obra-green shadow-sm',
                  },
                  {
                    value: 'atraso',
                    label: 'Atrasos',
                    count: asistenciasBase.filter((a) => a.estado === 'atraso').length,
                    dot: 'bg-amber-500',
                    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-sm',
                  },
                  {
                    value: 'ausente',
                    label: 'Ausencias / Licencias',
                    count: asistenciasBase.filter(
                      (a) => a.estado === 'ausente' || a.estado === 'licencia' || a.estado === 'permiso'
                    ).length,
                    dot: 'bg-red-500',
                    activeClass: 'bg-red-600 text-white border-red-600 shadow-sm',
                  },
                ] as const
              ).map((tab) => {
                const isActive = estadoFiltro === tab.value;
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    key={tab.value}
                    onClick={() => setEstadoFiltro(tab.value)}
                    className={`h-8 px-3 rounded-xl text-xs font-heading font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap border transition-all ${
                      isActive
                        ? tab.activeClass
                        : 'bg-kraft-50 dark:bg-[#0F141C] text-gray-600 dark:text-gray-300 border-kraft-200 dark:border-[#263040] hover:bg-kraft-100 dark:hover:bg-[#1E2530]'
                    }`}
                  >
                    {tab.value !== 'todos' && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isActive ? 'bg-white dark:bg-current' : tab.dot
                        }`}
                      />
                    )}
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                        isActive
                          ? 'bg-white/20 text-current'
                          : 'bg-kraft-200/70 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {(searchTerm || estadoFiltro !== 'todos' || obraFiltro !== 'todas') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setEstadoFiltro('todos');
                  setObraFiltro('todas');
                }}
                className="text-xs font-heading font-bold text-obra-orange hover:underline shrink-0 pl-2 whitespace-nowrap"
              >
                Limpiar
              </button>
            )}
          </div>
          )}
        </div>

        {viewMode === 'mensual' ? (
          <div className="bg-white dark:bg-[#141A23] rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm overflow-hidden">
            <div className="p-4 border-b border-kraft-100 dark:border-[#263040] flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-[#FF6A00]" />
                <span>Resumen Mensual de Asistencia ({mesFiltro})</span>
              </h3>
              {monthlyFilteredRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportarMensualExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0F141C] hover:border-[#FF6A00] text-xs font-heading font-semibold text-navy-900 dark:text-white transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#6B8F72]" />
                  <span>Descargar Excel (.xlsx)</span>
                </button>
              )}
            </div>

            {monthlyFilteredRows.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-sm font-heading font-bold text-navy-900 dark:text-white">
                  Sin marcajes registrados en {mesFiltro}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Cambia el mes o selecciona otra obra para revisar los acumulados.
                </p>
              </div>
            ) : (
              <>
                {/* Cards móviles mensuales */}
                <div className="md:hidden divide-y divide-kraft-100 dark:divide-[#1E2530]">
                  {monthlyFilteredRows.map((row) => (
                    <div key={row.workerKey} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-heading font-bold text-navy-900 dark:text-white">
                            {row.trabajador}
                          </p>
                          <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 capitalize">
                            {row.cargo}
                          </p>
                        </div>
                        <span className="text-xs font-mono font-bold text-obra-orange">
                          {row.totalHoras} h
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-mono">
                        <div className="rounded-lg bg-[#6B8F72]/15 text-[#6B8F72] py-1">
                          <span className="block font-bold">{row.presentes}</span>
                          <span className="text-[9px]">Pres.</span>
                        </div>
                        <div className="rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 py-1">
                          <span className="block font-bold">{row.atrasos}</span>
                          <span className="text-[9px]">Atras.</span>
                        </div>
                        <div className="rounded-lg bg-red-500/15 text-red-500 py-1">
                          <span className="block font-bold">{row.ausentes}</span>
                          <span className="text-[9px]">Aus.</span>
                        </div>
                        <div className="rounded-lg bg-kraft-100 dark:bg-[#0F141C] text-gray-700 dark:text-gray-300 py-1">
                          <span className="block font-bold">{row.totalDias}</span>
                          <span className="text-[9px]">Días</span>
                        </div>
                      </div>
                      {row.obras.length > 0 && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          Obras: {row.obras.join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Tabla escritorio mensual */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAF8F5] dark:bg-[#1A222D] text-[11px] font-mono uppercase text-gray-500 border-b border-kraft-200 dark:border-[#263040]">
                        <th className="py-3 px-4">Trabajador</th>
                        <th className="py-3 px-4">Cargo</th>
                        <th className="py-3 px-3 text-center">Presentes</th>
                        <th className="py-3 px-3 text-center">Atrasos</th>
                        <th className="py-3 px-3 text-center">Ausencias</th>
                        <th className="py-3 px-3 text-center">Lic./Perm.</th>
                        <th className="py-3 px-3 text-center">Días</th>
                        <th className="py-3 px-4 text-right">Horas</th>
                        <th className="py-3 px-4">Obras</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-kraft-100 dark:divide-[#1E2530]">
                      {monthlyFilteredRows.map((row) => (
                        <tr key={row.workerKey} className="hover:bg-kraft-50/50 dark:hover:bg-[#1A222D]/50">
                          <td className="py-3 px-4 font-bold text-navy-900 dark:text-white whitespace-nowrap">
                            {row.trabajador}
                          </td>
                          <td className="py-3 px-4 text-gray-500 dark:text-gray-400 capitalize whitespace-nowrap">
                            {row.cargo}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-[#6B8F72]">
                            {row.presentes}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                            {row.atrasos}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-red-500">
                            {row.ausentes}
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-gray-600 dark:text-gray-300">
                            {row.licenciasPermisos}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-semibold text-navy-900 dark:text-white">
                            {row.totalDias}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-obra-orange whitespace-nowrap">
                            {row.totalHoras} h
                          </td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-300 max-w-[220px] truncate">
                            {row.obras.join(' · ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : (
        /* Tabla Consolidada Diaria */
        <div className="bg-white dark:bg-[#141A23] rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-kraft-100 dark:border-[#263040] flex items-center justify-between gap-3">
            <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-[#FF6A00]" />
              <span>Registro Detallado de Marcajes — {formatDate(fechaFiltro)}</span>
            </h3>
          </div>

          {asistenciasFiltradas.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center mx-auto">
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-heading font-bold text-navy-900 dark:text-white">
                Sin marcajes para los filtros seleccionados
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                No hay asistencias registradas para esta fecha o filtro. Puedes usar el botón &quot;✓ Pasar lista 1 clic&quot; en la lista de arriba o entrar a la planilla de una obra.
              </p>
            </div>
          ) : (
            <>
              {/* Cards móviles diarias */}
              <div className="md:hidden divide-y divide-kraft-100 dark:divide-[#1E2530]">
                {asistenciasFiltradas.map((a) => {
                  const obraNombre =
                    proyectos.find((p) => p.id === a.proyecto_id)?.nombre || 'Obra';
                  return (
                    <div key={a.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-heading font-bold text-navy-900 dark:text-white truncate">
                            {a.trabajador_nombre}
                          </p>
                          <Link
                            href={`/proyectos/${a.proyecto_id}/asistencia`}
                            className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-[#FF6A00] inline-flex items-center gap-1 mt-0.5"
                          >
                            <Building2 className="w-3 h-3 text-[#FF6A00] shrink-0" />
                            <span className="truncate">{obraNombre}</span>
                          </Link>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase shrink-0 ${
                            a.estado === 'presente'
                              ? 'bg-[#6B8F72]/20 text-[#6B8F72]'
                              : a.estado === 'atraso'
                              ? 'bg-amber-500/20 text-amber-600'
                              : 'bg-red-500/15 text-red-500'
                          }`}
                        >
                          {a.estado}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-gray-500 dark:text-gray-400 pt-1">
                        <span>
                          {a.hora_entrada ? `${a.hora_entrada} - ${a.hora_salida || '--:--'}` : 'Sin marca'}
                        </span>
                        <span className="font-bold text-navy-900 dark:text-white">
                          {a.horas_trabajadas ? `${a.horas_trabajadas} h` : '0 h'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAF8F5] dark:bg-[#1A222D] text-[11px] font-mono uppercase text-gray-500 border-b border-kraft-200 dark:border-[#263040]">
                      <th className="py-3 px-4">Trabajador</th>
                      <th className="py-3 px-4">Obra</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4">Horario</th>
                      <th className="py-3 px-4">Horas</th>
                      <th className="py-3 px-4">Canal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-kraft-100 dark:divide-[#1E2530]">
                    {asistenciasFiltradas.map((a) => {
                      const obraNombre =
                        proyectos.find((p) => p.id === a.proyecto_id)?.nombre || 'Obra';
                      return (
                        <tr key={a.id}>
                          <td className="py-3 px-4 font-bold text-navy-900 dark:text-white">
                            {a.trabajador_nombre}
                          </td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-300">
                            <Link
                              href={`/proyectos/${a.proyecto_id}/asistencia`}
                              className="hover:text-[#FF6A00] inline-flex items-center gap-1"
                            >
                              <Building2 className="w-3.5 h-3.5 text-[#FF6A00]" />
                              <span>{obraNombre}</span>
                            </Link>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                                a.estado === 'presente'
                                  ? 'bg-[#6B8F72]/20 text-[#6B8F72]'
                                  : a.estado === 'atraso'
                                  ? 'bg-amber-500/20 text-amber-600'
                                  : 'bg-red-500/15 text-red-500'
                              }`}
                            >
                              {a.estado}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-gray-600 dark:text-gray-300">
                            {a.hora_entrada ? `${a.hora_entrada} - ${a.hora_salida || '--:--'}` : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-navy-900 dark:text-white">
                            {a.horas_trabajadas ? `${a.horas_trabajadas} h` : '0 h'}
                          </td>
                          <td className="py-3 px-4">
                            {a.origen === 'whatsapp_ia' ? (
                              <span className="inline-flex items-center gap-1 text-[#25D366] font-bold">
                                <Smartphone className="w-3.5 h-3.5" /> WhatsApp IA
                              </span>
                            ) : (
                              <span className="text-gray-500">Web</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
