'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Building,
  ClipboardCheck,
  CreditCard,
  FileText,
  GanttChartSquare,
  LayoutDashboard,
  MessageSquareShare,
  Plus,
  Search,
  Sparkles,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { dataService } from '@/lib/data-service';

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  group: 'Acciones rápidas' | 'Navegación' | 'Obras' | 'Clientes' | 'Equipo' | 'Presupuestos';
  href?: string;
  action?: () => void;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const user = dataService.getActiveUser();
    const isTerreno = user?.rol === 'terreno';

    const nav: CommandItem[] = isTerreno
      ? [
          {
            id: 'nav-proyectos',
            title: 'Obras Asignadas',
            subtitle: 'Ver tus obras en terreno',
            group: 'Navegación',
            href: '/proyectos',
            keywords: 'obras proyectos terreno',
            icon: Building,
          },
          {
            id: 'nav-asistencia',
            title: 'Asistencia',
            subtitle: 'Registro y control de jornada',
            group: 'Navegación',
            href: '/asistencia',
            keywords: 'asistencia asistencia obreros',
            icon: ClipboardCheck,
          },
          {
            id: 'nav-reportes',
            title: 'Reportes de Terreno',
            subtitle: 'Actividad de WhatsApp y evidencias',
            group: 'Navegación',
            href: '/reportes',
            keywords: 'reportes whatsapp evidencias',
            icon: MessageSquareShare,
          },
          {
            id: 'nav-obrabot',
            title: 'ObraBot',
            subtitle: 'Asistente IA para obra',
            group: 'Navegación',
            href: '/cotizador',
            keywords: 'obrabot ia cotizador',
            icon: Sparkles,
          },
        ]
      : [
          {
            id: 'nav-dashboard',
            title: 'Centro de Mando',
            subtitle: 'KPIs, alertas y flujo financiero',
            group: 'Navegación',
            href: '/dashboard',
            keywords: 'inicio dashboard centro mando kpi',
            icon: LayoutDashboard,
          },
          {
            id: 'nav-obrabot',
            title: 'ObraBot y Cotizador IA',
            subtitle: 'Crear presupuestos y comparar ferreterías',
            group: 'Navegación',
            href: '/cotizador',
            keywords: 'obrabot ia cotizador presupuesto radar materiales',
            icon: Sparkles,
          },
          {
            id: 'nav-proyectos',
            title: 'Obras y Proyectos',
            subtitle: 'Listado de obras, Gantt, costos y documentos',
            group: 'Navegación',
            href: '/proyectos',
            keywords: 'obras proyectos gantt finanzas documentos',
            icon: Building,
          },
          {
            id: 'nav-asistencia',
            title: 'Asistencia',
            subtitle: 'Control diario de cuadrillas',
            group: 'Navegación',
            href: '/asistencia',
            keywords: 'asistencia obreros cuadrilla',
            icon: ClipboardCheck,
          },
          {
            id: 'nav-reportes',
            title: 'Reportes WhatsApp',
            subtitle: 'Reportes de terreno y avisos enviados',
            group: 'Navegación',
            href: '/reportes',
            keywords: 'reportes whatsapp avisos',
            icon: MessageSquareShare,
          },
          {
            id: 'nav-equipo',
            title: 'Equipo de Obra',
            subtitle: 'Trabajadores, supervisores y especialidades',
            group: 'Navegación',
            href: '/equipo',
            keywords: 'equipo trabajadores maestros supervisores',
            icon: Users,
          },
          {
            id: 'nav-clientes',
            title: 'Clientes',
            subtitle: 'Mandantes y datos de contacto',
            group: 'Navegación',
            href: '/clientes',
            keywords: 'clientes mandantes rut',
            icon: User,
          },
          {
            id: 'nav-planes',
            title: 'Planes y Suscripción',
            subtitle: 'Gestionar plan y pagos Flow',
            group: 'Navegación',
            href: '/planes',
            keywords: 'planes suscripcion flow billing',
            icon: CreditCard,
          },
        ];

    const quickActions: CommandItem[] = isTerreno
      ? []
      : [
          {
            id: 'act-new-project',
            title: '+ Nueva obra o plantilla rápida',
            subtitle: 'Crear proyecto nuevo o desde plantilla chilena',
            group: 'Acciones rápidas',
            href: '/proyectos?nueva=1',
            keywords: 'crear nueva obra proyecto plantilla',
            icon: Plus,
          },
          {
            id: 'act-alerts',
            title: 'Abrir Centro de Alertas',
            subtitle: 'Sobrecostos, atrasos Gantt, materiales 7d y reclamos',
            group: 'Acciones rápidas',
            action: () => window.dispatchEvent(new Event('obratrack_open_alerts_drawer')),
            keywords: 'alertas avisos sobrecosto atraso',
            icon: Bell,
          },
          {
            id: 'act-monthly-attendance',
            title: 'Planilla Mensual de Asistencia',
            subtitle: 'Consolidado mensual de horas-hombre y exportación',
            group: 'Acciones rápidas',
            href: '/asistencia?vista=mensual',
            keywords: 'planilla mensual horas hombre asistencia liquidacion',
            icon: ClipboardCheck,
          },
        ];

    const proyectos: CommandItem[] = dataService.getProyectos().flatMap((p) => {
      const base: CommandItem = {
        id: `pro-${p.id}`,
        title: p.nombre,
        subtitle: [p.comuna, p.estado].filter(Boolean).join(' · ') || 'Obra',
        group: 'Obras',
        href: `/proyectos/${p.id}/gantt`,
        keywords: `${p.nombre} ${p.comuna || ''} ${p.direccion || ''} ${p.estado}`,
        icon: Building,
      };
      if (isTerreno) return [base];
      return [
        base,
        {
          id: `pro-${p.id}-finanzas`,
          title: `${p.nombre} → Finanzas y Materiales`,
          subtitle: 'Pagos, EDP PDF, materiales y rentabilidad',
          group: 'Obras',
          href: `/proyectos/${p.id}/finanzas`,
          keywords: `${p.nombre} finanzas costos pagos materiales edp`,
          icon: Wallet,
        },
        {
          id: `pro-${p.id}-gantt`,
          title: `${p.nombre} → Carta Gantt y Bitácora`,
          subtitle: 'Partidas, plazos y registro de avances',
          group: 'Obras',
          href: `/proyectos/${p.id}/gantt`,
          keywords: `${p.nombre} gantt partidas cronograma bitacora`,
          icon: GanttChartSquare,
        },
      ];
    });

    const clientes: CommandItem[] = isTerreno
      ? []
      : dataService.getClientes().map((c) => ({
          id: `cli-${c.id}`,
          title: c.nombre,
          subtitle: c.rut || c.email || c.telefono || 'Cliente',
          group: 'Clientes',
          href: '/clientes',
          keywords: `${c.nombre} ${c.rut || ''} ${c.email || ''} ${c.comuna || ''}`,
          icon: User,
        }));

    const usuarios: CommandItem[] = isTerreno
      ? []
      : dataService.getUsuarios().map((u) => ({
          id: `usr-${u.id}`,
          title: u.nombre,
          subtitle: `${u.rol}${u.especialidades?.length ? ` · ${u.especialidades.join(', ')}` : ''}`,
          group: 'Equipo',
          href: '/equipo',
          keywords: `${u.nombre} ${u.rol} ${(u.especialidades || []).join(' ')}`,
          icon: Users,
        }));

    const cotizaciones: CommandItem[] = isTerreno
      ? []
      : dataService.getCotizaciones().slice(0, 15).map((q) => ({
          id: `cot-${q.id}`,
          title: q.titulo_proyecto || 'Presupuesto',
          subtitle: q.comuna_region || q.tipo_obra || 'Cotización IA',
          group: 'Presupuestos',
          href: '/cotizador',
          keywords: `${q.titulo_proyecto || ''} ${q.tipo_obra || ''} ${q.comuna_region || ''}`,
          icon: FileText,
        }));

    return [...quickActions, ...nav, ...proyectos, ...clientes, ...usuarios, ...cotizaciones];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 14);
    const terms = q.split(/\s+/).filter(Boolean);
    return items
      .filter((item) => {
        const hay = `${item.title} ${item.subtitle} ${item.keywords} ${item.group}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 16);
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const selectItem = (item?: CommandItem) => {
    if (!item) return;
    onClose();
    if (item.action) {
      item.action();
      return;
    }
    if (item.href) {
      router.push(item.href);
    }
  };

  return (
    <ModalOverlay
      onClose={onClose}
      aria-label="Búsqueda rápida de ObraTrack"
      className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-16 sm:pt-24 bg-black/60 backdrop-blur-sm"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-kraft-200 dark:border-[#263040] px-4 py-3">
          <Search className="w-4 h-4 text-[#FF6A00] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((prev) =>
                  filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0,
                );
              } else if (e.key === 'Enter') {
                e.preventDefault();
                selectItem(filtered[activeIndex]);
              }
            }}
            placeholder="Buscar obra, cliente, trabajador o ir a sección…"
            aria-label="Buscar en ObraTrack"
            className="w-full bg-transparent text-sm text-[#1E1E1E] dark:text-white placeholder-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar búsqueda rápida"
            className="rounded-lg p-1 text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs font-mono text-gray-500">
              No encontramos resultados para «{query}».
            </p>
          ) : (
            <ul role="listbox" aria-label="Resultados de búsqueda rápida" className="space-y-0.5">
              {filtered.map((item, idx) => {
                const Icon = item.icon;
                const isSelected = idx === activeIndex;
                return (
                  <li key={item.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => selectItem(item)}
                      className={`w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-[#FF6A00]/10 text-[#1E1E1E] dark:text-white'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`p-1.5 rounded-lg shrink-0 ${
                            isSelected
                              ? 'bg-[#FF6A00] text-white'
                              : 'bg-kraft-100 dark:bg-[#1E2633] text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{item.title}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 shrink-0">
                        {item.group}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-kraft-200 dark:border-[#263040] bg-kraft-50/70 dark:bg-[#0F141C] px-4 py-2 text-[11px] font-mono text-gray-500">
          <span>↑↓ navegar · Enter abrir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </ModalOverlay>
  );
}
