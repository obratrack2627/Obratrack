'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

function scrollToPageStart() {
  // Los enlaces a una sección conservan su destino dentro de la página.
  if (!window.location.hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

export default function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const launchChecked = useRef(false);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) scrollToPageStart();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.history.scrollRestoration = previous;
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    scrollToPageStart();
    // Esperar el montaje del módulo y el cierre del menú o modal anterior.
    const frame = window.requestAnimationFrame(scrollToPageStart);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!pathname || launchChecked.current) return;
    launchChecked.current = true;
    const installed = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!installed || navigation?.type !== 'navigate' ||
      (document.referrer && !document.referrer.startsWith('android-app://'))) return;

    const url = new URL(window.location.href);
    if (url.hash) return;
    // Compatibilidad con instalaciones que todavía conservan el antiguo start_url.
    // Solo en el arranque: la navegación interna y los accesos directos se respetan.
    if (pathname === '/proyectos' && !url.search) {
      router.replace('/dashboard');
    } else if (pathname === '/login' && url.searchParams.get('redirect') === '/proyectos') {
      url.searchParams.set('redirect', '/dashboard');
      router.replace(url.pathname + url.search);
    }
  }, [pathname, router]);

  return null;
}
