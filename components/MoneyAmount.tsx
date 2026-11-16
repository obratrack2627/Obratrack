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
      // Keep a pixel for fractional glyph metrics and remeasure after rounding.
      let size=base;
      for(let attempt=0;attempt<4 && content.scrollWidth>available;attempt++){
        size*=Math.max(1,available-1)/Math.max(1,content.scrollWidth);
        content.style.fontSize=`${size}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    let active = true;
    void document.fonts.ready.then(() => { if (active) fit(); });
    document.fonts.addEventListener('loadingdone',fit);
    return () => { active = false; observer.disconnect();document.fonts.removeEventListener('loadingdone',fit); };
  }, [amount]);
  return <span ref={root} className={`money-amount overflow-hidden inline-block w-full min-w-0 max-w-full align-bottom ${className}`}><span ref={text} className="block whitespace-nowrap tabular-nums">{amount}</span></span>;
}
