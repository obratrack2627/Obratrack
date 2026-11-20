'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  Compass,
  HelpCircle,
  Sparkles,
  UserCog,
  Users,
  X,
} from 'lucide-react';

export interface TourChecklistStatus {
  hasProfileSetup: boolean;
  hasProject: boolean;
  hasTeamMember: boolean;
}

interface TourStep {
  id: string;
  badge: string;
  title: string;
  body: string;
  bullets?: { label: string; desc: string }[];
  getSelectors: () => string[];
  action?: 'open-profile';
}

const STEPS: TourStep[] = [
  {
    id: 'header',
    badge: 'Bienvenida',
    title: 'Tu Centro de Mando en 1 minuto',
    body: 'Aquí controlas el pulso diario de tu constructora. Desde arriba puedes abrir ObraBot (tu asistente IA) o ir directo a Gestionar Obras. En celular, abre todo el menú con ☰.',
    getSelectors: () => ['[data-tour-zone="header"]'],
  },
  {
    id: 'kpis',
    badge: 'Indicadores y Privacidad',
    title: 'Resumen financiero y botón de ojo',
    body: 'Revisa tus obras activas, lo contratado, recaudado y reportes pendientes. Por privacidad en terreno, los montos en pesos parten ocultos (••••) y se revelan por 30 seg al tocar el ojo.',
    getSelectors: () => ['[data-tour-zone="kpis"]'],
  },
  {
    id: 'projects',
    badge: 'Obras y Alertas',
    title: 'Saltos rápidos a Gantt y Costos',
    body: 'Cada obra activa tendrá accesos en 1 clic a su Carta Gantt y Finanzas / Materiales. Si alguna obra presenta atraso o plazo vencido, aparecerá destacada en rojo justo arriba.',
    getSelectors: () => ['[data-tour-zone="alerts"]', '[data-tour-zone="projects"]'],
  },
  {
    id: 'charts',
    badge: 'Análisis Visual',
    title: 'Flujo financiero y cartera',
    body: 'A medida que registres presupuestos, cobros e imprevistos, aquí compararás cuánto llevas contratado versus cobrado en cada proyecto, también con su propio botón de privacidad.',
    getSelectors: () => ['[data-tour-zone="charts"]'],
  },
  {
    id: 'navigation',
    badge: 'Mapa de Módulos',
    title: 'Qué hace cada sección del menú',
    body: 'Recorre tu operación diaria desde el menú lateral (o ☰ en móvil):',
    bullets: [
      { label: 'ObraBot', desc: 'Cotiza y crea obras/Gantt con IA (y por WhatsApp en Pro IA).' },
      { label: 'Obras y proyectos', desc: 'Carta Gantt, EDP, materiales, cambios y documentos.' },
      { label: 'Asistencia y Equipo', desc: 'Control diario de cuadrilla, especialidades y roles.' },
      { label: 'Reportes', desc: 'Avisos y novedades enviadas desde terreno o WhatsApp.' },
    ],
    getSelectors: () => {
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        return ['button[aria-label="Abrir menú"]'];
      }
      return ['[data-tour-zone="sidebar-nav"]'];
    },
  },
  {
    id: 'profile',
    badge: 'Paso Recomendado',
    title: 'Configura tu Empresa y WhatsApp',
    body: 'En Editar perfil puedes subir el logo de tu constructora (aparecerá en tus PDFs) y guardar tu teléfono para que ObraBot te reconozca por WhatsApp. Puedes repetir esta guía cuando quieras en "? Guía".',
    getSelectors: () => {
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        return ['button[aria-label="Mi perfil"]'];
      }
      return ['[data-tour-zone="sidebar-account"]'];
    },
    action: 'open-profile',
  },
];

function findTargetElement(selectors: string[]): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

export function openProfileFromOnboarding(tab: 'perfil' | 'empresa' = 'perfil') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('obratrack_open_profile', { detail: { tab } }));
}

interface DashboardFirstStepsChecklistProps {
  visible: boolean;
  status: TourChecklistStatus;
  onStartTour: () => void;
  onDismiss: () => void;
}

/**
 * Guía práctica de arranque visible únicamente cuando la constructora aún no registra obras.
 */
export function DashboardFirstStepsChecklist({
  visible,
  status,
  onStartTour,
  onDismiss,
}: DashboardFirstStepsChecklistProps) {
  if (!visible) return null;

  const completed =
    Number(status.hasProfileSetup) +
    Number(status.hasProject) +
    Number(status.hasTeamMember);

  return (
    <section
      aria-label="Primeros pasos en ObraTrack"
      className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-white via-[#FAF8F5] to-[#FF6A00]/[0.05] dark:from-[#141A23] dark:via-[#141A23] dark:to-[#FF6A00]/[0.08] border border-[#FF6A00]/30 shadow-sm space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#FF6A00]/15 text-[#FF6A00] border border-[#FF6A00]/30">
              <Compass className="w-3.5 h-3.5" />
              <span>Primeros pasos</span>
            </span>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {completed}/3 completados
            </span>
          </div>
          <h2 className="font-heading font-bold text-base sm:text-lg text-navy-900 dark:text-white">
            Deja tu constructora lista en 3 pasos
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onStartTour}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF6A00]/10 hover:bg-[#FF6A00]/20 text-[#FF6A00] text-xs font-heading font-bold transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Ver recorrido</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Ocultar primeros pasos"
            title="Ocultar lista de primeros pasos"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Paso 1: Perfil / Empresa */}
        <div className="p-3.5 rounded-xl bg-white/90 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] flex flex-col justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {status.hasProfileSetup ? (
              <CheckCircle2 className="w-4 h-4 text-[#6B8F72] shrink-0 mt-0.5" />
            ) : (
              <Circle className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-heading font-bold text-navy-900 dark:text-white">
                1. Perfil, logo y WhatsApp
              </p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                Sube tu logo para PDFs y guarda tu WhatsApp para usar ObraBot.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openProfileFromOnboarding('perfil')}
            className="inline-flex items-center gap-1.5 text-xs font-heading font-bold text-[#FF6A00] hover:underline self-start"
          >
            <UserCog className="w-3.5 h-3.5" />
            <span>{status.hasProfileSetup ? 'Revisar mi perfil' : 'Configurar perfil'}</span>
          </button>
        </div>

        {/* Paso 2: Primera obra o cotización */}
        <div className="p-3.5 rounded-xl bg-white/90 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] flex flex-col justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {status.hasProject ? (
              <CheckCircle2 className="w-4 h-4 text-[#6B8F72] shrink-0 mt-0.5" />
            ) : (
              <Circle className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-heading font-bold text-navy-900 dark:text-white">
                2. Crea o cotiza tu 1ª obra
              </p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                Pide una cotización con IA en ObraBot o registra tu proyecto directo.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/cotizador"
              className="inline-flex items-center gap-1 text-xs font-heading font-bold text-[#FF6A00] hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ir a ObraBot</span>
            </Link>
            <Link
              href="/proyectos"
              className="inline-flex items-center gap-1 text-xs font-heading font-bold text-navy-900 dark:text-gray-200 hover:underline"
            >
              <Building2 className="w-3.5 h-3.5 text-[#6B8F72]" />
              <span>Crear obra</span>
            </Link>
          </div>
        </div>

        {/* Paso 3: Cuadrilla */}
        <div className="p-3.5 rounded-xl bg-white/90 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] flex flex-col justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {status.hasTeamMember ? (
              <CheckCircle2 className="w-4 h-4 text-[#6B8F72] shrink-0 mt-0.5" />
            ) : (
              <Circle className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-heading font-bold text-navy-900 dark:text-white">
                3. Registra tu equipo
              </p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                Carga supervisores y maestros para asignar obras y tomar asistencia.
              </p>
            </div>
          </div>
          <Link
            href="/equipo"
            className="inline-flex items-center gap-1.5 text-xs font-heading font-bold text-[#FF6A00] hover:underline self-start"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{status.hasTeamMember ? 'Ver equipo' : 'Agregar trabajador'}</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

interface DashboardOnboardingTourProps {
  open: boolean;
  stepIndex: number;
  onStepChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Recorrido interactivo no bloqueante de 6 pasos para el Centro de Mando en web y móvil.
 */
export default function DashboardOnboardingTour({
  open,
  stepIndex,
  onStepChange,
  onClose,
}: DashboardOnboardingTourProps) {
  const [spotlightRect, setSpotlightRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [didNavigateManually, setDidNavigateManually] = useState(false);

  const safeIndex = Math.max(0, Math.min(STEPS.length - 1, stepIndex));
  const step = useMemo(() => STEPS[safeIndex], [safeIndex]);

  useEffect(() => {
    if (!open) {
      setSpotlightRect(null);
      setDidNavigateManually(false);
      return;
    }

    let rafId = 0;

    const measureNow = () => {
      const target = findTargetElement(step.getSelectors());
      if (!target) {
        setSpotlightRect(null);
        return;
      }
      const r = target.getBoundingClientRect();
      const pad = 6;
      const left = Math.max(4, r.left - pad);
      const top = Math.max(4, r.top - pad);
      const maxWidth = Math.max(0, window.innerWidth - left - 4);
      setSpotlightRect({
        top,
        left,
        width: Math.min(maxWidth, r.width + pad * 2),
        height: r.height + pad * 2,
      });
    };

    const scheduleMeasure = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(measureNow);
    };

    const target = findTargetElement(step.getSelectors());
    if (target && didNavigateManually) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    measureNow();
    const t1 = window.setTimeout(scheduleMeasure, 120);
    const t2 = window.setTimeout(scheduleMeasure, 360);
    const t3 = window.setTimeout(scheduleMeasure, 680);

    let resizeObs: ResizeObserver | null = null;
    if (target && typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(scheduleMeasure);
      resizeObs.observe(target);
    }

    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      resizeObs?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
    };
  }, [open, step, didNavigateManually]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && safeIndex < STEPS.length - 1) {
        setDidNavigateManually(true);
        onStepChange(safeIndex + 1);
      } else if (e.key === 'ArrowLeft' && safeIndex > 0) {
        setDidNavigateManually(true);
        onStepChange(safeIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, safeIndex, onStepChange, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const isLast = safeIndex === STEPS.length - 1;

  const goTo = (next: number) => {
    setDidNavigateManually(true);
    onStepChange(Math.max(0, Math.min(STEPS.length - 1, next)));
  };

  return createPortal(
    <>
      {/* Fondo oscurecido alrededor del bloque destacado (pointer-events-none para no bloquear botones) */}
      {spotlightRect ? (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none z-[44] rounded-2xl border-2 border-[#FF6A00] transition-opacity duration-200 print:hidden"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            boxShadow: '0 0 0 9999px rgba(11, 14, 20, 0.56), 0 0 0 4px rgba(255, 106, 0, 0.32)',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none z-[44] bg-[#0B0E14]/50 transition-opacity duration-200 print:hidden"
        />
      )}

      {/* Tarjeta guía flotante (bottom-sheet en móvil / esquina inferior izquierda junto al sidebar en escritorio) */}
      <aside
        role="region"
        aria-label={`Guía del Centro de Mando: ${step.title}`}
        className="fixed inset-x-2.5 bottom-2.5 sm:inset-x-4 md:inset-x-auto md:bottom-5 md:left-[17rem] md:w-[410px] max-w-[calc(100vw-1.25rem)] max-h-[75dvh] overflow-y-auto z-[46] rounded-2xl bg-[#141A23] text-white border border-[#FF6A00]/65 shadow-2xl p-4 space-y-3 print:hidden"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#FF6A00] animate-pulse shrink-0" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#FF6A00] truncate">
              Paso {safeIndex + 1} de {STEPS.length} · {step.badge}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-300 hover:text-white font-semibold inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <span>Saltar</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-sm sm:text-base font-heading font-bold text-white leading-snug">
            {step.title}
          </h3>
          <p className="text-xs text-gray-300 leading-relaxed">{step.body}</p>
          {step.bullets && (
            <ul className="space-y-1.5 pt-1 text-xs text-gray-200">
              {step.bullets.map((b) => (
                <li key={b.label} className="leading-snug">
                  <strong className="text-[#FF6A00]">{b.label}:</strong>{' '}
                  <span className="text-gray-300">{b.desc}</span>
                </li>
              ))}
            </ul>
          )}
          {step.action === 'open-profile' && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => openProfileFromOnboarding('perfil')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-heading font-bold text-[#FF6A00] border border-[#FF6A00]/40 transition-colors"
              >
                <UserCog className="w-3.5 h-3.5" />
                <span>Abrir Mi perfil ahora</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Pasos del tutorial">
            {STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={idx === safeIndex}
                aria-label={`Ir al paso ${idx + 1}: ${s.badge}`}
                onClick={() => goTo(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === safeIndex
                    ? 'w-5 bg-[#FF6A00]'
                    : 'w-2 bg-gray-600 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {safeIndex > 0 && (
              <button
                type="button"
                onClick={() => goTo(safeIndex - 1)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-heading font-bold text-gray-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Atrás</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? onClose() : goTo(safeIndex + 1))}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-[#FF6A00] hover:bg-[#E55F00] text-xs font-heading font-bold text-white shadow transition-colors"
            >
              <span>{isLast ? '¡Listo, empezar!' : 'Siguiente'}</span>
              {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </aside>
    </>,
    document.body,
  );
}
