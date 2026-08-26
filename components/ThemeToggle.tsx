'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';

interface ThemeToggleProps {
  variant?: 'button' | 'compact' | 'pill';
  className?: string;
}

export default function ThemeToggle({ variant = 'button', className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono transition-all ${
          isDark
            ? 'bg-[#171D26] border-[#2B3545] text-amber-300 hover:border-amber-400'
            : 'bg-white border-[#E5DFC9] text-gray-700 hover:border-[#FF6A00]'
        } ${className}`}
        title={isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
      >
        {isDark ? (
          <>
            <Sun className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
            <span>Modo Claro</span>
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 text-[#1E1E1E]" />
            <span>Modo Oscuro</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`p-2 rounded-xl border transition-all flex items-center justify-center ${
        isDark
          ? 'bg-[#171D26] border-[#2B3545] text-amber-300 hover:bg-[#222A36]'
          : 'bg-white border-[#E5DFC9] text-gray-700 hover:bg-gray-50'
      } ${className}`}
      title={isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
      aria-label="Cambiar tema"
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 text-gray-700 transition-transform duration-300 hover:-rotate-12" />
      )}
    </button>
  );
}
