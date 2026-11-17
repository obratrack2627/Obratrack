'use client';

import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import MoneyAmount from '@/components/MoneyAmount';
import { MASKED_CLP_AMOUNT } from '@/lib/privacy/mask';
import { formatCLP } from '@/lib/utils';

interface MaskedMoneyAmountProps {
  value: number;
  label: string;
  className?: string;
  compact?: boolean;
  autoHideMs?: number;
}

/**
 * Oculta montos financieros con asteriscos al estilo bancario ($ *******)
 * y permite revelarlos bajo demanda con re-ocultamiento automático.
 */
export default function MaskedMoneyAmount({
  value,
  label,
  className = '',
  compact = false,
  autoHideMs = 30000,
}: MaskedMoneyAmountProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!revealed || autoHideMs <= 0) return;
    const timer = window.setTimeout(() => setRevealed(false), autoHideMs);
    return () => window.clearTimeout(timer);
  }, [revealed, autoHideMs]);

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
        <span
          className="font-mono"
          aria-label={revealed ? `${label}: ${formatCLP(value)}` : `${label} oculto`}
        >
          {revealed ? formatCLP(value) : MASKED_CLP_AMOUNT}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRevealed((prev) => !prev);
          }}
          aria-label={revealed ? `Ocultar ${label}` : `Mostrar ${label}`}
          aria-pressed={revealed}
          title={revealed ? `Ocultar ${label}` : `Mostrar ${label}`}
          className="inline-flex items-center justify-center p-0.5 rounded text-gray-400 hover:text-obra-orange hover:bg-kraft-100 dark:hover:bg-[#1E2633] transition-colors shrink-0"
        >
          {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      </span>
    );
  }

  return (
    <div className={`flex items-center justify-between gap-2 min-w-0 ${className}`}>
      <div className="min-w-0 flex-1 overflow-hidden" style={{ containerType: 'inline-size' }}>
        {revealed ? (
          <MoneyAmount value={value} />
        ) : (
          <span
            className="block whitespace-nowrap font-mono tabular-nums select-none"
            style={{ fontSize: `min(1em, calc((100cqw - 2px) * 1.55 / ${MASKED_CLP_AMOUNT.length}))` }}
            aria-label={`${label} oculto`}
          >
            {MASKED_CLP_AMOUNT}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setRevealed((prev) => !prev)}
        aria-label={revealed ? `Ocultar ${label}` : `Mostrar ${label}`}
        aria-pressed={revealed}
        title={revealed ? `Ocultar ${label}` : `Mostrar ${label}`}
        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-kraft-50/80 dark:bg-[#1E2633] text-gray-500 hover:text-[#FF6A00] transition-colors shrink-0"
      >
        {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
