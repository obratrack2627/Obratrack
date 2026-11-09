'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import type { ProjectStatus } from '@/types/database';
import { projectStatuses, projectStatusLabel } from '@/lib/project-status';

const colors: Record<ProjectStatus, string> = {
  activo: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800',
  terminado: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
  cancelada: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  pendiente: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
  pausado: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800',
};
const badge = 'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold font-mono uppercase leading-none';

export function ProjectStatusBadge({ estado }: { estado: ProjectStatus }) {
  return <span data-project-status={estado} className={`${badge} ${colors[estado]}`}>{projectStatusLabel(estado)}</span>;
}

export function ProjectStatusSelect({ estado, busy, onChange }: { estado: ProjectStatus; busy: boolean; onChange: (value: ProjectStatus) => void }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [menuLeft, setMenuLeft] = useState(0);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', dismiss); };
  }, [open]);
  const show = () => { setMenuLeft(Math.min(0, window.innerWidth - (root.current?.getBoundingClientRect().left || 0) - 188)); setActive(Math.max(0, projectStatuses.findIndex(item => item.value === estado))); setOpen(true); };
  const choose = (value: ProjectStatus) => { setOpen(false); if (value !== estado) onChange(value); };
  return <div ref={root} className="relative inline-flex shrink-0">
    <button type="button" role="combobox" aria-label="Estado de la obra" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={busy}
      onClick={() => open ? setOpen(false) : show()}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') { setOpen(false); return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          if (!open) { show(); return; }
          setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? projectStatuses.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + projectStatuses.length) % projectStatuses.length);
        } else if (open && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); choose(projectStatuses[active].value); }
      }}
      data-project-status={estado}
      className={`${badge} ${colors[estado]} min-h-8 px-2.5 gap-2 shadow-sm hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obra-orange disabled:opacity-60 disabled:cursor-wait transition-colors`}>
      {projectStatusLabel(estado)}{busy ? <Loader2 aria-hidden="true" size={12} className="animate-spin" /> : <ChevronDown aria-hidden="true" size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
    </button>
    {open && <div id={id} role="listbox" aria-label="Estados de la obra" style={{ left: menuLeft }} className="absolute top-full z-50 mt-2 w-44 rounded-xl border border-kraft-200 bg-white p-1.5 shadow-lg dark:border-[#263040] dark:bg-[#141A23]">
      {projectStatuses.map((item, index) => <button type="button" role="option" tabIndex={-1} aria-selected={estado === item.value} id={`${id}-${index}`} key={item.value} onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(item.value)}
        className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left ${active === index ? 'bg-kraft-50 dark:bg-[#1E2530]' : ''}`}>
        <ProjectStatusBadge estado={item.value} />{estado === item.value && <Check size={14} aria-hidden="true" className="text-gray-500 dark:text-gray-300" />}
      </button>)}
    </div>}
  </div>;
}
