'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Sustituye el tema antiguo también mientras Chrome actualiza la app instalada. */
export default function InstalledAppTheme() {
  const pathname = usePathname();
  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)');
    let created: HTMLMetaElement | undefined;
    const apply = () => {
      if (!mode.matches) { created?.remove(); created = undefined; return; }
      let metas = Array.from(document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
      if (!metas.length) {
        created = document.createElement('meta');
        created.name = 'theme-color';
        document.head.appendChild(created);
        metas = [created];
      }
      metas.forEach(meta => { meta.content = '#1E1E1E'; });
    };
    apply();
    mode.addEventListener('change', apply);
    return () => { mode.removeEventListener('change', apply); created?.remove(); };
  }, [pathname]);
  return null;
}
