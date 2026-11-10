'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Deja las barras del sistema con el color predeterminado de Chrome y Android. */
export default function InstalledAppTheme() {
  const pathname = usePathname();
  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)');
    const apply = () => {
      if (mode.matches) {
        document.head.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.remove());
      }
    };
    apply();
    mode.addEventListener('change', apply);
    return () => mode.removeEventListener('change', apply);
  }, [pathname]);
  return null;
}
