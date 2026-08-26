'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Sparkles,
  X,
  Send,
  Loader2,
  HardHat,
  MessageSquare,
  ChevronDown,
  Minimize2,
  Maximize2,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { MensajeChatCotizador } from '@/types/database';
import Link from 'next/link';

export default function FloatingCopilotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeChatCotizador[]>([
    {
      id: 'fw-1',
      remitente: 'agente',
      texto:
        '¡Hola! Soy tu **Copiloto Obrero IA**, impulsado por **Google Gemini**.\n\nPuedes preguntarme por costos de faena, cubicaciones, precios de materiales en Chile o pedirme que cree una obra por ti.',
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      sugerencias: [
        '¿Cuánto cobrar por 30m2 de radier?',
        '¿Qué precio tiene el saco de cemento?',
        'Créame una obra de quincho en Peñalolén por 3.8M',
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensajes, isOpen, isMinimized]);

  const handleSend = async (textoPersonalizado?: string) => {
    const texto = textoPersonalizado || input;
    if (!texto.trim() || isLoading) return;

    const userMsg: MensajeChatCotizador = {
      id: 'user-' + Date.now(),
      remitente: 'usuario',
      texto: texto.trim(),
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    };

    setMensajes((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const contextoDB = {
        proyectos: dataService.getProyectos().map((p) => ({
          id: p.id,
          nombre: p.nombre,
          comuna: p.comuna,
          estado: p.estado,
        })),
        trabajadores: dataService.getUsuarios().map((u) => ({
          id: u.id,
          nombre: u.nombre,
          rol: u.rol,
        })),
        clientes: dataService.getClientes().map((c) => ({
          id: c.id,
          nombre: c.nombre,
        })),
      };

      const res = await fetch('/api/cotizador/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: texto.trim(),
          historial: mensajes.slice(-6),
          contexto_db: contextoDB,
        }),
      });

      const data = await res.json();

      const botMsg: MensajeChatCotizador = {
        id: 'bot-' + Date.now(),
        remitente: 'agente',
        texto:
          data.respuesta ||
          '¡Entendido! He procesado tu consulta con el motor de Google Gemini.',
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        accion_ejecutada: data.accion,
        sugerencias: data.sugerencias || [
          '¿Dónde comprar materiales más baratos?',
          '¿Cuánto pagar a un maestro albañil?',
        ],
      };

      setMensajes((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error(err);
      setMensajes((prev) => [
        ...prev,
        {
          id: 'bot-err-' + Date.now(),
          remitente: 'agente',
          texto:
            'Tuve una intermitencia al contactar con Google Gemini. Por favor reintenta tu mensaje.',
          timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 select-none">
      {/* Botón Flotante Redondo */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2.5 px-4 py-3 bg-[#1E1E1E] hover:bg-black text-white rounded-full shadow-2xl hover:shadow-[#FF6A00]/30 transition-all border border-[#FF6A00]/40 hover:scale-105 active:scale-95"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF6A00] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FF6A00]"></span>
          </span>
          <Bot className="w-5 h-5 text-[#FF6A00] group-hover:rotate-12 transition-transform" />
          <span className="font-heading font-bold text-xs tracking-wide pr-1">
            Copiloto IA
          </span>
        </button>
      )}

      {/* Ventana de Chat Flotante */}
      {isOpen && (
        <div
          className={`bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
            isMinimized
              ? 'w-72 h-14'
              : 'w-[calc(100vw-2.5rem)] sm:w-[380px] h-[520px] max-h-[85vh]'
          }`}
        >
          {/* Header */}
          <div className="p-3.5 bg-[#1E1E1E] text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/20 border border-[#FF6A00]/40 flex items-center justify-center text-[#FF6A00]">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-heading font-bold text-xs text-white">
                    Copiloto ObraTrack
                  </h3>
                  <span className="px-1.5 py-0.2 bg-[#6B8F72] text-white text-[9px] font-mono font-bold rounded">
                    Gemini IA
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 font-sans">
                  En línea • Pregunta lo que necesites
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors"
                title={isMinimized ? 'Maximizar' : 'Minimizar'}
              >
                {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Cuerpo del Chat */}
          {!isMinimized && (
            <>
              <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-[#FAF8F5] dark:bg-[#0D1117] text-xs">
                {mensajes.map((m) => {
                  const isUser = m.remitente === 'usuario';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-3 leading-relaxed ${
                          isUser
                            ? 'bg-[#FF6A00] text-white rounded-br-xs shadow-sm font-sans'
                            : 'bg-white dark:bg-[#1A222D] text-gray-800 dark:text-gray-200 border border-[#E5DFC9] dark:border-[#263040] rounded-bl-xs shadow-sm font-sans whitespace-pre-line'
                        }`}
                      >
                        {m.texto}

                        {/* Acción sugerida */}
                        {m.accion_ejecutada && (
                          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-[11px]">
                            <span className="font-bold text-[#FF6A00] block mb-1 font-heading">
                              ⚡ Acción detectada: {m.accion_ejecutada.tipo}
                            </span>
                            <Link
                              href="/cotizador"
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-[#6B8F72] hover:underline"
                            >
                              <span>Ver en Pantalla Completa</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] text-gray-400 font-mono mt-0.5 px-1">
                        {m.timestamp}
                      </span>

                      {/* Sugerencias Rápidas */}
                      {!isUser && m.sugerencias && m.sugerencias.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {m.sugerencias.slice(0, 2).map((sug, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSend(sug)}
                              className="text-[10px] bg-white dark:bg-[#1A222D] hover:bg-[#FF6A00]/10 border border-[#E5DFC9] dark:border-[#263040] hover:border-[#FF6A00] text-gray-700 dark:text-gray-300 hover:text-[#FF6A00] px-2.5 py-1 rounded-lg transition-all text-left"
                            >
                              💡 {sug}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {isLoading && (
                  <div className="flex items-center gap-2 p-2 bg-white dark:bg-[#1A222D] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl w-fit text-xs text-gray-500 font-mono">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF6A00]" />
                    <span>Gemini está pensando...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="p-2.5 bg-white dark:bg-[#141A23] border-t border-[#E5DFC9] dark:border-[#263040] flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Pregúntale al Copiloto de Obras..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#FAF8F5] dark:bg-[#0D1117] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:border-[#FF6A00]"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="p-2 bg-[#FF6A00] hover:bg-[#E55F00] text-white rounded-xl transition-colors disabled:opacity-40 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}