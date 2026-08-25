import React from 'react';

interface LogoProps {
  variant?: 'horizontal' | 'vertical' | 'icon' | 'badge';
  theme?: 'light' | 'dark' | 'monochrome-light' | 'monochrome-dark';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  withDescriptor?: boolean;
  withTagline?: boolean;
  className?: string;
}

export function ObraTrackIcon({
  theme = 'light',
  className = 'w-10 h-10',
}: {
  theme?: 'light' | 'dark' | 'monochrome-light' | 'monochrome-dark';
  className?: string;
}) {
  const isDark = theme === 'dark';
  const isMonoLight = theme === 'monochrome-light';
  const isMonoDark = theme === 'monochrome-dark';

  // Colores oficiales según manual de marca
  const orange = isMonoLight ? '#1E1E1E' : isMonoDark ? '#FFFFFF' : '#FF6A00';
  const carbon = isMonoLight ? '#1E1E1E' : isMonoDark ? '#FFFFFF' : isDark ? '#FFFFFF' : '#1E1E1E';
  const green = isMonoLight ? '#9A9A9A' : isMonoDark ? '#FFFFFF' : '#6B8F72';

  return (
    <svg
      viewBox="0 0 140 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 1. Casa exterior naranja con nodo tech/circuito */}
      {/* Nodo circular izquierdo */}
      <circle cx="16" cy="106" r="6.5" stroke={orange} strokeWidth="6" fill="none" />
      {/* Línea horizontal inferior */}
      <path
        d="M22.5 106 H 58"
        stroke={orange}
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* Pared izquierda, Techo a dos aguas y Pared derecha */}
      <path
        d="M 23 100 V 44 L 68 12 L 112 44 V 68"
        stroke={orange}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 2. Columnas de edificios / Barras de progreso (Carbón) */}
      {/* Barra Izquierda */}
      <rect x="36" y="52" width="13" height="46" rx="2.5" fill={carbon} />
      {/* Barra Centro (más alta) */}
      <rect x="53" y="32" width="15" height="66" rx="2.5" fill={carbon} />
      {/* Barra Derecha */}
      <rect x="72" y="46" width="13" height="52" rx="2.5" fill={carbon} />

      {/* 3. Checkmark / Flecha de avance (Verde Terreno #6B8F72) */}
      <path
        d="M 52 98 L 74 116 L 126 62"
        stroke={green}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Logo({
  variant = 'horizontal',
  theme = 'light',
  size = 'md',
  withDescriptor = false,
  withTagline = false,
  className = '',
}: LogoProps) {
  const isDark = theme === 'dark';
  const isMonoLight = theme === 'monochrome-light';
  const isMonoDark = theme === 'monochrome-dark';

  const orangeText = isMonoLight ? 'text-[#1E1E1E]' : isMonoDark ? 'text-white' : 'text-[#FF6A00]';
  const trackText = isMonoLight
    ? 'text-[#1E1E1E]'
    : isMonoDark
    ? 'text-white'
    : isDark
    ? 'text-white'
    : 'text-[#1E1E1E]';
  const descriptorText = isMonoDark ? 'text-gray-400' : isDark ? 'text-gray-400' : 'text-[#9A9A9A]';

  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-5xl',
  };

  const descriptorSizes = {
    sm: 'text-[7px] tracking-[0.2em]',
    md: 'text-[8.5px] tracking-[0.25em]',
    lg: 'text-[11px] tracking-[0.28em]',
    xl: 'text-[14px] tracking-[0.3em]',
  };

  if (variant === 'icon') {
    return <ObraTrackIcon theme={theme} className={`${iconSizes[size]} ${className}`} />;
  }

  if (variant === 'vertical') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <ObraTrackIcon theme={theme} className={iconSizes[size]} />
        
        <div className="mt-2">
          <div className={`font-heading font-extrabold ${textSizes[size]} tracking-tight leading-none`}>
            <span className={orangeText}>Obra</span>
            <span className={trackText}>Track</span>
          </div>

          {(withDescriptor || withTagline) && (
            <p className={`font-mono font-bold uppercase ${descriptorText} ${descriptorSizes[size]} mt-1.5`}>
              CONTROL • COTIZACIONES
              <br />
              COSTOS • PAGOS • AVANCES
            </p>
          )}

          {withTagline && (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-heading">
              <span className="text-[#1E1E1E] font-medium">El</span>
              <span className="text-[#FF6A00] font-bold">copiloto</span>
              <span className="text-[#1E1E1E] font-bold">digital del constructor</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Variant Horizontal (Default)
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <ObraTrackIcon theme={theme} className={iconSizes[size]} />

      <div className="flex flex-col justify-center">
        <div className={`font-heading font-black ${textSizes[size]} tracking-tight leading-none`}>
          <span className={orangeText}>Obra</span>
          <span className={trackText}>Track</span>
        </div>

        {withDescriptor && (
          <p className={`font-mono font-bold uppercase ${descriptorText} ${descriptorSizes[size]} mt-1`}>
            CONTROL • COTIZACIONES • COSTOS • PAGOS • AVANCES
          </p>
        )}

        {withTagline && (
          <p className="text-[11px] font-heading font-medium text-gray-500 mt-0.5">
            El <strong className="text-[#FF6A00]">copiloto</strong> digital del constructor
          </p>
        )}
      </div>
    </div>
  );
}
