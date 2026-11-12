'use client';
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
  CheckCircle2,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { Proyecto, AsistenciaObrero } from '@/types/database';
import { formatDate } from '@/lib/utils';

export default function ControlAsistenciaGlobalPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaObrero[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [obraFiltro, setObraFiltro] = useState('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | 'presente' | 'atraso' | 'ausente'>('todos');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = () => {
    setProyectos(dataService.getProyectos());
    setAsistencias(dataService.getAsistencias());
  };

  useEffect(() => {
    loadData();
    const onSync = () => loadData();
    window.addEventListener('obratrack_cloud_synced', onSync);
    return () => window.removeEventListener('obratrack_cloud_synced', onSync);
  }, []);

  const handleMarcarObraCompleta = (proyectoId: string) => {
    try {
      const regs = dataService.marcarCuadrillaPresente(proyectoId, fechaFiltro, '', '');
      loadData();
      showToast(`✅ ${regs.length} obreros marcados presentes en la obra seleccionada.`);
    } catch(error){showToast(error instanceof Error?error.message:'No se pudo registrar la asistencia.');}
  };

  const handleExportarConsolidado = () => {
    if (asistencias.length === 0) {
      showToast('No hay registros de asistencia para exportar.');
      return;
    }
    const headers = ['Fecha', 'Obra', 'Trabajador', 'Cargo', 'Estado', 'Entrada', 'Salida', 'Horas', 'Origen'];
    const rows = asistencias.map((a) => {
      const pName = proyectos.find((p) => p.id === a.proyecto_id)?.nombre || a.proyecto_id;
      return [
        a.fecha,
        `"${pName}"`,
        `"${a.trabajador_nombre}"`,
        `"${a.trabajador_rol || ''}"`,
        a.estado,
        a.hora_entrada || '',
        a.hora_salida || '',
        String(a.horas_trabajadas || 0),
        a.origen,
      ].join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
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

  const presentesHoy = asistencias.filter(
    (a) => a.fecha === fechaFiltro && (a.estado === 'presente' || a.estado === 'atraso')
  ).length;
  const atrasosHoy = asistencias.filter(
    (a) => a.fecha === fechaFiltro && a.estado === 'atraso'
  ).length;
  const ausenciasHoy = asistencias.filter(
    (a) => a.fecha === fechaFiltro && (a.estado === 'ausente' || a.estado === 'licencia')
  ).length;
  const totalHorasMes = asistencias.reduce((acc, a) => acc + (Number(a.horas_trabajadas) || 0), 0);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#FAF8F5] dark:bg-[#0E131B] pb-16">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-navy-900 text-white border border-obra-orange/40 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-5 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-obra-orange shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Navbar
        title="Asistencia"
        subtitle="Asistencia diaria de tus obras."
        action={
          <button
            onClick={handleExportarConsolidado}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#E05E00] text-white text-xs font-heading font-bold shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Exportar asistencia</span>
          </button>
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

        {/* Tarjetas Rápidas por Obra Activa */}
        <div className="space-y-3">
          <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white">
            Acceso Rápido a Planilla por Obra
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {proyectos
              .filter((p) => p.estado === 'activo')
              .map((p) => {
                const asisObraHoy = asistencias.filter(
                  (a) =>
                    a.proyecto_id === p.id &&
                    a.fecha === fechaFiltro &&
                    (a.estado === 'presente' || a.estado === 'atraso')
                );
                return (
                  <div
                    key={p.id}
                    className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase text-[#6B8F72] bg-[#6B8F72]/15 px-2 py-0.5 rounded-full">
                          {asisObraHoy.length} presentes hoy
                        </span>
                        <span className="text-[11px] text-gray-400">{p.comuna || 'Chile'}</span>
                      </div>
                      <h4 className="text-sm font-heading font-bold text-navy-900 dark:text-white mt-2">
                        {p.nombre}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-kraft-100 dark:border-[#1E2530]">
                      <button
                        type="button"
                        onClick={() => handleMarcarObraCompleta(p.id)}
                        className="px-3 py-1.5 rounded-xl bg-[#6B8F72]/15 hover:bg-[#6B8F72] text-[#6B8F72] hover:text-white text-xs font-bold transition-colors"
                      >
                        ✓ Pasar lista 1 clic
                      </button>
                      <Link
                        href={`/proyectos/${p.id}/asistencia`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#FF6A00] hover:underline"
                      >
                        <span>Abrir planilla</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Barra Unificada de Búsqueda y Filtros de Asistencia */}
        <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3 min-w-0">
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
                <input
                  type="date"
                  aria-label="Filtrar por fecha"
                  value={fechaFiltro}
                  onChange={(e) => setFechaFiltro(e.target.value)}
                  className="bg-transparent text-xs font-mono text-navy-900 dark:text-white focus:outline-none min-w-0"
                />
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
                      className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
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
        </div>

        {/* Tabla Consolidada */}
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
                No hay asistencias registradas para esta fecha o filtro. Puedes usar el botón &quot;✓ Pasar lista 1 clic&quot; en las tarjetas de arriba o entrar a la planilla de una obra.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
          )}
        </div>
      </div>
    </div>
  );
}
