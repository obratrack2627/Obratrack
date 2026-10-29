'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Send,
  Mic,
  MicOff,
  Bot,
  User,
  CheckCircle2,
  Building2,
  Users,
  Calendar,
  Zap,
  ArrowRight,
  ShieldCheck,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { dataService } from '@/lib/data-service';
import { Usuario, SubscriptionPlanId, MensajeChatCotizador, AccionAsistenteIA } from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';
import ChatMessageFormatter from '@/components/ChatMessageFormatter';
import { aiContext, requestAI, applyAIResponse } from '@/lib/ai/client';
import AIMessageTools from '@/components/AIMessageTools';


export default function GlobalCopilotFloatingWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [mensajes, setMensajes] = useState<MensajeChatCotizador[]>([]);
  const [inputTexto, setInputTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasAccess = activePlan === 'pro_ia';

  useEffect(() => {
    const user = dataService.getActiveUser();
    setActiveUser(user);
    setActivePlan(dataService.getActivePlan());

    const planHandler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    window.addEventListener('obratrack_plan_changed', planHandler);
    return () => window.removeEventListener('obratrack_plan_changed', planHandler);
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensajes]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen && mensajes.length === 0) {
      setMensajes([
        {
          id: 'welcome-global',
          remitente: 'agente',
          texto:
            'Hola. Puedo preparar presupuestos, consultar tus obras y registrar cambios. Indica qué necesitas y el nombre de la obra.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sugerencias: [
            'Crea una obra de radier en Maipú por $2.800.000',
            'Agrega al maestro Juan Pérez al equipo',
            'Agenda visita de inspección mañana a las 11:00',
            'Cotiza un radier de 20 m² en Maipú',
          ],
        },
      ]);
    }
  };

  const handleEnviarMensaje = async (textoAEnviar?: string) => {
    const query = (textoAEnviar || inputTexto).trim();
    if (!query || cargando) return;

    const userMsg: MensajeChatCotizador = {
      id: 'usr-' + Date.now(),
      remitente: 'usuario',
      texto: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMensajes((prev) => [...prev, userMsg]);
    setInputTexto('');
    setCargando(true);

    try {
      const data = await requestAI('/api/cotizador/chat', {
        mensaje: query, historial: mensajes.slice(-10), contexto_db: aiContext(),
        contexto_cotizacion: [...mensajes].reverse().find(m => m.cotizacion_generada)?.cotizacion_generada,
      });
      const processed = await applyAIResponse(data);
      if (processed.accion_ejecutada) showToast(processed.accion_ejecutada.titulo);

      const agenteMsg: MensajeChatCotizador = {
        id: 'agt-' + Date.now(),
        remitente: 'agente',
        ...processed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMensajes((prev) => [...prev, agenteMsg]);
    } catch (e: any) {
      console.error(e);
      setMensajes((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          remitente: 'agente',
          texto: e?.message || 'No se pudo completar la solicitud. Intenta nuevamente.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setCargando(false);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Tu navegador no soporta reconocimiento de voz nativo. Por favor escribe tu mensaje.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-CL';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputTexto(transcript);
          void handleEnviarMensaje(transcript);
        }
      };

      recognition.start();
    } catch (err) {
      console.error('Speech recognition error:', err);
      setIsListening(false);
    }
  };

  if (pathname === '/cotizador' || /^\/proyectos\/[^/]+\/ia$/.test(pathname || '')) return null;

  return (
    <>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 right-6 z-50 bg-[#141A23] text-white border border-[#FF6A00]/50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-5 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-[#FF6A00]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Botón Flotante Emergente */}
      <div className="fixed bottom-6 right-6 z-40">
        {!isOpen && (
          <button
            onClick={handleToggle}
            className="group relative flex items-center gap-2.5 px-4 py-3.5 bg-gradient-to-r from-[#FF6A00] to-[#E55F00] hover:from-[#E55F00] hover:to-[#CC5400] text-white rounded-full shadow-[0_8px_30px_rgba(255,106,0,0.35)] hover:shadow-[0_12px_40px_rgba(255,106,0,0.5)] transition-all duration-300 transform hover:-translate-y-0.5"
            title="Abrir Copiloto Obrero IA Global"
          >
            <div className="relative">
              <Sparkles className="w-5 h-5 animate-pulse" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping" />
            </div>
            <span className="font-heading font-bold text-xs tracking-wide">Copiloto IA</span>
            <span className="px-1.5 py-0.5 bg-black/30 rounded-full text-[10px] font-mono font-bold text-amber-200">
              PRO IA
            </span>
          </button>
        )}
      </div>

      {/* Modal / Drawer Flotante de Chat */}
      {isOpen && (
        <div
          className={`fixed right-4 sm:right-6 bottom-4 sm:bottom-6 z-50 w-[calc(100vw-2rem)] sm:w-[460px] bg-white dark:bg-[#111722] border border-[#E5DFC9] dark:border-[#263040] rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden transition-all duration-300 ${
            isMinimized ? 'h-[72px]' : 'h-[620px] max-h-[85vh]'
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#141A23] to-[#1E2638] text-white px-5 py-3.5 flex items-center justify-between border-b border-[#263040]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/20 border border-[#FF6A00]/40 flex items-center justify-center text-[#FF6A00]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-heading font-bold text-xs tracking-wide">Copiloto Obrero IA</h3>
                  <span className="px-1.5 py-0.2 bg-[#FF6A00]/20 text-[#FF6A00] rounded text-[9px] font-mono font-bold">
                    GLOBAL
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 font-sans">Control autónomo de obras, cuadrillas y agenda</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                title={isMinimized ? 'Expandir' : 'Minimizar'}
              >
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                title="Cerrar Copiloto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Contenido Condicional según el Plan */}
              {!hasAccess ? (
                <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4 bg-gradient-to-b from-amber-500/5 to-transparent">
                  <div className="w-14 h-14 rounded-2xl bg-[#FF6A00]/15 text-[#FF6A00] flex items-center justify-center border border-[#FF6A00]/30 shadow-inner">
                    <Zap className="w-7 h-7" />
                  </div>

                  <div className="space-y-1.5 max-w-xs">
                    <h4 className="font-heading font-black text-base text-navy-900 dark:text-white">
                      Exclusivo Plan Pro + Asistente IA
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-sans leading-relaxed">
                      El Copiloto Obrero IA crea obras automáticamente, coordina cuadrillas por voz y asesora en
                      cubicaciones y compras las 24 horas del día.
                    </p>
                  </div>

                  <div className="w-full bg-[#141A23]/5 dark:bg-white/5 border border-amber-500/20 rounded-2xl p-3.5 text-left space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-navy-900 dark:text-gray-200 font-semibold">
                      <Building2 className="w-3.5 h-3.5 text-[#FF6A00]" />
                      <span>Creación autónoma de obras y cronogramas</span>
                    </div>
                    <div className="flex items-center gap-2 text-navy-900 dark:text-gray-200 font-semibold">
                      <Users className="w-3.5 h-3.5 text-[#FF6A00]" />
                      <span>Gestión de cuadrillas y trabajadores</span>
                    </div>
                    <div className="flex items-center gap-2 text-navy-900 dark:text-gray-200 font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-[#FF6A00]" />
                      <span>Agendamiento automático en tu calendario</span>
                    </div>
                  </div>

                  <Link
                    href="/planes"
                    onClick={() => setIsOpen(false)}
                    className="w-full py-2.5 bg-gradient-to-r from-[#FF6A00] to-[#E55F00] hover:from-[#E55F00] hover:to-[#CC5400] text-white rounded-xl font-bold font-heading text-xs shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <span>Ver Planes & Precios</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ) : (
                <>
                  {/* Historial de Mensajes */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs font-sans">
                    {mensajes.map((m) => (
                      <div
                        key={m.id}
                        className={`flex gap-2.5 ${m.remitente === 'usuario' ? 'justify-end' : 'justify-start'}`}
                      >
                        {m.remitente === 'agente' && (
                          <div className="w-7 h-7 rounded-xl bg-[#FF6A00]/15 text-[#FF6A00] flex-shrink-0 flex items-center justify-center border border-[#FF6A00]/30 mt-0.5">
                            <Bot className="w-4 h-4" />
                          </div>
                        )}

                        <div className="max-w-[85%] space-y-2">
                          <div
                            className={`p-3 rounded-2xl ${
                              m.remitente === 'usuario'
                                ? 'bg-[#FF6A00] text-white rounded-tr-none shadow-sm'
                                : 'bg-gray-100 dark:bg-[#1A2230] text-navy-900 dark:text-gray-100 rounded-tl-none border border-gray-200 dark:border-[#263040]'
                            }`}
                          >
                            <ChatMessageFormatter
                              content={m.texto}
                              isUser={m.remitente === 'usuario'}
                            />
                            <AIMessageTools message={m} />
                            <span
                              className={`block text-[9px] mt-1 text-right ${
                                m.remitente === 'usuario' ? 'text-white/70' : 'text-gray-400'
                              }`}
                            >
                              {m.timestamp}
                            </span>
                          </div>

                          {/* Tarjeta de Acción Ejecutada */}
                          {m.accion_ejecutada && (
                            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-2.5 space-y-1 text-left animate-in fade-in-50">
                              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold font-heading text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{m.accion_ejecutada.titulo}</span>
                              </div>
                              <p className="text-[10px] text-gray-600 dark:text-gray-300">
                                {m.accion_ejecutada.resultado_texto}
                              </p>
                               {m.accion_ejecutada.link_destino && (
                                <Link
                                  href={m.accion_ejecutada.link_destino}
                                  onClick={() => setIsOpen(false)}
                                  className="inline-block mt-1 text-[11px] font-bold text-[#FF6A00] hover:underline"
                                >
                                  {m.accion_ejecutada.link_texto || 'Ver detalles ➔'}
                                </Link>
                              )}
                              {m.accion_ejecutada.enlace_whatsapp && (
                                <a
                                  href={m.accion_ejecutada.enlace_whatsapp}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block mt-1 ml-2 text-[11px] font-bold text-emerald-600 hover:underline"
                                >
                                  {m.accion_ejecutada.link_texto || 'Enviar por WhatsApp Ahora ➔'}
                                </a>
                              )}
                            </div>
                          )}

                          {/* Sugerencias Rápidas */}
                          {m.sugerencias && m.sugerencias.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {m.sugerencias.map((sug, sIdx) => (
                                <button
                                  key={sIdx}
                                  onClick={() => handleEnviarMensaje(sug)}
                                  className="px-2.5 py-1 bg-white dark:bg-[#1A2230] hover:bg-[#FF6A00]/10 border border-gray-200 dark:border-[#263040] hover:border-[#FF6A00] text-navy-900 dark:text-gray-300 rounded-lg text-[10px] transition-colors text-left"
                                >
                                  {sug}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {m.remitente === 'usuario' && (
                          <div className="w-7 h-7 rounded-xl bg-navy-800 text-white flex-shrink-0 flex items-center justify-center mt-0.5">
                            <User className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    ))}

                    {cargando && (
                      <div className="flex items-center gap-2 text-gray-400 text-xs py-2">
                        <Bot className="w-4 h-4 text-[#FF6A00] animate-bounce" />
                        <span>Analizando requerimiento y coordinando acciones...</span>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input Footer */}
                  <div className="p-3 border-t border-gray-200 dark:border-[#263040] bg-gray-50/50 dark:bg-[#141A23]/50">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleEnviarMensaje();
                      }}
                      className="flex items-center gap-2"
                    >
                      <button
                        type="button"
                        onClick={handleVoiceInput}
                        className={`p-2 rounded-xl transition-all ${
                          isListening
                            ? 'bg-rose-500 text-white animate-pulse'
                            : 'bg-gray-100 dark:bg-[#1A2230] text-gray-500 hover:text-[#FF6A00] hover:bg-gray-200 dark:hover:bg-[#222C3D]'
                        }`}
                        title={isListening ? 'Escuchando...' : 'Hablar por micrófono'}
                      >
                        {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>

                      <input
                        type="text"
                        value={inputTexto}
                  aria-label="Mensaje para el copiloto global"
                        onChange={(e) => setInputTexto(e.target.value)}
                        placeholder="Escribe una orden (crear obra, cuadrilla, visita...)"
                        disabled={cargando}
                        className="flex-1 px-3 py-2 bg-white dark:bg-[#1A2230] border border-gray-200 dark:border-[#263040] rounded-xl text-xs text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#FF6A00]"
                      />

                      <button
                        type="submit"
                  aria-label="Enviar mensaje"
                        disabled={!inputTexto.trim() || cargando}
                        className="p-2 bg-[#FF6A00] hover:bg-[#E55F00] disabled:opacity-40 text-white rounded-xl shadow-sm transition-all"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
