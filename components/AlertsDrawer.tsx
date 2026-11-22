'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Calendar,
  ClipboardCheck,
  DollarSign,
  GanttChartSquare,
  Info,
  Package,
  X,
} from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { dataService } from '@/lib/data-service';
import {
  computeOperationalAlerts,
  type OperationalAlert,
  type OperationalAlertCategory,
} from '@/lib/operational-alerts';

const CATEGORY_META: Record<
  OperationalAlertCategory | 'todas',
  { label: string; icon: typeof Bell }
> = {
  todas: { label: 'Todas', icon: Bell },
  cambios: { label: 'Reclamos', icon: AlertTriangle },
  finanzas: { label: 'Finanzas', icon: DollarSign },
  gantt: { label: 'Plazos', icon: GanttChartSquare },
  materiales: { label: 'Materiales', icon: Package },
  asistencia: { label: 'Asistencia', icon: ClipboardCheck },
  agenda: { label: 'Agenda', icon: Calendar },
};

function readAlertsFromStore(): OperationalAlert[] {
  const active = dataService.getActiveUser();
  if (!active || active.rol === 'terreno') return [];
  return computeOperationalAlerts({
    proyectos: dataService.getProyectos(),
    actividades: dataService.getActividades(),
    materiales: dataService.getMaterialesProyecto(),
    bitacora: dataService.getBitacora(),
    imprevistos: dataService.getImprevistos(),
    reclamos: dataService.getReclamosCambios(),
    asistencias: dataService.getAsistencias(),
    usuarios: dataService.getUsuarios(),
    agenda: dataService.getEventosAgenda(),
  });
}

export function AlertsBellButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);

  useEffect(() => {
    const refresh = () => setAlerts(readAlertsFromStore());
    refresh();
    const onOpen = () => {
      refresh();
      setOpen(true);
    };
    window.addEventListener('obratrack_cloud_synced', refresh);
    window.addEventListener('obratrack_open_alerts_drawer', onOpen);
    return () => {
      window.removeEventListener('obratrack_cloud_synced', refresh);
      window.removeEventListener('obratrack_open_alerts_drawer', onOpen);
    };
  }, []);

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const totalCount = alerts.length;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAlerts(readAlertsFromStore());
          setOpen(true);
        }}
        aria-label={`Centro de alertas (${totalCount})`}
        title={`Centro de alertas (${totalCount})`}
        className={`relative inline-flex items-center gap-1.5 rounded-xl border border-[#E5DFC9] dark:border-[#263040] bg-white/85 dark:bg-[#1E2633] ${
          compact ? 'p-2' : 'px-2.5 py-1.5'
        } text-xs text-gray-700 dark:text-gray-200 hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors shrink-0`}
      >
        <Bell className={`w-4 h-4 ${criticalCount > 0 ? 'text-red-500' : totalCount > 0 ? 'text-[#FF6A00]' : ''}`} />
        {!compact && <span className="hidden sm:inline font-medium">Alertas</span>}
        {totalCount > 0 && (
          <span
            className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-bold text-white ${
              criticalCount > 0 ? 'bg-[#D94336]' : 'bg-[#FF6A00]'
            }`}
          >
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {open && <AlertsDrawer alerts={alerts} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function AlertsDrawer({
  alerts,
  onClose,
}: {
  alerts: OperationalAlert[];
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<OperationalAlertCategory | 'todas'>('todas');

  const filtered = filter === 'todas' ? alerts : alerts.filter((a) => a.category === filter);
  const categoriesPresent = (Object.keys(CATEGORY_META) as Array<OperationalAlertCategory | 'todas'>).filter(
    (cat) => cat === 'todas' || alerts.some((a) => a.category === cat),
  );

  return (
    <ModalOverlay
      onClose={onClose}
      aria-label="Centro de alertas operacionales"
      className="fixed inset-0 z-[85] flex justify-end bg-black/55 backdrop-blur-sm animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full max-w-md h-full bg-white dark:bg-[#141A23] border-l border-[#E5DFC9] dark:border-[#263040] shadow-2xl animate-slide-in-right"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#E5DFC9] dark:border-[#263040]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading font-bold text-base text-navy-900 dark:text-white truncate">
                Centro de Alertas
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                {alerts.length === 0
                  ? 'Sin alertas activas'
                  : `${alerts.length} ${alerts.length === 1 ? 'novedad detectada' : 'novedades detectadas'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar centro de alertas"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#1E2633] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {alerts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C]">
            {categoriesPresent.map((cat) => {
              const count =
                cat === 'todas'
                  ? alerts.length
                  : alerts.filter((a) => a.category === cat).length;
              const active = filter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilter(cat)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    active
                      ? 'bg-[#FF6A00] text-white'
                      : 'bg-white dark:bg-[#141A23] text-gray-600 dark:text-gray-300 border border-[#E5DFC9] dark:border-[#263040] hover:border-[#FF6A00]/60'
                  }`}
                >
                  <span>{CATEGORY_META[cat].label}</span>
                  <span className="font-mono text-[10px] opacity-85">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-[#6B8F72]/15 text-[#6B8F72] flex items-center justify-center mx-auto">
                <ClipboardCheck className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-navy-900 dark:text-white">
                Todo al día en tus obras
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                No hay sobrecostos, partidas vencidas ni reclamos abiertos en esta vista.
              </p>
            </div>
          ) : (
            filtered.map((alert) => {
              const Icon = CATEGORY_META[alert.category].icon;
              const sevClass =
                alert.severity === 'critical'
                  ? 'border-red-300 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/25'
                  : alert.severity === 'warning'
                    ? 'border-amber-300 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20'
                    : 'border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1A2230]';
              const SevIcon =
                alert.severity === 'critical'
                  ? AlertCircle
                  : alert.severity === 'warning'
                    ? AlertTriangle
                    : Info;
              const sevIconColor =
                alert.severity === 'critical'
                  ? 'text-[#D94336]'
                  : alert.severity === 'warning'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-[#FF6A00]';

              return (
                <Link
                  key={alert.id}
                  href={alert.href}
                  onClick={onClose}
                  className={`block p-3.5 rounded-xl border ${sevClass} hover:border-[#FF6A00] transition-colors space-y-1`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <SevIcon className={`w-4 h-4 shrink-0 ${sevIconColor}`} />
                      <span className="text-xs font-bold text-navy-900 dark:text-white truncate">
                        {alert.title}
                      </span>
                    </div>
                    <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed pl-6">
                    {alert.detail}
                  </p>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
