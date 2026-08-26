'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ThemeProvider from '@/components/ThemeProvider';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname?.startsWith('/login');

  return (
    <ThemeProvider>
      {isAuthPage ? (
        <main className="min-h-screen w-full page-fade-enter">
          {children}
        </main>
      ) : (
        <div className="min-h-screen flex flex-col md:flex-row bg-[var(--bg-page)] text-[var(--text-primary)] antialiased transition-colors duration-200">
          <Sidebar />
          <main className="flex-1 flex flex-col min-h-screen w-full md:pl-64 transition-all">
            <div className="flex-1 flex flex-col page-fade-enter">
              {children}
            </div>
          </main>
        </div>
      )}
    </ThemeProvider>
  );
}
