'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import ThemeProvider from '@/components/ThemeProvider';
import { getActiveSupabaseSession } from '@/lib/supabase/auth';
import { dataService } from '@/lib/data-service';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === '/login' || pathname?.startsWith('/login');

  const [isVerifying, setIsVerifying] = useState(!isAuthPage);

  useEffect(() => {
    let isMounted = true;

    if (isAuthPage) {
      setIsVerifying(false);
      return;
    }

    async function checkAuth() {
      try {
        const sessionUser = await getActiveSupabaseSession();
        const activeLocal = dataService.getActiveUser();
        const hasValidUser = !!(sessionUser || activeLocal);

        if (isMounted) {
          setIsVerifying(false);
          if (!hasValidUser) {
            router.replace('/login');
          }
        }
      } catch (err) {
        if (isMounted) {
          setIsVerifying(false);
          router.replace('/login');
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [pathname, isAuthPage, router]);

  return (
    <ThemeProvider>
      {isAuthPage ? (
        <main key={pathname} className="min-h-screen w-full page-fade-enter">
          {children}
        </main>
      ) : isVerifying ? (
        <div className="min-h-screen w-full bg-[var(--bg-page)] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#FF6A00] animate-spin" />
          <p className="text-xs font-mono text-gray-500">Cargando ObraTrack...</p>
        </div>
      ) : (
        <div className="min-h-screen flex flex-col md:flex-row bg-[var(--bg-page)] text-[var(--text-primary)] antialiased transition-colors duration-200">
          <Sidebar />
          <main className="flex-1 flex flex-col min-h-screen w-full md:pl-64 transition-all">
            <div key={pathname} className="flex-1 flex flex-col page-fade-enter">
              {children}
            </div>
          </main>
        </div>
      )}
    </ThemeProvider>
  );
}
