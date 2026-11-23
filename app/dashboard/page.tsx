'use client';
import { calendarDays, chileToday } from '@/lib/work-calendar';
import MoneyAmount from "@/components/MoneyAmount";
import MaskedMoneyAmount from '@/components/MaskedMoneyAmount';
import CompactSummary from '@/components/CompactSummary';
import { ProjectStatusBadge } from '@/components/ProjectStatus';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Building,
  TrendingUp,
  AlertTriangle,
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
  X,
} from 'lucide-react';
import DashboardOnboardingTour, {
  DashboardFirstStepsChecklist,
  type TourChecklistStatus,
} from '@/components/DashboardOnboardingTour';
import { DashboardSkeleton } from '@/components/PageSkeletons';
import { AlertsBellButton } from '@/components/AlertsDrawer';
import AgendaWidget from '@/components/AgendaWidget';
import { dataService } from '@/lib/data-service';
import {
  dismissedDashboardAlertsKey,
  isProjectCompletedOrClosed,
  persistDismissedIds,
  readDismissedIds,
} from '@/lib/operational-alerts';
import { Actividad, EventoAgenda, Proyecto, ReporteWhatsApp, Usuario } from '@/types/database';
import { formatDate } from '@/lib/utils';
import { aiHeaders } from '@/lib/ai/client';

const DashboardFinanceCharts = dynamic(
  () => import('@/components/DashboardFinanceCharts'),
  {
    ssr: false,
    loading: () => (
      <div data-tour-zone="charts" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-80 animate-pulse rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040]" />
        <div className="h-80 animate-pulse rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040]" />
      </div>
    ),
  },
);

const DEMO_EMPRESA_ID = 'e1111111-1111-4111-a111-111111111111';
const tourDoneKey = (userId: string) => `obratrack_dashboard_tour_done:${userId}`;
const checklistHiddenKey = (userId: string) => `obratrack_dashboard_checklist_hidden:${userId}`;

export default function DashboardPage() {
  const router = useRouter();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [reportes, setReportes] = useState<ReporteWhatsApp[]>([]);
  const [eventosAgenda, setEventosAgenda] = useState<EventoAgenda[]>([]);
  const [dismissedDeadlineIds, setDismissedDeadlineIds] = useState<Set<string>>(new Set());
  const [whatsappPendingCount, setWhatsappPendingCount] = useState(0);
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [teamCount, setTeamCount] = useState(0);
  const [hasProfileSetup, setHasProfileSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [barChartRevealed, setBarChartRevealed] = useState(false);
  const [pieChartRevealed, setPieChartRevealed] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [checklistHidden, setChecklistHidden] = useState(false);

  useEffect(() => {
    if (!barChartRevealed && !pieChartRevealed) return;
    const timer = window.setTimeout(() => {
      setBarChartRevealed(false);
      setPieChartRevealed(false);
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [barChartRevealed, pieChartRevealed]);

  useEffect(() => {
    const computeOnboardingState = (
      user: Usuario | null,
      projs: Proyecto[],
      autoTrigger: boolean
    ) => {
      const empresa = dataService.getEmpresa();
      const users = dataService.getUsuarios();
      const cleanPhone = (user?.telefono_whatsapp || '').replace(/\D/g, '');
      setHasProfileSetup(Boolean(cleanPhone.length >= 8 || empresa?.logo_url));
      setTeamCount(users.filter((u) => u.id !== user?.id).length);

      if (!user?.id || user.empresa_id === DEMO_EMPRESA_ID) return;
      try {
        setChecklistHidden(localStorage.getItem(checklistHiddenKey(user.id)) === '1');
        if (autoTrigger && projs.length === 0 && localStorage.getItem(tourDoneKey(user.id)) !== '1') {
          setTourStep(0);
          setTourOpen(true);
        }
      } catch {
        // Ignorar restricciones de almacenamiento en modo privado
      }
    };

    const user = dataService.getActiveUser();
    if (user?.rol === 'terreno') {
      router.replace('/proyectos');
      return;
    }
    setActiveUser(user);

    const projs = dataService.getProyectos();
    setProyectos(projs);
    setActividades(dataService.getActividades());
    setDismissedDeadlineIds(readDismissedIds(dismissedDashboardAlertsKey(user?.id)));

    const reps = dataService.getReportes();
    setReportes(reps);
    setEventosAgenda(dataService.getEventosAgenda());

    computeOnboardingState(user, projs, true);

    const loadWhatsAppPending = async () => {
      try {
        const res = await fetch('/api/whatsapp/mensajes', { headers: await aiHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const msgs = Array.isArray(data?.mensajes) ? data.mensajes : [];
        const pending = msgs.filter(
          (m: any) =>
            (m?.adjunto?.path && !m?.adjunto?.proyecto_id && !m?.obras?.length) ||
            m?.categoria === 'datos_obra'
        ).length;
        setWhatsappPendingCount(pending);
      } catch {
        // Silent fallback if offline or unauthenticated
      }
    };
    void loadWhatsAppPending();

    setLoading(false);
    const onSync = () => {
      const syncedUser = dataService.getActiveUser();
      const syncedProjs = dataService.getProyectos();
      setActiveUser(syncedUser);
      setProyectos(syncedProjs);
      setActividades(dataService.getActividades());
      setReportes(dataService.getReportes());
      setEventosAgenda(dataService.getEventosAgenda());
      setDismissedDeadlineIds(readDismissedIds(dismissedDashboardAlertsKey(syncedUser?.id)));
      computeOnboardingState(syncedUser, syncedProjs, false);
      void loadWhatsAppPending();
    };
    const onProfileUpdated = () => {
      const updatedUser = dataService.getActiveUser();
      setActiveUser(updatedUser);
      computeOnboardingState(updatedUser, dataService.getProyectos(), false);
    };
    const onStartTour = () => {
      setTourStep(0);
      setTourOpen(true);
    };
    try {
      if (sessionStorage.getItem('obratrack_open_tour_on_dashboard') === '1') {
        sessionStorage.removeItem('obratrack_open_tour_on_dashboard');
        setTourStep(0);
        setTourOpen(true);
      }
    } catch {
      // Ignore storage errors
    }
    window.addEventListener('obratrack_cloud_synced', onSync);
    window.addEventListener('obratrack_profile_updated', onProfileUpdated);
    window.addEventListener('obratrack_start_dashboard_tour', onStartTour);
    return () => {
      window.removeEventListener('obratrack_cloud_synced', onSync);
      window.removeEventListener('obratrack_profile_updated', onProfileUpdated);
      window.removeEventListener('obratrack_start_dashboard_tour', onStartTour);
    };
  }, [router]);

  const startTour = () => {
    setTourStep(0);
    setTourOpen(true);
  };

  const closeTour = () => {
    setTourOpen(false);
    if (activeUser?.id) {
      try {
        localStorage.setItem(tourDoneKey(activeUser.id), '1');
      } catch {
        // Ignore storage errors
      }
    }
  };

  const dismissChecklist = () => {
    setChecklistHidden(true);
    if (activeUser?.id) {
      try {
        localStorage.setItem(checklistHiddenKey(activeUser.id), '1');
      } catch {
        // Ignore storage errors
      }
    }
  };

  // Cálculos de KPIs Financieros y Operacionales (excluyendo obras canceladas)
  const proyectosVigentes = proyectos.filter((p) => p.estado !== 'cancelada');
  const obrasActivas = proyectosVigentes.filter((p) => p.estado === 'activo');
  const obrasTerminadas = proyectosVigentes.filter((p) => p.estado === 'terminado');

  const totalCotizado = proyectosVigentes.reduce((acc, p) => acc + (p.monto_cotizado || 0), 0);
  const totalCobrado = proyectosVigentes.reduce((acc, p) => acc + (p.total_pagado || 0), 0);
  const totalImprevistos = proyectosVigentes.reduce((acc, p) => acc + (p.total_imprevistos || 0), 0);
  const totalMateriales = proyectosVigentes.reduce((acc, p) => acc + (p.total_materiales || 0), 0);
  const saldoPendiente = proyectosVigentes.reduce((sum, p) => sum + Math.max(0, (p.monto_cotizado || 0) - (p.total_pagado || 0)), 0);

  const avancePromedio =
    obrasActivas.length > 0
      ? Math.round(
          obrasActivas.reduce((acc, p) => acc + (p.porcentaje_avance_ponderado || 0), 0) /
            obrasActivas.length
        )
      : 0;

  const reportesPendientes = reportes.filter((r) => r.estado === 'pendiente');
  const totalReportesPorValidar = reportesPendientes.length + whatsappPendingCount;

  // Alertas de obras críticas (con plazo próximo o atrasadas; excluye obras completadas al 100%)
  const alertas = obrasActivas
    .filter((p) => !isProjectCompletedOrClosed(p, actividades))
    .map((p) => {
      let diasRestantes = 99999;
      try { diasRestantes = calendarDays(chileToday(), p.fecha_termino_estimada); } catch { /* Sin fecha válida: no inventar un vencimiento. */ }
      const avance = p.porcentaje_avance_ponderado || 0;

      let nivel: 'critico' | 'advertencia' | 'ok' = 'ok';
      let mensaje = 'En cronograma';

      if (diasRestantes < 0 && avance < 100) {
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

  const visibleAlertas = alertas.filter((a) => !dismissedDeadlineIds.has(a.proyecto.id));

  const dismissDeadlineAlert = (projectId: string) => {
    const next = new Set(dismissedDeadlineIds);
    next.add(projectId);
    setDismissedDeadlineIds(persistDismissedIds(dismissedDashboardAlertsKey(activeUser?.id), next));
  };

  const dismissAllDeadlineAlerts = () => {
    const next = new Set(dismissedDeadlineIds);
    for (const item of visibleAlertas) next.add(item.proyecto.id);
    setDismissedDeadlineIds(persistDismissedIds(dismissedDashboardAlertsKey(activeUser?.id), next));
  };

  // Datos para gráficos de flujo de caja (solo obras vigentes, activas primero)
  const chartDataFinanzas = [...proyectosVigentes]
    .sort((a, b) => {
      const rank = (s: Proyecto['estado']) => (s === 'activo' ? 0 : s === 'pausado' ? 1 : 2);
      return rank(a.estado) - rank(b.estado) || (b.monto_cotizado || 0) - (a.monto_cotizado || 0);
    })
    .map((p) => {
      const presupuestado = p.monto_cotizado || 0;
      const cobrado = p.total_pagado || 0;
      const costos = (p.total_materiales || 0) + (p.total_imprevistos || 0);
      return {
        nombre: p.nombre,
        Presupuestado: presupuestado,
        Cobrado: cobrado,
        Pendiente: Math.max(0, presupuestado - cobrado),
        Costos: costos,
        Margen: presupuestado - costos,
      };
    });

  const pieDataRentabilidad = [
    { name: 'Cobrado', value: totalCobrado, color: '#6B8F72' },
    { name: 'Por Cobrar', value: saldoPendiente, color: '#FF6A00' },
  ].filter((d) => d.value > 0);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const checklistStatus: TourChecklistStatus = {
    hasProfileSetup,
    hasProject: proyectosVigentes.length > 0,
    hasTeamMember: teamCount > 0,
  };
  const showFirstSteps =
    Boolean(activeUser?.id) &&
    activeUser?.empresa_id !== DEMO_EMPRESA_ID &&
    !checklistHidden &&
    proyectosVigentes.length === 0;

  return (
    <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Cabecera Principal */}
      <div
        data-tour-zone="header"
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#141A23] p-4 sm:p-6 md:pr-16 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm"
      >
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#6B8F72]/15 text-[#6B8F72] border border-[#6B8F72]/30 shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#6B8F72] animate-pulse"></span>
              Hoy
            </span>
            <span className="text-xs font-mono text-gray-500">
              {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-black text-navy-900 dark:text-white">
            Centro de Mando
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Resumen ejecutivo en tiempo real para{' '}
            <strong className="text-navy-900 dark:text-gray-200">
              {activeUser?.nombre || 'Constructor'}
            </strong>
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto shrink-0">
          <AlertsBellButton className="hidden md:inline-flex" />
          <Link
            href="/cotizador"
            className="inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#E55F00] text-white font-heading font-bold text-sm shadow-md shadow-[#FF6A00]/20 hover:opacity-95 transition-all whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>ObraBot</span>
          </Link>
          <Link
            href="/proyectos"
            className="inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl bg-kraft-100 dark:bg-[#1E2530] text-navy-900 dark:text-gray-100 font-heading font-bold text-sm border border-kraft-200 dark:border-[#263040] hover:bg-kraft-200 dark:hover:bg-[#263040] transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-[#FF6A00] shrink-0" />
            <span>Gestionar Obras</span>
          </Link>
        </div>
      </div>

      {/* Checklist de Arranque para cuentas nuevas sin obras */}
      <DashboardFirstStepsChecklist
        visible={showFirstSteps}
        status={checklistStatus}
        onStartTour={startTour}
        onDismiss={dismissChecklist}
      />

      {/* Grid de KPIs Superiores */}
      <CompactSummary><div data-tour-zone="kpis" className="workspace-metrics grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Obras Activas */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm hover:border-[#FF6A00]/50 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">
              Obras en curso
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
              / {proyectosVigentes.length} vigentes ({obrasTerminadas.length} finalizadas)
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
              Total cotizado
            </span>
            <div className="p-2 rounded-xl bg-[#6B8F72]/10 text-[#6B8F72] group-hover:scale-110 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl lg:text-3xl font-heading font-black text-navy-900 dark:text-white">
            <MaskedMoneyAmount value={totalCotizado} label="Total facturado / cotizado" />
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
          <div className="mt-3 text-2xl lg:text-3xl font-heading font-black text-[#6B8F72]">
            <MaskedMoneyAmount value={totalCobrado} label="Total recaudado / cobrado" />
          </div>
          <div className="mt-3 space-y-2 text-xs font-mono text-gray-500">
            <div className="flex items-center justify-between gap-2">
              <span>Saldo por cobrar:</span>
              <strong className="min-w-0 text-[#FF6A00]">
                <MaskedMoneyAmount value={saldoPendiente} label="Saldo por cobrar" compact />
              </strong>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-kraft-100 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#6B8F72] h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${totalCotizado > 0 ? Math.min(100, Math.round((totalCobrado / totalCotizado) * 100)) : 0}%`,
                  }}
                />
              </div>
              <span className="text-[11px] font-bold text-[#6B8F72]">
                {totalCotizado > 0 ? Math.min(100, Math.round((totalCobrado / totalCotizado) * 100)) : 0}% cobrado
              </span>
            </div>
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
              {totalReportesPorValidar}
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
              <span>Ver reportes</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div></CompactSummary>

      {/* Alertas Operacionales Críticas */}
      {visibleAlertas.length > 0 && (
        <div
          data-tour-zone="alerts"
          className="p-4 rounded-2xl bg-[#D94336]/10 border border-[#D94336]/30 text-navy-900 dark:text-gray-100 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#D94336] font-heading font-bold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Alertas de Plazo y Avance en Obras ({visibleAlertas.length})</span>
            </div>
            <button
              type="button"
              onClick={dismissAllDeadlineAlerts}
              className="text-xs font-semibold text-[#D94336] hover:underline shrink-0"
            >
              Quitar todas
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleAlertas.map((a) => (
              <div
                key={a.proyecto.id}
                className="p-3 rounded-xl bg-white dark:bg-[#141A23] border border-[#D94336]/30 hover:border-[#D94336] transition-all flex items-start justify-between gap-2 shadow-sm"
              >
                <Link
                  href={`/proyectos/${a.proyecto.id}/gantt`}
                  className="flex-1 min-w-0"
                >
                  <h4 className="font-heading font-bold text-sm text-navy-900 dark:text-white">
                    {a.proyecto.nombre}
                  </h4>
                  <p className="text-xs text-[#D94336] font-medium mt-0.5">{a.mensaje}</p>
                  <p className="text-[11px] text-gray-500 font-mono mt-1">
                    Entrega: {formatDate(a.proyecto.fecha_termino_estimada)}
                  </p>
                </Link>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => dismissDeadlineAlert(a.proyecto.id)}
                    aria-label={`Quitar alerta de ${a.proyecto.nombre}`}
                    title="Quitar esta alerta"
                    className="p-1 rounded-md text-gray-400 hover:text-[#D94336] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#D94336] text-white">
                    {a.avance}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Obras en curso */}
      <div data-tour-zone="projects">
        {/* Obras Activas con Semáforo */}
        <div className="min-w-0 p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white">
                Obras en curso ({obrasActivas.length})
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                Avance y próxima entrega
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
              <div className="rounded-xl border border-dashed border-kraft-300 dark:border-[#263040] bg-kraft-50/70 dark:bg-[#0F141C] px-4 py-8 text-center space-y-2">
                <Building className="w-7 h-7 text-gray-400 mx-auto" />
                <p className="text-xs font-semibold text-navy-900 dark:text-gray-200">
                  No hay obras en curso en este momento.
                </p>
                <Link
                  href="/proyectos?nueva=1"
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#FF6A00] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear nueva obra</span>
                </Link>
              </div>
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
                        <ProjectStatusBadge estado={p.estado} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 font-mono">
                        {p.comuna && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#FF6A00]" />
                            {p.comuna}
                          </span>
                        )}
                        <span>Entrega: {formatDate(p.fecha_termino_estimada)}</span>
                        <span className="inline-flex items-center gap-1">
                          <span>Monto:</span>
                          <MaskedMoneyAmount
                            value={p.monto_cotizado || 0}
                            label={`Monto de ${p.nombre}`}
                            compact
                          />
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto min-w-0">
                      <div className="flex-1 sm:flex-none sm:w-32 min-w-[100px]">
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

                      <div className="flex items-center gap-1.5 shrink-0">
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

      </div>
      {/* Sección Gráfica y Obras en Curso */}
      <DashboardFinanceCharts
        chartDataFinanzas={chartDataFinanzas}
        pieDataRentabilidad={pieDataRentabilidad}
        barChartRevealed={barChartRevealed}
        onToggleBarChart={() => setBarChartRevealed((prev) => !prev)}
        pieChartRevealed={pieChartRevealed}
        onTogglePieChart={() => setPieChartRevealed((prev) => !prev)}
        totalCobrado={totalCobrado}
        saldoPendiente={saldoPendiente}
        totalImprevistos={totalImprevistos}
      />

      <AgendaWidget
        proyectos={proyectosVigentes}
        eventos={eventosAgenda}
        onChanged={() => setEventosAgenda(dataService.getEventosAgenda())}
      />

      <DashboardOnboardingTour
        open={tourOpen}
        stepIndex={tourStep}
        onStepChange={setTourStep}
        onClose={closeTour}
      />
    </div>
  );
}
