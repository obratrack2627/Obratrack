'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building,
  TrendingUp,
  AlertTriangle,
  Calendar,
  DollarSign,
  Users,
  Sparkles,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  PhoneCall,
  MessageSquareShare,
  Plus,
  ShieldCheck,
  Zap,
  MapPin,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { dataService } from '@/lib/data-service';
import { Proyecto, EventoAgenda, ReporteWhatsApp, Usuario } from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [eventos, setEventos] = useState<EventoAgenda[]>([]);
  const [reportes, setReportes] = useState<ReporteWhatsApp[]>([]);
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = dataService.getActiveUser();
    if (user?.rol === 'terreno') {
      router.replace('/proyectos');
      return;
    }
    setActiveUser(user);

    const projs = dataService.getProyectos();
    setProyectos(projs);

    const evts = dataService.getEventosAgenda();
    setEventos(evts);

    const reps = dataService.getReportes();
    setReportes(reps);

    setLoading(false);
  }, [router]);

  // Cálculos de KPIs Financieros y Operacionales
  const obrasActivas = proyectos.filter((p) => p.estado === 'activo');
  const obrasTerminadas = proyectos.filter((p) => p.estado === 'terminado');

  const totalCotizado = proyectos.reduce((acc, p) => acc + (p.monto_cotizado || 0), 0);
  const totalCobrado = proyectos.reduce((acc, p) => acc + (p.total_pagado || 0), 0);
  const totalImprevistos = proyectos.reduce((acc, p) => acc + (p.total_imprevistos || 0), 0);
  const totalMateriales = proyectos.reduce((acc, p) => acc + (p.total_materiales || 0), 0);
  const saldoPendiente = Math.max(0, totalCotizado - totalCobrado);

  const avancePromedio =
    obrasActivas.length > 0
      ? Math.round(
          obrasActivas.reduce((acc, p) => acc + (p.porcentaje_avance_ponderado || 0), 0) /
            obrasActivas.length
        )
      : 0;

  const reportesPendientes = reportes.filter((r) => r.estado === 'pendiente');

  // Alertas de obras críticas (con plazo próximo o atrasadas)
  const today = new Date();
  const alertas = obrasActivas
    .map((p) => {
      const fechaTermino = new Date(p.fecha_termino_estimada + 'T23:59:59');
      const diasRestantes = Math.ceil(
        (fechaTermino.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      const avance = p.porcentaje_avance_ponderado || 0;

      let nivel: 'critico' | 'advertencia' | 'ok' = 'ok';
      let mensaje = 'En cronograma';

      if (diasRestantes < 0) {
        nivel = 'critico';
        mensaje = `Plazo vencido hace ${Math.abs(diasRestantes)} días (${avance}% avance)`;
      } else if (diasRestantes <= 7 && avance < 75) {
        nivel = 'critico';
        mensaje = `Quedan ${diasRestantes} días y el avance es del ${avance}%`;
      } else if (diasRestantes <= 15 && avance < 40) {
        nivel = 'advertencia';
        mensaje = `Avance lento (${avance}%) con ${diasRestantes} días restantes`;
      }

      return {
        proyecto: p,
        diasRestantes,
        avance,
        nivel,
        mensaje,
      };
    })
    .filter((a) => a.nivel !== 'ok');

  // Datos para gráficos de flujo de caja
  const chartDataFinanzas = proyectos.map((p) => ({
    nombre: p.nombre.length > 15 ? p.nombre.slice(0, 15) + '...' : p.nombre,
    Presupuestado: p.monto_cotizado || 0,
    Cobrado: p.total_pagado || 0,
    Pendiente: Math.max(0, (p.monto_cotizado || 0) - (p.total_pagado || 0)),
  }));

  const pieDataRentabilidad = [
    { name: 'Cobrado', value: totalCobrado, color: '#6B8F72' },
    { name: 'Por Cobrar', value: saldoPendiente, color: '#FF6A00' },
    { name: 'Imprevistos', value: totalImprevistos, color: '#D94336' },
  ].filter((d) => d.value > 0);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-[#FF6A00] border-t-transparent rounded-full animate-spin"></div>
          <span className="font-heading">Cargando Centro de Control...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#141A23] p-6 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#6B8F72]/15 text-[#6B8F72] border border-[#6B8F72]/30">
              <span className="w-2 h-2 rounded-full bg-[#6B8F72] animate-pulse"></span>
              En Vivo
            </span>
            <span className="text-xs font-mono text-gray-500">
              {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-black text-navy-900 dark:text-white">
            Centro de Mando & Control de Obras
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Resumen ejecutivo en tiempo real para{' '}
            <strong className="text-navy-900 dark:text-gray-200">
              {activeUser?.nombre || 'Constructor'}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/cotizador"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#E55F00] text-white font-heading font-bold text-sm shadow-md shadow-[#FF6A00]/20 hover:opacity-95 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Copiloto IA</span>
          </Link>
          <Link
            href="/proyectos"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-kraft-100 dark:bg-[#1E2530] text-navy-900 dark:text-gray-100 font-heading font-bold text-sm border border-kraft-200 dark:border-[#263040] hover:bg-kraft-200 dark:hover:bg-[#263040] transition-all"
          >
            <Plus className="w-4 h-4 text-[#FF6A00]" />
            <span>Gestionar Obras</span>
          </Link>
        </div>
      </div>

      {/* Grid de KPIs Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Obras Activas */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm hover:border-[#FF6A00]/50 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">
              Obras en Ejecución
            </span>
            <div className="p-2 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] group-hover:scale-110 transition-transform">
              <Building className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-heading font-black text-navy-900 dark:text-white">
              {obrasActivas.length}
            </span>
            <span className="text-xs text-gray-500 font-mono">
              / {proyectos.length} total ({obrasTerminadas.length} finalizadas)
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 bg-kraft-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#FF6A00] h-full rounded-full transition-all duration-500"
                style={{ width: `${avancePromedio}%` }}
              ></div>
            </div>
            <span className="text-xs font-mono font-bold text-[#FF6A00]">
              {avancePromedio}% prom.
            </span>
          </div>
        </div>

        {/* KPI 2: Total Contratado */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm hover:border-[#6B8F72]/50 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">
              Cartera Contratada
            </span>
            <div className="p-2 rounded-xl bg-[#6B8F72]/10 text-[#6B8F72] group-hover:scale-110 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl lg:text-3xl font-heading font-black text-navy-900 dark:text-white">
              {formatCLP(totalCotizado)}
            </span>
          </div>
          <p className="mt-3 text-xs text-gray-500 font-mono">
            Valor total de presupuestos aprobados
          </p>
        </div>

        {/* KPI 3: Cobrado a la fecha */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm hover:border-[#6B8F72]/50 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">
              Recaudado / Cobrado
            </span>
            <div className="p-2 rounded-xl bg-[#6B8F72]/10 text-[#6B8F72] group-hover:scale-110 transition-transform">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl lg:text-3xl font-heading font-black text-[#6B8F72]">
              {formatCLP(totalCobrado)}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-mono text-gray-500">
            <span>Saldo por cobrar:</span>
            <strong className="text-[#FF6A00]">{formatCLP(saldoPendiente)}</strong>
          </div>
        </div>

        {/* KPI 4: Reportes WhatsApp */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm hover:border-[#D94336]/50 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">
              Reportes de Terreno
            </span>
            <div className="p-2 rounded-xl bg-[#25D366]/10 text-[#25D366] group-hover:scale-110 transition-transform">
              <MessageSquareShare className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-heading font-black text-navy-900 dark:text-white">
              {reportesPendientes.length}
            </span>
            <span className="text-xs text-gray-500 font-mono">
              pendientes de validar
            </span>
          </div>
          <div className="mt-3">
            <Link
              href="/reportes"
              className="inline-flex items-center gap-1 text-xs font-heading font-bold text-[#FF6A00] hover:underline"
            >
              <span>Revisar bandeja WhatsApp</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Alertas Operacionales Críticas */}
      {alertas.length > 0 && (
        <div className="p-4 rounded-2xl bg-[#D94336]/10 border border-[#D94336]/30 text-navy-900 dark:text-gray-100 space-y-3">
          <div className="flex items-center gap-2 text-[#D94336] font-heading font-bold text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Alertas de Plazo y Avance en Obras ({alertas.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertas.map((a, i) => (
              <Link
                key={i}
                href={`/proyectos/${a.proyecto.id}/gantt`}
                className="p-3 rounded-xl bg-white dark:bg-[#141A23] border border-[#D94336]/30 hover:border-[#D94336] transition-all flex items-start justify-between gap-3 shadow-sm"
              >
                <div>
                  <h4 className="font-heading font-bold text-sm text-navy-900 dark:text-white">
                    {a.proyecto.nombre}
                  </h4>
                  <p className="text-xs text-[#D94336] font-medium mt-0.5">{a.mensaje}</p>
                  <p className="text-[11px] text-gray-500 font-mono mt-1">
                    Entrega: {formatDate(a.proyecto.fecha_termino_estimada)}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#D94336] text-white shrink-0">
                  {a.avance}%
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sección Gráfica y Obras en Curso */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de Flujo de Caja por Obra */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white">
                Flujo Financiero por Obra (CLP)
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                Comparativa entre monto contratado y pagos recaudados
              </p>
            </div>
            <Link
              href="/proyectos"
              className="text-xs font-heading font-bold text-[#FF6A00] hover:underline flex items-center gap-1"
            >
              <span>Ver todas</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartDataFinanzas} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                <XAxis dataKey="nombre" stroke="#888888" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#888888"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`}
                />
                <Tooltip
                  formatter={(val: number) => [formatCLP(val), '']}
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="Presupuestado" fill="#FF6A00" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Cobrado" fill="#6B8F72" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center gap-6 pt-2 border-t border-kraft-200 dark:border-gray-800 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#FF6A00]"></span>
              <span>Presupuesto Contratado</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#6B8F72]"></span>
              <span>Recaudado a la Fecha</span>
            </div>
          </div>
        </div>

        {/* Distribución Financiera / Pie Chart */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white">
              Distribución de Cartera
            </h3>
            <p className="text-xs text-gray-500 font-mono">
              Estado general de cobranza e imprevistos
            </p>
          </div>

          <div className="h-52 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieDataRentabilidad}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieDataRentabilidad.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number) => [formatCLP(val), '']}
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2 pt-2 border-t border-kraft-200 dark:border-gray-800 text-xs">
            <div className="flex items-center justify-between font-mono">
              <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6B8F72]"></span>
                Total Cobrado:
              </span>
              <strong className="text-[#6B8F72]">{formatCLP(totalCobrado)}</strong>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF6A00]"></span>
                Por Cobrar:
              </span>
              <strong className="text-[#FF6A00]">{formatCLP(saldoPendiente)}</strong>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D94336]"></span>
                Imprevistos:
              </span>
              <strong className="text-[#D94336]">{formatCLP(totalImprevistos)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Inferior: Obras Activas con Semáforo y Agenda de Faena */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Obras Activas con Semáforo */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white">
                Obras en Faena Activa ({obrasActivas.length})
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                Seguimiento de avance ponderado y georreferenciación
              </p>
            </div>
            <Link
              href="/proyectos"
              className="text-xs font-heading font-bold text-[#FF6A00] hover:underline"
            >
              Ver todas
            </Link>
          </div>

          <div className="space-y-3">
            {obrasActivas.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">No hay obras activas en este momento.</p>
            ) : (
              obrasActivas.map((p) => {
                const avance = p.porcentaje_avance_ponderado || 0;
                return (
                  <div
                    key={p.id}
                    className="p-4 rounded-xl bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] hover:border-[#FF6A00]/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-heading font-bold text-sm text-navy-900 dark:text-white">
                          {p.nombre}
                        </h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#6B8F72]/20 text-[#6B8F72]">
                          {p.estado}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 font-mono">
                        {p.comuna && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#FF6A00]" />
                            {p.comuna}
                          </span>
                        )}
                        <span>Entrega: {formatDate(p.fecha_termino_estimada)}</span>
                        <span>Monto: {formatCLP(p.monto_cotizado)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="w-32">
                        <div className="flex justify-between text-xs font-mono mb-1">
                          <span className="text-gray-500">Avance</span>
                          <strong className="text-[#FF6A00]">{avance}%</strong>
                        </div>
                        <div className="h-2 w-full bg-kraft-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="bg-[#FF6A00] h-full rounded-full transition-all"
                            style={{ width: `${avance}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Link
                          href={`/proyectos/${p.id}/gantt`}
                          className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#1E2530] text-navy-900 dark:text-gray-200 text-xs font-heading font-bold border border-kraft-200 dark:border-[#263040] hover:bg-[#FF6A00] hover:text-white transition-colors"
                        >
                          Gantt
                        </Link>
                        <Link
                          href={`/proyectos/${p.id}/finanzas`}
                          className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#1E2530] text-navy-900 dark:text-gray-200 text-xs font-heading font-bold border border-kraft-200 dark:border-[#263040] hover:bg-[#6B8F72] hover:text-white transition-colors"
                        >
                          Costos
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Agenda Próxima de Terreno */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white">
                Agenda de Faena
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                Próximas visitas y vaciados
              </p>
            </div>
            <Calendar className="w-4 h-4 text-[#FF6A00]" />
          </div>

          <div className="space-y-2.5">
            {eventos.slice(0, 5).map((evt) => (
              <div
                key={evt.id}
                className="p-3 rounded-xl bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-heading font-bold text-navy-900 dark:text-white">
                    {evt.titulo}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#FF6A00]/15 text-[#FF6A00]">
                    {evt.hora || 'Por confirmar'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-1">{evt.descripcion}</p>
                <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 pt-1">
                  <span>{formatDate(evt.fecha)}</span>
                  <span>{evt.comuna_lugar || 'En terreno'}</span>
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/cotizador"
            className="block text-center w-full py-2 rounded-xl bg-kraft-100 dark:bg-[#1E2530] text-xs font-heading font-bold text-navy-900 dark:text-gray-200 border border-kraft-200 dark:border-[#263040] hover:bg-kraft-200 transition-colors"
          >
            + Agendar con Copiloto IA
          </Link>
        </div>
      </div>
    </div>
  );
}
