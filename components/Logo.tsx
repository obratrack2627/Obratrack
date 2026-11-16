import React from 'react';

interface LogoProps {
  variant?: 'horizontal' | 'vertical' | 'icon' | 'badge';
  theme?: 'light' | 'dark' | 'monochrome-light' | 'monochrome-dark';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  withDescriptor?: boolean;
  withTagline?: boolean;
  className?: string;
}

export function ObraTrackLogoPaths({
  orange,
  buildings,
  green,
  buildingsClassName,
}: {
  orange: string;
  buildings: string;
  green: string;
  buildingsClassName?: string;
}) {
  return (
    <>
      {/* 1. Contorno superior naranja (pared izquierda y cubierta a dos aguas) */}
      <path
        d="M 19.59 89.65 V 38.12 L 65.21 6.00 L 101.79 31.44 V 41.92 L 65.21 17.28 L 28.37 43.24 V 89.65 Z"
        fill={orange}
      />

      {/* 2. Nodo circular izquierdo y barra inferior biselada */}
      <path
        fillRule="evenodd"
        d="M 25.03 100.86 A 11.60 11.60 0 1 0 25.03 124.06 A 11.60 11.60 0 1 0 25.03 100.86 Z M 25.03 107.61 A 4.85 4.85 0 1 1 25.03 117.31 A 4.85 4.85 0 1 1 25.03 107.61 Z"
        fill={orange}
      />
      <path d="M 34.00 108.00 H 70.07 L 77.93 116.40 H 34.00 Z" fill={orange} />

      {/* 3. Tres torres centrales (oscuras sobre claro / blancas sobre negro) */}
      <path
        d="M 41.48 101.90 V 62.60 Q 41.48 61.50 42.40 60.98 L 53.80 54.45 Q 55.51 53.45 55.51 55.35 V 101.90 Q 55.51 102.76 54.65 102.76 H 42.34 Q 41.48 102.76 41.48 101.90 Z"
        fill={buildings}
        className={buildingsClassName}
      />
      <path
        d="M 60.36 96.13 V 37.20 Q 60.36 35.60 61.75 34.80 L 62.70 34.25 Q 63.70 33.65 64.75 34.35 L 77.10 43.35 Q 77.67 43.76 77.67 44.50 V 87.30 Q 77.67 87.95 77.10 87.58 L 75.50 86.52 Q 75.05 86.22 74.60 86.65 L 64.15 96.55 Q 63.70 96.99 63.00 96.99 H 61.22 Q 60.36 96.99 60.36 96.13 Z"
        fill={buildings}
        className={buildingsClassName}
      />
      <path
        d="M 82.26 91.05 V 58.95 Q 82.26 57.65 83.40 57.05 L 84.05 56.72 Q 84.85 56.30 85.65 56.88 L 95.80 64.75 Q 96.29 65.13 96.29 65.80 V 85.20 Q 96.29 85.85 95.75 86.35 L 86.70 94.70 Q 86.15 95.22 85.60 94.68 L 82.75 91.90 Q 82.26 91.42 82.26 91.05 Z"
        fill={buildings}
        className={buildingsClassName}
      />

      {/* 4. Checkmark de avance verde */}
      <path
        d="M 69.67 98.56 L 75.83 92.40 L 86.45 103.02 L 126.31 64.08 V 76.41 L 86.45 115.22 Z"
        fill={green}
      />
    </>
  );
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

  const orange = isMonoLight ? '#222A37' : isMonoDark ? '#FFFFFF' : '#FF6201';
  const buildings = isMonoLight ? '#222A37' : isMonoDark ? '#FFFFFF' : isDark ? '#FFFFFF' : '#222A37';
  const green = isMonoLight ? '#7A8390' : isMonoDark ? '#D1D5DB' : '#688868';
  const buildingsClassName =
    theme === 'light' ? 'fill-[#222A37] dark:fill-white logo-carbon-bar' : undefined;

  return (
    <svg
      viewBox="0 0 140 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <ObraTrackLogoPaths
        orange={orange}
        buildings={buildings}
        green={green}
        buildingsClassName={buildingsClassName}
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

  const orangeText = isMonoLight ? 'text-[#222A37]' : isMonoDark ? 'text-white' : isDark ? 'text-[#FF6A00]' : 'text-obra-orange';
  const trackText = isMonoLight
    ? 'text-[#222A37]'
    : isMonoDark
    ? 'text-white'
    : isDark
    ? 'text-white'
    : 'text-[#222A37] dark:text-white logo-carbon-text';
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
              <span className={isDark ? 'text-gray-300 font-medium' : 'text-[#222A37] dark:text-gray-300 font-medium'}>El</span>
              <span className="text-[#FF6A00] font-bold">copiloto</span>
              <span className={isDark ? 'text-white font-bold' : 'text-[#222A37] dark:text-white font-bold'}>digital del constructor</span>
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
          <p className={`text-[11px] font-heading font-medium mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500 dark:text-gray-400'}`}>
            El <strong className="text-[#FF6A00]">copiloto</strong> digital del constructor
          </p>
        )}
      </div>
    </div>
  );
}
