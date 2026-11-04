'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Send, Maximize2 } from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { requestAI, applyAIResponse } from '@/lib/ai/client';
import { conversationRequest } from '@/lib/ai/conversation';
import { canAccessWeb } from '@/lib/auth/access';
import type { MensajeChatCotizador, Proyecto } from '@/types/database';
import ChatMessageFormatter from './ChatMessageFormatter';
import AIMessageTools from './AIMessageTools';

export default function ObraBotLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Proyecto[]>([]);
  const [projectId, setProjectId] = useState('');
  const [history, setHistory] = useState<MensajeChatCotizador[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState('gratis');
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
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
    setProjectId(id => id && !current.some(project => project.id === id) ? '' : id);
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
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    refresh();
    field.current?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const resize = () => {
      if (!panel.current) return;
      panel.current.style.maxHeight = `${Math.max(160, (viewport?.height || window.innerHeight) - 110)}px`;
      panel.current.style.bottom = `${Math.max(80, window.innerHeight - (viewport?.height || window.innerHeight) - (viewport?.offsetTop || 0) + 80)}px`;
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.documentElement.hasAttribute('data-modal-open')) close(); };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    document.addEventListener('keydown', key);
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); document.removeEventListener('keydown', key); };
  }, [open]);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [history, busy, projectId]);
  useEffect(() => {
    if (!open || !projectId) return;
    let current = true;
    const session = identity.current;
    void dataService.loadProyectoChatFromSupabase(projectId).then(messages => {
      if (!current || identity.current !== session || !messages.length) return;
      const previous = dataService.getChatSessionHistory() || [];
      const merged = new Map(previous.map(message => [message.id,message]));
      for (const message of messages) merged.set(message.id,{...message,obra_contexto_id:projectId,timestamp:new Date(message.created_at).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})});
      const values = Array.from(merged.values());
      const next = [...values.filter(message => message.obra_contexto_id !== projectId),
        ...values.filter(message => message.obra_contexto_id === projectId).sort((a,b) => (a.created_at || '').localeCompare(b.created_at || ''))];
      dataService.saveChatSessionHistory(next); setHistory(next);
    });
    return () => { current = false; };
  }, [open,projectId]);
  const append = (message: MensajeChatCotizador) => {
    message = { ...message, created_at: new Date().toISOString() };
    const current = dataService.getChatSessionHistory() || [];
    const next = [...current, message];
    dataService.saveChatSessionHistory(next);
    const user = dataService.getActiveUser();
    if (message.obra_contexto_id && user?.empresa_id) dataService.saveProyectoMensajeChat({ ...message, proyecto_id:message.obra_contexto_id, empresa_id:user.empresa_id, created_at:new Date().toISOString() });
    setHistory(next);
  };
  const send = async () => {
    if (!input.trim() || busy || !['pro','pro_ia'].includes(plan)) return;
    const scope = projectId;
    const message = input.trim();
    const session = identity.current;
    const context = history.filter(item => (item.obra_contexto_id || '') === scope);
    const timestamp = () => new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    append({ id: crypto.randomUUID(), remitente: 'usuario', texto: message, obra_contexto_id: scope || undefined, timestamp: timestamp() });
    setInput(''); setBusy(true);
    try {
      const result = await requestAI(scope ? `/api/proyectos/${scope}/chat` : '/api/cotizador/chat', {
        mensaje: message, historial: conversationRequest(context, message), contexto_cotizacion: [...context].reverse().find(item => item.cotizacion_generada)?.cotizacion_generada,
      });
      const user = dataService.getActiveUser();
      if (`${user?.id}:${user?.empresa_id}` !== session) return;
      const processed = await applyAIResponse(result, scope || undefined);
      append({ id: crypto.randomUUID(), remitente: 'agente', ...processed, obra_contexto_id: scope || undefined, timestamp: timestamp() });
    } catch (error) {
      const user = dataService.getActiveUser();
      if (`${user?.id}:${user?.empresa_id}` === session) append({ id: crypto.randomUUID(), remitente: 'agente', texto: (error as Error).message, obra_contexto_id: scope || undefined, timestamp: timestamp() });
    } finally { setBusy(false); }
  };
  if (!ready || fullPage) return null;
  const messages = history.filter(item => (item.obra_contexto_id || '') === projectId);
  return <>
    <button ref={trigger} type="button" aria-label="Abrir ObraBot" aria-expanded={open} aria-controls="obrabot-widget" onClick={() => setOpen(value => !value)}
      className="obrabot-launcher fixed z-40 inline-flex items-center gap-2 rounded-xl border border-[#FF6A00] bg-[#1E1E1E] px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[#2A2A2A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF6A00] print:hidden">
      <Sparkles aria-hidden="true" className="h-4 w-4 text-[#FF6A00]" /><span>ObraBot</span>
    </button>
    {open && createPortal(<section ref={panel} id="obrabot-widget" role="dialog" aria-label="Chat con ObraBot" aria-modal="false"
      className="fixed bottom-20 right-3 left-3 sm:left-auto sm:right-5 z-[45] flex h-[34rem] max-h-[calc(100dvh-7rem)] sm:w-[390px] flex-col overflow-hidden rounded-2xl border border-[#FF6A00]/30 bg-[var(--bg-page)] text-[var(--text-primary)] shadow-2xl print:hidden">
      <header className="flex items-center gap-2 border-b border-gray-200/30 px-4 py-3">
        <Sparkles className="h-4 w-4 text-obra-orange" /><h2 className="flex-1 text-sm font-bold">ObraBot</h2>
        <Link href={projectId ? `/proyectos/${projectId}/ia` : '/cotizador'} aria-label="Abrir chat completo" className="rounded-lg p-1.5 hover:bg-gray-500/10"><Maximize2 className="h-4 w-4" /></Link>
        <button type="button" onClick={close} aria-label="Cerrar chat" className="rounded-lg p-1.5 hover:bg-gray-500/10"><X className="h-4 w-4" /></button>
      </header>
      <div className="px-3 py-2"><label htmlFor="obrabot-project" className="sr-only">Obra de la conversación</label>
        <select id="obrabot-project" value={projectId} disabled={busy} onChange={event => setProjectId(event.target.value)} className="w-full rounded-lg border border-gray-300/40 bg-transparent px-2 py-1.5 text-xs">
          <option value="">Consulta general</option>{projects.map(project => <option key={project.id} value={project.id}>{project.nombre}</option>)}
        </select>
      </div>
      <div ref={feed} role="log" aria-label="Conversación" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-2 text-sm">
        {!messages.length && <p className="p-2 text-gray-500">¿Qué necesitas gestionar en tu obra?</p>}
        {messages.map(item => <article key={item.id} className={`rounded-xl p-3 ${item.remitente === 'usuario' ? 'ml-5 bg-[#FF6A00]/10' : 'mr-2 border border-gray-300/30'}`}>
          <ChatMessageFormatter content={item.texto} /><AIMessageTools message={item} />
        </article>)}
        {busy && <p role="status" className="text-xs text-gray-500">ObraBot está respondiendo…</p>}
      </div>
      {['pro','pro_ia'].includes(plan) ? <form onSubmit={event => { event.preventDefault(); void send(); }} className="flex items-end gap-2 border-t border-gray-300/30 p-3">
        <label htmlFor="obrabot-message" className="sr-only">Mensaje a ObraBot</label>
        <textarea ref={field} id="obrabot-message" value={input} onChange={event => setInput(event.target.value)} rows={2} maxLength={6000} placeholder="Escribe tu solicitud…"
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}
          className="min-w-0 flex-1 resize-none rounded-xl border border-gray-300/40 bg-transparent p-2 text-sm focus:border-obra-orange focus:outline-none" />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar mensaje" className="rounded-xl bg-obra-orange p-2.5 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </form> : <p className="border-t border-gray-300/30 p-3 text-xs">Disponible con Pro o Pro IA. <Link className="text-obra-orange underline" href="/planes">Ver planes</Link></p>}
    </section>, document.body)}
  </>;
}
