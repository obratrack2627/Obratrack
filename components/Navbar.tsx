'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { AlertsBellButton } from '@/components/AlertsDrawer';

interface NavbarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function Navbar({ title, subtitle, action }: NavbarProps) {
  return (
    <header className="bg-[#FAF8F5] dark:bg-[#141A23] border-b border-[#E5DFC9] dark:border-[#263040] px-4 sm:px-6 md:pr-16 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-16 md:top-0 z-30 shadow-sm backdrop-blur-md bg-opacity-95 dark:bg-opacity-95 transition-colors duration-200 print:hidden">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg sm:text-2xl font-black text-[#1E1E1E] dark:text-white tracking-tight font-heading flex items-center gap-2 truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-sans mt-0.5 truncate">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('obratrack_open_command_palette'))}
          aria-label="Búsqueda rápida (Ctrl+K)"
          title="Búsqueda rápida (Ctrl+K)"
          className="inline-flex items-center gap-2 rounded-xl border border-[#E5DFC9] dark:border-[#263040] bg-white/80 dark:bg-[#1E2633] px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline font-medium">Buscar</span>
          <kbd className="hidden lg:inline-flex items-center rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:text-gray-400">
            Ctrl K
          </kbd>
        </button>
        <AlertsBellButton className="hidden md:inline-flex" />
        {action}
      </div>
    </header>
  );
}
