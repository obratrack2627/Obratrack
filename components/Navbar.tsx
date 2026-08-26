'use client';

import React from 'react';
import ThemeToggle from './ThemeToggle';

interface NavbarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function Navbar({ title, subtitle, action }: NavbarProps) {
  return (
    <header className="bg-[#FAF8F5] dark:bg-[#141A23] border-b border-[#E5DFC9] dark:border-[#263040] px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-0 z-30 shadow-sm backdrop-blur-md bg-opacity-95 dark:bg-opacity-95 transition-colors duration-200">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-[#1E1E1E] dark:text-white tracking-tight font-heading flex items-center gap-2">
          {title}
        </h1>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 font-sans mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {action}
        <ThemeToggle />
      </div>
    </header>
  );
}
