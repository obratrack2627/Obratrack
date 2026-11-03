'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';

export default function ObraBotLauncher() {
  const pathname = usePathname();
  if (pathname === '/cotizador' || pathname?.endsWith('/ia')) return null;
  const project = pathname?.match(/^\/proyectos\/([^/]+)(?:\/|$)/)?.[1];
  return (
    <Link href={project ? `/proyectos/${project}/ia` : '/cotizador'}
      aria-label="Abrir ObraBot" className="obrabot-launcher fixed z-40 inline-flex items-center gap-2 rounded-xl border border-[#FF6A00] bg-[#1E1E1E] px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/20 hover:bg-[#2A2A2A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF6A00] print:hidden">
      <Sparkles aria-hidden="true" className="h-4 w-4 text-[#FF6A00]" />
      <span>ObraBot</span>
    </Link>
  );
}
