'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bot,
  Check,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  MessageCircle,
  Mic,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Undo2,
  User,
  X,
} from 'lucide-react';
import ChatMessageFormatter from './ChatMessageFormatter';
import AIMessageTools from './AIMessageTools';
import { quoteIntroText } from '@/lib/ai/quote-format';
import { aiHeaders, downloadProtectedFile } from '@/lib/ai/client';
import { canUndoAIWrite, undoAIWrite } from '@/lib/ai/execute';
import { toast } from './ToastProvider';
import type { AccionAsistenteIA, CotizacionEstimacion } from '@/types/database';

export interface SharedChatMessage {
  id: string;
  remitente: 'usuario' | 'agente';
  texto: string;
  timestamp?: string;
  created_at?: string;
  sugerencias?: string[];
  accion_ejecutada?: AccionAsistenteIA;
  cotizacion_generada?: CotizacionEstimacion;
  comparacion_materiales?: import('@/lib/materials/types').ComparacionMateriales;
  pendiente_sincronizacion?: string;
  job_id?: string;
  latencia_ms?: number;
  feedback?: 'up' | 'down';
  es_error?: boolean;
  reintentar_texto?: string;
  confirmacion_pendiente?: { resumen: string; rawResponse: Record<string, any> };
}

export async function fileToChatImage(file: File): Promise<{ mimeType: string; data: string }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('La imagen debe ser JPG, PNG o WebP.');
  }
  if (file.size > 3000000) {
    throw new Error('La imagen debe pesar hasta 3 MB.');
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { mimeType: file.type, data: btoa(binary) };
}

export async function submitQuoteAttachmentWeb(message: string, file: File) {
  const headers = await aiHeaders();
  const form = new FormData();
  form.set('mensaje', message.trim() ? `Nueva cotización: ${message.trim().slice(0, 120)}` : `Nueva cotización: ${file.name.replace(/\.[^.]+$/, '').slice(0, 120)}`);
  form.set('solicitud', crypto.randomUUID());
  form.set('archivo', file);
  const res = await fetch('/api/obrabot/cotizaciones', {
    method: 'POST',
    headers: { Authorization: headers.Authorization },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || 'No se pudo procesar el archivo del presupuesto.');
  }
  return data as { respuesta: string; solicitud?: string; revision?: number; archivo?: { id: string; formato: 'pdf' | 'excel' } };
}

export function ObraBotMessageBubble({
  message,
  compact = false,
  onSelectSuggestion,
  onRetry,
  onConfirmCritical,
  onCancelCritical,
  onFeedbackChange,
  onUndone,
}: {
  message: SharedChatMessage;
  compact?: boolean;
  onSelectSuggestion?: (text: string) => void;
  onRetry?: (text: string) => void;
  onConfirmCritical?: (messageId: string, rawResponse: Record<string, any>) => void;
  onCancelCritical?: (messageId: string) => void;
  onFeedbackChange?: (messageId: string, value: 'up' | 'down') => void;
  onUndone?: (messageId: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);

  const isUser = message.remitente === 'usuario';
  const content = message.comparacion_materiales?.resumen || quoteIntroText(message.texto, message.cotizacion_generada);
  const timeLabel =
    message.timestamp ||
    (message.created_at ? new Date(message.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '');
  const canUndo = !undone && canUndoAIWrite(message.job_id);

  const handleDownloadApiLink = async (url: string, label?: string) => {
    setDownloading(true);
    try {
      const ext = url.includes('formato=excel') ? 'xlsx' : 'pdf';
      await downloadProtectedFile(url, `ObraTrack_Cotizacion.${ext}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : `No se pudo descargar (${label || 'archivo'}).`);
    } finally {
      setDownloading(false);
    }
  };

  const handleUndo = async () => {
    if (!message.job_id || undoing) return;
    setUndoing(true);
    try {
      await undoAIWrite(message.job_id);
      setUndone(true);
      toast('Acción revertida correctamente.');
      onUndone?.(message.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo deshacer el cambio.');
    } finally {
      setUndoing(false);
    }
  };

  const sendFeedback = (value: 'up' | 'down') => {
    if (message.feedback === value) return;
    onFeedbackChange?.(message.id, value);
    void aiHeaders()
      .then((headers) =>
        fetch('/api/ia/quality', {
          method: 'POST',
          headers,
          body: JSON.stringify({ kind: value === 'up' ? 'thumbs_up' : 'thumbs_down' }),
          signal: AbortSignal.timeout(3000),
        }),
      )
      .catch(() => undefined);
  };

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full`}>
      <div
        className={`w-full ${compact ? 'max-w-[96%]' : 'max-w-[95%] sm:max-w-[85%]'} rounded-2xl ${compact ? 'p-3' : 'p-3.5 sm:p-4'} space-y-2.5 shadow-xs overflow-hidden break-words ${
          isUser
            ? 'bg-navy-900 dark:bg-[#FF6A00] text-white rounded-br-xs'
            : message.es_error
              ? 'bg-red-50/90 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-navy-900 dark:text-red-100 rounded-bl-xs'
              : 'bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] text-navy-900 dark:text-gray-100 rounded-bl-xs'
        }`}
      >
        <div className={`flex items-center gap-1.5 font-bold text-[10px] ${isUser ? 'text-gray-300 dark:text-white/85' : 'text-gray-500 dark:text-gray-400'}`}>
          {isUser ? <User className="w-3.5 h-3.5 text-obra-orange dark:text-white" /> : <Bot className="w-3.5 h-3.5 text-obra-orange" />}
          <span>{isUser ? 'Tú' : 'ObraBot'}</span>
          {!isUser && typeof message.latencia_ms === 'number' && message.latencia_ms > 0 && (
            <span className="font-mono text-[9px] opacity-75">· {(message.latencia_ms / 1000).toFixed(1)} s</span>
          )}
          {timeLabel && <span className="ml-auto font-mono text-[9px]">{timeLabel}</span>}
        </div>

        {content ? <ChatMessageFormatter content={content} isUser={isUser} /> : null}

        {/* Confirmación explícita antes de acciones destructivas */}
        {message.confirmacion_pendiente && (
          <div className="mt-2 rounded-xl border border-amber-300 dark:border-amber-700/70 bg-amber-50/90 dark:bg-amber-950/40 p-3 space-y-2 text-xs text-navy-900 dark:text-amber-100">
            <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Confirmación requerida</span>
            </div>
            <p className="text-[11px] leading-relaxed">{message.confirmacion_pendiente.resumen}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onConfirmCritical?.(message.id, message.confirmacion_pendiente!.rawResponse)}
                className="inline-flex items-center gap-1 rounded-xl bg-obra-orange hover:bg-orange-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirmar y ejecutar</span>
              </button>
              <button
                type="button"
                onClick={() => onCancelCritical?.(message.id)}
                className="inline-flex items-center gap-1 rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] px-3 py-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:border-gray-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            </div>
          </div>
        )}

        {/* Tarjeta interactiva de acción ejecutada */}
        {message.accion_ejecutada && message.accion_ejecutada.tipo !== 'solicitar_datos_persona' && (
          <div className="mt-2 bg-kraft-50 dark:bg-[#1A2230] border border-kraft-200 dark:border-[#2A364B] rounded-2xl p-3 space-y-2 text-navy-900 dark:text-gray-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono font-bold uppercase text-obra-orange flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-obra-orange" />
                <span>{undone ? 'Cambio revertido' : 'Acción lista'}</span>
              </span>
              <span className={`px-2 py-0.5 rounded text-white text-[9px] font-bold ${undone ? 'bg-gray-500' : 'bg-obra-green'}`}>
                {undone ? 'Revertido' : 'Confirmado'}
              </span>
            </div>

            <h4 className="font-heading font-bold text-xs sm:text-sm text-navy-900 dark:text-white">
              {message.accion_ejecutada.titulo}
            </h4>
            {message.accion_ejecutada.resultado_texto && (
              <p className="text-[11px] text-gray-700 dark:text-gray-300">{message.accion_ejecutada.resultado_texto}</p>
            )}

            <div className="pt-2 border-t border-kraft-200/70 dark:border-[#2A364B] flex flex-wrap items-center gap-2 justify-end">
              {canUndo && (
                <button
                  type="button"
                  disabled={undoing}
                  onClick={() => void handleUndo()}
                  className="mr-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-kraft-200 dark:border-[#34425A] bg-white dark:bg-[#141A23] hover:border-obra-orange text-gray-700 dark:text-gray-200 text-[11px] font-semibold transition-colors disabled:opacity-50"
                >
                  <Undo2 className="w-3.5 h-3.5 text-obra-orange" />
                  <span>{undoing ? 'Deshaciendo…' : 'Deshacer'}</span>
                </button>
              )}

              {message.accion_ejecutada.enlace_whatsapp && (
                <a
                  href={message.accion_ejecutada.enlace_whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold transition-all shadow-2xs"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Enviar por WhatsApp</span>
                </a>
              )}

              {message.accion_ejecutada.link_destino &&
                (message.accion_ejecutada.link_destino.startsWith('/api/') ? (
                  <button
                    type="button"
                    disabled={downloading}
                    onClick={() => void handleDownloadApiLink(message.accion_ejecutada!.link_destino!, message.accion_ejecutada!.link_texto)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-navy-900 dark:bg-[#FF6A00] hover:opacity-90 text-white rounded-xl text-[11px] font-bold transition-all shadow-2xs disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{downloading ? 'Descargando…' : message.accion_ejecutada.link_texto || 'Descargar archivo'}</span>
                  </button>
                ) : (
                  <Link
                    href={message.accion_ejecutada.link_destino}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-navy-900 dark:bg-[#243044] hover:bg-navy-800 text-white rounded-xl text-[11px] font-bold transition-all shadow-2xs"
                  >
                    <span>{message.accion_ejecutada.link_texto || 'Abrir ➔'}</span>
                  </Link>
                ))}
            </div>
          </div>
        )}

        <AIMessageTools message={message} compact={compact} />

        {/* Reintentar en 1 clic si hubo error */}
        {message.es_error && message.reintentar_texto && onRetry && (
          <div className="pt-1 flex justify-end">
            <button
              type="button"
              onClick={() => onRetry(message.reintentar_texto!)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-obra-orange hover:bg-orange-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reintentar solicitud</span>
            </button>
          </div>
        )}

        {/* Barra discreta de calificación 👍/👎 para respuestas del asistente */}
        {!isUser && !message.es_error && !message.id.startsWith('m-init') && !message.id.startsWith('welcome-') && onFeedbackChange && (
          <div className="pt-1 flex items-center justify-end gap-1 opacity-75 hover:opacity-100 transition-opacity">
            <button
              type="button"
              aria-label="Respuesta útil"
              title="Respuesta útil"
              onClick={() => sendFeedback('up')}
              className={`p-1 rounded-lg transition-colors ${
                message.feedback === 'up'
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              }`}
            >
              <ThumbsUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              aria-label="Respuesta por mejorar"
              title="Respuesta por mejorar"
              onClick={() => sendFeedback('down')}
              className={`p-1 rounded-lg transition-colors ${
                message.feedback === 'down'
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              }`}
            >
              <ThumbsDown className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Chips de sugerencias rápidas */}
      {message.sugerencias && message.sugerencias.length > 0 && !isUser && onSelectSuggestion && (
        <div className="flex flex-wrap gap-1.5 mt-2 max-w-[92%]">
          {message.sugerencias.map((sug, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectSuggestion(sug)}
              className="px-3 py-1.5 bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] hover:border-obra-orange text-navy-900 dark:text-gray-100 rounded-xl text-[11px] font-medium shadow-2xs transition-all hover:bg-orange-50/50 dark:hover:bg-[#1E2634] text-left"
            >
              {sug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ObraBotStreamingBubble({
  stage,
  partialText,
  onStop,
}: {
  stage: string;
  partialText: string;
  onStop?: () => void;
}) {
  return (
    <div className="flex flex-col items-start w-full">
      <div className="w-full max-w-[95%] sm:max-w-[85%] rounded-2xl rounded-bl-xs p-3.5 bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] text-navy-900 dark:text-gray-100 shadow-xs space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex items-center gap-2 font-mono font-bold text-obra-orange">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>{stage || 'Revisando tu solicitud…'}</span>
          </span>
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1 rounded-lg border border-kraft-200 dark:border-[#2A364B] px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:text-gray-300 hover:border-red-400 hover:text-red-600 transition-colors"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>Detener</span>
            </button>
          )}
        </div>
        {partialText ? <ChatMessageFormatter content={partialText} isUser={false} /> : null}
      </div>
    </div>
  );
}

export function ObraBotComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  disabled,
  placeholder = 'Escribe o dicta tu solicitud, o adjunta foto/PDF/Excel…',
  compact = false,
  allowFiles = true,
  attachedFile,
  onAttachFile,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
  allowFiles?: boolean;
  attachedFile?: File | null;
  onAttachFile?: (file: File | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop?.(); } catch {}
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch {}
    };
  }, []);

  const toggleVoice = async () => {
    if (recording) {
      setRecording(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
        return;
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      return;
    }

    const SpeechRec = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = 'es-CL';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onresult = (ev: any) => {
          const transcript = ev.results?.[0]?.[0]?.transcript?.trim();
          if (transcript) onChange(value ? `${value.trim()} ${transcript}` : transcript);
        };
        rec.onerror = () => setRecording(false);
        rec.onend = () => {
          setRecording(false);
          recognitionRef.current = null;
        };
        recognitionRef.current = rec;
        setRecording(true);
        rec.start();
        return;
      } catch {
        // Fallback a MediaRecorder + /api/obrabot/transcribir
      }
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast('Tu navegador no admite grabación de voz.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const headers = await aiHeaders();
          const form = new FormData();
          form.set('audio', new File([blob], 'voz.webm', { type: blob.type || 'audio/webm' }));
          const res = await fetch('/api/obrabot/transcribir', {
            method: 'POST',
            headers: { Authorization: headers.Authorization },
            body: form,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.texto) throw new Error(data.error || 'No se pudo transcribir el audio.');
          onChange(value ? `${value.trim()} ${data.texto}` : data.texto);
        } catch (err) {
          toast(err instanceof Error ? err.message : 'No se pudo transcribir la nota de voz.');
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = recorder;
      setRecording(true);
      recorder.start();
    } catch {
      toast('Permite el acceso al micrófono para dictar por voz.');
    }
  };

  return (
    <div className="shrink-0 bg-white dark:bg-[#141A23] border-t border-kraft-200 dark:border-[#263040] p-2.5 sm:p-3 space-y-2">
      {attachedFile && onAttachFile && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-kraft-50 dark:bg-[#1A2230] border border-kraft-200 dark:border-[#2A364B] px-3 py-1.5 text-xs text-navy-900 dark:text-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            {attachedFile.type.startsWith('image/') ? (
              <ImageIcon className="w-3.5 h-3.5 text-obra-orange shrink-0" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-obra-orange shrink-0" />
            )}
            <span className="truncate font-medium">{attachedFile.name}</span>
            <span className="text-[10px] text-gray-500 shrink-0">({Math.max(1, Math.round(attachedFile.size / 1024))} KB)</span>
          </div>
          <button
            type="button"
            aria-label="Quitar archivo adjunto"
            onClick={() => onAttachFile(null)}
            className="p-1 rounded-lg hover:bg-gray-500/10 text-gray-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-1.5 sm:gap-2">
        {allowFiles && onAttachFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.xlsx"
              className="hidden"
              onChange={(ev) => {
                const selected = ev.target.files?.[0] || null;
                if (selected && selected.size > 3000000) {
                  toast('Adjunta una foto, PDF o Excel de hasta 3 MB.');
                } else if (selected) {
                  onAttachFile(selected);
                }
                ev.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Adjuntar foto, PDF o Excel"
              title="Adjuntar foto de obra, PDF o planilla Excel (máx. 3 MB)"
              className="p-2.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0F141C] hover:border-obra-orange text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-40 shrink-0"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </>
        )}

        <button
          type="button"
          disabled={busy || disabled || transcribing}
          onClick={() => void toggleVoice()}
          aria-label={recording ? 'Detener dictado' : 'Dictar por voz'}
          title={recording ? 'Detener grabación' : 'Dictar mensaje por voz'}
          className={`p-2.5 rounded-xl border transition-colors shrink-0 disabled:opacity-40 ${
            recording
              ? 'border-red-500 bg-red-500 text-white animate-pulse'
              : 'border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0F141C] hover:border-obra-orange text-gray-600 dark:text-gray-300'
          }`}
        >
          {transcribing ? <RefreshCw className="w-4 h-4 animate-spin" /> : recording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
        </button>

        <textarea
          rows={2}
          maxLength={6000}
          value={value}
          disabled={disabled}
          aria-label="Mensaje para ObraBot"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy && (value.trim() || attachedFile)) onSubmit();
            }
          }}
          placeholder={recording ? 'Escuchando… habla ahora' : transcribing ? 'Transcribiendo audio…' : placeholder}
          className="flex-1 min-w-0 resize-none text-xs sm:text-sm bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] rounded-2xl px-3.5 py-2.5 text-navy-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-obra-orange focus:bg-white dark:focus:bg-[#141A23] transition-all"
        />

        {busy && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Detener respuesta"
            className="px-3.5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-heading font-bold text-xs inline-flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            {!compact && <span>Detener</span>}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || disabled || (!value.trim() && !attachedFile)}
            aria-label="Enviar mensaje"
            className="px-4 py-2.5 bg-obra-orange hover:bg-orange-600 text-white rounded-2xl font-heading font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-45 transition-all shadow-xs shrink-0"
          >
            {!compact && <span>Enviar</span>}
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ObraBotQualityBadge() {
  const [stats, setStats] = useState<{
    total_eventos: number;
    tasa_recuperacion_pct: number;
    por_canal: { web: number; whatsapp: number };
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    void aiHeaders()
      .then((headers) => fetch('/api/ia/quality', { headers, cache: 'no-store' }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (mounted && data && typeof data.tasa_recuperacion_pct === 'number') setStats(data);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (!stats) return null;
  return (
    <div className="hidden md:inline-flex items-center gap-2 rounded-xl bg-navy-800/80 border border-navy-700 px-2.5 py-1 text-[10px] font-mono text-gray-300" title="Telemetría operativa de ObraBot">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
      <span>Autovalidación {stats.tasa_recuperacion_pct}%</span>
      <span className="text-gray-500">·</span>
      <span>WA {stats.por_canal.whatsapp} / Web {stats.por_canal.web}</span>
    </div>
  );
}
