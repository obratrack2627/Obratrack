'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Sparkles,
  Send,
  Mic,
  MicOff,
  Bot,
  User,
  CheckCircle2,
  AlertTriangle,
  GanttChartSquare,
  Wallet,
  Trash2,
  Phone,
  Calendar,
  Building2,
  DollarSign,
  TrendingUp,
  MapPin,
  MessageSquare,
  Lock,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import ProjectTabsHeader from '@/components/ProjectTabsHeader';
import { dataService } from '@/lib/data-service';
import {
  Proyecto,
  Actividad,
  MaterialProyecto,
  BitacoraEntrada,
  Pago,
  Imprevisto,
  Usuario,
  Cliente,
  SubscriptionPlanId,
  MensajeChatProyecto,
  AccionAsistenteIA,
} from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';
import GoogleMapsProjectViewer from '@/components/GoogleMapsProjectViewer';
import ChatMessageFormatter from '@/components/ChatMessageFormatter';
import { aiContext, requestAI, applyAIResponse } from '@/lib/ai/client';
import AIMessageTools from '@/components/AIMessageTools';


export default function ProyectoIAPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [materiales, setMateriales] = useState<MaterialProyecto[]>([]);
  const [bitacora, setBitacora] = useState<BitacoraEntrada[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [imprevistos, setImprevistos] = useState<Imprevisto[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');

  const [mensajes, setMensajes] = useState<MensajeChatProyecto[]>([]);
  const [inputTexto, setInputTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMapsModalOpen, setIsMapsModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasAccess = activePlan === 'pro_ia';

  const loadData = () => {
    if (!projectId) return;
    const proj = dataService.getProyectoById(projectId);
    const acts = dataService.getActividades(projectId);
    const mats = dataService.getMaterialesProyecto(projectId);
    const bits = dataService.getBitacora(projectId);
    const pgs = dataService.getPagos(projectId);
    const imps = dataService.getImprevistos(projectId);
    const usrs = dataService.getUsuarios();
    const cli = proj?.cliente_id ? dataService.getClienteById(proj.cliente_id) : null;

    setProyecto(proj);
    setActividades(acts);
    setMateriales(mats);
    setBitacora(bits);
    setPagos(pgs);
    setImprevistos(imps);
    setUsuarios(usrs);
    setCliente(cli || null);

    const user = dataService.getActiveUser();
    setActiveUser(user);
    setActivePlan(dataService.getActivePlan());

    // Cargar historial persistente local
    const historialLocal = dataService.getProyectoChatHistorial(projectId);
    if (historialLocal.length > 0) {
      setMensajes(historialLocal);
    } else if (proj) {
      // Mensaje de bienvenida inicial contextualizado a la obra
      const bienvenida: MensajeChatProyecto = {
        id: 'welcome-' + projectId,
        proyecto_id: projectId,
        empresa_id: proj.empresa_id,
        remitente: 'agente',
        texto: `👷‍♂️ **¡Hola! Soy el Agente de IA dedicado a la obra "${proj.nombre}".**\n\nTengo acceso completo en tiempo real a:\n• Presupuesto acordado: **$${(proj.monto_cotizado || 0).toLocaleString('es-CL')} CLP**\n• Cronograma y partidas de la **Carta Gantt** (${acts.length} partidas)\n• Registro de materiales, imprevistos y bitácora de terreno\n• Datos de contacto del cliente **${cli?.nombre || 'Mandante'}**\n\nPuedes pedirme consultas financieras, redactar informes para el cliente o realizar cambios directos en esta obra.`,
        created_at: new Date().toISOString(),
        sugerencias: [
          '¿Cuánto saldo nos queda por cobrar al cliente?',
          '¿Qué partidas tenemos pendientes en la Carta Gantt?',
          'Redacta un mensaje de WhatsApp para el mandante',
          'Agrega la partida "Instalación de terminaciones" de 4 días',
        ],
      };
      setMensajes([bienvenida]);
    }
  };

  useEffect(() => {
    loadData();

    // Sincronizar desde Supabase en segundo plano
    if (projectId) {
      dataService.loadProyectoChatFromSupabase(projectId).then((synced) => {
        if (synced && synced.length > 0) {
          setMensajes(synced);
        }
      });
    }

    const planHandler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    window.addEventListener('obratrack_plan_changed', planHandler);
    return () => window.removeEventListener('obratrack_plan_changed', planHandler);
  }, [projectId]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensajes]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleLimpiarHistorial = () => {
    if (confirm('¿Deseas reiniciar el historial de conversación de este proyecto?')) {
      dataService.clearProyectoChatHistorial(projectId);
      setMensajes([]);
      loadData();
      showToast('Historial del proyecto reiniciado.');
    }
  };

  const handleEnviarMensaje = async (textoAEnviar?: string) => {
    const query = (textoAEnviar || inputTexto).trim();
    if (!query || cargando || !proyecto) return;

    const userMsg: MensajeChatProyecto = {
      id: 'usr-p-' + Date.now(),
      proyecto_id: projectId,
      empresa_id: proyecto.empresa_id,
      remitente: 'usuario',
      texto: query,
      created_at: new Date().toISOString(),
    };

    dataService.saveProyectoMensajeChat(userMsg);
    setMensajes((prev) => [...prev, userMsg]);
    setInputTexto('');
    setCargando(true);

    try {
      const totalPagado = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
      const totalImprevistos = imprevistos.reduce((sum, i) => sum + Number(i.monto || 0), 0);
      const totalMateriales = materiales.reduce(
        (sum, m) => sum + Number(m.subtotal || m.cantidad * m.precio_unitario || 0),
        0
      );
      const saldoPendiente = Math.max(0, (proyecto.monto_cotizado || 0) - totalPagado);

      const contextoProyecto = {
        id: proyecto.id,
        nombre: proyecto.nombre,
        comuna: proyecto.comuna,
        direccion: proyecto.direccion,
        estado: proyecto.estado,
        fecha_inicio: proyecto.fecha_inicio,
        fecha_termino_estimada: proyecto.fecha_termino_estimada,
        monto_cotizado: proyecto.monto_cotizado || 0,
        total_pagado: totalPagado,
        total_imprevistos: totalImprevistos,
        total_materiales: totalMateriales,
        saldo_pendiente: saldoPendiente,
        porcentaje_avance: proyecto.porcentaje_avance_ponderado || 0,
        cliente: cliente ? { nombre: cliente.nombre, telefono: cliente.telefono } : undefined,
        actividades: actividades.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          dias: Math.max(1, Math.round((new Date(a.fecha_termino).getTime() - new Date(a.fecha_inicio).getTime()) / 86400000)),
          porcentaje_avance: a.porcentaje_avance,
          estado: a.estado,
          fecha_inicio: a.fecha_inicio,
          fecha_termino: a.fecha_termino,
        })),
        materiales: materiales.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          cantidad: m.cantidad,
          unidad: m.unidad,
          precio_unitario: m.precio_unitario,
          subtotal: m.subtotal,
        })),
        imprevistos: imprevistos.map((i) => ({
          id: i.id,
          descripcion: i.descripcion,
          monto: i.monto,
          fecha: i.fecha,
        })),
        bitacora: bitacora.map((b) => ({
          id: b.id,
          titulo: b.titulo,
          nota: b.nota,
          fecha: b.fecha,
          tipo: b.tipo,
        })),
        trabajadores: usuarios
          .filter((u) => (proyecto.trabajadores_ids || []).includes(u.id))
          .map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol })),
      };

      const data = await requestAI(`/api/proyectos/${projectId}/chat`, {
        mensaje: query, historial: mensajes.slice(-10), contexto_proyecto: contextoProyecto, contexto_cotizacion: [...mensajes].reverse().find(m => m.cotizacion_generada)?.cotizacion_generada,
      });
      const processed = await applyAIResponse(data, projectId);
      loadData();
      if (processed.accion_ejecutada) showToast(processed.accion_ejecutada.titulo);

      const agenteMsg: MensajeChatProyecto = {
        id: 'agt-p-' + Date.now(),
        proyecto_id: projectId,
        empresa_id: proyecto.empresa_id,
        remitente: 'agente',
        ...processed,
        created_at: new Date().toISOString(),
      };

      dataService.saveProyectoMensajeChat(agenteMsg);
      setMensajes((prev) => [...prev, agenteMsg]);
    } catch (err: any) {
      console.error(err);
      const errorMsg = err?.message || 'Error de comunicación con el asistente.';
      showToast(errorMsg);
      const agenteErrorMsg: MensajeChatProyecto = {
        id: 'agt-err-' + Date.now(),
        proyecto_id: projectId,
        empresa_id: proyecto?.empresa_id,
        remitente: 'agente',
        texto: `⚠️ No pude procesar tu mensaje: ${errorMsg}. Por favor intenta nuevamente.`,
        created_at: new Date().toISOString(),
        sugerencias: [
          '¿Cuánto saldo nos queda por cobrar?',
          '¿Cómo vamos con la Carta Gantt?',
        ],
      };
      setMensajes((prev) => [...prev, agenteErrorMsg]);
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
          handleEnviarMensaje(transcript);
        }
      };

      recognition.start();
    } catch (err) {
      console.error('Speech recognition error:', err);
      setIsListening(false);
    }
  };

  if (!proyecto) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen text-gray-500 font-sans">
        <p>Cargando Copiloto de la Obra...</p>
        <Link href="/proyectos" className="mt-4 text-xs font-bold text-[#FF6A00] hover:underline">
          &larr; Volver a Proyectos
        </Link>
      </div>
    );
  }

  const totalPagado = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
  const saldoPendiente = Math.max(0, (proyecto.monto_cotizado || 0) - totalPagado);
  const pctAvance = proyecto.porcentaje_avance_ponderado || 0;

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#141A23] text-white border border-[#FF6A00]/40 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-5 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-[#FF6A00]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modal Google Maps */}
      <GoogleMapsProjectViewer
        isOpen={isMapsModalOpen}
        onClose={() => setIsMapsModalOpen(false)}
        proyecto={proyecto}
      />

      <ProjectTabsHeader
        proyecto={proyecto}
        cliente={cliente}
        onOpenMaps={() => setIsMapsModalOpen(true)}
      />

      <div className="p-6 max-w-6xl w-full mx-auto space-y-6 flex-1 flex flex-col">
        {/* Barra de Métricas en Vivo de la Obra */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl p-3.5 shadow-sm">
            <p className="text-[10px] font-mono font-semibold uppercase text-gray-400">Avance Físico</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-[#FF6A00]">{pctAvance}%</span>
              <span className="text-[10px] text-gray-500 font-sans">
                {actividades.filter((a) => a.estado === 'terminada').length} de {actividades.length} partidas
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl p-3.5 shadow-sm">
            <p className="text-[10px] font-mono font-semibold uppercase text-gray-400">Presupuesto Total</p>
            <p className="text-xl font-bold font-mono text-navy-900 dark:text-white mt-1">
              {formatCLP(proyecto.monto_cotizado || 0)}
            </p>
          </div>

          <div className="bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl p-3.5 shadow-sm">
            <p className="text-[10px] font-mono font-semibold uppercase text-gray-400">Saldo Por Cobrar</p>
            <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {formatCLP(saldoPendiente)}
            </p>
          </div>

          <div className="bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono font-semibold uppercase text-gray-400">Mandante / Cliente</p>
              <p className="text-xs font-bold font-heading text-navy-900 dark:text-white mt-1 truncate max-w-[120px]">
                {cliente?.nombre || 'No asignado'}
              </p>
            </div>
            {cliente?.telefono && (
              <a
                href={`https://wa.me/${cliente.telefono.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors"
                title="Abrir WhatsApp del cliente"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Bloqueo si el usuario no tiene Plan Pro + IA */}
        {!hasAccess ? (
          <div className="flex-1 bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-3xl bg-[#FF6A00]/15 text-[#FF6A00] flex items-center justify-center border border-[#FF6A00]/30 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>

            <div className="max-w-md space-y-2">
              <span className="px-2.5 py-1 bg-[#FF6A00]/20 text-[#FF6A00] rounded-full text-xs font-mono font-bold">
                EXCLUSIVO PLAN PRO + ASISTENTE IA
              </span>
              <h3 className="text-xl font-heading font-black text-navy-900 dark:text-white">
                Agente de IA Propio para cada Faena
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-sans leading-relaxed">
                Cada obra en ObraTrack cuenta con su propio agente inteligente que recuerda el historial completo de
                la conversación, coordina cronogramas en vivo y redacta estados de pago directamente para el cliente.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Link
                href="/planes"
                className="px-5 py-2.5 bg-gradient-to-r from-[#FF6A00] to-[#E55F00] hover:from-[#E55F00] hover:to-[#CC5400] text-white rounded-xl font-bold font-heading text-xs shadow-md transition-all flex items-center gap-2"
              >
                <span>Ver Planes para Desbloquear</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          /* Área de Conversación Persistente del Proyecto */
          <div className="flex-1 bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-3xl shadow-sm flex flex-col overflow-hidden min-h-[500px]">
            {/* Cabecera del Agente */}
            <div className="px-6 py-3.5 bg-gradient-to-r from-[#141A23] to-[#1E2638] text-white flex items-center justify-between border-b border-[#263040]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/20 border border-[#FF6A00]/40 flex items-center justify-center text-[#FF6A00]">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-heading font-bold text-xs tracking-wide flex items-center gap-2">
                    <span>Agente Especialista: {proyecto.nombre}</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px] font-mono font-bold">
                      EN VIVO
                    </span>
                  </h4>
                  <p className="text-[10px] text-gray-400 font-sans">
                    Historial persistente y memoria de faena sincronizada en Supabase
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-400 hidden sm:inline">
                  {mensajes.length} mensaje(s)
                </span>
                <button
                  type="button"
                  onClick={handleLimpiarHistorial}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-rose-500/20 hover:text-rose-400 text-gray-300 text-[11px] font-medium flex items-center gap-1 transition-all"
                  title="Reiniciar conversación de esta obra"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpiar Chat</span>
                </button>
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4 text-xs font-sans">
              {mensajes.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${m.remitente === 'usuario' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.remitente === 'agente' && (
                    <div className="w-8 h-8 rounded-2xl bg-[#FF6A00]/15 text-[#FF6A00] flex-shrink-0 flex items-center justify-center border border-[#FF6A00]/30 mt-0.5 shadow-sm">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  )}

                  <div className="max-w-[80%] space-y-2">
                    <div
                      className={`p-4 rounded-3xl ${
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
                        className={`block text-[9px] mt-1.5 text-right ${
                          m.remitente === 'usuario' ? 'text-white/70' : 'text-gray-400'
                        }`}
                      >
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Tarjeta de Acción Ejecutada */}
                    {m.accion_ejecutada && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-3 space-y-1.5 text-left animate-in fade-in-50">
                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold font-heading text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{m.accion_ejecutada.titulo}</span>
                        </div>
                        <p className="text-[11px] text-gray-600 dark:text-gray-300">
                          {m.accion_ejecutada.resultado_texto}
                        </p>
                        {m.accion_ejecutada.enlace_whatsapp && (
                          <a
                            href={m.accion_ejecutada.enlace_whatsapp}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 mt-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-colors"
                          >
                            <span>Enviar mensaje al cliente por WhatsApp</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {m.accion_ejecutada.link_destino && !m.accion_ejecutada.enlace_whatsapp && (
                          <Link
                            href={m.accion_ejecutada.link_destino}
                            className="inline-block mt-1 text-xs font-bold text-[#FF6A00] hover:underline"
                          >
                            {m.accion_ejecutada.link_texto || 'Ver en la obra ➔'}
                          </Link>
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
                            className="px-3 py-1.5 bg-white dark:bg-[#1A2230] hover:bg-[#FF6A00]/10 border border-gray-200 dark:border-[#263040] hover:border-[#FF6A00] text-navy-900 dark:text-gray-300 rounded-xl text-[11px] transition-colors text-left"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {m.remitente === 'usuario' && (
                    <div className="w-8 h-8 rounded-2xl bg-navy-800 text-white flex-shrink-0 flex items-center justify-center mt-0.5 shadow-sm">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}

              {cargando && (
                <div className="flex items-center gap-2.5 text-gray-400 text-xs py-3">
                  <Bot className="w-4 h-4 text-[#FF6A00] animate-bounce" />
                  <span>Consultando datos de la obra y analizando respuesta...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-4 border-t border-gray-200 dark:border-[#263040] bg-gray-50/70 dark:bg-[#141A23]/70">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEnviarMensaje();
                }}
                className="flex items-center gap-2.5"
              >
                <button
                  type="button"
                  onClick={handleVoiceInput}
                  className={`p-2.5 rounded-2xl transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-white dark:bg-[#1A2230] text-gray-500 hover:text-[#FF6A00] border border-gray-200 dark:border-[#263040]'
                  }`}
                  title={isListening ? 'Escuchando...' : 'Hablar por micrófono'}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <input
                  type="text"
                  value={inputTexto}
                  aria-label="Mensaje para el asistente de la obra"
                  onChange={(e) => setInputTexto(e.target.value)}
                  placeholder={`Pregunta sobre finanzas, o pide: "Agrega partida techumbre de 5 días", "Redacta WhatsApp..."`}
                  disabled={cargando}
                  className="flex-1 px-4 py-2.5 bg-white dark:bg-[#1A2230] border border-gray-200 dark:border-[#263040] rounded-2xl text-xs text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#FF6A00] shadow-sm"
                />

                <button
                  type="submit"
                  aria-label="Enviar mensaje"
                  disabled={!inputTexto.trim() || cargando}
                  className="p-2.5 bg-[#FF6A00] hover:bg-[#E55F00] disabled:opacity-40 text-white rounded-2xl shadow-md transition-all flex items-center justify-center"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
