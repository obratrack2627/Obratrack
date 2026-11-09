'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
export default function CompactSummary({ children, title = 'Ver resumen' }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const change = () => setOpen(media.matches);
    change(); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="compact-summary group">
    <summary className="md:hidden flex cursor-pointer list-none items-center justify-between rounded-xl border border-kraft-200 bg-white px-3 py-3 text-sm font-semibold text-navy-900 dark:bg-[#141A23] dark:border-[#263040] dark:text-gray-100">
      {title}<ChevronDown size={16} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
    </summary>
    <div className="pt-3 md:pt-0">{children}</div>
  </details>;
}
