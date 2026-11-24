'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Maximize2 } from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { requestAIStream, applyAIResponse } from '@/lib/ai/client';
import { conversationRequest } from '@/lib/ai/conversation';
import { canAccessWeb } from '@/lib/auth/access';
import type { MensajeChatCotizador, Proyecto } from '@/types/database';
import {
  ObraBotComposer,
  ObraBotMessageBubble,
  ObraBotStreamingBubble,
  fileToChatImage,
  submitQuoteAttachmentWeb,
} from './ObraBotChatShared';

export default function ObraBotLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Proyecto[]>([]);
  const [projectId, setProjectId] = useState('');
  const [history, setHistory] = useState<MensajeChatCotizador[]>([]);
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [streamStage, setStreamStage] = useState('');
  const [streamText, setStreamText] = useState('');
  const [plan, setPlan] = useState('gratis');
  const abortRef = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const identity = useRef('');
  const fullPage = pathname === '/cotizador' || pathname?.endsWith('/ia');

  const refresh = () => {
    const user = dataService.getActiveUser();
    setReady(canAccessWeb(user));
    identity.current = `${user?.id}:${user?.empresa_id}`;
    const current = dataService.getProyectos();
    setProjects(current);
    setPlan(dataService.getActivePlan());
    setHistory(dataService.getChatSessionHistory() || []);
    setProjectId((id) => (id && !current.some((project) => project.id === id) ? '' : id));
  };

  useEffect(() => {
    refresh();
    window.addEventListener('obratrack_cloud_synced', refresh);
    window.addEventListener('obratrack_plan_changed', refresh);
    return () => {
      window.removeEventListener('obratrack_cloud_synced', refresh);
      window.removeEventListener('obratrack_plan_changed', refresh);
    };
  }, []);

  useEffect(() => {
    setProjectId(pathname?.match(/^\/proyectos\/([^/]+)(?:\/|$)/)?.[1] || '');
    if (fullPage) setOpen(false);
  }, [pathname, fullPage]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    const viewport = window.visualViewport;
    const resize = () => {
      if (!panel.current) return;
      panel.current.style.maxHeight = `${Math.max(160, (viewport?.height || window.innerHeight) - 110)}px`;
      panel.current.style.bottom = `${Math.max(80, window.innerHeight - (viewport?.height || window.innerHeight) - (viewport?.offsetTop || 0) + 80)}px`;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.documentElement.hasAttribute('data-modal-open')) close();
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    document.addEventListener('keydown', key);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' });
  }, [history, busy, streamText, projectId]);

  useEffect(() => {
    if (!open || !projectId) return;
    let current = true;
    const session = identity.current;
    void dataService.loadProyectoChatFromSupabase(projectId).then((messages) => {
      if (!current || identity.current !== session || !messages.length) return;
      const previous = dataService.getChatSessionHistory() || [];
      const merged = new Map(previous.map((message) => [message.id, message]));
      for (const message of messages) {
        merged.set(message.id, {
          ...message,
          obra_contexto_id: projectId,
          timestamp: new Date(message.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        });
      }
      const values = Array.from(merged.values());
      const next = [
        ...values.filter((message) => message.obra_contexto_id !== projectId),
        ...values.filter((message) => message.obra_contexto_id === projectId).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')),
      ];
      dataService.saveChatSessionHistory(next);
      setHistory(next);
    });
    return () => {
      current = false;
    };
  }, [open, projectId]);

  const append = (message: MensajeChatCotizador) => {
    message = { ...message, created_at: new Date().toISOString() };
    const current = dataService.getChatSessionHistory() || [];
    const next = [...current, message];
    dataService.saveChatSessionHistory(next);
    const user = dataService.getActiveUser();
    if (message.obra_contexto_id && user?.empresa_id) {
      dataService.saveProyectoMensajeChat({
        ...message,
        proyecto_id: message.obra_contexto_id,
        empresa_id: user.empresa_id,
        created_at: new Date().toISOString(),
      });
    }
    setHistory(next);
  };

  const updateMessage = (id: string, patch: Partial<MensajeChatCotizador>) => {
    const current = dataService.getChatSessionHistory() || [];
    const next = current.map((m) => (m.id === id ? { ...m, ...patch } : m));
    dataService.saveChatSessionHistory(next);
    setHistory(next);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const send = async (overrideText?: string) => {
    const rawText = (overrideText ?? input).trim();
    const fileToUse = overrideText ? null : attachedFile;
    if ((!rawText && !fileToUse) || busy || !['pro', 'pro_ia'].includes(plan)) return;

    const scope = projectId;
    const displayUserText = fileToUse ? `${rawText ? rawText + '\n' : ''}📎 ${fileToUse.name}` : rawText;
    const session = identity.current;
    const context = history.filter((item) => (item.obra_contexto_id || '') === scope);
    const timestamp = () => new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    append({ id: crypto.randomUUID(), remitente: 'usuario', texto: displayUserText, obra_contexto_id: scope || undefined, timestamp: timestamp() });
    if (!overrideText) {
      setInput('');
      setAttachedFile(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStreamStage('Conectando con ObraBot…');
    setStreamText('');
    const startedAt = Date.now();

    try {
      const isDocQuote = fileToUse && (!fileToUse.type.startsWith('image/') || /\bcotiz|presupuest/i.test(rawText));
      if (fileToUse && isDocQuote && !scope) {
        setStreamStage('Leyendo archivo de presupuesto…');
        const quoteRes = await submitQuoteAttachmentWeb(rawText, fileToUse);
        if (`${dataService.getActiveUser()?.id}:${dataService.getActiveUser()?.empresa_id}` !== session) return;
        append({
          id: crypto.randomUUID(),
          remitente: 'agente',
          texto: quoteRes.respuesta,
          sugerencias: quoteRes.solicitud && quoteRes.revision ? ['Aprobar cotización', 'Cotizaciones pendientes'] : [],
          accion_ejecutada: quoteRes.solicitud && quoteRes.revision
            ? {
                tipo: 'agendar_evento' as any,
                titulo: 'Cotización lista para revisión',
                resultado_texto: 'Puedes aprobarla aquí o abrir la bandeja del Cotizador.',
                detalles: { solicitud_cotizacion: quoteRes.solicitud, revision_cotizacion: quoteRes.revision },
                link_destino: '/cotizador#cotizaciones-obrabot',
                link_texto: 'Abrir bandeja',
              }
            : undefined,
          latencia_ms: Date.now() - startedAt,
          obra_contexto_id: undefined,
          timestamp: timestamp(),
        });
        return;
      }

      const imagen = fileToUse && fileToUse.type.startsWith('image/') ? await fileToChatImage(fileToUse) : undefined;
      const effectiveMessage = rawText || 'Analiza esta foto de obra e indícame qué observas o cómo registrarla.';

      const result = await requestAIStream(
        scope ? `/api/proyectos/${scope}/chat` : '/api/cotizador/chat',
        {
          mensaje: effectiveMessage,
          historial: conversationRequest(context, effectiveMessage),
          contexto_cotizacion: [...context].reverse().find((item) => item.cotizacion_generada)?.cotizacion_generada,
          ...(imagen ? { imagen } : {}),
        },
        {
          onStage: (s) => setStreamStage(s),
          onText: (t) => setStreamText(t),
        },
        controller.signal,
      );
      const user = dataService.getActiveUser();
      if (`${user?.id}:${user?.empresa_id}` !== session) return;
      const processed = await applyAIResponse(result, scope || undefined, { confirmCritical: true });
      append({
        id: crypto.randomUUID(),
        remitente: 'agente',
        ...processed,
        latencia_ms: Date.now() - startedAt,
        obra_contexto_id: scope || undefined,
        timestamp: timestamp(),
      });
    } catch (error: any) {
      const user = dataService.getActiveUser();
      if (`${user?.id}:${user?.empresa_id}` !== session) return;
      const aborted = error?.name === 'AbortError' || controller.signal.aborted;
      append({
        id: crypto.randomUUID(),
        remitente: 'agente',
        texto: aborted ? 'Solicitud detenida.' : (error as Error).message || 'No se pudo completar la solicitud.',
        es_error: !aborted,
        reintentar_texto: !aborted && rawText ? rawText : undefined,
        obra_contexto_id: scope || undefined,
        timestamp: timestamp(),
      });
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStreamStage('');
      setStreamText('');
    }
  };

  const handleConfirmCritical = async (messageId: string, rawResponse: Record<string, any>) => {
    setBusy(true);
    try {
      const processed = await applyAIResponse(rawResponse, projectId || undefined, { confirmCritical: false });
      updateMessage(messageId, { ...processed, confirmacion_pendiente: undefined });
      refresh();
    } catch (err: any) {
      updateMessage(messageId, {
        texto: err?.message || 'No se pudo ejecutar la acción.',
        confirmacion_pendiente: undefined,
        es_error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelCritical = (messageId: string) => {
    updateMessage(messageId, {
      texto: 'Acción cancelada. No se realizaron cambios.',
      confirmacion_pendiente: undefined,
    });
  };

  if (!ready || fullPage) return null;
  const messages = history.filter((item) => (item.obra_contexto_id || '') === projectId);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Abrir ObraBot"
        aria-expanded={open}
        aria-controls="obrabot-widget"
        onClick={() => setOpen((value) => !value)}
        className="obrabot-launcher fixed z-40 inline-flex items-center gap-2 rounded-xl border border-[#FF6A00] bg-[#1E1E1E] px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[#2A2A2A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF6A00] print:hidden"
      >
        <Sparkles aria-hidden="true" className="h-4 w-4 text-[#FF6A00]" />
        <span>ObraBot</span>
      </button>
      {open &&
        createPortal(
          <section
            ref={panel}
            id="obrabot-widget"
            role="dialog"
            aria-label="Chat con ObraBot"
            aria-modal="false"
            className="fixed bottom-20 right-3 left-3 sm:left-auto sm:right-5 z-[45] flex h-[36rem] max-h-[calc(100dvh-7rem)] sm:w-[410px] flex-col overflow-hidden rounded-2xl border border-[#FF6A00]/30 bg-[var(--bg-page)] text-[var(--text-primary)] shadow-2xl print:hidden"
          >
            <header className="flex items-center gap-2 border-b border-kraft-200 dark:border-[#263040] bg-navy-900 text-white px-4 py-3">
              <Sparkles className="h-4 w-4 text-obra-orange" />
              <h2 className="flex-1 text-sm font-bold">ObraBot</h2>
              <Link
                href={projectId ? `/proyectos/${projectId}/ia` : '/cotizador'}
                aria-label="Abrir chat completo"
                className="rounded-lg p-1.5 hover:bg-white/10"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
              <button type="button" onClick={close} aria-label="Cerrar chat" className="rounded-lg p-1.5 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="px-3 py-2 border-b border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23]">
              <label htmlFor="obrabot-project" className="sr-only">
                Obra de la conversación
              </label>
              <select
                id="obrabot-project"
                value={projectId}
                disabled={busy}
                onChange={(event) => setProjectId(event.target.value)}
                className="w-full rounded-lg border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0F141C] px-2.5 py-1.5 text-xs text-navy-900 dark:text-gray-100"
              >
                <option value="">Consulta general o cotización nueva</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div
              ref={feed}
              role="log"
              aria-label="Conversación"
              aria-live="polite"
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-kraft-50/40 dark:bg-[#0B0E14] px-3 py-3 text-xs"
            >
              {!messages.length && (
                <p className="p-2 text-gray-500 dark:text-gray-400">
                  ¿Qué necesitas cotizar o gestionar hoy en tu obra? Puedes escribir, dictar por voz o adjuntar una foto/PDF/Excel.
                </p>
              )}
              {messages.map((item) => (
                <ObraBotMessageBubble
                  key={item.id}
                  message={item}
                  compact
                  onSelectSuggestion={(sug) => void send(sug)}
                  onRetry={(retryText) => void send(retryText)}
                  onConfirmCritical={handleConfirmCritical}
                  onCancelCritical={handleCancelCritical}
                  onFeedbackChange={(id, val) => updateMessage(id, { feedback: val })}
                  onUndone={() => refresh()}
                />
              ))}
              {busy && <ObraBotStreamingBubble stage={streamStage} partialText={streamText} onStop={handleStop} />}
            </div>
            {['pro', 'pro_ia'].includes(plan) ? (
              <ObraBotComposer
                value={input}
                onChange={setInput}
                onSubmit={() => void send()}
                onStop={handleStop}
                busy={busy}
                compact
                attachedFile={attachedFile}
                onAttachFile={setAttachedFile}
                inputAriaLabel="Mensaje a ObraBot"
                submitAriaLabel="Enviar mensaje"
                placeholder="Escribe, dicta o adjunta…"
              />
            ) : (
              <p className="border-t border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-3 text-xs">
                Disponible con Pro o Pro IA.{' '}
                <Link className="text-obra-orange underline" href="/planes">
                  Ver planes
                </Link>
              </p>
            )}
          </section>,
          document.body,
        )}
    </>
  );
}
