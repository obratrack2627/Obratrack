'use client';

import { ObraBotQuoteReviews } from '@/components/ObraBotQuoteReviews';
import { conversationRequest } from '@/lib/ai/conversation';
import React, { useState, useEffect, useRef } from 'react';
import { Bot, RotateCcw } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { toast } from '@/components/ToastProvider';
import { dataService } from '@/lib/data-service';
import {
  MensajeChatCotizador,
  Proyecto,
  SubscriptionPlanId,
} from '@/types/database';
import PlanLockOverlay from '@/components/PlanLockOverlay';
import { CloudChatHistory } from '@/lib/ai/cloud-chat-history';
import { aiContext, aiHeaders, requestAIStream, applyAIResponse } from '@/lib/ai/client';
import ObraBotWhatsAppLink from '@/components/ObraBotWhatsAppLink';
import {
  ObraBotComposer,
  ObraBotMessageBubble,
  ObraBotQualityBadge,
  ObraBotStreamingBubble,
  fileToChatImage,
  submitQuoteAttachmentWeb,
} from '@/components/ObraBotChatShared';

const INITIAL_CHAT_MESSAGE: MensajeChatCotizador = {
  id: 'm-init',
  remitente: 'agente',
  texto:
    'Hola, soy ObraBot. Puedo preparar presupuestos, editar cotizaciones y ayudarte a gestionar obras, agenda, materiales, pagos y cuadrillas. ¿Qué necesitas?',
  timestamp: '',
  sugerencias: [
    'Quiero cotizar un trabajo',
    'Quiero buscar el precio de un material',
    'Ayúdame a planificar mi obra',
  ],
};

export default function CopilotoObreroPage() {
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('gratis');

  const [mensajesChat, setMensajesChat] = useState<MensajeChatCotizador[]>([INITIAL_CHAT_MESSAGE]);
  const [inputChat, setInputChat] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [obraSeleccionada, setObraSeleccionada] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [streamStage, setStreamStage] = useState('');
  const [streamText, setStreamText] = useState('');
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<'synced' | 'pending'>('pending');
  const cloudHistory = useRef<CloudChatHistory | null>(null);

  const persistHistory = (rows: MensajeChatCotizador[]) => {
    dataService.saveChatSessionHistory(rows);
    void cloudHistory.current?.sync();
  };

  const feedback = (kind: 'action_cancelled' | 'execution_failure') => {
    void aiHeaders()
      .then((headers) =>
        fetch('/api/ia/quality', {
          method: 'POST',
          headers,
          body: JSON.stringify({ kind }),
          signal: AbortSignal.timeout(3000),
        }),
      )
      .catch(() => undefined);
  };

  const reloadData = () => {
    const current = dataService.getProyectos();
    setProyectos(current);
    setObraSeleccionada((selected) => (selected && !current.some((p) => p.id === selected) ? '' : selected));
  };

  useEffect(() => {
    reloadData();
    const savedPlan = dataService.getActivePlan();
    if (savedPlan) setActivePlan(savedPlan);
    const planHandler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    const syncHandler = () => {
      setActivePlan(dataService.getActivePlan());
      reloadData();
    };
    window.addEventListener('obratrack_plan_changed', planHandler);
    window.addEventListener('obratrack_cloud_synced', syncHandler);

    const savedChat = dataService.getChatSessionHistory();
    if (savedChat && Array.isArray(savedChat) && savedChat.length > 0) {
      setMensajesChat(
        savedChat.map((m) =>
          m.id?.startsWith('m-init')
            ? { ...m, texto: INITIAL_CHAT_MESSAGE.texto, sugerencias: INITIAL_CHAT_MESSAGE.sugerencias }
            : m,
        ),
      );
    } else {
      setMensajesChat([
        {
          ...INITIAL_CHAT_MESSAGE,
          timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }

    const actor = dataService.getActiveUser();
    let alive = true;
    const owner = actor?.empresa_id && actor.id ? JSON.stringify([actor.empresa_id, actor.id]) : null;
    const active = () => {
      const current = dataService.getActiveUser();
      return alive && !!owner && JSON.stringify([current?.empresa_id, current?.id]) === owner;
    };
    const cloud = owner
      ? new CloudChatHistory({
          active,
          read: () => dataService.getChatSessionHistory() || [],
          write: (rows, state) => {
            if (active()) {
              dataService.saveChatSessionHistory(rows, state);
              setMensajesChat(rows.length ? rows : [INITIAL_CHAT_MESSAGE]);
            }
          },
          readCache: () => dataService.getChatSessionSyncState(),
          writeCache: (cache) => {
            if (active()) dataService.setChatSessionSyncState(cache);
          },
          status: (state) => {
            if (active()) setHistoryStatus(state);
          },
          request: async (method, body) => {
            if (!active()) throw Error('CHAT_ACCOUNT_CHANGED');
            const headers = await aiHeaders();
            if (!active()) throw Error('CHAT_ACCOUNT_CHANGED');
            const url =
              '/api/cotizador/historial' +
              (method === 'GET' && body ? '?' + new URLSearchParams(body).toString() : '');
            const response = await fetch(url, {
              method,
              headers,
              ...(body && method === 'POST' ? { body: JSON.stringify(body) } : {}),
              signal: AbortSignal.timeout(15000),
            });
            const data = await response.json();
            if (!response.ok) throw Error('CHAT_SYNC');
            if (method === 'GET' && !body && active()) setHistoryHasMore(data.has_more === true);
            return data;
          },
        })
      : null;
    cloudHistory.current = cloud;
    if (cloud) {
      void cloud
        .initialize()
        .then(() => cloud.sync())
        .finally(() => {
          if (alive) setIsHistoryLoading(false);
        });
    } else {
      setIsHistoryLoading(false);
    }
    const resume = () => {
      void cloud?.sync();
    };
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    try {
      const intent = new URLSearchParams(window.location.search).get('intent');
      if (intent === 'agendar') {
        setInputChat('Agenda una visita técnica mañana a las 10:00 en ');
      }
    } catch {}
    return () => {
      alive = false;
      cloudHistory.current = null;
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('obratrack_plan_changed', planHandler);
      window.removeEventListener('obratrack_cloud_synced', syncHandler);
    };
  }, []);

  // Sincronización en la nube cuando se selecciona una obra específica
  useEffect(() => {
    if (!obraSeleccionada) return;
    let alive = true;
    void dataService.loadProyectoChatFromSupabase(obraSeleccionada).then((synced) => {
      if (!alive || !synced?.length) return;
      const previous = dataService.getChatSessionHistory() || [];
      const merged = new Map(previous.map((msg) => [msg.id, msg]));
      for (const msg of synced) {
        merged.set(msg.id, {
          ...msg,
          obra_contexto_id: obraSeleccionada,
          timestamp: new Date(msg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        });
      }
      const values = Array.from(merged.values());
      const next = [
        ...values.filter((msg) => msg.obra_contexto_id !== obraSeleccionada),
        ...values
          .filter((msg) => msg.obra_contexto_id === obraSeleccionada)
          .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')),
      ];
      dataService.saveChatSessionHistory(next);
      setMensajesChat(next);
    });
    return () => {
      alive = false;
    };
  }, [obraSeleccionada]);

  useEffect(() => {
    const feed = chatBottomRef.current?.parentElement;
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
  }, [mensajesChat, isChatLoading, streamText]);

  const showToast = (msg: string) => {
    toast(msg);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const updateMessage = (id: string, patch: Partial<MensajeChatCotizador>) => {
    setMensajesChat((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
      persistHistory(next);
      return next;
    });
  };

  const handleResetChat = () => {
    if (isChatLoading || isHistoryLoading) return;
    if (mensajesChat.some((m) => m.accion_ejecutada?.tipo === 'solicitar_datos_persona')) feedback('action_cancelled');
    const remaining = mensajesChat.filter((m) => (m.obra_contexto_id || '') !== obraSeleccionada);
    const freshMessage: MensajeChatCotizador = {
      ...INITIAL_CHAT_MESSAGE,
      id: 'm-init-' + Date.now(),
      obra_contexto_id: obraSeleccionada || undefined,
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    };
    setMensajesChat([...remaining, freshMessage]);
    dataService.saveChatSessionHistory([...remaining, freshMessage]);
    if (!obraSeleccionada) void cloudHistory.current?.reset();
    showToast('Conversación reiniciada.');
  };

  const syncProjectTurnToCloud = (msg: MensajeChatCotizador) => {
    const user = dataService.getActiveUser();
    if (msg.obra_contexto_id && user?.empresa_id) {
      dataService.saveProyectoMensajeChat({
        ...msg,
        proyecto_id: msg.obra_contexto_id,
        empresa_id: user.empresa_id,
        created_at: msg.created_at || new Date().toISOString(),
      });
    }
  };

  const handleSendChat = async (texto?: string) => {
    const rawText = (texto ?? inputChat).trim();
    const fileToUse = texto !== undefined ? null : attachedFile;
    if ((!rawText && !fileToUse) || isChatLoading || isHistoryLoading || !['pro', 'pro_ia'].includes(dataService.getActivePlan())) return;

    const displayUserText = fileToUse ? `${rawText ? rawText + '\n' : ''}📎 ${fileToUse.name}` : rawText;
    const nowIso = new Date().toISOString();
    const userMsg: MensajeChatCotizador = {
      id: 'm-u-' + crypto.randomUUID(),
      created_at: nowIso,
      remitente: 'usuario',
      texto: displayUserText,
      obra_contexto_id: obraSeleccionada || undefined,
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...mensajesChat, userMsg];
    setMensajesChat(nextHistory);
    persistHistory(nextHistory);
    syncProjectTurnToCloud(userMsg);

    if (texto === undefined) {
      setInputChat('');
      setAttachedFile(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsChatLoading(true);
    setStreamStage('Conectando con ObraBot…');
    setStreamText('');
    const startedAt = Date.now();

    let executingAction = false;
    try {
      const isDocQuote = fileToUse && (!fileToUse.type.startsWith('image/') || /\bcotiz|presupuest/i.test(rawText));
      if (fileToUse && isDocQuote && !obraSeleccionada) {
        setStreamStage('Leyendo archivo de presupuesto…');
        const quoteRes = await submitQuoteAttachmentWeb(rawText, fileToUse);
        const agentMsg: MensajeChatCotizador = {
          id: 'm-a-' + crypto.randomUUID(),
          created_at: new Date().toISOString(),
          remitente: 'agente',
          texto: quoteRes.respuesta,
          sugerencias: quoteRes.solicitud && quoteRes.revision ? ['Aprobar cotización', 'Cotizaciones pendientes'] : [],
          accion_ejecutada:
            quoteRes.solicitud && quoteRes.revision
              ? {
                  tipo: 'agendar_evento' as any,
                  titulo: 'Cotización lista para revisión',
                  resultado_texto: 'Puedes aprobarla aquí con un clic o revisarla en la bandeja.',
                  detalles: { solicitud_cotizacion: quoteRes.solicitud, revision_cotizacion: quoteRes.revision },
                  link_destino: '/cotizador#cotizaciones-obrabot',
                  link_texto: 'Abrir bandeja de revisión',
                }
              : undefined,
          latencia_ms: Date.now() - startedAt,
          timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        };
        const updated = [...nextHistory, agentMsg];
        setMensajesChat(updated);
        persistHistory(updated);
        return;
      }

      const imagen = fileToUse && fileToUse.type.startsWith('image/') ? await fileToChatImage(fileToUse) : undefined;
      const effectiveMsg = rawText || 'Analiza esta foto de obra e indícame qué observas o cómo registrarla.';
      const ultimaCotizacion = [...mensajesChat]
        .reverse()
        .find((m) => m.cotizacion_generada && (m.obra_contexto_id || '') === obraSeleccionada)?.cotizacion_generada;

      const data = await requestAIStream(
        obraSeleccionada ? `/api/proyectos/${obraSeleccionada}/chat` : '/api/cotizador/chat',
        {
          mensaje: effectiveMsg,
          historial: conversationRequest(
            mensajesChat.filter((m) => (m.obra_contexto_id || '') === obraSeleccionada),
            effectiveMsg,
          ),
          contexto_db: aiContext(),
          contexto_cotizacion: ultimaCotizacion,
          ...(imagen ? { imagen } : {}),
        },
        {
          onStage: (s) => setStreamStage(s),
          onText: (t) => setStreamText(t),
        },
        controller.signal,
      );
      executingAction = !!data.accion;
      const processed = await applyAIResponse(data, obraSeleccionada || undefined, { confirmCritical: true });
      if (processed.pendiente_sincronizacion) feedback('execution_failure');
      executingAction = false;
      reloadData();
      if (processed.accion_ejecutada && processed.accion_ejecutada.tipo !== 'solicitar_datos_persona') {
        showToast(processed.accion_ejecutada.titulo);
      }

      const agentMsg: MensajeChatCotizador = {
        id: 'm-a-' + crypto.randomUUID(),
        created_at: new Date().toISOString(),
        remitente: 'agente',
        ...processed,
        latencia_ms: Date.now() - startedAt,
        obra_contexto_id: obraSeleccionada || undefined,
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      };

      const updatedHistory = [...nextHistory, agentMsg];
      setMensajesChat(updatedHistory);
      persistHistory(updatedHistory);
      syncProjectTurnToCloud(agentMsg);
    } catch (err: any) {
      if (executingAction) feedback('execution_failure');
      const aborted = err?.name === 'AbortError' || controller.signal.aborted;
      const errMsg: MensajeChatCotizador = {
        id: 'm-err-' + crypto.randomUUID(),
        created_at: new Date().toISOString(),
        obra_contexto_id: obraSeleccionada || undefined,
        remitente: 'agente',
        texto: aborted
          ? 'Solicitud detenida.'
          : err?.message || 'No se pudo completar la solicitud. Intenta nuevamente.',
        es_error: !aborted,
        reintentar_texto: !aborted && rawText ? rawText : undefined,
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      };
      const updatedHistory = [...nextHistory, errMsg];
      setMensajesChat(updatedHistory);
      persistHistory(updatedHistory);
    } finally {
      abortRef.current = null;
      setIsChatLoading(false);
      setStreamStage('');
      setStreamText('');
    }
  };

  const handleConfirmCritical = async (messageId: string, rawResponse: Record<string, any>) => {
    setIsChatLoading(true);
    try {
      const processed = await applyAIResponse(rawResponse, obraSeleccionada || undefined, { confirmCritical: false });
      updateMessage(messageId, { ...processed, confirmacion_pendiente: undefined });
      reloadData();
      if (processed.accion_ejecutada) showToast(processed.accion_ejecutada.titulo);
    } catch (err: any) {
      feedback('execution_failure');
      updateMessage(messageId, {
        texto: err?.message || 'No se pudo ejecutar la acción.',
        confirmacion_pendiente: undefined,
        es_error: true,
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleCancelCritical = (messageId: string) => {
    feedback('action_cancelled');
    updateMessage(messageId, {
      texto: 'Acción cancelada. No se realizaron cambios.',
      confirmacion_pendiente: undefined,
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-[calc(100dvh-4rem)] md:min-h-dvh bg-[var(--bg-page)] font-sans">
      <Navbar title="ObraBot" subtitle="Cotizaciones y acciones para gestionar tus obras." />

      <div className="flex-1 flex flex-col p-3 sm:p-4 md:px-6 md:py-4 max-w-[1400px] w-full mx-auto">
        <PlanLockOverlay
          isLocked={!['pro', 'pro_ia'].includes(activePlan)}
          featureName="ObraBot"
          requiredPlan="pro"
          description="Cotiza trabajos, consulta materiales y organiza tu obra desde el chat."
        >
          <div className="flex flex-col gap-3 sm:gap-4">
            <ObraBotQuoteReviews />

            <div className="bg-white dark:bg-[#141A23] border border-kraft-200/90 dark:border-[#263040] rounded-2xl sm:rounded-3xl shadow-md overflow-hidden flex flex-col h-[calc(100dvh-17.5rem)] sm:h-[calc(100dvh-15rem)] md:h-[calc(100dvh-12.5rem)] min-h-[440px] sm:min-h-[560px]">
              <div className="bg-gradient-to-r from-navy-900 via-[#151D2B] to-navy-900 text-white px-4 sm:px-6 py-3.5 sm:py-4 border-b border-navy-700/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-obra-orange to-[#FF8A3D] flex items-center justify-center text-white shadow-md shadow-obra-orange/20 shrink-0">
                    <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-sm sm:text-base text-white flex items-center gap-2">
                      <span>Conversación con ObraBot</span>
                    </h3>
                    <p className="text-[11px] sm:text-xs text-gray-400 truncate">
                      Texto, voz, fotos de obra y archivos PDF/Excel
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <ObraBotQualityBadge />
                  <ObraBotWhatsAppLink activePlan={activePlan} showMissingPhoneHint />
                  <button
                    onClick={handleResetChat}
                    disabled={isChatLoading || isHistoryLoading}
                    title="Iniciar nueva conversación limpia"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-200 hover:text-white border border-white/10 text-[11px] font-bold transition-all shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-obra-orange" />
                    <span className="hidden sm:inline">Nueva Conversación</span>
                  </button>
                </div>
              </div>

              <div className="border-b border-kraft-200/80 dark:border-[#263040] bg-kraft-50/50 dark:bg-[#101620] px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-2.5">
                <label htmlFor="obra-copiloto" className="text-xs font-semibold text-navy-900 dark:text-gray-200">
                  Obra:
                </label>
                <select
                  id="obra-copiloto"
                  value={obraSeleccionada}
                  onChange={(e) => setObraSeleccionada(e.target.value)}
                  disabled={isChatLoading}
                  className="max-w-full rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-navy-900 dark:text-gray-100 px-3 py-1.5 text-xs sm:text-sm focus:border-obra-orange focus:outline-none focus:ring-2 focus:ring-obra-orange/15 transition-all"
                >
                  <option value="">Consulta general o trabajo nuevo</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-[#141A23] border border-kraft-200/80 dark:border-[#263040] px-2.5 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  {obraSeleccionada
                    ? 'Sincronizado con la obra'
                    : isHistoryLoading
                      ? 'Recuperando conversación…'
                      : historyStatus === 'synced'
                        ? 'Historial sincronizado'
                        : 'Guardado local'}
                </span>
              </div>

              {!obraSeleccionada && historyHasMore && (
                <button
                  type="button"
                  className="px-4 sm:px-6 py-2 text-xs font-medium text-obra-orange hover:underline text-left bg-kraft-50/40 dark:bg-[#0B0E14]"
                  onClick={() => {
                    void cloudHistory.current
                      ?.older()
                      .then(setHistoryHasMore)
                      .catch(() => showToast('No se pudieron recuperar los mensajes anteriores.'));
                  }}
                >
                  Ver mensajes anteriores
                </button>
              )}

              <div className="flex-1 min-h-0 px-4 py-5 sm:px-6 sm:py-6 overflow-y-auto space-y-5 bg-kraft-50/40 dark:bg-[#0B0E14] text-xs">
                {(mensajesChat.some((m) => (m.obra_contexto_id || '') === obraSeleccionada)
                  ? mensajesChat.filter((m) => (m.obra_contexto_id || '') === obraSeleccionada)
                  : [INITIAL_CHAT_MESSAGE]
                ).map((m) => (
                  <ObraBotMessageBubble
                    key={m.id}
                    message={m}
                    onSelectSuggestion={(sug) => void handleSendChat(sug)}
                    onRetry={(retryText) => void handleSendChat(retryText)}
                    onConfirmCritical={handleConfirmCritical}
                    onCancelCritical={handleCancelCritical}
                    onFeedbackChange={(id, val) => updateMessage(id, { feedback: val })}
                    onUndone={() => reloadData()}
                  />
                ))}

                {isChatLoading && (
                  <ObraBotStreamingBubble stage={streamStage} partialText={streamText} onStop={handleStop} />
                )}
                <div ref={chatBottomRef} />
              </div>

              <ObraBotComposer
                value={inputChat}
                onChange={setInputChat}
                onSubmit={() => void handleSendChat()}
                onStop={handleStop}
                busy={isChatLoading}
                disabled={isHistoryLoading}
                attachedFile={attachedFile}
                onAttachFile={setAttachedFile}
                placeholder="Describe lo que necesitas, dicta por micrófono o adjunta foto/PDF/Excel…"
              />
            </div>
          </div>
        </PlanLockOverlay>
      </div>
    </div>
  );
}
