'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

const TOAST_EVENT = 'obratrack_toast';

function inferToastTone(message: string): ToastTone {
  const normalized = (message || '').toLowerCase();
  if (
    normalized.includes('⚠️') ||
    normalized.includes('❌') ||
    /\berror\b|no se pudo|no pudo|no hay|inválid|invalid|rechaz|falló|pendiente de sincronización/.test(
      normalized,
    )
  ) {
    return normalized.includes('pendiente') ? 'warning' : 'error';
  }
  if (/pendiente|aviso|atención|alerta/.test(normalized)) {
    return 'warning';
  }
  return 'success';
}

export function toast(message: string, tone?: ToastTone): void {
  if (typeof window === 'undefined' || !message) return;
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, {
      detail: { message, tone: tone || inferToastTone(message) },
    }),
  );
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: (message, tone) => toast(message, tone),
});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback((message: string, tone?: ToastTone) => {
    const clean = message.trim();
    if (!clean) return;
    const resolvedTone = tone || inferToastTone(clean);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev.slice(-3), { id, message: clean, tone: resolvedTone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 3800);
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; tone?: ToastTone }>).detail;
      if (detail?.message) {
        pushToast(detail.message, detail.tone);
      }
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, [pushToast]);

  return (
    <ToastContext.Provider value={{ showToast: pushToast }}>
      {children}
      {items.length > 0 && (
        <div
          aria-live="polite"
          className="fixed top-[4.5rem] md:top-4 right-3 left-3 sm:left-auto sm:right-4 sm:w-96 z-[95] pointer-events-none flex flex-col gap-2 print:hidden"
        >
          {items.map((item) => {
            const toneStyles: Record<ToastTone, { border: string; icon: React.ReactNode }> = {
              success: {
                border: 'border-emerald-500/40',
                icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
              },
              error: {
                border: 'border-red-500/50',
                icon: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
              },
              warning: {
                border: 'border-amber-500/50',
                icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
              },
              info: {
                border: 'border-[#FF6A00]/50',
                icon: <Info className="w-4 h-4 text-[#FF6A00] shrink-0" />,
              },
            };
            const visual = toneStyles[item.tone];
            return (
              <div
                key={item.id}
                role="status"
                className={`pointer-events-auto bg-[#141A23]/95 backdrop-blur-md text-white border ${visual.border} px-4 py-3 rounded-2xl shadow-2xl flex items-start gap-2.5 text-xs font-semibold animate-fade-in`}
              >
                <span className="mt-0.5">{visual.icon}</span>
                <span className="flex-1 min-w-0 break-words leading-relaxed">{item.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Cerrar notificación"
                  className="text-gray-400 hover:text-white p-0.5 rounded transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}
