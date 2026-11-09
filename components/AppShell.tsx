'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import CloudSync from '@/components/CloudSync';
import ThemeProvider from '@/components/ThemeProvider';
import ThemeToggle from '@/components/ThemeToggle';
import ObraBotLauncher from '@/components/ObraBotLauncher';
import WebSession from '@/components/WebSession';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Raíz (/), /login y /actualizar-password son vistas de autenticación sin Sidebar
  const isAuthPage =
    !pathname ||
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/login') ||
    pathname === '/actualizar-password' ||
    pathname.startsWith('/actualizar-password');

  return (
    <ThemeProvider>
      {isAuthPage ? (
        <main className="min-h-screen w-full bg-[var(--bg-page)] text-[var(--text-primary)] antialiased workspace-ui page-fade-enter transition-colors duration-200">
          <div className="fixed top-4 right-4 z-40 print:hidden">
            <ThemeToggle />
          </div>
          {children}
        </main>
      ) : (
        <div className="min-h-screen flex flex-col md:flex-row bg-[var(--bg-page)] text-[var(--text-primary)] antialiased transition-colors duration-200">
          <Sidebar />
          <WebSession />
          <div className="hidden md:flex fixed top-3.5 right-4 z-40 print:hidden">
            <ThemeToggle />
          </div>
          <main className="workspace-ui flex-1 flex flex-col min-h-screen w-full pt-16 md:pt-0 md:pl-64 transition-all">
            <CloudSync />
            <div className="flex-1 flex flex-col page-fade-enter">
              {children}
            </div>
          </main>
          <ObraBotLauncher />
        </div>
      )}
    </ThemeProvider>
  );
}
