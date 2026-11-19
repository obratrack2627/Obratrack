'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { aiHeaders } from '@/lib/ai/client';

interface MaskedFieldProps {
  value: string;
  masked: string;
  label: string;
  href?: string;
  external?: boolean;
  actionHref?: string;
  actionLabel?: string;
  actionTitle?: string;
  actionClassName?: string;
  prefix?: string;
  className?: string;
  resourceType?: string;
  resourceId?: string;
  fieldName?: string;
  autoHideMs?: number;
}

/**
 * Muestra PII enmascarada por defecto (ISO/IEC 27002 A.8.11) con botón sutil
 * para revelar bajo demanda y ocultamiento automático tras inactividad.
 */
export default function MaskedField({
  value,
  masked,
  label,
  href,
  external = false,
  actionHref,
  actionLabel,
  actionTitle,
  actionClassName = 'text-emerald-700 dark:text-emerald-400 hover:underline font-sans text-[11px] ml-1',
  prefix,
  className = '',
  resourceType,
  resourceId,
  fieldName,
  autoHideMs = 30000,
}: MaskedFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const auditedOnceRef = useRef(false);

  useEffect(() => {
    if (!revealed || autoHideMs <= 0) return;
    const timer = window.setTimeout(() => setRevealed(false), autoHideMs);
    return () => window.clearTimeout(timer);
  }, [revealed, autoHideMs]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !revealed;
    setRevealed(next);

    if (next && !auditedOnceRef.current && typeof window !== 'undefined' && dataService.getActiveUser()) {
      auditedOnceRef.current = true;
      void aiHeaders()
        .then((headers) =>
          fetch('/api/auditoria/evento', {
            method: 'POST',
            headers,
            keepalive: true,
            body: JSON.stringify({
              event_type: 'privacy.pii_revealed',
              resource_type: resourceType || 'pii',
              resource_id: resourceId || null,
              metadata: { field: fieldName || label },
            }),
          }),
        )
        .catch(() => {});
    }
  };

  const shown = revealed ? value : masked;
  const fullText = prefix ? `${prefix} ${shown}` : shown;

  return (
    <span
      className={`inline-flex items-center gap-1 max-w-full whitespace-nowrap transition-all ${
        revealed
          ? 'rounded-md bg-amber-50/90 dark:bg-amber-950/35 border border-amber-300/60 dark:border-amber-700/50 px-1.5 py-0.5 text-navy-900 dark:text-amber-100'
          : 'text-gray-600 dark:text-gray-300'
      } ${className}`}
    >
      {revealed && href ? (
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          className="font-mono truncate hover:underline"
        >
          {fullText}
        </a>
      ) : (
        <span className="font-mono truncate tracking-tight">{fullText}</span>
      )}
      {revealed && actionHref && actionLabel && (
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          title={actionTitle || actionLabel}
          className={actionClassName}
        >
          {actionLabel}
        </a>
      )}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={revealed ? `Ocultar ${label}` : `Revelar ${label}`}
        aria-pressed={revealed}
        title={revealed ? `Ocultar ${label}` : `Revelar ${label}`}
        className="inline-flex items-center justify-center p-0.5 rounded text-gray-400 hover:text-obra-orange hover:bg-kraft-100 dark:hover:bg-[#1E2633] transition-colors shrink-0"
      >
        {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
    </span>
  );
}
