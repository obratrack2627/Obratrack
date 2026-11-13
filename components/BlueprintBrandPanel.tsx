'use client';

import React, { useRef, useState } from 'react';
import Logo from '@/components/Logo';

export default function BlueprintBrandPanel() {
  const asideRef = useRef<HTMLElement | null>(null);
  const coordRef = useRef<HTMLSpanElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const updateCursorPosition = (e: React.MouseEvent<HTMLElement>) => {
    const el = asideRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    el.style.setProperty('--mx', `${x.toFixed(1)}px`);
    el.style.setProperty('--my', `${y.toFixed(1)}px`);

    if (coordRef.current) {
      const metersX = (x / 36).toFixed(1);
      const metersY = (y / 36).toFixed(1);
      coordRef.current.textContent = `X ${metersX}m · Y ${metersY}m`;
      const nearRight = x > rect.width - 140;
      const nearBottom = y > rect.height - 44;
      coordRef.current.style.left = nearRight ? 'auto' : '2.25rem';
      coordRef.current.style.right = nearRight ? '2.25rem' : 'auto';
      coordRef.current.style.top = nearBottom ? 'auto' : '0.5rem';
      coordRef.current.style.bottom = nearBottom ? '0.5rem' : 'auto';
    }
  };

  const revealMask =
    'radial-gradient(330px circle at var(--mx, 50%) var(--my, 50%), rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 42%, rgba(0,0,0,0.16) 72%, transparent 100%)';

  return (
    <>
      {/* Barra superior compacta en móvil */}
      <header className="lg:hidden bg-[#141920] border-b border-[#222A36] shrink-0">
        <div className="h-[2px] w-full bg-[#FF6A00]" />
        <div className="px-5 py-3.5 pr-16 flex items-center justify-between">
          <Logo variant="horizontal" theme="dark" size="sm" />
          <span className="text-[11px] font-mono text-[#94A3B8] hidden sm:inline uppercase tracking-wider">
            El copiloto digital del constructor
          </span>
        </div>
      </header>

      {/* Panel Izquierdo Blueprint Interactivo (Desktop) */}
      <aside
        ref={asideRef}
        onMouseEnter={(e) => {
          updateCursorPosition(e);
          setIsHovered(true);
        }}
        onMouseMove={updateCursorPosition}
        onMouseLeave={() => setIsHovered(false)}
        style={
          {
            '--mx': '50%',
            '--my': '50%',
          } as React.CSSProperties
        }
        className="group hidden lg:flex lg:col-span-5 bg-[#141920] text-white border-r border-[#222A36] hover:border-[#2563EB]/50 transition-colors duration-500 flex-col justify-between relative overflow-hidden select-none cursor-crosshair"
      >
        {/* Viga superior de acento */}
        <div className="relative z-30 h-[3px] w-full bg-[#FF6A00] shrink-0 overflow-hidden">
          <div
            aria-hidden="true"
            className={`absolute inset-0 bg-gradient-to-r from-[#1D4ED8] via-[#38BDF8] to-[#2563EB] transition-opacity duration-500 ${
              isHovered ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>

        {/* Textura base sutil de plano técnico */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #FFFFFF 1px, transparent 1px), linear-gradient(to bottom, #FFFFFF 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Halo atmosférico azul cobalto/celeste que sigue el cursor */}
        <div
          aria-hidden="true"
          className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            background:
              'radial-gradient(460px circle at var(--mx) var(--my), rgba(37, 99, 235, 0.28), rgba(56, 189, 248, 0.12) 40%, rgba(15, 23, 42, 0) 72%)',
          }}
        />

        {/* Capa de plano constructivo azul revelada con máscara radial al pasar el cursor */}
        <div
          aria-hidden="true"
          className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            maskImage: revealMask,
            WebkitMaskImage: revealMask,
          }}
        >
          {/* Retícula CAD secundaria azul fina */}
          <div
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(56,189,248,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.22) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />

          {/* Ilustración SVG de Plano Constructivo: Grúa torre, estructura aporticada, cimientos y cotas */}
          <svg
            viewBox="0 0 600 840"
            preserveAspectRatio="xMidYMid slice"
            className="w-full h-full text-[#38BDF8]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Ejes estructurales principales */}
            <g stroke="currentColor" strokeOpacity="0.28" strokeDasharray="6 6" strokeWidth="1">
              <line x1="80" y1="40" x2="80" y2="800" />
              <line x1="220" y1="40" x2="220" y2="800" />
              <line x1="380" y1="40" x2="380" y2="800" />
              <line x1="520" y1="40" x2="520" y2="800" />
              <line x1="30" y1="220" x2="570" y2="220" />
              <line x1="30" y1="560" x2="570" y2="560" />
            </g>

            {/* Marcadores circulares de ejes CAD */}
            <g stroke="#60A5FA" strokeOpacity="0.7" strokeWidth="1.2">
              <circle cx="80" cy="72" r="11" fill="#0F172A" fillOpacity="0.7" />
              <circle cx="220" cy="72" r="11" fill="#0F172A" fillOpacity="0.7" />
              <circle cx="380" cy="72" r="11" fill="#0F172A" fillOpacity="0.7" />
              <circle cx="520" cy="72" r="11" fill="#0F172A" fillOpacity="0.7" />
            </g>
            <g fill="#7DD3FC" fillOpacity="0.85" fontSize="9" fontFamily="monospace" textAnchor="middle">
              <text x="80" y="75">A</text>
              <text x="220" y="75">B</text>
              <text x="380" y="75">C</text>
              <text x="520" y="75">D</text>
            </g>

            {/* Grúa Torre estructural en zona superior derecha */}
            <g stroke="#38BDF8" strokeOpacity="0.78" strokeWidth="1.4">
              {/* Mástil reticulado */}
              <rect x="448" y="128" width="22" height="228" strokeOpacity="0.65" />
              <path d="M448 158 L470 188 L448 218 L470 248 L448 278 L470 308 L448 338" />
              <path d="M470 158 L448 188 L470 218 L448 248 L470 278 L448 308 L470 338" strokeOpacity="0.45" />
              {/* Pluma horizontal y contrapeso */}
              <polygon points="459,98 442,128 476,128" />
              <rect x="200" y="128" width="350" height="16" strokeOpacity="0.7" />
              <path d="M220 128 L238 144 L256 128 L274 144 L292 128 L310 144 L328 128 L346 144 L364 128 L382 144 L400 128 L418 144 L436 128" />
              {/* Tirantes de acero */}
              <line x1="459" y1="98" x2="250" y2="128" strokeOpacity="0.65" />
              <line x1="459" y1="98" x2="538" y2="128" strokeOpacity="0.65" />
              <rect x="512" y="144" width="34" height="18" fill="#1D4ED8" fillOpacity="0.35" />
              {/* Carro y cable plomada */}
              <rect x="278" y="144" width="24" height="8" fill="#38BDF8" fillOpacity="0.4" />
              <line x1="290" y1="152" x2="290" y2="216" strokeDasharray="3 3" />
              <path d="M285 216 L295 216 L292 225 C292 229 286 229 286 225" />
            </g>

            {/* Cota superior */}
            <g stroke="#60A5FA" strokeOpacity="0.6" strokeWidth="1">
              <line x1="200" y1="108" x2="459" y2="108" />
              <line x1="200" y1="103" x2="200" y2="113" />
              <line x1="459" y1="103" x2="459" y2="113" />
            </g>
            <text x="328" y="102" fill="#93C5FD" fillOpacity="0.85" fontSize="9.5" fontFamily="monospace" textAnchor="middle">
              PLUMA 32.0 m · H +24.5 m
            </text>

            {/* Geometría radial de compás tras el centro de marca */}
            <g stroke="#38BDF8" strokeOpacity="0.28" strokeWidth="1">
              <circle cx="300" cy="410" r="145" strokeDasharray="5 5" />
              <circle cx="300" cy="410" r="198" strokeOpacity="0.18" />
              <line x1="120" y1="410" x2="480" y2="410" strokeOpacity="0.18" />
              <line x1="175" y1="285" x2="425" y2="535" strokeOpacity="0.16" />
              <line x1="425" y1="285" x2="175" y2="535" strokeOpacity="0.16" />
            </g>

            {/* Corte estructural en sección inferior (Losas, pilares, arriostramientos y fundaciones) */}
            <g stroke="#38BDF8" strokeOpacity="0.72" strokeWidth="1.4">
              {/* Losas horizontales */}
              <rect x="74" y="556" width="452" height="10" fill="#1D4ED8" fillOpacity="0.25" />
              <rect x="74" y="646" width="452" height="10" fill="#1D4ED8" fillOpacity="0.25" />
              <rect x="64" y="736" width="472" height="12" fill="#2563EB" fillOpacity="0.32" />

              {/* Pilares verticales */}
              <rect x="76" y="566" width="8" height="170" fill="#38BDF8" fillOpacity="0.18" />
              <rect x="216" y="566" width="8" height="170" fill="#38BDF8" fillOpacity="0.18" />
              <rect x="376" y="566" width="8" height="170" fill="#38BDF8" fillOpacity="0.18" />
              <rect x="516" y="566" width="8" height="170" fill="#38BDF8" fillOpacity="0.18" />

              {/* Arriostramientos diagonales de acero */}
              <line x1="84" y1="566" x2="216" y2="646" strokeOpacity="0.55" />
              <line x1="216" y1="566" x2="84" y2="646" strokeOpacity="0.55" />
              <line x1="384" y1="656" x2="516" y2="736" strokeOpacity="0.55" />
              <line x1="516" y1="656" x2="384" y2="736" strokeOpacity="0.55" />

              {/* Zapatas de fundación */}
              <path d="M58 748 L102 748 L110 768 L50 768 Z" fill="#1D4ED8" fillOpacity="0.25" />
              <path d="M198 748 L242 748 L250 768 L190 768 Z" fill="#1D4ED8" fillOpacity="0.25" />
              <path d="M358 748 L402 748 L410 768 L350 768 Z" fill="#1D4ED8" fillOpacity="0.25" />
              <path d="M498 748 L542 748 L550 768 L490 768 Z" fill="#1D4ED8" fillOpacity="0.25" />
            </g>

            {/* Niveles de elevación y rótulo técnico */}
            <g fill="#7DD3FC" fillOpacity="0.82" fontSize="9" fontFamily="monospace">
              <text x="536" y="564">NPT +6.40</text>
              <text x="536" y="654">NPT +3.20</text>
              <text x="536" y="744">NTN ±0.00</text>
              <text x="54" y="786" fillOpacity="0.72">
                LÁMINA EST-01 · ESC 1:50 · HORMIGÓN H30 / ACERO A630-420H
              </text>
            </g>
          </svg>
        </div>

        {/* Mira de ingeniería y ejes X/Y sincronizados con el cursor */}
        <div
          aria-hidden="true"
          className={`absolute inset-0 pointer-events-none z-10 transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Línea guía horizontal */}
          <div
            className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/45 to-transparent"
            style={{ top: 'var(--my)' }}
          />
          {/* Línea guía vertical */}
          <div
            className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#38BDF8]/45 to-transparent"
            style={{ left: 'var(--mx)' }}
          />
          {/* Retícula CAD en la posición exacta del puntero */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: 'var(--mx)', top: 'var(--my)' }}
          >
            <div className="w-8 h-8 rounded-full border border-[#38BDF8]/65 shadow-[0_0_16px_rgba(56,189,248,0.45)] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#7DD3FC]" />
            </div>
            <span
              ref={coordRef}
              className="absolute left-9 top-2 whitespace-nowrap px-2 py-0.5 rounded bg-[#0B172A]/90 border border-[#38BDF8]/40 text-[10px] font-mono tracking-tight text-[#7DD3FC] shadow-sm"
            >
              X 0.0m · Y 0.0m
            </span>
          </div>
        </div>

        {/* Cabecera institucional */}
        <div className="relative z-20 p-8 xl:p-10 flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest text-[#94A3B8] group-hover:text-[#93C5FD] transition-colors duration-300 uppercase">
            OBRATRACK SAAS
          </span>
          <span className="text-[11px] font-mono text-[#94A3B8] group-hover:text-[#7DD3FC] transition-colors duration-300 flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                isHovered ? 'bg-[#38BDF8] shadow-[0_0_8px_#38BDF8]' : 'bg-transparent'
              }`}
            />
            CHILE
          </span>
        </div>

        {/* Contenido centrado */}
        <div className="relative z-20 flex-1 flex flex-col items-center justify-center p-8 xl:p-12 text-center my-auto">
          <div className="max-w-sm flex flex-col items-center">
            <Logo variant="vertical" theme="dark" size="lg" className="mb-6" />

            <h2 className="font-heading text-2xl xl:text-[28px] font-semibold text-white tracking-tight leading-tight">
              Tus obras bajo control
            </h2>

            <p className="text-sm text-[#94A3B8] group-hover:text-[#CBD5E1] transition-colors duration-300 mt-2.5 font-sans leading-relaxed">
              El copiloto digital del constructor.
            </p>

            <div className="mt-8 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1C2430] group-hover:bg-[#102038]/90 border border-[#2B3747] group-hover:border-[#38BDF8]/45 group-hover:shadow-[0_0_24px_-6px_rgba(56,189,248,0.45)] transition-all duration-300 text-[11px] font-mono text-[#CBD5E1]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] group-hover:bg-[#38BDF8] transition-colors duration-300" />
              <span>CONTROL · CUBICACIONES · FAENA</span>
            </div>
          </div>
        </div>

        {/* Pie institucional sobrio */}
        <div className="relative z-20 p-6 text-center text-xs text-[#5E6B7E] group-hover:text-[#7DD3FC]/70 transition-colors duration-300 border-t border-[#1C232E]/60 group-hover:border-[#1E3A5F]/70">
          © {new Date().getFullYear()} ObraTrack · Plataforma de Obras
        </div>
      </aside>
    </>
  );
}
