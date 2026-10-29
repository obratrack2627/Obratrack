'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  GanttChartSquare,
  Wallet,
  Sparkles,
  MapPin,
  Calendar,
  User,
  AlertTriangle,
  FolderOpen,
  FileText,
  ClipboardCheck,
} from 'lucide-react';
import { Proyecto, Cliente } from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';
import { dataService } from '@/lib/data-service';

interface ProjectTabsHeaderProps {
  proyecto: Proyecto | null;
  cliente?: Cliente | null;
  onOpenMaps?: () => void;
}

export default function ProjectTabsHeader({
  proyecto,
  cliente,
  onOpenMaps,
}: ProjectTabsHeaderProps) {
  const pathname = usePathname();
  const [cambiosPendientes, setCambiosPendientes] = useState(0);
  const [docsCount, setDocsCount] = useState(0);
  const [presentesHoy, setPresentesHoy] = useState(0);

  useEffect(() => {
    if (!proyecto) return;
    const refreshCounts = () => {
      const cambios = dataService
        .getReclamosCambios(proyecto.id)
        .filter((c) => c.estado === 'pendiente' || c.estado === 'en_revision');
      setCambiosPendientes(cambios.length);

      const docs = dataService.getDocumentosObra(proyecto.id);
      setDocsCount(docs.length);

      const hoy = new Date().toISOString().split('T')[0];
      const asistHoy = dataService
        .getAsistencias(proyecto.id, hoy)
        .filter((a) => a.estado === 'presente' || a.estado === 'atraso');
      setPresentesHoy(asistHoy.length);
    };

    refreshCounts();
    window.addEventListener('obratrack_cloud_synced', refreshCounts);
    return () => window.removeEventListener('obratrack_cloud_synced', refreshCounts);
  }, [proyecto, pathname]);

  if (!proyecto) return null;

  const tabs = [
    {
      id: 'gantt',
      label: 'Carta Gantt',
      href: `/proyectos/${proyecto.id}/gantt`,
      icon: GanttChartSquare,
      badge: `${proyecto.porcentaje_avance_ponderado || 0}%`,
    },
    {
      id: 'finanzas',
      label: 'Finanzas y materiales',
      href: `/proyectos/${proyecto.id}/finanzas`,
      icon: Wallet,
      badge: formatCLP(proyecto.monto_cotizado || 0),
    },
    {id:'presupuestos',label:'Presupuestos',href:`/proyectos/${proyecto.id}/presupuestos`,icon:FileText},
    {
      id: 'cambios',
      label: 'Reclamos & Cambios',
      href: `/proyectos/${proyecto.id}/cambios`,
      icon: AlertTriangle,
      badge: cambiosPendientes > 0 ? `${cambiosPendientes} pend.` : undefined,
      alert: cambiosPendientes > 0,
    },
    {
      id: 'documentos',
      label: 'Documentos',
      href: `/proyectos/${proyecto.id}/documentos`,
      icon: FolderOpen,
      badge: docsCount > 0 ? String(docsCount) : undefined,
    },
    {
      id: 'asistencia',
      label: 'Asistencia',
      href: `/proyectos/${proyecto.id}/asistencia`,
      icon: ClipboardCheck,
      badge: presentesHoy > 0 ? `${presentesHoy} hoy` : undefined,
    },
    {
      id: 'ia',
      label: 'Copiloto IA',
      href: `/proyectos/${proyecto.id}/ia`,
      icon: Sparkles,
      highlight: true,
      badge: 'Gemini',
    },
  ];

  return (
    <div className="bg-white dark:bg-[#141A23] border-b border-kraft-200 dark:border-[#263040] shadow-sm transition-colors duration-200">
      {/* Fila Superior: Breadcrumbs, Título y Datos Clave */}
      <div className="px-4 sm:px-6 pt-4 pb-3">
        {/* Breadcrumb de Navegación */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-mono mb-2">
          <Link
            href="/proyectos"
            className="hover:text-[#FF6A00] flex items-center gap-1 transition-colors font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Obras & Proyectos</span>
          </Link>
          <span>/</span>
          <span className="text-navy-900 dark:text-gray-200 font-bold truncate max-w-[200px] sm:max-w-none">
            {proyecto.nombre}
          </span>
        </div>

        {/* Encabezado Principal de la Obra */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-heading font-black text-navy-900 dark:text-white truncate">
                {proyecto.nombre}
              </h1>
              <span
                className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                  proyecto.estado === 'activo'
                    ? 'bg-[#6B8F72]/15 text-[#6B8F72] border border-[#6B8F72]/30'
                    : proyecto.estado === 'terminado'
                    ? 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                    : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                }`}
              >
                {proyecto.estado.toUpperCase()}
              </span>
            </div>

            {/* Metadatos Rápidos */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-gray-600 dark:text-gray-400 font-sans">
              {cliente?.nombre && (
                <div className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-[#FF6A00]" />
                  <span>
                    Mandante: <strong className="text-navy-900 dark:text-gray-200">{cliente.nombre}</strong>
                  </span>
                </div>
              )}
              {proyecto.comuna && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    {proyecto.direccion ? `${proyecto.direccion}, ` : ''}
                    {proyecto.comuna}
                  </span>
                </div>
              )}
              {proyecto.fecha_termino_estimada && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span>Entrega: {formatDate(proyecto.fecha_termino_estimada)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Botón de Ubicación Maps */}
          {onOpenMaps && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onOpenMaps}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-kraft-100 dark:bg-[#1E2530] text-navy-900 dark:text-gray-200 border border-kraft-200 dark:border-[#263040] hover:border-[#FF6A00] text-xs font-heading font-bold shadow-sm transition-all"
                title="Ver ubicación en Google Maps"
              >
                <MapPin className="w-3.5 h-3.5 text-[#FF6A00]" />
                <span>Ver en Maps</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fila Inferior: Pestañas de Navegación Rápida por Obra */}
      <div className="px-4 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-kraft-100 dark:border-[#1E2530] pt-1">
        {tabs.filter(tab=>tab.id!=='presupuestos'||['admin','supervisor'].includes(dataService.getActiveUser()?.rol||'')).map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname?.startsWith(tab.href);

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex items-center gap-2 px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm font-heading font-bold border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-[#FF6A00] text-[#FF6A00] bg-[#FF6A00]/5 dark:bg-[#FF6A00]/10'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-navy-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Icon
                className={`w-4 h-4 ${
                  isActive
                    ? 'text-[#FF6A00]'
                    : tab.alert
                    ? 'text-amber-500'
                    : tab.highlight
                    ? 'text-purple-500'
                    : 'text-gray-400'
                }`}
              />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? 'bg-[#FF6A00] text-white'
                      : tab.alert
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      : tab.highlight
                      ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                      : 'bg-kraft-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
