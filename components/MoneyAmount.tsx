'use client';
import { useLayoutEffect, useRef } from 'react';
import { formatCLP } from '@/lib/utils';

/** Mantiene el importe completo en una línea ajustando su tamaño al ancho real. */
export default function MoneyAmount({ value, className = '' }: { value: number; className?: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const amount = formatCLP(value);
  useLayoutEffect(() => {
    const box = root.current, content = text.current;
    if (!box || !content) return;
    const fit = () => {
      const available = box.clientWidth;
      if (!available) return;
      const base = Number.parseFloat(getComputedStyle(box).fontSize);
      content.style.fontSize = `${base}px`;
      const natural = content.scrollWidth;
      content.style.fontSize = `${Math.min(base, base * available / Math.max(1, natural))}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    let active = true;
    void document.fonts.ready.then(() => { if (active) fit(); });
    return () => { active = false; observer.disconnect(); };
  }, [amount]);
  return <span ref={root} className={`money-amount overflow-hidden inline-block w-full min-w-0 max-w-full align-bottom ${className}`}><span ref={text} className="block whitespace-nowrap tabular-nums">{amount}</span></span>;
}
