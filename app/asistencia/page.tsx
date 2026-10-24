'use client';

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
    const regs = dataService.marcarCuadrillaPresente(proyectoId, fechaFiltro, '08:00', '18:00');
    loadData();
    showToast(`✅ ${regs.length} obreros marcados presentes en la obra seleccionada.`);
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

  const asistenciasFiltradas = asistencias.filter((a) => {
    const matchFecha = !fechaFiltro || a.fecha === fechaFiltro;
    const matchObra = obraFiltro === 'todas' || a.proyecto_id === obraFiltro;
    return matchFecha && matchObra;
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
        <div className="fixed bottom-6 right-6 z-50 bg-[#1E1E1E] text-white px-4 py-3 rounded-2xl shadow-2xl border border-[#FF6A00] flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="w-4 h-4 text-[#FF6A00]" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Navbar
        title="Control General de Asistencia"
        subtitle="Supervisión diaria de cuadrillas, horas-hombre y marcajes por WhatsApp en todas tus obras"
        action={
          <button
            onClick={handleExportarConsolidado}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#E05E00] text-white text-xs font-heading font-bold shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Planilla Remuneraciones (CSV)</span>
          </button>
        }
      />

      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* KPIs Globales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Obreros Presentes ({formatDate(fechaFiltro)})</span>
              <UserCheck className="w-4 h-4 text-[#6B8F72]" />
            </div>
            <p className="text-2xl font-heading font-black text-navy-900 dark:text-white">
              {presentesHoy}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">En todas las faenas activas</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Atrasos del Día</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-heading font-black text-navy-900 dark:text-white">
              {atrasosHoy}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Ingreso posterior al horario</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Ausencias / Licencias</span>
              <UserX className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-2xl font-heading font-black text-navy-900 dark:text-white">
              {ausenciasHoy}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Sin ingreso en jornada seleccionada</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Horas-Hombre Totales</span>
              <ClipboardCheck className="w-4 h-4 text-[#FF6A00]" />
            </div>
            <p className="text-2xl font-heading font-black text-navy-900 dark:text-white">
              {totalHorasMes.toFixed(1)} h
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Sincronizadas con Supabase</p>
          </div>
        </div>

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

        {/* Tabla Consolidada */}
        <div className="bg-white dark:bg-[#141A23] rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-kraft-100 dark:border-[#263040] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white">
              Registro Detallado de Marcajes
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-[#FAF8F5] dark:bg-[#1E2530] px-3 py-1.5 rounded-xl border border-kraft-200 dark:border-[#263040]">
                <Calendar className="w-3.5 h-3.5 text-[#FF6A00]" />
                <input
                  type="date"
                  value={fechaFiltro}
                  onChange={(e) => setFechaFiltro(e.target.value)}
                  className="bg-transparent text-xs font-mono text-navy-900 dark:text-white focus:outline-none"
                />
              </div>

              <select
                value={obraFiltro}
                onChange={(e) => setObraFiltro(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
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

          {asistenciasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500">
              No hay asistencias registradas para la fecha y filtro seleccionados. Usa el botón &quot;Pasar lista 1 clic&quot; arriba o entra a una obra.
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
