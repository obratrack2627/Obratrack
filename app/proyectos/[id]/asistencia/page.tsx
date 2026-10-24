'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ClipboardCheck,
  UserCheck,
  UserX,
  Clock,
  Calendar,
  Plus,
  Users,
  Smartphone,
  Sparkles,
  Download,
} from 'lucide-react';
import ProjectTabsHeader from '@/components/ProjectTabsHeader';
import GoogleMapsProjectViewer from '@/components/GoogleMapsProjectViewer';
import { dataService } from '@/lib/data-service';
import {
  Proyecto,
  Cliente,
  Usuario,
  AsistenciaObrero,
  EstadoAsistencia,
} from '@/types/database';
import { formatDate } from '@/lib/utils';

export default function ProyectoAsistenciaPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cuadrilla, setCuadrilla] = useState<Usuario[]>([]);
  const [todosUsuarios, setTodosUsuarios] = useState<Usuario[]>([]);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [asistenciasDia, setAsistenciasDia] = useState<AsistenciaObrero[]>([]);
  const [historialObra, setHistorialObra] = useState<AsistenciaObrero[]>([]);
  const [isMapsModalOpen, setIsMapsModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Registro rápido de obrero eventual / externo
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoRol, setNuevoRol] = useState('Maestro / Jornal');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = () => {
    if (!projectId) return;
    const proj = dataService.getProyectoById(projectId);
    setProyecto(proj || null);
    if (proj?.cliente_id) {
      setCliente(dataService.getClienteById(proj.cliente_id) || null);
    }

    const users = dataService.getUsuarios();
    setTodosUsuarios(users);

    const asignados = users.filter((u) => proj?.trabajadores_ids?.includes(u.id));
    setCuadrilla(asignados.length > 0 ? asignados : users.filter((u) => u.rol !== 'admin' || users.length <= 2));

    setAsistenciasDia(dataService.getAsistencias(projectId, fechaSeleccionada));
    setHistorialObra(dataService.getAsistencias(projectId));
  };

  useEffect(() => {
    loadData();
    const onSync = () => loadData();
    window.addEventListener('obratrack_cloud_synced', onSync);
    return () => window.removeEventListener('obratrack_cloud_synced', onSync);
  }, [projectId, fechaSeleccionada]);

  const handleMarcarEstado = (
    trabajador: { id?: string; nombre: string; rol?: string },
    estado: EstadoAsistencia,
    horaEntrada?: string,
    horaSalida?: string,
    observacion?: string
  ) => {
    if (!projectId) return;
    const prev = asistenciasDia.find(
      (a) =>
        (trabajador.id && a.usuario_id === trabajador.id) ||
        a.trabajador_nombre.toLowerCase() === trabajador.nombre.toLowerCase()
    );

    dataService.upsertAsistenciaObrero({
      id: prev?.id,
      proyecto_id: projectId,
      usuario_id: trabajador.id,
      trabajador_nombre: trabajador.nombre,
      trabajador_rol: trabajador.rol || 'terreno',
      fecha: fechaSeleccionada,
      estado,
      hora_entrada:
        horaEntrada ??
        prev?.hora_entrada ??
        (estado === 'atraso' ? '08:45' : estado === 'presente' ? '08:00' : ''),
      hora_salida:
        horaSalida ?? prev?.hora_salida ?? (estado === 'presente' || estado === 'atraso' ? '18:00' : ''),
      observacion: observacion ?? prev?.observacion ?? '',
      origen: prev?.origen || 'web',
    });

    loadData();
  };

  const handleMarcarTodosPresentes = () => {
    if (!projectId) return;
    const regs = dataService.marcarCuadrillaPresente(projectId, fechaSeleccionada, '08:00', '18:00');
    loadData();
    showToast(`✅ ${regs.length} trabajadores marcados presentes (08:00 - 18:00).`);
  };

  const handleAgregarObreroDia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim() || !projectId) return;
    dataService.upsertAsistenciaObrero({
      proyecto_id: projectId,
      trabajador_nombre: nuevoNombre.trim(),
      trabajador_rol: nuevoRol.trim() || 'Jornal',
      fecha: fechaSeleccionada,
      estado: 'presente',
      hora_entrada: '08:00',
      hora_salida: '18:00',
      origen: 'web',
    });
    setNuevoNombre('');
    loadData();
    showToast('👷 Trabajador registrado en la planilla del día.');
  };

  const handleExportarCSV = () => {
    if (historialObra.length === 0) {
      showToast('Aún no hay registros de asistencia para exportar.');
      return;
    }
    const headers = ['Fecha', 'Trabajador', 'Rol', 'Estado', 'Entrada', 'Salida', 'Horas', 'Origen', 'Observacion'];
    const rows = historialObra.map((a) => [
      a.fecha,
      `"${a.trabajador_nombre}"`,
      `"${a.trabajador_rol || ''}"`,
      a.estado,
      a.hora_entrada || '',
      a.hora_salida || '',
      String(a.horas_trabajadas || 0),
      a.origen,
      `"${(a.observacion || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Asistencia_${(proyecto?.nombre || 'Obra').replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Combinar trabajadores de cuadrilla + obreros adicionales registrados ese día
  const listaPlanilla = React.useMemo(() => {
    const items: Array<{ id?: string; nombre: string; rol?: string; registro?: AsistenciaObrero }> = [];
    const vistos = new Set<string>();

    cuadrilla.forEach((u) => {
      const reg = asistenciasDia.find(
        (a) => a.usuario_id === u.id || a.trabajador_nombre.toLowerCase() === u.nombre.toLowerCase()
      );
      items.push({ id: u.id, nombre: u.nombre, rol: u.rol, registro: reg });
      vistos.add(u.nombre.toLowerCase());
    });

    asistenciasDia.forEach((a) => {
      if (!vistos.has(a.trabajador_nombre.toLowerCase())) {
        items.push({
          id: a.usuario_id,
          nombre: a.trabajador_nombre,
          rol: a.trabajador_rol,
          registro: a,
        });
        vistos.add(a.trabajador_nombre.toLowerCase());
      }
    });

    return items;
  }, [cuadrilla, asistenciasDia]);

  const presentesCount = asistenciasDia.filter(
    (a) => a.estado === 'presente' || a.estado === 'atraso'
  ).length;
  const ausentesCount = asistenciasDia.filter(
    (a) => a.estado === 'ausente' || a.estado === 'licencia'
  ).length;
  const totalHorasAcumuladas = historialObra.reduce(
    (acc, a) => acc + (Number(a.horas_trabajadas) || 0),
    0
  );

  if (!proyecto) {
    return (
      <div className="p-8 text-center text-gray-500 font-mono text-sm">
        Cargando control de asistencia...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#FAF8F5] dark:bg-[#0E131B] pb-16">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1E1E1E] text-white px-4 py-3 rounded-2xl shadow-2xl border border-[#FF6A00] flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="w-4 h-4 text-[#FF6A00] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <ProjectTabsHeader
        proyecto={proyecto}
        cliente={cliente}
        onOpenMaps={() => setIsMapsModalOpen(true)}
      />

      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Cabecera y Acciones */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-heading font-bold text-navy-900 dark:text-white">
              Control de Asistencia de Obreros
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Registro diario de entrada/salida, horas-hombre y reportes de llegada vía WhatsApp IA.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white dark:bg-[#141A23] px-3 py-2 rounded-xl border border-kraft-200 dark:border-[#263040]">
              <Calendar className="w-4 h-4 text-[#FF6A00]" />
              <input
                type="date"
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                className="bg-transparent text-xs font-mono font-bold text-navy-900 dark:text-white focus:outline-none"
              />
            </div>

            <button
              onClick={handleMarcarTodosPresentes}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#6B8F72] hover:bg-[#5B7C61] text-white text-xs font-heading font-bold shadow-sm transition-colors"
            >
              <UserCheck className="w-4 h-4" />
              <span>Marcar Cuadrilla Presente (08:00 - 18:00)</span>
            </button>

            <button
              onClick={handleExportarCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] hover:border-[#FF6A00] text-navy-900 dark:text-white text-xs font-heading font-bold transition-colors"
            >
              <Download className="w-4 h-4 text-[#FF6A00]" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* KPIs de Asistencia */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Presentes / En Faena ({formatDate(fechaSeleccionada)})</span>
              <UserCheck className="w-4 h-4 text-[#6B8F72]" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {presentesCount} / {listaPlanilla.length}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Obreros activos en la jornada</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Ausencias / Licencias Hoy</span>
              <UserX className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {ausentesCount}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Inasistencias registradas</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Horas-Hombre Acumuladas</span>
              <Clock className="w-4 h-4 text-[#FF6A00]" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {totalHorasAcumuladas.toFixed(1)} hrs
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Total histórico en esta obra</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Equipo Asignado</span>
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {cuadrilla.length}
            </p>
            <Link href="/equipo" className="text-[11px] text-[#FF6A00] font-bold hover:underline mt-1 inline-block">
              Gestionar cuadrilla →
            </Link>
          </div>
        </div>

        {/* Planilla Diaria Interactiva */}
        <div className="bg-white dark:bg-[#141A23] rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-kraft-100 dark:border-[#263040] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-[#FF6A00]" />
              <span>Planilla de Asistencia — {formatDate(fechaSeleccionada)}</span>
            </h3>

            {/* Agregar trabajador eventual en la jornada */}
            <form onSubmit={handleAgregarObreroDia} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Nombre obrero adicional..."
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
              />
              <input
                type="text"
                placeholder="Cargo (ej. Gasfíter)"
                value={nuevoRol}
                onChange={(e) => setNuevoRol(e.target.value)}
                className="w-32 px-2.5 py-1.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white hidden sm:block"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FF6A00] text-white text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] dark:bg-[#1A222D] text-[11px] font-mono uppercase text-gray-500 border-b border-kraft-200 dark:border-[#263040]">
                  <th className="py-3 px-4">Trabajador</th>
                  <th className="py-3 px-4">Estado del Día</th>
                  <th className="py-3 px-4">Entrada</th>
                  <th className="py-3 px-4">Salida</th>
                  <th className="py-3 px-4">Hrs Netas</th>
                  <th className="py-3 px-4">Observación / Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kraft-100 dark:divide-[#1E2530] text-xs">
                {listaPlanilla.map((item, idx) => {
                  const reg = item.registro;
                  const est = reg?.estado;
                  return (
                    <tr key={idx} className="hover:bg-kraft-50/50 dark:hover:bg-[#1A222D]/60">
                      <td className="py-3.5 px-4">
                        <p className="font-heading font-bold text-navy-900 dark:text-white">
                          {item.nombre}
                        </p>
                        <p className="text-[11px] text-gray-500 capitalize">
                          {item.rol || 'Terreno'}
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              { id: 'presente', label: 'Presente', activeClass: 'bg-[#6B8F72] text-white' },
                              { id: 'atraso', label: 'Atraso', activeClass: 'bg-amber-500 text-white' },
                              { id: 'ausente', label: 'Ausente', activeClass: 'bg-red-600 text-white' },
                              { id: 'licencia', label: 'Licencia', activeClass: 'bg-purple-600 text-white' },
                              { id: 'permiso', label: 'Permiso', activeClass: 'bg-blue-600 text-white' },
                            ] as { id: EstadoAsistencia; label: string; activeClass: string }[]
                          ).map((btn) => (
                            <button
                              key={btn.id}
                              type="button"
                              onClick={() => handleMarcarEstado(item, btn.id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                est === btn.id
                                  ? btn.activeClass
                                  : 'bg-kraft-100 dark:bg-[#1E2530] text-gray-600 dark:text-gray-300 hover:border-[#FF6A00]'
                              }`}
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <input
                          type="time"
                          value={reg?.hora_entrada || ''}
                          disabled={!reg || reg.estado === 'ausente' || reg.estado === 'licencia'}
                          onChange={(e) =>
                            handleMarcarEstado(
                              item,
                              reg?.estado || 'presente',
                              e.target.value,
                              reg?.hora_salida || '18:00'
                            )
                          }
                          className="px-2 py-1 rounded-lg border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] font-mono text-xs text-navy-900 dark:text-white disabled:opacity-40"
                        />
                      </td>

                      <td className="py-3.5 px-4">
                        <input
                          type="time"
                          value={reg?.hora_salida || ''}
                          disabled={!reg || reg.estado === 'ausente' || reg.estado === 'licencia'}
                          onChange={(e) =>
                            handleMarcarEstado(
                              item,
                              reg?.estado || 'presente',
                              reg?.hora_entrada || '08:00',
                              e.target.value
                            )
                          }
                          className="px-2 py-1 rounded-lg border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] font-mono text-xs text-navy-900 dark:text-white disabled:opacity-40"
                        />
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-navy-900 dark:text-white">
                        {reg?.horas_trabajadas ? `${reg.horas_trabajadas} h` : '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Agregar nota..."
                            value={reg?.observacion || ''}
                            onChange={(e) =>
                              handleMarcarEstado(
                                item,
                                reg?.estado || 'presente',
                                reg?.hora_entrada,
                                reg?.hora_salida,
                                e.target.value
                              )
                            }
                            className="px-2.5 py-1 rounded-lg border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white w-40"
                          />
                          {reg?.origen === 'whatsapp_ia' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#25D366]/15 text-[#25D366]">
                              <Smartphone className="w-3 h-3" /> WA
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <GoogleMapsProjectViewer
        proyecto={proyecto}
        isOpen={isMapsModalOpen}
        onClose={() => setIsMapsModalOpen(false)}
      />
    </div>
  );
}
