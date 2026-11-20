'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BellRing,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileDown,
  FileText,
  GitPullRequest,
  Landmark,
  Mail,
  MapPin,
  MapPinned,
  Menu,
  MessageCircle,
  MessageSquare,
  Phone,
  Play,
  PlayCircle,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Square,
  User,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { ObraTrackIcon } from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import { PLANES_SUSCRIPCION, getPlanPricing, isPaidPlanId } from '@/lib/plans';
import { formatCLP } from '@/lib/utils';
import type { BillingCycle } from '@/types/database';

type StoreFilter = 'Todas' | 'Sodimac' | 'Construmart' | 'Easy' | 'Imperial' | 'Dimaco';
type CategoryFilter = 'Todos' | 'Obra Gruesa' | 'Terminaciones' | 'Instalaciones';

interface RadarItem {
  name: string;
  cat: Exclude<CategoryFilter, 'Todos'>;
  unit: string;
  avg: number;
  best: number;
  store: Exclude<StoreFilter, 'Todas'>;
}

const DIRECT_COST = 16514500;
const TIER_LABELS: Record<15 | 30 | 40, string> = {
  15: 'Tarifa Competitiva',
  30: 'Tarifa Recomendada',
  40: 'Tarifa Premium',
};

const EDP_CONTRATO = 16000000;
const EDP_PAGADO_ANT = 8400000;
const EDP_BRUTO_PERIODO = 3600000;

const RADAR_ITEMS: RadarItem[] = [
  { name: 'Cemento Especial Polpaico 25 kg', cat: 'Obra Gruesa', unit: 'Saco', avg: 4690, best: 4190, store: 'Construmart' },
  { name: 'Fierro Estriado A63-42H 12 mm × 6 m', cat: 'Obra Gruesa', unit: 'Tira', avg: 9850, best: 8990, store: 'Sodimac' },
  { name: 'Tablero OSB Estructural 11,1 mm 1,22×2,44 m', cat: 'Obra Gruesa', unit: 'Plancha', avg: 14990, best: 13490, store: 'Dimaco' },
  { name: 'Adhesivo Cerámico Bekron DA 25 kg', cat: 'Terminaciones', unit: 'Saco', avg: 7290, best: 6450, store: 'Imperial' },
  { name: 'Plancha Volcanita Estándar 10 mm 1,2×2,4 m', cat: 'Terminaciones', unit: 'Plancha', avg: 6990, best: 6190, store: 'Easy' },
  { name: 'Esmalte al Agua Blanco Tineta 4 gl', cat: 'Terminaciones', unit: 'Tineta', avg: 48990, best: 43990, store: 'Sodimac' },
  { name: 'Cable Eléctrico EVA Libre Halógeno 2,5 mm (100 m)', cat: 'Instalaciones', unit: 'Rollo', avg: 42500, best: 37900, store: 'Imperial' },
  { name: 'Tubo PVC Sanitario Gris 110 mm × 6 m', cat: 'Instalaciones', unit: 'Tira', avg: 13800, best: 12190, store: 'Construmart' },
];

const STORES: Array<{ name: StoreFilter; dotClass?: string }> = [
  { name: 'Todas' },
  { name: 'Sodimac', dotClass: 'bg-red-600' },
  { name: 'Construmart', dotClass: 'bg-orange-600' },
  { name: 'Easy', dotClass: 'bg-amber-500' },
  { name: 'Imperial', dotClass: 'bg-blue-600' },
  { name: 'Dimaco', dotClass: 'bg-[#6B8F72]' },
];

const CATEGORIES: CategoryFilter[] = ['Todos', 'Obra Gruesa', 'Terminaciones', 'Instalaciones'];

const NAV_ITEMS = [
  { href: '#radar-ferretero', label: 'Radar Ferretero', dot: true },
  { href: '#como-funciona', label: 'WhatsApp IA' },
  { href: '#estados-pago', label: 'Estados de Pago' },
  { href: '#modulos', label: 'Funciones' },
  { href: '#calculadora-roi', label: 'Ahorro' },
  { href: '#precios', label: 'Planes' },
];

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('');

  // Hero Quote interactive state
  const [quoteMargin, setQuoteMargin] = useState<15 | 30 | 40>(30);

  // Radar Ferretero state
  const [activeStore, setActiveStore] = useState<StoreFilter>('Todas');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('Todos');
  const [radarSearch, setRadarSearch] = useState('');

  // WhatsApp -> ObraBot -> Gantt simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [waTimer, setWaTimer] = useState('0:18');
  const [waHint, setWaHint] = useState('▶ Pulsa Play para simular');
  const [botBadge, setBotBadge] = useState('LISTO');
  const [botStep, setBotStep] = useState(0);
  const [pipelinePct, setPipelinePct] = useState(0);
  const [ganttPct, setGanttPct] = useState(75);
  const [edpHighlight, setEdpHighlight] = useState(false);
  const simTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // EDP calculator & modals state
  const [edpRetention, setEdpRetention] = useState<0 | 5 | 10>(5);
  const [openModal, setOpenModal] = useState<'edp' | 'whatsapp' | null>(null);

  // ROI calculator state
  const [roiObras, setRoiObras] = useState(3);
  const [roiMonto, setRoiMonto] = useState(15000000);
  const [roiMeses, setRoiMeses] = useState(3);

  // Billing toggle state
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('mensual');

  const tiltRef = useRef<HTMLDivElement | null>(null);

  // Derived quote math
  const quoteCalc = useMemo(() => {
    const marginAmount = Math.round(DIRECT_COST * (quoteMargin / 100));
    const neto = DIRECT_COST + marginAmount;
    const iva = Math.round(neto * 0.19);
    const total = neto + iva;
    return { marginAmount, neto, iva, total };
  }, [quoteMargin]);

  // Derived filtered radar items
  const filteredRadar = useMemo(() => {
    const q = radarSearch.toLowerCase().trim();
    return RADAR_ITEMS.filter((item) => {
      const matchStore = activeStore === 'Todas' || item.store === activeStore;
      const matchCat = activeCategory === 'Todos' || item.cat === activeCategory;
      const matchQuery = !q || item.name.toLowerCase().includes(q) || item.store.toLowerCase().includes(q);
      return matchStore && matchCat && matchQuery;
    });
  }, [activeStore, activeCategory, radarSearch]);

  // Derived EDP math (matches lib/edp-calculator.ts)
  const edpCalc = useMemo(() => {
    const retMonto = Math.round((EDP_BRUTO_PERIODO * edpRetention) / 100);
    const liquido = EDP_BRUTO_PERIODO - retMonto;
    const neto = Math.round(liquido / 1.19);
    const iva = liquido - neto;
    const remanente = EDP_CONTRATO - EDP_PAGADO_ANT - liquido;
    return { retMonto, liquido, neto, iva, remanente };
  }, [edpRetention]);

  // Derived ROI math
  const roiCalc = useMemo(() => {
    const cycleRecup = Math.round(roiObras * roiMonto * 0.078);
    const monthlyRecup = Math.round(cycleRecup / roiMeses);
    const hoursSaved = roiObras * 6;
    const roiMult = Math.max(1, Math.round(monthlyRecup / 24990));
    return { cycleRecup, monthlyRecup, hoursSaved, roiMult };
  }, [roiObras, roiMonto, roiMeses]);

  // Scroll progress + header elevation
  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? Math.min(1, Math.max(0, scrollTop / docHeight)) : 0);
      setHeaderScrolled(scrollTop > 12);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll reveal observer & active section tracking
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll('.landing-reveal').forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const revealObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -36px 0px' },
    );

    document.querySelectorAll('.landing-reveal').forEach((el) => revealObs.observe(el));

    const navObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(`#${entry.target.id}`);
          }
        });
      },
      { rootMargin: '-25% 0px -60% 0px' },
    );

    NAV_ITEMS.forEach((item) => {
      const target = document.querySelector(item.href);
      if (target) navObs.observe(target);
    });

    return () => {
      revealObs.disconnect();
      navObs.disconnect();
    };
  }, []);

  // Close modals on Escape + lock body scroll while modal open
  useEffect(() => {
    if (!openModal) {
      document.body.style.overflow = '';
      return;
    }
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenModal(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openModal]);

  // Clear simulation timers on unmount
  useEffect(() => {
    return () => {
      simTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleSpotlightMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  const handleTiltMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg)`;
  };

  const handleTiltLeave = () => {
    if (tiltRef.current) {
      tiltRef.current.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
    }
  };

  const resetSimulation = () => {
    simTimersRef.current.forEach((t) => clearTimeout(t));
    simTimersRef.current = [];
    setIsSimulating(false);
    setWaTimer('0:18');
    setWaHint('▶ Pulsa Play para simular');
    setBotBadge('LISTO');
    setBotStep(0);
    setPipelinePct(0);
    setEdpHighlight(false);
  };

  const simulateWhatsAppFlow = () => {
    if (isSimulating) {
      resetSimulation();
      return;
    }
    simTimersRef.current.forEach((t) => clearTimeout(t));
    simTimersRef.current = [];

    setIsSimulating(true);
    setWaTimer('0:00');
    setWaHint('Transcribiendo audio en ObraBot...');
    setBotBadge('PROCESANDO...');
    setBotStep(0);
    setPipelinePct(28);
    setGanttPct(68);
    setEdpHighlight(false);

    const schedule: Array<[number, () => void]> = [
      [400, () => setWaTimer('0:05')],
      [
        950,
        () => {
          setWaTimer('0:10');
          setPipelinePct(58);
          setBotStep(1);
        },
      ],
      [
        1700,
        () => {
          setWaTimer('0:14');
          setPipelinePct(82);
          setBotStep(2);
        },
      ],
      [
        2450,
        () => {
          setWaTimer('0:18');
          setPipelinePct(100);
          setBotStep(3);
          setBotBadge('SINCRONIZADO ✓');
          setGanttPct(75);
          setEdpHighlight(true);
          setWaHint('✓ Avance, costo y bitácora al día');
        },
      ],
      [
        3400,
        () => {
          setIsSimulating(false);
        },
      ],
    ];

    simTimersRef.current = schedule.map(([delay, fn]) => setTimeout(fn, delay));
  };

  const waEdpPreviewText = useMemo(() => {
    const retLine =
      edpCalc.retMonto > 0
        ? `🛡️ Retención (${edpRetention}%): -${formatCLP(edpCalc.retMonto)}\n`
        : '';
    return (
      `📑 ESTADO DE PAGO EDP-003 — OBRATRACK\n` +
      `🏗️ Obra: Ampliación PAC 250 m²\n` +
      `👤 Mandante: Constructora del Norte S.A.\n\n` +
      `📊 Avance promedio de partidas: 75%\n` +
      `💼 Contrato Vigente (IVA incl.): ${formatCLP(EDP_CONTRATO)}\n` +
      `✅ Pagos Anteriores: ${formatCLP(EDP_PAGADO_ANT)}\n` +
      retLine +
      `\n💰 NETO DEL MONTO A PAGAR: ${formatCLP(edpCalc.neto)}\n` +
      `🏛️ IVA (19%): ${formatCLP(edpCalc.iva)}\n` +
      `🔥 LÍQUIDO A PAGAR EN ESTE EDP: ${formatCLP(edpCalc.liquido)}\n` +
      `📌 Saldo restante tras este pago: ${formatCLP(edpCalc.remanente)}\n\n` +
      `Emitido por Tu Constructora SpA en ObraTrack.`
    );
  }, [edpCalc, edpRetention]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0E14] text-[#1E1E1E] dark:text-gray-100 font-sans antialiased selection:bg-[#FF6A00] selection:text-white overflow-x-clip">
      {/* Top Scroll Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] z-[60] bg-transparent pointer-events-none">
        <div
          className="h-full w-full bg-gradient-to-r from-[#FF6A00] via-amber-400 to-[#6B8F72]"
          style={{ transformOrigin: 'left', transform: `scaleX(${scrollProgress})` }}
        />
      </div>

      {/* Top Industrial Telemetry Bar */}
      <div className="bg-[#141A23] text-white py-2 px-4 sm:px-6 text-[11px] font-mono border-b-2 border-[#FF6A00]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center gap-1.5 font-bold whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-[#6B8F72] animate-pulse" />
              OBRATRACK CHILE
            </span>
            <span className="text-slate-600 hidden xl:inline">|</span>
            <span className="text-slate-300 hidden xl:inline truncate">
              RADAR EN VIVO: SODIMAC · CONSTRUMART · EASY · IMPERIAL · DIMACO
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 whitespace-nowrap shrink-0">
            <span className="text-[#9AC2A2] font-semibold hidden sm:inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> LEY 21.719 Y 21.663
            </span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <Link
              href="/login"
              className="text-[#FF6A00] font-bold hover:text-orange-400 transition inline-flex items-center gap-1 group"
            >
              Portal Faena{' '}
              <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Header: Single-Row Official Navbar (Official Logo + ObraTrack Only, No Subtitle Underneath) */}
      <header
        className={`bg-white/90 dark:bg-[#141A23]/90 backdrop-blur-md border-b border-[#E5E7EB] dark:border-[#263040] sticky top-0 z-50 transition-shadow duration-300 ${
          headerScrolled ? 'shadow-md' : ''
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
          {/* Official Brand Logo + Wordmark Only */}
          <a
            href="#"
            className="flex items-center gap-2.5 shrink-0 whitespace-nowrap group"
            aria-label="ObraTrack Inicio"
          >
            <ObraTrackIcon
              theme="light"
              className="w-10 h-10 shrink-0 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-2"
            />
            <span className="font-heading text-2xl font-extrabold tracking-tight leading-none">
              <span className="text-[#FF6A00]">Obra</span>
              <span className="text-[#1E1E1E] dark:text-white">Track</span>
            </span>
          </a>

          {/* Desktop Single-Row Navigation */}
          <nav
            className="hidden lg:flex items-center gap-5 xl:gap-7 text-sm font-semibold text-[#1E1E1E] dark:text-gray-200 whitespace-nowrap"
            aria-label="Navegación principal"
          >
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`landing-nav-link hover:text-[#FF6A00] transition inline-flex items-center gap-1.5 whitespace-nowrap ${
                  activeSection === item.href ? 'landing-nav-link-active' : ''
                }`}
              >
                {item.dot && <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00]" />}
                {item.label}
              </a>
            ))}
          </nav>

          {/* Action Buttons + Compact Theme Toggle + Mobile Menu Trigger */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 whitespace-nowrap">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center text-xs font-mono font-bold text-[#1E1E1E] dark:text-gray-200 hover:text-[#FF6A00] px-2.5 py-2 transition whitespace-nowrap"
            >
              Ingresar
            </Link>
            <Link
              href="/login"
              className="landing-shimmer px-4 sm:px-5 py-2.5 rounded-xl bg-[#FF6A00] text-white font-heading font-bold text-sm hover:bg-[#E05E00] transition shadow-md shadow-[#FF6A00]/25 inline-flex items-center gap-1.5 whitespace-nowrap group"
            >
              <span>Crear Cuenta</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden p-2 rounded-xl border border-[#E5E7EB] dark:border-[#263040] text-[#1E1E1E] dark:text-gray-200 hover:border-[#FF6A00] hover:text-[#FF6A00] transition"
              aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white dark:bg-[#141A23] border-t border-[#E5E7EB] dark:border-[#263040] px-4 py-4 shadow-xl">
            <nav className="flex flex-col space-y-1 text-sm font-semibold text-[#1E1E1E] dark:text-gray-200" aria-label="Navegación móvil">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-xl hover:bg-[#FAF8F5] dark:hover:bg-[#1C2432] hover:text-[#FF6A00] flex items-center gap-2 transition"
                >
                  {item.dot && <span className="w-2 h-2 rounded-full bg-[#FF6A00]" />}
                  {item.label}
                </a>
              ))}
              <div className="pt-3 mt-2 border-t border-[#E5E7EB] dark:border-[#263040] flex items-center justify-between gap-2.5">
                <ThemeToggle />
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    className="py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#263040] text-center font-mono text-xs font-bold text-[#1E1E1E] dark:text-gray-200"
                  >
                    Ingresar
                  </Link>
                  <Link
                    href="/login"
                    className="py-2.5 rounded-xl bg-[#FF6A00] text-center font-heading text-xs font-bold text-white hover:bg-[#E05E00] transition"
                  >
                    Probar Gratis
                  </Link>
                </div>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="py-14 sm:py-20 lg:py-24 bg-white dark:bg-[#0B0E14] border-b border-[#E5E7EB] dark:border-[#263040] landing-wireframe relative overflow-hidden">
        <div className="landing-blob-1 pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#FF6A00]/10 blur-3xl" />
        <div className="landing-blob-2 pointer-events-none absolute -bottom-28 -left-24 w-96 h-96 rounded-full bg-[#6B8F72]/15 blur-3xl" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="border-l-4 border-[#FF6A00] pl-3.5 mb-6 landing-reveal">
            <div className="text-base sm:text-xl font-heading font-bold text-[#1E1E1E] dark:text-white">
              El <span className="text-[#FF6A00] italic">copiloto</span> digital del constructor
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column */}
            <div className="lg:col-span-7 landing-reveal landing-delay-1">
              <h1 className="font-heading text-4xl sm:text-5xl lg:text-[54px] font-extrabold text-[#1E1E1E] dark:text-white tracking-tight leading-[1.08]">
                Cotiza en minutos.
                <br />
                <span className="text-[#FF6A00]">
                  Controla tu obra, Gantt y pagos desde WhatsApp.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-[#334155] dark:text-gray-300 mt-6 leading-relaxed max-w-2xl">
                Diseñado para contratistas y constructoras PyME en Chile. Compara materiales en vivo entre{' '}
                <strong className="text-[#1E1E1E] dark:text-white">
                  Sodimac, Construmart, Easy, Imperial y Dimaco
                </strong>
                , ordena tu Carta Gantt con{' '}
                <strong className="text-[#1E1E1E] dark:text-white">ObraBot</strong> y emite Estados de Pago en PDF con tu propio membrete.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
                <Link
                  href="/login"
                  className="landing-shimmer px-7 py-4 rounded-xl bg-[#FF6A00] text-white font-heading font-bold text-base hover:bg-[#E05E00] transition shadow-lg shadow-[#FF6A00]/30 flex items-center justify-center gap-2"
                >
                  <Zap className="w-5 h-5 fill-white" />
                  <span>Probar Plan Gratis (1 Obra)</span>
                </Link>
                <a
                  href="#como-funciona"
                  className="px-6 py-4 rounded-xl bg-white dark:bg-[#141A23] border-2 border-[#1E1E1E] dark:border-gray-400 text-[#1E1E1E] dark:text-white font-heading font-bold text-base hover:bg-[#1E1E1E] hover:text-white dark:hover:bg-white dark:hover:text-[#141A23] transition flex items-center justify-center gap-2 shadow-sm group"
                >
                  <PlayCircle className="w-5 h-5 text-[#6B8F72] group-hover:scale-110 transition-transform" />
                  <span>Simular ObraBot en Vivo</span>
                </a>
              </div>

              <div className="mt-10 pt-8 border-t border-[#E5E7EB] dark:border-[#263040] grid grid-cols-2 sm:grid-cols-4 gap-5">
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#FF6A00] font-heading">5 Cadenas</div>
                  <div className="text-xs text-[#1E1E1E] dark:text-white font-bold mt-0.5">Catálogos en Vivo</div>
                  <div className="text-[11px] text-[#64748B] dark:text-gray-400 font-mono">Precios CLP reales</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-obra-green font-heading">100%</div>
                  <div className="text-xs text-[#1E1E1E] dark:text-white font-bold mt-0.5">Cálculo Determinista</div>
                  <div className="text-[11px] text-[#64748B] dark:text-gray-400 font-mono">Neto, margen e IVA 19%</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#1E1E1E] dark:text-white font-heading">0 Apps</div>
                  <div className="text-xs text-[#1E1E1E] dark:text-white font-bold mt-0.5">Para Terreno</div>
                  <div className="text-[11px] text-[#64748B] dark:text-gray-400 font-mono">Reportan por WhatsApp</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 font-heading">$12.990</div>
                  <div className="text-xs text-[#1E1E1E] dark:text-white font-bold mt-0.5">Plan Pro Mensual</div>
                  <div className="text-[11px] text-[#64748B] dark:text-gray-400 font-mono">CLP IVA incluido · Flow</div>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive 3D-Tilt Deterministic Quote Card */}
            <div className="lg:col-span-5 landing-reveal landing-delay-2">
              <div
                ref={tiltRef}
                onMouseMove={handleTiltMove}
                onMouseLeave={handleTiltLeave}
                className="landing-tilt bg-white dark:bg-[#141A23] rounded-2xl border-2 border-[#E5E7EB] dark:border-[#263040] p-5 shadow-2xl relative"
              >
                <div className="flex items-center justify-between pb-4 border-b border-[#E5E7EB] dark:border-[#263040] mb-4">
                  <div className="flex items-center gap-2">
                    <ObraTrackIcon theme="light" className="w-8 h-8 shrink-0" />
                    <span className="font-heading font-extrabold text-lg leading-none">
                      <span className="text-[#FF6A00]">Obra</span>
                      <span className="text-[#1E1E1E] dark:text-white">Track</span>
                    </span>
                  </div>

                  <div className="text-right border-l-2 border-[#FF6A00] pl-3">
                    <div className="font-heading font-extrabold text-sm uppercase text-[#1E1E1E] dark:text-white">
                      COTIZACIÓN APU
                    </div>
                    <div className="font-mono text-[10px] text-[#64748B] dark:text-gray-400">
                      PDF CON TU MEMBRETE
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 bg-[#FAF8F5] dark:bg-[#0B0E14] rounded-xl text-xs mb-4 border border-[#E5E7EB] dark:border-[#263040]">
                  <div>
                    <div className="font-bold text-[#FF6A00] text-[10px] flex items-center gap-1 uppercase">
                      <User className="w-3 h-3" /> CLIENTE
                    </div>
                    <div className="font-bold text-[#1E1E1E] dark:text-white mt-0.5">Constructora del Norte S.A.</div>
                    <div className="text-[11px] text-[#64748B] dark:text-gray-400 font-mono">RUT: 76.412.890-K</div>
                  </div>
                  <div>
                    <div className="font-bold text-[#FF6A00] text-[10px] flex items-center gap-1 uppercase">
                      <MapPin className="w-3 h-3" /> OBRA
                    </div>
                    <div className="font-bold text-[#1E1E1E] dark:text-white mt-0.5">Ampliación PAC 250 m²</div>
                    <div className="text-[11px] text-[#64748B] dark:text-gray-400">Las Condes, Santiago</div>
                  </div>
                </div>

                <div className="rounded-xl overflow-hidden border border-[#E5E7EB] dark:border-[#263040] mb-3">
                  <div className="bg-[#141A23] text-white text-[10px] font-mono uppercase grid grid-cols-12 py-2 px-3 font-bold">
                    <div className="col-span-2">ÍTEM</div>
                    <div className="col-span-6">PARTIDA (COSTO DIRECTO)</div>
                    <div className="col-span-4 text-right">SUBTOTAL</div>
                  </div>
                  <div className="text-[11px] divide-y divide-[#E5E7EB] dark:divide-[#263040]">
                    {[
                      ['01', 'Movimiento de suelo y excavación', '$ 582.000'],
                      ['02', 'Hormigón H-21 + Moldaje (55 m³)', '$ 6.957.500'],
                      ['03', 'Estructura metálica y perfiles', '$ 5.875.000'],
                      ['04', 'Instalación eléctrica y sanitaria', '$ 3.100.000'],
                    ].map(([code, desc, subtotal], idx) => (
                      <div
                        key={code}
                        className={`grid grid-cols-12 py-2 px-3 items-center ${
                          idx % 2 === 1 ? 'bg-[#FAF8F5] dark:bg-[#0F141C]' : 'bg-white dark:bg-[#141A23]'
                        }`}
                      >
                        <div className="col-span-2 font-mono font-bold text-[#FF6A00]">{code}</div>
                        <div className="col-span-6 font-medium text-[#1E1E1E] dark:text-gray-200">{desc}</div>
                        <div className="col-span-4 text-right font-mono font-bold text-[#1E1E1E] dark:text-white">
                          {subtotal}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#FAF8F5] dark:bg-[#0B0E14] rounded-xl p-3 border border-[#E5E7EB] dark:border-[#263040] mb-3 text-[11px] font-mono space-y-1.5">
                  <div className="flex items-center justify-between text-[#475569] dark:text-gray-300">
                    <span>Subtotal Costo Directo</span>
                    <span className="font-bold text-[#1E1E1E] dark:text-white">{formatCLP(DIRECT_COST)}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[#475569] dark:text-gray-300">
                    <div className="flex items-center gap-1.5">
                      <span>Tarifa:</span>
                      <div className="inline-flex bg-white dark:bg-[#141A23] border border-[#E5E7EB] dark:border-[#263040] rounded-lg p-0.5 text-[10px]">
                        {([15, 30, 40] as const).map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setQuoteMargin(pct)}
                            className={`px-1.5 py-0.5 rounded font-bold transition ${
                              quoteMargin === pct
                                ? 'bg-[#141A23] dark:bg-[#FF6A00] text-white'
                                : 'text-[#64748B] dark:text-gray-400 hover:text-[#1E1E1E] dark:hover:text-white'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <span className="font-bold text-[#1E1E1E] dark:text-white">
                      + {formatCLP(quoteCalc.marginAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#475569] dark:text-gray-300">
                    <span>IVA (19% sobre Neto)</span>
                    <span className="font-bold text-[#1E1E1E] dark:text-white">+ {formatCLP(quoteCalc.iva)}</span>
                  </div>
                </div>

                <div className="bg-[#FF6A00] text-white rounded-xl p-3.5 flex items-center justify-between shadow-md">
                  <div>
                    <div className="text-[10px] uppercase font-mono tracking-wider font-bold">
                      TOTAL PRESUPUESTADO (CON IVA)
                    </div>
                    <div className="text-[11px] text-white/90 font-mono">
                      Neto {formatCLP(quoteCalc.neto)} · {TIER_LABELS[quoteMargin]}
                    </div>
                  </div>
                  <div className="font-heading font-extrabold text-xl sm:text-2xl font-mono">
                    {formatCLP(quoteCalc.total)}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-gray-400 font-mono">
                  <span className="flex items-center gap-1 text-obra-green font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Asesor &quot;¿Cuánto cobrar?&quot; (3 niveles)
                  </span>
                  <span>Recálculo determinista</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Interactive Radar Ferretero */}
      <section id="radar-ferretero" className="scroll-mt-24 py-20 bg-[#FAF8F5] dark:bg-[#0F141C] border-b border-[#E5E7EB] dark:border-[#263040]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-12 landing-reveal">
            <span className="text-xs font-mono font-bold text-[#FF6A00] uppercase tracking-widest">
              PROVEEDORES INTEGRADOS EN OBRABOT
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold font-heading text-[#1E1E1E] dark:text-white mt-2">
              Radar Ferretero en Vivo
            </h2>
            <p className="text-[#475569] dark:text-gray-300 mt-3 text-base">
              Consulta catálogos públicos de las 5 cadenas líderes en Chile directamente desde el Cotizador Web o WhatsApp con ObraBot. Filtra la muestra por cadena o partida.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-4xl mx-auto mb-6 font-heading font-bold text-xs sm:text-sm landing-reveal landing-delay-1">
            {STORES.map((store) => {
              const selected = activeStore === store.name;
              return (
                <button
                  key={store.name}
                  type="button"
                  onClick={() => setActiveStore(store.name)}
                  className={`px-4 py-2.5 rounded-xl border-2 shadow-sm transition hover:-translate-y-0.5 flex items-center gap-2 ${
                    selected
                      ? 'border-[#141A23] dark:border-[#FF6A00] bg-[#141A23] dark:bg-[#FF6A00] text-white'
                      : 'border-[#E5E7EB] dark:border-[#263040] bg-white dark:bg-[#141A23] text-[#1E1E1E] dark:text-gray-200 hover:border-[#141A23] dark:hover:border-[#FF6A00]'
                  }`}
                >
                  {store.dotClass && <span className={`w-2.5 h-2.5 rounded-full ${store.dotClass}`} />}
                  {store.name === 'Todas' ? 'Todas (5)' : store.name}
                </button>
              );
            })}
          </div>

          <div className="bg-white dark:bg-[#141A23] rounded-2xl border-2 border-[#E5E7EB] dark:border-[#263040] overflow-hidden shadow-lg max-w-5xl mx-auto landing-reveal landing-delay-2">
            <div className="bg-[#141A23] text-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="font-mono text-xs font-bold flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#FF6A00] animate-pulse shrink-0" />
                <span>EJEMPLO DE COMPARATIVA DE MATERIALES (CLP CON IVA)</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex bg-white/10 rounded-lg p-0.5 text-[11px] font-mono">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className={`px-2.5 py-1 rounded-md transition ${
                        activeCategory === cat
                          ? 'bg-[#FF6A00] text-white font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 sm:flex-none">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={radarSearch}
                    onChange={(e) => setRadarSearch(e.target.value)}
                    placeholder="Buscar material..."
                    aria-label="Buscar material en el radar"
                    className="w-full sm:w-44 pl-8 pr-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-[#FF6A00]"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-[#FAF8F5] dark:bg-[#0B0E14] text-[#1E1E1E] dark:text-gray-200 font-mono border-b border-[#E5E7EB] dark:border-[#263040] uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Material / Insumo</th>
                    <th className="py-3 px-4">Partida</th>
                    <th className="py-3 px-4">Unidad</th>
                    <th className="py-3 px-4">Ref. Promedio</th>
                    <th className="py-3 px-4 text-obra-green font-bold">Mejor Oferta Referencial</th>
                    <th className="py-3 px-4 text-right">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] dark:divide-[#263040]">
                  {filteredRadar.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#64748B] dark:text-gray-400 font-mono">
                        No hay insumos en esta muestra para el filtro seleccionado. Prueba con &quot;Todas&quot;.
                      </td>
                    </tr>
                  ) : (
                    filteredRadar.map((item, idx) => {
                      const savingPct = (((item.avg - item.best) / item.avg) * 100).toFixed(1);
                      return (
                        <tr
                          key={item.name}
                          className={`landing-row-enter ${
                            idx % 2 === 1 ? 'bg-[#FAF8F5]/80 dark:bg-[#0F141C]' : 'bg-white dark:bg-[#141A23]'
                          } hover:bg-orange-50/50 dark:hover:bg-[#1C2432] transition`}
                          style={{ animationDelay: `${idx * 35}ms` }}
                        >
                          <td className="py-3 px-4 font-bold text-[#1E1E1E] dark:text-white">{item.name}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#0B0E14] text-[#475569] dark:text-gray-300 font-mono text-[10px]">
                              {item.cat}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[#64748B] dark:text-gray-400">{item.unit}</td>
                          <td className="py-3 px-4 font-mono text-[#475569] dark:text-gray-300">
                            {formatCLP(item.avg)}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-obra-green">
                            {formatCLP(item.best)}{' '}
                            <span className="text-[#1E1E1E] dark:text-white">({item.store})</span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-right text-emerald-700 dark:text-emerald-400">
                            - {savingPct}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-[#FAF8F5] dark:bg-[#0B0E14] border-t border-[#E5E7EB] dark:border-[#263040] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-[#475569] dark:text-gray-400">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#6B8F72]" />
                <span>
                  Mostrando {filteredRadar.length} de {RADAR_ITEMS.length} insumos referenciales
                </span>
              </div>
              <span className="text-[#1E1E1E] dark:text-gray-200 font-bold">
                En la app devuelve enlaces directos a cada tienda y fecha de consulta
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Interactive WhatsApp to Gantt Engine */}
      <section id="como-funciona" className="scroll-mt-24 py-20 bg-white dark:bg-[#0B0E14] border-b border-[#E5E7EB] dark:border-[#263040]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-10 landing-reveal">
            <span className="text-xs font-mono font-bold text-[#FF6A00] uppercase tracking-widest">
              WHATSAPP CLOUD API + OBRABOT
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold font-heading text-[#1E1E1E] dark:text-white mt-2">
              Cómo opera ObraTrack en la faena real
            </h2>
            <p className="text-[#475569] dark:text-gray-300 mt-3 text-base">
              Sin vincular QR ni dejar un computador encendido. Escribe o manda notas de voz al asistente ObraTrack desde tu WhatsApp habitual. Pulsa{' '}
              <strong className="text-[#1E1E1E] dark:text-white">Play</strong> para ver la sincronización en vivo.
            </p>
          </div>

          <div className="hidden lg:block max-w-4xl mx-auto mb-6 px-12 landing-reveal">
            <div className="h-1.5 w-full rounded-full bg-[#E5E7EB] dark:bg-[#263040] overflow-hidden">
              <div
                className={`h-full rounded-full bg-[#FF6A00] transition-all duration-700 ${
                  isSimulating ? 'landing-pipeline-active' : ''
                }`}
                style={{ width: `${pipelinePct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">
            {/* Step 1 */}
            <div
              onMouseMove={handleSpotlightMove}
              className="landing-spotlight bg-[#FAF8F5] dark:bg-[#141A23] border-2 border-[#E5E7EB] dark:border-[#263040] rounded-3xl p-6 landing-reveal"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E5E7EB] dark:border-[#263040]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                    WA
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#1E1E1E] dark:text-white">1. Jefe de Obra en Terreno</div>
                    <div className="text-[11px] text-[#64748B] dark:text-gray-400 font-mono">
                      Nota de voz + foto vía WhatsApp
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold">
                  META API
                </span>
              </div>

              <div className="p-3.5 bg-white dark:bg-[#0B0E14] rounded-2xl border border-[#E5E7EB] dark:border-[#263040] mb-3 shadow-sm">
                <div className="flex items-center gap-3 mb-2.5">
                  <button
                    type="button"
                    onClick={simulateWhatsAppFlow}
                    className="w-10 h-10 rounded-full bg-[#FF6A00] hover:bg-[#E05E00] flex items-center justify-center text-white shadow-md shadow-[#FF6A00]/30 transition hover:scale-105 shrink-0"
                    aria-label="Simular nota de voz de WhatsApp"
                  >
                    {isSimulating ? (
                      <Square className="w-3.5 h-3.5 fill-white" />
                    ) : (
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    )}
                  </button>
                  <div className="flex-1">
                    <div
                      className={`flex items-center gap-1 h-6 ${isSimulating ? 'landing-wave-playing' : ''}`}
                    >
                      <span className="w-1 h-3 bg-[#FF6A00] rounded-full" />
                      <span className="w-1 h-5 bg-[#FF6A00] rounded-full" />
                      <span className="w-1 h-2.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
                      <span className="w-1 h-6 bg-[#FF6A00] rounded-full" />
                      <span className="w-1 h-4 bg-[#FF6A00] rounded-full" />
                      <span className="w-1 h-5 bg-slate-300 dark:bg-slate-600 rounded-full" />
                      <span className="w-1 h-3 bg-slate-300 dark:bg-slate-600 rounded-full" />
                      <span className="w-1 h-5 bg-[#FF6A00] rounded-full" />
                      <span className="w-1 h-3.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
                      <span className="w-1 h-4 bg-slate-300 dark:bg-slate-600 rounded-full" />
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-[#64748B] dark:text-gray-400 font-bold">
                    {waTimer}
                  </span>
                </div>
                <p className="text-xs text-[#1E1E1E] dark:text-gray-200 italic font-mono bg-[#FAF8F5] dark:bg-[#141A23] p-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#263040] leading-relaxed">
                  &quot;Actualiza Pintura Esmalte al 50% en Ampliación PAC y registra un imprevisto de $18.500 en rodillos y cinta en Sodimac. Adjunto foto de avance para bitácora.&quot;
                </p>
                <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-[#64748B] dark:text-gray-400">
                  <span className="text-[#FF6A00] font-bold">{waHint}</span>
                  <span>+1 foto evidencia</span>
                </div>
              </div>

              <div className="text-xs text-[#475569] dark:text-gray-300 leading-relaxed mt-4">
                <strong className="text-[#1E1E1E] dark:text-white">Control real por roles:</strong> Jefes de obra y administradores gestionan avances, gastos, asistencia y avisos; el personal de{' '}
                <strong className="text-[#1E1E1E] dark:text-white">terreno</strong> reporta avances y fotos sin acceder a finanzas privadas.
              </div>
            </div>

            {/* Step 2 */}
            <div
              onMouseMove={handleSpotlightMove}
              className="landing-spotlight bg-white dark:bg-[#141A23] border-2 border-[#FF6A00] rounded-3xl p-6 shadow-xl relative landing-reveal landing-delay-1"
            >
              <div className="absolute -top-3.5 left-6 px-3 py-0.5 rounded-full bg-[#FF6A00] text-white font-mono font-bold text-[10px] uppercase tracking-wider shadow-sm">
                2. MOTOR OBRABOT IA CHILE
              </div>

              <div className="flex items-center justify-between text-xs font-mono text-[#64748B] dark:text-gray-400 uppercase mb-4 mt-2 font-bold">
                <span>VALIDACIÓN TRANSACCIONAL</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#FAF8F5] dark:bg-[#0B0E14] border border-[#E5E7EB] dark:border-[#263040] text-[#475569] dark:text-gray-200">
                  {botBadge}
                </span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div
                  className={`p-3 rounded-xl border transition-all duration-300 ${
                    botStep >= 1
                      ? 'ring-2 ring-[#FF6A00] bg-orange-50 dark:bg-orange-950/30 border-[#FF6A00]'
                      : 'bg-[#FAF8F5] dark:bg-[#0B0E14] border-[#E5E7EB] dark:border-[#263040]'
                  }`}
                >
                  <div className="text-[10px] text-[#FF6A00] font-bold uppercase">1. Mapeo a Partida Gantt</div>
                  <div className="text-[#1E1E1E] dark:text-white font-bold text-sm mt-0.5">Pintura Esmalte al Agua</div>
                  <div className="text-obra-green text-[11px] font-bold mt-1">Avance físico actualizado: 50%</div>
                </div>

                <div
                  className={`p-3 rounded-xl border transition-all duration-300 ${
                    botStep >= 2
                      ? 'ring-2 ring-[#FF6A00] bg-orange-50 dark:bg-orange-950/30 border-[#FF6A00]'
                      : 'bg-[#FAF8F5] dark:bg-[#0B0E14] border-[#E5E7EB] dark:border-[#263040]'
                  }`}
                >
                  <div className="text-[10px] text-[#1E1E1E] dark:text-gray-300 font-bold uppercase">
                    2. Registro de Imprevisto Instruido
                  </div>
                  <div className="text-[#1E1E1E] dark:text-white font-bold text-sm mt-0.5">
                    Rodillos y cinta (Sodimac)
                  </div>
                  <div className="text-[#FF6A00] text-[11px] font-bold mt-1">$ 18.500 CLP en control de costos</div>
                </div>

                <div
                  className={`p-3 rounded-xl border transition-all duration-300 ${
                    botStep >= 3
                      ? 'ring-2 ring-[#FF6A00] bg-orange-50 dark:bg-orange-950/30 border-[#FF6A00]'
                      : 'bg-[#FAF8F5] dark:bg-[#0B0E14] border-[#E5E7EB] dark:border-[#263040]'
                  }`}
                >
                  <div className="text-[10px] text-obra-green font-bold uppercase">3. Evidencia Privada en Bitácora</div>
                  <div className="text-[#1E1E1E] dark:text-white font-bold text-sm mt-0.5">
                    Foto guardada con acceso firmado
                  </div>
                  <div className="text-[#64748B] dark:text-gray-400 text-[11px] mt-1">
                    Aislada por empresa (RLS Supabase)
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div
              onMouseMove={handleSpotlightMove}
              className="landing-spotlight bg-[#FAF8F5] dark:bg-[#141A23] border-2 border-[#E5E7EB] dark:border-[#263040] rounded-3xl p-6 landing-reveal landing-delay-2"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E5E7EB] dark:border-[#263040]">
                <div>
                  <div className="text-xs font-bold text-[#1E1E1E] dark:text-white">3. Centro de Mando (Web / PWA)</div>
                  <div className="text-[11px] text-[#64748B] dark:text-gray-400 font-mono">Panel de administración</div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EBF2ED] dark:bg-[#1E2E23] text-obra-green font-bold">
                  AL DÍA
                </span>
              </div>

              <div className="p-3.5 bg-white dark:bg-[#0B0E14] rounded-2xl border border-[#E5E7EB] dark:border-[#263040] mb-3 shadow-sm">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-bold text-[#1E1E1E] dark:text-white">Avance Ponderado de Obra</span>
                  <span className="font-mono font-bold text-[#FF6A00]">{ganttPct}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-[#FF6A00] to-amber-500 h-full rounded-full transition-all duration-700"
                    style={{ width: `${ganttPct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[#64748B] dark:text-gray-400">
                  <span>Partida Pintura: 50%</span>
                  <span>Imprevisto: $18.500</span>
                </div>
              </div>

              <div
                className={`p-4 bg-[#EBF2ED] dark:bg-[#18261D] rounded-2xl border border-[#6B8F72]/40 transition-all duration-300 ${
                  edpHighlight ? 'ring-2 ring-[#6B8F72]' : ''
                }`}
              >
                <div className="text-[10px] font-mono font-bold text-obra-green uppercase mb-1">
                  EDP-003 SUGERIDO SEGÚN AVANCE
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-heading font-extrabold text-xl text-[#1E1E1E] dark:text-white">
                    $ 3.600.000 <span className="text-xs font-normal text-[#64748B] dark:text-gray-400 font-mono">CLP</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenModal('edp')}
                    className="px-3.5 py-2 rounded-xl bg-[#6B8F72] text-white font-mono font-bold text-xs hover:opacity-90 transition shadow-sm inline-flex items-center gap-1.5 hover:scale-105"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Ver PDF
                  </button>
                </div>
                <div className="text-[11px] text-obra-green font-mono mt-1.5 font-semibold">
                  ✓ Listo para descargar PDF o enviar por WhatsApp
                </div>
              </div>

              <div className="text-xs text-[#475569] dark:text-gray-300 leading-relaxed mt-4">
                <strong className="text-[#1E1E1E] dark:text-white">Seguridad financiera:</strong> Ninguna foto de boleta crea pagos ni altera el presupuesto por sí sola; todo queda trazado bajo permisos verificados.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: REAL Estados de Pago (EDP) + Custom Letterhead PDF */}
      <section id="estados-pago" className="scroll-mt-24 py-20 bg-[#FAF8F5] dark:bg-[#0F141C] border-b border-[#E5E7EB] dark:border-[#263040]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-5 landing-reveal">
              <span className="text-xs font-mono font-bold text-[#FF6A00] uppercase tracking-widest">
                COBRANZA FORMAL Y ORDENADA
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-[#1E1E1E] dark:text-white mt-2 leading-tight">
                Estados de Pago en PDF con el membrete de tu constructora
              </h2>
              <p className="text-[#475569] dark:text-gray-300 mt-4 text-sm sm:text-base leading-relaxed">
                ObraTrack calcula automáticamente el cobro sugerido según el avance real de tu Carta Gantt, descuenta pagos y retenciones previas, y suma los adicionales aprobados.
              </p>

              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center shrink-0 mt-0.5">
                    <BadgeCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-heading font-bold text-sm text-[#1E1E1E] dark:text-white">
                      Tu logo, RUT, giro y datos bancarios
                    </div>
                    <p className="text-xs text-[#475569] dark:text-gray-400 mt-0.5">
                      Configura tu empresa una vez y tanto tus cotizaciones como tus Estados de Pago salen listos con tu identidad corporativa.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#EBF2ED] dark:bg-[#18261D] text-obra-green flex items-center justify-center shrink-0 mt-0.5">
                    <Calculator className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-heading font-bold text-sm text-[#1E1E1E] dark:text-white">
                      Retenciones (0% a 20%) e IVA 19% exacto
                    </div>
                    <p className="text-xs text-[#475569] dark:text-gray-400 mt-0.5">
                      Correlativo automático (<code className="font-mono">EDP-001</code>, <code className="font-mono">EDP-002</code>…), saldo remanente del contrato y desglose Neto + IVA.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-200/80 dark:bg-[#1E2634] text-[#1E1E1E] dark:text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-heading font-bold text-sm text-[#1E1E1E] dark:text-white">
                      Descarga PDF, cartola Excel o envío por WhatsApp
                    </div>
                    <p className="text-xs text-[#475569] dark:text-gray-400 mt-0.5">
                      Envía el resumen del Estado de Pago directo al WhatsApp del mandante o descarga la cartola completa en Excel (.xlsx).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 landing-reveal landing-delay-1">
              <div className="bg-white dark:bg-[#141A23] rounded-3xl border-2 border-[#E5E7EB] dark:border-[#263040] shadow-xl overflow-hidden">
                <div className="bg-[#141A23] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-mono text-white">
                    <span className="w-2 h-2 rounded-full bg-[#6B8F72]" />
                    <span className="font-bold">CALCULADORA EDP-003</span>
                    <span className="text-slate-400 hidden sm:inline">· Mismo motor de la plataforma</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-300">Retención:</span>
                    <div className="inline-flex bg-white/10 rounded-lg p-0.5">
                      {([0, 5, 10] as const).map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setEdpRetention(pct)}
                          className={`px-2.5 py-1 rounded-md transition ${
                            edpRetention === pct
                              ? 'bg-[#FF6A00] text-white font-bold'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <div className="p-3.5 rounded-2xl bg-[#FAF8F5] dark:bg-[#0B0E14] border border-[#E5E7EB] dark:border-[#263040] flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#141A23] dark:bg-[#FF6A00] text-white font-heading font-extrabold text-sm flex items-center justify-center">
                        TC
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#1E1E1E] dark:text-white">
                          Tu Constructora SpA{' '}
                          <span className="text-[10px] font-mono text-obra-green ml-1">MEMBRETE PROPIO</span>
                        </div>
                        <div className="text-[11px] font-mono text-[#64748B] dark:text-gray-400">
                          RUT 77.123.456-8 · Obras Civiles y Remodelaciones
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] font-bold px-2.5 py-1 rounded-lg bg-[#EBF2ED] dark:bg-[#18261D] text-obra-green">
                      FOLIO EDP-003
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                    <div className="p-3.5 rounded-2xl bg-[#FAF8F5] dark:bg-[#0B0E14] border border-[#E5E7EB] dark:border-[#263040]">
                      <div className="text-[10px] font-mono text-[#64748B] dark:text-gray-400 uppercase">
                        Avance Ponderado
                      </div>
                      <div className="font-heading font-extrabold text-2xl text-[#1E1E1E] dark:text-white mt-1">
                        75%
                      </div>
                      <div className="text-[11px] font-mono text-obra-green font-bold">
                        Contrato: {formatCLP(EDP_CONTRATO)}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#FAF8F5] dark:bg-[#0B0E14] border border-[#E5E7EB] dark:border-[#263040]">
                      <div className="text-[10px] font-mono text-[#64748B] dark:text-gray-400 uppercase">
                        Bruto del Período
                      </div>
                      <div className="font-heading font-extrabold text-2xl text-[#1E1E1E] dark:text-white mt-1">
                        {formatCLP(EDP_BRUTO_PERIODO)}
                      </div>
                      <div className="text-[11px] font-mono text-[#FF6A00] font-bold">
                        {edpRetention > 0
                          ? `Retención ${edpRetention}%: -${formatCLP(edpCalc.retMonto)}`
                          : 'Sin retención aplicada'}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#EBF2ED] dark:bg-[#18261D] border border-[#6B8F72]/40">
                      <div className="text-[10px] font-mono text-obra-green uppercase font-bold">
                        Líquido a Pagar
                      </div>
                      <div className="font-heading font-extrabold text-2xl text-[#1E1E1E] dark:text-white mt-1">
                        {formatCLP(edpCalc.liquido)}
                      </div>
                      <div className="text-[11px] font-mono text-obra-green font-bold">
                        Neto {formatCLP(edpCalc.neto)} + IVA {formatCLP(edpCalc.iva)}
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#FAF8F5] dark:bg-[#0B0E14] border border-[#E5E7EB] dark:border-[#263040] flex flex-wrap items-center justify-between gap-2 text-xs font-mono mb-5">
                    <span className="text-[#475569] dark:text-gray-400">
                      Pagos anteriores:{' '}
                      <strong className="text-[#1E1E1E] dark:text-white">{formatCLP(EDP_PAGADO_ANT)}</strong>
                    </span>
                    <span className="text-[#475569] dark:text-gray-400">
                      Saldo remanente tras EDP:{' '}
                      <strong className="text-[#FF6A00]">{formatCLP(edpCalc.remanente)}</strong>
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenModal('edp')}
                      className="flex-1 px-4 py-3 rounded-xl bg-[#141A23] dark:bg-[#0B0E14] border border-transparent dark:border-[#263040] text-white font-heading font-bold text-xs hover:bg-[#1E2837] transition inline-flex items-center justify-center gap-2 shadow-sm"
                    >
                      <FileDown className="w-4 h-4 text-[#FF6A00]" />
                      Previsualizar Documento EDP-003
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenModal('whatsapp')}
                      className="flex-1 px-4 py-3 rounded-xl bg-[#6B8F72] text-white font-heading font-bold text-xs hover:opacity-90 transition inline-flex items-center justify-center gap-2 shadow-sm"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Ver Resumen WhatsApp al Cliente
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Real Platform Modules Bento Grid */}
      <section id="modulos" className="scroll-mt-24 py-20 bg-white dark:bg-[#0B0E14] border-b border-[#E5E7EB] dark:border-[#263040]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-14 landing-reveal">
            <span className="text-xs font-mono font-bold text-[#FF6A00] uppercase tracking-widest">
              ECOSISTEMA REAL EN PRODUCCIÓN
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold font-heading text-[#1E1E1E] dark:text-white mt-2">
              Mucho más que presupuestos: toda tu obra en un solo lugar
            </h2>
            <p className="text-[#475569] dark:text-gray-300 mt-3 text-base">
              Cada módulo está construido y funcionando hoy en ObraTrack para ordenar tus proyectos de principio a fin.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: ClipboardCheck,
                iconBg: 'bg-[#FF6A00]/10 text-[#FF6A00]',
                title: 'Asistencia y Cálculo de Jornales',
                desc: 'Control exclusivo de administración y jefes de obra para registrar presencia, atrasos y calcular jornales automáticamente sin planillas sueltas.',
              },
              {
                icon: FileCheck2,
                iconBg: 'bg-[#EBF2ED] dark:bg-[#18261D] text-obra-green',
                title: 'Cierres de Jornada en PDF',
                desc: 'Consolida avances, incidencias y resumen del día en un PDF limpio que también puedes recibir en forma privada por WhatsApp.',
              },
              {
                icon: MapPinned,
                iconBg: 'bg-[#141A23] text-[#FF6A00]',
                title: 'Georreferenciación Google Maps',
                desc: 'Ubica cada proyecto con dirección y comuna de Chile directamente en Google Maps para compartir rutas rápidas a tu equipo. Incluido desde el Plan Gratis.',
              },
              {
                icon: BellRing,
                iconBg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
                title: 'Avisos a Cuadrillas con Trazabilidad',
                desc: 'Pídele a ObraBot que envíe instrucciones individuales por WhatsApp a tu equipo y revisa su estado real: pendiente, enviado, entregado o leído.',
              },
              {
                icon: GitPullRequest,
                iconBg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
                title: 'Adicionales y Solicitudes de Cambio',
                desc: 'Separa incidentes internos de adicionales del cliente. El contrato y plazo solo cambian cuando registras la aprobación explícita del mandante.',
              },
              {
                icon: Smartphone,
                iconBg: 'bg-slate-200 dark:bg-[#1E2634] text-[#1E1E1E] dark:text-white',
                title: 'PWA Móvil, Push y Respaldo Total',
                desc: 'Instálala en tu celular con modo claro/oscuro, notificaciones Push, caché local si se corta internet y exportación completa a Excel (.xlsx) y JSON (Ley 21.719).',
              },
            ].map((mod, idx) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.title}
                  onMouseMove={handleSpotlightMove}
                  className={`landing-spotlight bg-[#FAF8F5] dark:bg-[#141A23] border-2 border-[#E5E7EB] dark:border-[#263040] hover:border-[#FF6A00]/60 rounded-3xl p-6 landing-reveal ${
                    idx % 3 === 1 ? 'landing-delay-1' : idx % 3 === 2 ? 'landing-delay-2' : ''
                  }`}
                >
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-4 ${mod.iconBg}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-heading font-bold text-lg text-[#1E1E1E] dark:text-white">{mod.title}</h3>
                  <p className="text-xs sm:text-sm text-[#475569] dark:text-gray-300 mt-2 leading-relaxed">
                    {mod.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 6: Market Comparison */}
      <section className="py-20 bg-[#FAF8F5] dark:bg-[#0F141C] border-b border-[#E5E7EB] dark:border-[#263040]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mb-12 landing-reveal">
            <span className="text-xs font-mono font-bold text-[#FF6A00] uppercase tracking-widest">
              COMPARATIVA DE MERCADO
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold font-heading text-[#1E1E1E] dark:text-white mt-2">
              ¿Por qué ObraTrack y no un ERP costoso o planillas sueltas?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              onMouseMove={handleSpotlightMove}
              className="landing-spotlight bg-white dark:bg-[#141A23] border-2 border-red-200 dark:border-red-900/50 rounded-3xl p-6 shadow-sm flex flex-col landing-reveal"
            >
              <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
                <X className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold font-heading text-[#1E1E1E] dark:text-white mb-2">
                Excel y Cuaderno de Faena
              </h3>
              <p className="text-[#475569] dark:text-gray-300 text-xs leading-relaxed mb-4">
                Boletas perdidas, versiones desactualizadas de presupuestos y extras que nunca llegan al estado de pago.
              </p>
              <ul className="space-y-2.5 text-red-700 dark:text-red-400 border-t border-[#E5E7EB] dark:border-[#263040] pt-4 text-xs font-medium mt-auto">
                <li className="flex items-start gap-2"><XCircle className="w-4 h-4 shrink-0 mt-0.5" /> Sin consulta en vivo a ferreterías chilenas</li>
                <li className="flex items-start gap-2"><XCircle className="w-4 h-4 shrink-0 mt-0.5" /> Fuga de margen en imprevistos y adicionales</li>
                <li className="flex items-start gap-2"><XCircle className="w-4 h-4 shrink-0 mt-0.5" /> Horas semanales pasando datos a mano</li>
                <li className="flex items-start gap-2"><XCircle className="w-4 h-4 shrink-0 mt-0.5" /> Estados de pago armados desde cero cada mes</li>
              </ul>
            </div>

            <div
              onMouseMove={handleSpotlightMove}
              className="landing-spotlight bg-white dark:bg-[#141A23] border-2 border-amber-200 dark:border-amber-900/50 rounded-3xl p-6 shadow-sm flex flex-col landing-reveal landing-delay-1"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center mb-4">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold font-heading text-[#1E1E1E] dark:text-white mb-2">
                ERPs Tradicionales de Constructora
              </h3>
              <p className="text-[#475569] dark:text-gray-300 text-xs leading-relaxed mb-4">
                Diseñados para mega empresas con oficinas técnicas dedicadas exclusivamente a operar el software.
              </p>
              <ul className="space-y-2.5 text-amber-800 dark:text-amber-300 border-t border-[#E5E7EB] dark:border-[#263040] pt-4 text-xs font-medium mt-auto">
                <li className="flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> Valores altos en UF y contratos amarrados</li>
                <li className="flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> Semanas de implementación y capacitación</li>
                <li className="flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> Difíciles de usar desde el celular en faena</li>
                <li className="flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> Demasiado complejos para contratistas PyME</li>
              </ul>
            </div>

            <div
              onMouseMove={handleSpotlightMove}
              className="landing-spotlight bg-white dark:bg-[#141A23] border-2 border-[#FF6A00] rounded-3xl p-6 shadow-xl shadow-[#FF6A00]/10 flex flex-col relative landing-reveal landing-delay-2"
            >
              <div className="w-9 h-9 rounded-xl bg-[#FF6A00] text-white flex items-center justify-center mb-4">
                <Check className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold font-heading text-[#1E1E1E] dark:text-white mb-2">
                ObraTrack SaaS Chile
              </h3>
              <p className="text-[#475569] dark:text-gray-300 text-xs leading-relaxed mb-4">
                La velocidad de WhatsApp unida a un motor financiero determinista hecho para la realidad de Chile.
              </p>
              <ul className="space-y-2.5 text-obra-green border-t border-[#E5E7EB] dark:border-[#263040] pt-4 text-xs font-semibold mt-auto">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> Desde $12.990 CLP/mes (IVA incl.) con Flow</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> Plan Gratis para partir hoy en 1 obra real</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> Radar con 5 ferreterías chilenas en vivo</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> PDF con tu membrete + Excel + Respaldo JSON</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: Interactive ROI Estimator */}
      <section id="calculadora-roi" className="scroll-mt-24 py-20 bg-white dark:bg-[#0B0E14] border-b border-[#E5E7EB] dark:border-[#263040]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 landing-reveal">
            <span className="text-xs font-mono font-bold text-[#FF6A00] uppercase tracking-widest">
              ESTIMADOR DE IMPACTO
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-[#1E1E1E] dark:text-white mt-2">
              ¿Cuánto margen puedes proteger en tus obras?
            </h2>
            <p className="text-[#475569] dark:text-gray-300 mt-2 text-sm">
              Ajusta tus obras activas y duración promedio para proyectar el margen recuperable al respaldar adicionales e imprevistos a tiempo.
            </p>
          </div>

          <div className="bg-[#FAF8F5] dark:bg-[#141A23] border-2 border-[#E5E7EB] dark:border-[#263040] rounded-3xl p-6 sm:p-8 shadow-xl landing-reveal landing-delay-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6 font-mono text-xs">
                <div>
                  <div className="flex justify-between text-[#1E1E1E] dark:text-white font-bold mb-2">
                    <span>Obras activas simultáneas:</span>
                    <span className="text-[#FF6A00] text-sm">
                      {roiObras} obra{roiObras > 1 ? 's' : ''}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={roiObras}
                    onChange={(e) => setRoiObras(Number(e.target.value))}
                    aria-label="Obras activas simultáneas"
                    className="landing-range w-full cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[#1E1E1E] dark:text-white font-bold mb-2">
                    <span>Presupuesto promedio por obra:</span>
                    <span className="text-[#FF6A00] text-sm">{formatCLP(roiMonto)} CLP</span>
                  </div>
                  <input
                    type="range"
                    min={3000000}
                    max={60000000}
                    step={1000000}
                    value={roiMonto}
                    onChange={(e) => setRoiMonto(Number(e.target.value))}
                    aria-label="Presupuesto promedio por obra"
                    className="landing-range w-full cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[#1E1E1E] dark:text-white font-bold mb-2">
                    <span>Duración promedio por obra:</span>
                    <span className="text-[#FF6A00] text-sm">
                      {roiMeses} mes{roiMeses > 1 ? 'es' : ''}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={roiMeses}
                    onChange={(e) => setRoiMeses(Number(e.target.value))}
                    aria-label="Duración promedio por obra en meses"
                    className="landing-range w-full cursor-pointer"
                  />
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-[#0B0E14] border border-[#E5E7EB] dark:border-[#263040] text-xs text-[#475569] dark:text-gray-300 space-y-1.5 font-sans">
                  <div className="font-bold text-[#1E1E1E] dark:text-white">Supuesto referencial de simulación:</div>
                  <div>• Proyección sobre un <strong>7,8%</strong> promedio de adicionales e imprevistos sin trazabilidad.</div>
                  <div>• Estimación de <strong>6 horas/mes por obra</strong> ahorradas en cubicaciones y estados de pago.</div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#0B0E14] border-2 border-[#FF6A00] rounded-2xl p-6 text-center shadow-lg">
                <span className="text-xs font-mono text-[#FF6A00] font-bold uppercase tracking-wider">
                  PROYECCIÓN DE MARGEN PROTEGIDO
                </span>
                <div className="text-3xl sm:text-5xl font-extrabold font-heading text-[#1E1E1E] dark:text-white mt-3">
                  {formatCLP(roiCalc.monthlyRecup)}{' '}
                  <span className="text-sm font-normal text-[#64748B] dark:text-gray-400 font-mono">CLP/mes</span>
                </div>
                <div className="text-xs text-obra-green font-mono font-bold mt-2">
                  {formatCLP(roiCalc.cycleRecup)} CLP en el ciclo de tus {roiObras} obra{roiObras > 1 ? 's' : ''}
                </div>

                <div className="grid grid-cols-2 gap-3 mt-5 text-left">
                  <div className="p-3 rounded-xl bg-[#FAF8F5] dark:bg-[#141A23] border border-[#E5E7EB] dark:border-[#263040]">
                    <div className="text-[10px] font-mono text-[#64748B] dark:text-gray-400 uppercase">
                      Oficina ahorrada
                    </div>
                    <div className="font-heading font-extrabold text-lg text-[#1E1E1E] dark:text-white mt-0.5">
                      {roiCalc.hoursSaved} hrs/mes
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF8F5] dark:bg-[#141A23] border border-[#E5E7EB] dark:border-[#263040]">
                    <div className="text-[10px] font-mono text-[#64748B] dark:text-gray-400 uppercase">
                      Relación vs Pro IA
                    </div>
                    <div className="font-heading font-extrabold text-lg text-obra-green mt-0.5">
                      {roiCalc.roiMult}x valor plan
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-5 border-t border-[#E5E7EB] dark:border-[#263040]">
                  <div className="text-xs text-[#475569] dark:text-gray-300">
                    Plan Pro IA cuesta <strong className="text-[#1E1E1E] dark:text-white">$24.990 CLP/mes</strong> (IVA incluido).
                  </div>
                  <Link
                    href="/login"
                    className="landing-shimmer mt-4 inline-flex items-center justify-center w-full py-3.5 rounded-xl bg-[#FF6A00] text-white font-heading font-bold text-sm hover:bg-[#E05E00] transition shadow-md shadow-[#FF6A00]/25"
                  >
                    Probar Gratis en Mi Primera Obra →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 8: Official Pricing Plans (Driven directly from lib/plans.ts) */}
      <section id="precios" className="scroll-mt-24 py-24 bg-[#FAF8F5] dark:bg-[#0F141C] border-b border-[#E5E7EB] dark:border-[#263040]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-12 landing-reveal">
            <span className="text-xs font-mono font-bold text-[#FF6A00] uppercase tracking-widest">
              TARIFAS OFICIALES EN CHILE
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold font-heading text-[#1E1E1E] dark:text-white mt-2">
              Planes claros en pesos chilenos (IVA incluido)
            </h2>
            <p className="text-[#475569] dark:text-gray-300 mt-3 text-base">
              Paga fácil con{' '}
              <strong className="text-[#1E1E1E] dark:text-white">
                Webpay, tarjetas de crédito, débito, CuentaRUT o transferencia
              </strong>{' '}
              vía Flow.cl. Ahorra 15% con suscripción anual.
            </p>

            <div className="mt-8 inline-flex items-center gap-2 p-1.5 bg-white dark:bg-[#141A23] rounded-full border-2 border-[#E5E7EB] dark:border-[#263040] shadow-sm">
              <button
                type="button"
                onClick={() => setBillingCycle('mensual')}
                className={`px-5 py-2 rounded-full font-heading font-bold text-xs transition inline-flex items-center ${
                  billingCycle === 'mensual'
                    ? 'bg-[#141A23] dark:bg-[#FF6A00] text-white'
                    : 'text-[#1E1E1E] dark:text-gray-300 hover:text-[#FF6A00]'
                }`}
              >
                Facturación Mensual
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('anual')}
                className={`px-5 py-2 rounded-full font-heading font-bold text-xs transition inline-flex items-center gap-1.5 ${
                  billingCycle === 'anual'
                    ? 'bg-[#141A23] dark:bg-[#FF6A00] text-white'
                    : 'text-[#1E1E1E] dark:text-gray-300 hover:text-[#FF6A00]'
                }`}
              >
                <span>Pago Anual</span>
                <span
                  className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                    billingCycle === 'anual'
                      ? 'bg-[#FF6A00] dark:bg-white text-white dark:text-[#141A23]'
                      : 'bg-[#FF6A00]/15 text-[#FF6A00]'
                  }`}
                >
                  -15% OFF
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-7 items-stretch">
            {PLANES_SUSCRIPCION.map((plan, idx) => {
              const pricing = isPaidPlanId(plan.id) ? getPlanPricing(plan.id, billingCycle) : null;
              const monthlyPrice = pricing ? pricing.precioEfectivoMensualCLP : 0;
              const isPro = plan.id === 'pro';
              const isProIa = plan.id === 'pro_ia';

              return (
                <article
                  key={plan.id}
                  onMouseMove={handleSpotlightMove}
                  className={`landing-spotlight bg-white dark:bg-[#141A23] rounded-3xl p-7 flex flex-col justify-between relative landing-reveal ${
                    idx === 1 ? 'landing-delay-1' : idx === 2 ? 'landing-delay-2' : ''
                  } ${
                    isPro
                      ? 'border-2 border-[#FF6A00] shadow-xl shadow-[#FF6A00]/15'
                      : isProIa
                      ? 'border-2 border-[#6B8F72] shadow-lg'
                      : 'border-2 border-[#E5E7EB] dark:border-[#263040] shadow-sm'
                  }`}
                >
                  {(isPro || isProIa) && (
                    <div
                      className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full text-white font-mono font-bold text-[10px] tracking-wider uppercase whitespace-nowrap shadow-md ${
                        isPro ? 'bg-[#FF6A00]' : 'bg-[#6B8F72]'
                      }`}
                    >
                      {plan.badge}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-2xl font-bold font-heading text-[#1E1E1E] dark:text-white">
                        {plan.nombre}
                      </h3>
                      <span
                        className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                          isPro
                            ? 'bg-[#FF6A00]/10 text-[#FF6A00]'
                            : isProIa
                            ? 'bg-[#EBF2ED] dark:bg-[#18261D] text-obra-green'
                            : 'bg-[#FAF8F5] dark:bg-[#0B0E14] border border-[#E5E7EB] dark:border-[#263040] text-[#64748B] dark:text-gray-400'
                        }`}
                      >
                        {plan.id === 'gratis' ? plan.badge : isPro ? 'Contratista' : 'Multi-Cuadrilla'}
                      </span>
                    </div>

                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className="text-4xl font-extrabold font-heading text-[#1E1E1E] dark:text-white">
                        {formatCLP(monthlyPrice)}
                      </span>
                      <span className="text-xs font-mono text-[#64748B] dark:text-gray-400">
                        {plan.id === 'gratis' ? 'CLP / mes para siempre' : 'CLP / mes'}
                      </span>
                    </div>

                    <div className="h-5 mt-1 text-[11px] font-mono text-obra-green font-bold">
                      {pricing && billingCycle === 'anual'
                        ? `Pago anual único ${formatCLP(pricing.montoCobroCLP)} · Ahorras ${formatCLP(pricing.ahorroAnualCLP)}`
                        : ''}
                    </div>

                    <p className="text-xs text-[#475569] dark:text-gray-300 mt-2 leading-relaxed">
                      {plan.descripcion}
                    </p>

                    <ul className="mt-6 space-y-2.5 text-xs text-[#1E1E1E] dark:text-gray-200 border-t border-[#E5E7EB] dark:border-[#263040] pt-6">
                      {plan.caracteristicas.map((feat) => (
                        <li key={feat} className="flex items-start gap-2">
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              isPro ? 'text-[#FF6A00]' : 'text-[#6B8F72]'
                            }`}
                          />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href={plan.id === 'gratis' ? '/login' : '/login?redirect=/planes'}
                    className={`mt-8 block text-center py-3.5 rounded-xl font-heading font-bold text-sm transition ${
                      isPro
                        ? 'landing-shimmer bg-[#FF6A00] text-white hover:bg-[#E05E00] shadow-md shadow-[#FF6A00]/25'
                        : isProIa
                        ? 'bg-[#141A23] dark:bg-[#6B8F72] text-white hover:opacity-90 shadow-md'
                        : 'bg-[#FAF8F5] dark:bg-[#0B0E14] border-2 border-[#E5E7EB] dark:border-[#263040] text-[#1E1E1E] dark:text-white hover:border-[#1E1E1E] dark:hover:border-white'
                    }`}
                  >
                    {plan.id === 'gratis' ? 'Comenzar Gratis' : `Contratar ${plan.nombre}`}
                  </Link>
                </article>
              );
            })}
          </div>

          <div className="mt-8 p-6 rounded-2xl bg-white dark:bg-[#141A23] border-2 border-[#E5E7EB] dark:border-[#263040] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm landing-reveal">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#141A23] text-[#FF6A00] flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="font-heading font-bold text-base text-[#1E1E1E] dark:text-white">
                  ¿Necesitas un convenio a medida o implementación multi-empresa?
                </div>
                <p className="text-xs text-[#475569] dark:text-gray-300 mt-0.5">
                  Conversemos por WhatsApp para configurar cuentas corporativas con condiciones especiales para tu constructora.
                </p>
              </div>
            </div>
            <a
              href="https://wa.me/56948743041?text=Hola,%20quiero%20consultar%20por%20un%20plan%20corporativo%20a%20medida%20en%20ObraTrack"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#0B0E14] border-2 border-[#1E1E1E] dark:border-gray-300 text-[#1E1E1E] dark:text-white font-heading font-bold text-xs hover:bg-[#1E1E1E] hover:text-white dark:hover:bg-white dark:hover:text-[#141A23] transition whitespace-nowrap text-center"
            >
              Cotizar Convenio →
            </a>
          </div>

          <div className="mt-6 p-5 rounded-2xl bg-white dark:bg-[#141A23] border border-[#E5E7EB] dark:border-[#263040] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-[#475569] dark:text-gray-300 landing-reveal">
            <div className="flex items-center gap-2 text-[#1E1E1E] dark:text-white font-semibold">
              <CreditCard className="w-4 h-4 text-[#FF6A00] shrink-0" />
              <span>Pagos procesados vía Flow.cl: Webpay · Crédito · Débito · CuentaRUT · Transferencia.</span>
            </div>
            <div className="flex items-center gap-1.5 text-obra-green font-bold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Cumplimiento Leyes 21.719 y 21.663 · Respaldo JSON portátil</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 9: FAQ */}
      <section className="py-20 bg-white dark:bg-[#0B0E14] border-b border-[#E5E7EB] dark:border-[#263040]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 landing-reveal">
            <span className="text-xs font-mono font-bold text-[#FF6A00] uppercase tracking-widest">
              RESOLVEMOS TUS DUDAS
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-[#1E1E1E] dark:text-white mt-2">
              Preguntas frecuentes sobre ObraTrack
            </h2>
          </div>

          <div className="space-y-3.5 text-sm landing-reveal landing-delay-1">
            {[
              {
                q: '¿Mis trabajadores de terreno tienen que descargar una app o ver las finanzas?',
                a: 'No. El personal de terreno opera únicamente por WhatsApp sobre sus obras asignadas: reporta avances, sube fotos a la bitácora y registra solicitudes de cambio, sin acceso a la web ni a presupuestos o finanzas privadas. Solo administradores y jefes de obra gestionan la operación completa.',
                defaultOpen: true,
              },
              {
                q: '¿Cómo garantizan que la Inteligencia Artificial no cometa errores de suma o de IVA?',
                a: 'ObraTrack separa estrictamente la comprensión del mensaje del cálculo financiero determinista. La IA interpreta tu audio o texto y estructura los ítems, pero todas las sumas, márgenes, retenciones e IVA (19%) los calcula el motor matemático de la plataforma en CLP sin decimales.',
              },
              {
                q: '¿Qué pasa si se corta la señal en terreno mientras uso la app?',
                a: 'La plataforma mantiene los últimos datos guardados localmente en tu dispositivo y avisa si pierdes conexión, reintentando automáticamente la sincronización transaccional con la nube apenas vuelve la señal (con detección de conflictos si trabajas desde varios equipos).',
              },
              {
                q: '¿Qué medios de pago aceptan y qué documentos puedo exportar?',
                a: 'Aceptamos Webpay, tarjetas de crédito, débito nacional, CuentaRUT y transferencia bancaria mediante Flow.cl (sin contratos amarrados). Desde la plataforma puedes descargar cotizaciones, Estados de Pago y Cierres de Jornada en PDF con tu membrete, cartolas financieras en Excel (.xlsx) y tu respaldo completo en JSON (portabilidad Ley 21.719).',
              },
            ].map((faq) => (
              <details
                key={faq.q}
                open={faq.defaultOpen}
                className="group bg-[#FAF8F5] dark:bg-[#141A23] rounded-2xl p-5 border border-[#E5E7EB] dark:border-[#263040] hover:border-[#FF6A00]/50 transition [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex items-center justify-between gap-4 cursor-pointer font-bold font-heading text-[#1E1E1E] dark:text-white text-base">
                  <span>{faq.q}</span>
                  <ChevronDown className="w-5 h-5 text-[#FF6A00] shrink-0 group-open:rotate-180 transition-transform duration-200" />
                </summary>
                <p className="mt-3 text-[#475569] dark:text-gray-300 leading-relaxed text-xs sm:text-sm">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer (Official Dark Logo Variant) */}
      <footer className="bg-[#0B0E14] text-white pt-16 pb-12 border-t-4 border-[#FF6A00]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="bg-gradient-to-r from-[#141A23] via-[#1C2432] to-[#141A23] border-2 border-[#FF6A00]/50 rounded-3xl p-8 sm:p-12 text-center max-w-4xl mx-auto shadow-2xl mb-16 landing-reveal">
            <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-white">
              Empieza a ordenar tu faena hoy mismo sin costo
            </h2>
            <p className="text-slate-300 mt-3 text-base max-w-xl mx-auto">
              Crea tu cuenta gratis en 1 minuto, prueba la Carta Gantt y Google Maps en tu primera obra y escala cuando necesites ObraBot o WhatsApp IA.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className="landing-shimmer w-full sm:w-auto px-8 py-4 rounded-xl bg-[#FF6A00] text-white font-heading font-extrabold text-base hover:bg-[#E05E00] transition shadow-lg shadow-[#FF6A00]/30"
              >
                Crear Cuenta Gratis (Plan 1 Obra)
              </Link>
              <a
                href="https://wa.me/56948743041?text=Hola,%20quiero%20ver%20una%20demo%20de%20ObraTrack"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-4 rounded-xl bg-white/10 border border-white/20 text-white font-mono text-xs hover:bg-white/20 transition flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4 text-[#9AC2A2]" />
                <span>Hablar por WhatsApp</span>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-12 border-b border-slate-800 text-xs">
            <div className="md:col-span-2">
              <a href="#" className="inline-flex items-center gap-2.5 mb-3 group">
                <ObraTrackIcon
                  theme="dark"
                  className="w-10 h-10 shrink-0 transition-transform duration-300 group-hover:scale-105"
                />
                <span className="font-heading font-extrabold text-2xl tracking-tight leading-none">
                  <span className="text-[#FF6A00]">Obra</span>
                  <span className="text-white">Track</span>
                </span>
              </a>
              <p className="text-slate-400 max-w-sm leading-relaxed">
                El copiloto digital del constructor. Cotizador IA determinista, comparador de 5 ferreterías chilenas, Carta Gantt, WhatsApp con ObraBot y Estados de Pago en PDF.
              </p>
              <div className="mt-4 font-mono text-[#9AC2A2] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Cumplimiento Leyes 21.719 (Datos) y 21.663 (Ciberseguridad)
              </div>
            </div>

            <div>
              <div className="text-xs font-mono font-bold text-[#FF6A00] uppercase mb-3">Módulos</div>
              <ul className="space-y-2.5 text-slate-300">
                <li><a href="#radar-ferretero" className="hover:text-white transition">Radar Ferretero</a></li>
                <li><a href="#como-funciona" className="hover:text-white transition">WhatsApp IA y Gantt</a></li>
                <li><a href="#estados-pago" className="hover:text-white transition">Estados de Pago PDF</a></li>
                <li><a href="#modulos" className="hover:text-white transition">Asistencia y Cierres</a></li>
                <li><Link href="/precios" className="hover:text-white transition">Planes CLP (Flow)</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-mono font-bold text-[#FF6A00] uppercase mb-3">Contacto y Soporte</div>
              <ul className="space-y-2.5 font-mono text-slate-300">
                <li>
                  <a
                    href="https://wa.me/56948743041?text=Hola,%20quisiera%20m%C3%A1s%20informaci%C3%B3n%20sobre%20ObraTrack"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#FF6A00] transition inline-flex items-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-[#9AC2A2]" /> +56 9 4874 3041
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:soporte@obratrack.cl"
                    className="hover:text-[#FF6A00] transition inline-flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#FF6A00]" /> soporte@obratrack.cl
                  </a>
                </li>
                <li className="text-slate-400 inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Santiago, Chile
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-slate-400">
            <div>© {new Date().getFullYear()} ObraTrack SaaS Chile. Todos los derechos reservados.</div>
            <div>Diseñado con orgullo para el constructor y contratista chileno.</div>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Quick Contact Button */}
      <a
        href="https://wa.me/56948743041?text=Hola,%20vengo%20desde%20la%20web%20de%20ObraTrack%20y%20tengo%20una%20consulta"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-5 right-5 z-40 group flex items-center gap-2.5 bg-[#141A23] hover:bg-[#0B0E14] text-white pl-4 pr-3 py-2.5 rounded-full shadow-2xl border border-white/15 transition-all hover:scale-105"
        aria-label="Contactar por WhatsApp"
      >
        <span className="text-xs font-heading font-bold hidden sm:inline">¿Dudas? WhatsApp</span>
        <span className="landing-fab-pulse relative w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-inner">
          <MessageCircle className="w-5 h-5" />
        </span>
      </a>

      {/* Interactive Estado de Pago PDF Preview Modal */}
      {openModal === 'edp' && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenModal(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
        >
          <div className="landing-modal-pop bg-white dark:bg-[#141A23] rounded-3xl border-2 border-[#E5E7EB] dark:border-[#263040] max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="bg-[#141A23] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ObraTrackIcon theme="dark" className="w-7 h-7" />
                <div>
                  <div id="payment-modal-title" className="font-heading font-bold text-sm">
                    Vista Previa · Estado de Pago EDP-003
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">
                    Formato PDF oficial generado por ObraTrack
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition"
                aria-label="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-[#FAF8F5] dark:bg-[#0B0E14] border border-[#E5E7EB] dark:border-[#263040] grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] font-mono text-[#64748B] dark:text-gray-400 uppercase">
                    Emisor (Tu Empresa)
                  </div>
                  <div className="font-bold text-[#1E1E1E] dark:text-white">Tu Constructora SpA</div>
                  <div className="font-mono text-[10px] text-[#64748B] dark:text-gray-400">RUT 77.123.456-8</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-[#64748B] dark:text-gray-400 uppercase">
                    Mandante / Obra
                  </div>
                  <div className="font-bold text-[#1E1E1E] dark:text-white">Ampliación PAC 250 m²</div>
                  <div className="font-mono text-[10px] text-obra-green font-bold">Avance Ponderado: 75%</div>
                </div>
              </div>

              <div className="border border-[#E5E7EB] dark:border-[#263040] rounded-xl overflow-hidden font-mono">
                <div className="flex justify-between px-3.5 py-2 bg-[#FAF8F5] dark:bg-[#0B0E14] border-b border-[#E5E7EB] dark:border-[#263040] font-bold text-[#1E1E1E] dark:text-white">
                  <span>Resumen financiero EDP-003</span>
                  <span>Monto CLP</span>
                </div>
                <div className="divide-y divide-[#E5E7EB] dark:divide-[#263040] px-3.5">
                  <div className="flex justify-between py-2">
                    <span>Contrato vigente (IVA incl.)</span>
                    <span className="font-bold">{formatCLP(EDP_CONTRATO)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span>Pagos anteriores acreditados</span>
                    <span>{formatCLP(EDP_PAGADO_ANT)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span>Cobro bruto del período</span>
                    <span className="font-bold">{formatCLP(EDP_BRUTO_PERIODO)}</span>
                  </div>
                  <div className="flex justify-between py-2 text-[#FF6A00]">
                    <span>Retención contractual ({edpRetention}%)</span>
                    <span>{edpRetention > 0 ? `- ${formatCLP(edpCalc.retMonto)}` : '$0'}</span>
                  </div>
                  <div className="flex justify-between py-2 text-[#64748B] dark:text-gray-400">
                    <span>Desglose Neto + IVA (19%)</span>
                    <span>
                      {formatCLP(edpCalc.neto)} + {formatCLP(edpCalc.iva)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between px-3.5 py-3 bg-[#EBF2ED] dark:bg-[#18261D] text-[#1E1E1E] dark:text-white font-bold text-sm">
                  <span>LÍQUIDO A PAGAR (IVA INCL.)</span>
                  <span className="text-obra-green">{formatCLP(edpCalc.liquido)} CLP</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono text-obra-green bg-[#EBF2ED]/70 dark:bg-[#18261D] p-2.5 rounded-xl">
                <Landmark className="w-4 h-4 shrink-0" />
                <span>Incluye tus datos bancarios y firma del emisor en el PDF descargable.</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <Link
                  href="/login"
                  className="landing-shimmer flex-1 py-3 rounded-xl bg-[#FF6A00] text-white font-heading font-bold text-xs text-center hover:bg-[#E05E00] transition"
                >
                  Generar Estados de Pago en Mi Obra →
                </Link>
                <button
                  type="button"
                  onClick={() => setOpenModal(null)}
                  className="px-5 py-3 rounded-xl border border-[#E5E7EB] dark:border-[#263040] text-[#1E1E1E] dark:text-white font-heading font-bold text-xs hover:bg-[#FAF8F5] dark:hover:bg-[#0B0E14] transition"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Summary Preview Modal */}
      {openModal === 'whatsapp' && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenModal(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wa-modal-title"
        >
          <div className="landing-modal-pop bg-white dark:bg-[#141A23] rounded-3xl border-2 border-[#E5E7EB] dark:border-[#263040] max-w-md w-full overflow-hidden shadow-2xl">
            <div className="bg-emerald-700 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <MessageCircle className="w-5 h-5" />
                <div>
                  <div id="wa-modal-title" className="font-heading font-bold text-sm">
                    Mensaje WhatsApp para el Mandante
                  </div>
                  <div className="font-mono text-[10px] text-emerald-100">
                    Se abre listo con un clic desde ObraTrack
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                className="p-1.5 rounded-lg text-emerald-100 hover:bg-white/10 transition"
                aria-label="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 bg-[#EFEAE2] dark:bg-[#0B141A]">
              <div className="bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-white rounded-2xl rounded-tr-none p-4 shadow-sm text-xs leading-relaxed whitespace-pre-line font-sans">
                {waEdpPreviewText}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-[#141A23] border-t border-[#E5E7EB] dark:border-[#263040] flex gap-2.5">
              <Link
                href="/login"
                className="flex-1 py-2.5 rounded-xl bg-[#FF6A00] text-white font-heading font-bold text-xs text-center hover:bg-[#E05E00] transition"
              >
                Probarlo en ObraTrack →
              </Link>
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                className="px-4 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#263040] text-[#1E1E1E] dark:text-white font-heading font-bold text-xs hover:bg-[#FAF8F5] dark:hover:bg-[#0B0E14] transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
