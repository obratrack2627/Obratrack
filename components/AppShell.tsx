'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ThemeProvider from '@/components/ThemeProvider';
import { getActiveSupabaseSession } from '@/lib/supabase/auth';
import { dataService } from '@/lib/data-service';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === '/login' || pathname?.startsWith('/login');

  useEffect(() => {
    let isCurrent = true;

    if (isAuthPage) return;

    async function checkAuth() {
      try {
        const sessionUser = await getActiveSupabaseSession();
        const activeLocal = dataService.getActiveUser();
        const hasValidUser = !!(sessionUser || activeLocal);

        if (isCurrent && !hasValidUser) {
          router.replace('/login');
        }
      } catch (err) {
        if (isCurrent) {
          router.replace('/login');
        }
      }
    }

    checkAuth();

    return () => {
      isCurrent = false;
    };
  }, [pathname, isAuthPage, router]);

  return (
    <ThemeProvider>
      {isAuthPage ? (
        <div className="min-h-screen w-full page-fade-enter">
          {children}
        </div>
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
