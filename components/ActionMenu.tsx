'use client';
import { useEffect, useRef, useId, type ReactNode } from 'react';
import { MoreHorizontal, ChevronDown } from 'lucide-react';
export default function ActionMenu({ label = 'Más acciones', children, above = false, text }: { label?: string; children: ReactNode; above?: boolean; text?: string }) {
  const root = useRef<HTMLDetailsElement>(null);
  const id = useId();
  useEffect(() => {
    const pointer = (event: PointerEvent) => { if (root.current?.open && !root.current.contains(event.target as Node)) root.current.open = false; };
    const click = (event: MouseEvent) => { const target = event.target as HTMLElement; if (root.current?.contains(target) && target.closest('button,a')) root.current.open = false; };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && root.current?.open) { root.current.open = false; root.current.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', pointer); document.addEventListener('click', click); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('click', click); document.removeEventListener('keydown', key); };
  }, []);
  return <details ref={root} className="relative shrink-0 action-menu">
    <summary aria-label={label} aria-controls={id} className="list-none cursor-pointer inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-kraft-200 bg-white px-2 text-gray-600 hover:border-obra-orange focus-visible:outline focus-visible:outline-2 focus-visible:outline-obra-orange dark:bg-[#141A23] dark:border-[#263040] dark:text-gray-200">
      {text ? <><span className="mr-1 text-sm font-semibold">{text}</span><ChevronDown size={16} aria-hidden="true" /></> : <><MoreHorizontal size={18} aria-hidden="true" />{label === 'Cuenta' && <span className="ml-1 text-xs">Cuenta</span>}</>}
    </summary>
    <div id={id} className={`absolute right-0 z-50 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-kraft-200 bg-white p-1.5 text-sm text-navy-900 shadow-lg dark:bg-[#141A23] dark:text-gray-100 dark:border-[#263040] ${above ? 'bottom-full mb-2' : 'top-full mt-2'}`}>{children}</div>
  </details>;
}
