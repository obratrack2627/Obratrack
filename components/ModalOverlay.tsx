'use client';

import { useEffect, useRef, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

const stack: HTMLDivElement[] = [];
let restorePage: (() => void) | undefined;
const focusable = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Las ventanas se montan fuera de páginas animadas y comparten el bloqueo de scroll. */
export default function ModalOverlay({ children, className = '', onClose, ...props }: HTMLAttributes<HTMLDivElement> & { onClose?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!stack.length) {
      const body = document.body;
      const { scrollX, scrollY } = window;
      const saved = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow, paddingRight: body.style.paddingRight };
      const gap = window.innerWidth - document.documentElement.clientWidth;
      if (gap > 0) body.style.paddingRight = `${Number.parseFloat(getComputedStyle(body).paddingRight) + gap}px`;
      Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, left: `-${scrollX}px`, width: '100%', overflow: 'hidden' });
      document.documentElement.dataset.modalOpen = 'true';
      restorePage = () => {
        Object.assign(body.style, saved);
        delete document.documentElement.dataset.modalOpen;
        window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
      };
    }
    stack.push(element);
    const viewport = window.visualViewport;
    const resize = () => {
      element.style.setProperty('--modal-viewport-height', `${viewport?.height || window.innerHeight}px`);
      element.style.setProperty('--modal-viewport-top', `${viewport?.offsetTop || 0}px`);
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    const closeButton = element.querySelector('svg.lucide-x')?.closest('button');
    if (closeButton && !closeButton.getAttribute('aria-label') && !closeButton.textContent?.trim()) closeButton.setAttribute('aria-label', 'Cerrar ventana');
    if (!element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby')) {
      const heading = element.querySelector('h1,h2,h3');
      element.setAttribute('aria-label', heading?.textContent?.trim() || 'Ventana de ObraTrack');
    }
    element.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== element) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (close.current) close.current();
        else closeButton?.click();
      }
      if (event.key === 'Tab') {
        const items = Array.from(element.querySelectorAll<HTMLElement>(focusable)).filter((item) => item.getClientRects().length && item.tabIndex >= 0);
        const first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); element.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
      document.removeEventListener('keydown', keydown);
      const index = stack.indexOf(element);
      if (index >= 0) stack.splice(index, 1);
      if (!stack.length) { restorePage?.(); restorePage = undefined; }
      previousFocus?.isConnected && previousFocus.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div {...props} ref={root} role={props.role || 'dialog'} aria-modal="true" tabIndex={-1}
      data-modal-layout={className.includes('flex-col') ? 'fullscreen' : 'dialog'}
      className={`app-modal-overlay ${className}`}>
      {children}
    </div>, document.body,
  );
}
