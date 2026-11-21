'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import PwaSplash from './PwaSplash';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import CloudSync from '@/components/CloudSync';
import ThemeProvider from '@/components/ThemeProvider';
import InstalledAppTheme from '@/components/InstalledAppTheme';
import AppNavigation from '@/components/AppNavigation';
import ThemeToggle from '@/components/ThemeToggle';
import ObraBotLauncher from '@/components/ObraBotLauncher';
import WebSession from '@/components/WebSession';

const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false });

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Raíz (/), /login, /precios y /actualizar-password son vistas públicas o de autenticación sin Sidebar
  const isAuthPage =
    !pathname ||
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/login') ||
    pathname === '/precios' ||
    pathname.startsWith('/precios') ||
    pathname === '/actualizar-password' ||
    pathname.startsWith('/actualizar-password');

  const isLandingPage = pathname === '/';

  useEffect(() => {
    if (isAuthPage) {
      setPaletteOpen(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    const handleOpen = () => setPaletteOpen(true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('obratrack_open_command_palette', handleOpen);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('obratrack_open_command_palette', handleOpen);
    };
  }, [isAuthPage]);

  return (
    <ThemeProvider>
      <a
        href="#contenido-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-[#FF6A00] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg"
      >
        Saltar al contenido principal
      </a>
      <PwaSplash />
      <InstalledAppTheme />
      <AppNavigation />
      {isAuthPage ? (
        <main
          id="contenido-principal"
          className="min-h-screen w-full bg-[var(--bg-page)] text-[var(--text-primary)] antialiased workspace-ui page-fade-enter transition-colors duration-200"
        >
          {!isLandingPage && (
            <div className="fixed top-4 right-4 z-40 print:hidden">
              <ThemeToggle />
            </div>
          )}
          {children}
        </main>
      ) : (
        <div className="min-h-screen flex flex-col md:flex-row bg-[var(--bg-page)] text-[var(--text-primary)] antialiased transition-colors duration-200">
          <Sidebar />
          <WebSession />
          <div className="hidden md:flex fixed top-3.5 right-4 z-40 print:hidden">
            <ThemeToggle />
          </div>
          <main
            id="contenido-principal"
            className="workspace-ui min-w-0 flex-1 flex flex-col min-h-screen w-full pt-16 md:pt-0 md:pl-64 transition-all"
          >
            <CloudSync />
            <div className="min-w-0 max-w-full flex-1 flex flex-col page-fade-enter">
              {children}
            </div>
          </main>
          <ObraBotLauncher />
          {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
        </div>
      )}
    </ThemeProvider>
  );
}
