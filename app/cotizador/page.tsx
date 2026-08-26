'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Bot,
  Send,
  User,
  RefreshCw,
  Building2,
  Users,
  Calendar,
  DollarSign,
  CheckCircle2,
  HardHat,
  MapPin,
  Clock,
  ArrowRight,
  ExternalLink,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  ShieldCheck,
  Zap,
  Phone,
  MessageCircle,
  RotateCcw,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import {
  MensajeChatCotizador,
  Proyecto,
  Usuario,
  Cliente,
  EventoAgenda,
  SubscriptionPlanId,
  AccionAsistenteIA,
} from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';
import { getPlanDetails } from '@/lib/plans';
import PlanSwitcherModal from '@/components/PlanSwitcherModal';
import PlanLockOverlay from '@/components/PlanLockOverlay';

const INITIAL_CHAT_MESSAGE: MensajeChatCotizador = {
  id: 'm-init',
  remitente: 'agente',
  texto:
    '¡Hola! Soy tu **Copiloto Obrero IA de ObraTrack**, impulsado por **Google Gemini**.\n\nPuedo cotizar obras, asesorarte en costos de faena, y lo más importante: **controlar y actualizar la plataforma por ti**.\n\nPruébame pidiéndome cosas como:\n• *"Créame una obra de radier para Carlos Henríquez en Peñalolén por 3.5 millones iniciando este lunes"*\n• *"Agrega al maestro Juan Pérez como albañil con teléfono +56912345678"*\n• *"Agéndame una visita a terreno para el viernes a las 10:00 en Las Condes"*',
  timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
  sugerencias: [
    'Créame una obra de radier de 35m2 en Peñalolén por 3.2M',
    'Agrega al maestro Pedro Soto como carpintero',
    'Agéndame una visita a terreno para el viernes a las 10:00',
    '¿Cuánto cobrar por instalar 40m2 de porcelanato?',
  ],
};

export default function CopilotoObreroPage() {
  const router = useRouter();
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Estados de datos
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [eventosAgenda, setEventosAgenda] = useState<EventoAgenda[]>([]);

  // Estados de interfaz
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Mensajes de chat (Persistidos por sesión de usuario)
  const [mensajesChat, setMensajesChat] = useState<MensajeChatCotizador[]>([INITIAL_CHAT_MESSAGE]);
  const [inputChat, setInputChat] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Cargar datos y restaurar historial de sesión
  const reloadData = () => {
    setProyectos(dataService.getProyectos());
    setUsuarios(dataService.getUsuarios());
    setClientes(dataService.getClientes());
    setEventosAgenda(dataService.getEventosAgenda());
  };

  useEffect(() => {
    const user = dataService.getActiveUser();
    if (user?.rol === 'terreno') {
      router.replace('/proyectos');
      return;
    }
    reloadData();
    const savedPlan = dataService.getActivePlan();
    if (savedPlan) setActivePlan(savedPlan);

    // Recuperar historial de la sesión activa
    const savedChat = dataService.getChatSessionHistory();
    if (savedChat && Array.isArray(savedChat) && savedChat.length > 0) {
      setMensajesChat(savedChat);
    }
  }, [router]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajesChat, isChatLoading]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Reiniciar conversación activa para empezar una nueva
  const handleResetChat = () => {
    dataService.clearChatSessionHistory();
    const freshMessage: MensajeChatCotizador = {
      ...INITIAL_CHAT_MESSAGE,
      id: 'm-init-' + Date.now(),
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    };
    setMensajesChat([freshMessage]);
    dataService.saveChatSessionHistory([freshMessage]);
    showToast('✨ Conversación reiniciada para esta sesión.');
  };

  // Enviar mensaje a Google Gemini y ejecutar acciones
  const handleSendChat = async (texto?: string) => {
    const msgToSend = texto || inputChat;
    if (!msgToSend.trim() || isChatLoading) return;

    const userMsg: MensajeChatCotizador = {
      id: 'm-u-' + Date.now(),
      remitente: 'usuario',
      texto: msgToSend,
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...mensajesChat, userMsg];
    setMensajesChat(nextHistory);
    dataService.saveChatSessionHistory(nextHistory);

    setInputChat('');
    setIsChatLoading(true);

    try {
      // Enviar contexto de obras y equipo actual a Gemini
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

      const response = await fetch('/api/cotizador/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: msgToSend,
          historial: nextHistory.slice(-8),
          contexto_db: contextoDB,
        }),
      });

      const data = await response.json();

      let accionEjecutada: AccionAsistenteIA | undefined = undefined;

      // Ejecución autónoma de la acción detectada por Gemini
      if (data.accion) {
        const acc = data.accion;

        if (acc.tipo === 'crear_proyecto') {
          const nuevoProj = dataService.crearProyectoDesdeIA({
            nombre: acc.nombre || 'Nueva Obra',
            cliente_nombre: acc.cliente_nombre,
            cliente_telefono: acc.cliente_telefono,
            comuna: acc.comuna,
            direccion: acc.direccion,
            monto: acc.monto,
            dias: acc.dias,
            descripcion: acc.descripcion,
            partidas: acc.partidas,
          });
          reloadData();
          accionEjecutada = {
            tipo: 'crear_proyecto',
            titulo: `Obra Creada: ${nuevoProj.nombre}`,
            detalles: nuevoProj,
            resultado_texto: `Monto: $${nuevoProj.monto_cotizado.toLocaleString('es-CL')} CLP • Ubicación: ${nuevoProj.comuna || 'Chile'} • Fecha inicio: ${formatDate(nuevoProj.fecha_inicio)}`,
            link_destino: `/proyectos/${nuevoProj.id}/gantt`,
            link_texto: 'Ver Obra & Carta Gantt ➔',
          };
          showToast(`🏗️ ¡Obra "${nuevoProj.nombre}" creada en el menú de Proyectos!`);
        } else if (acc.tipo === 'agregar_trabajador') {
          const nuevoUser = dataService.agregarTrabajadorDesdeIA({
            nombre: acc.nombre || 'Nuevo Trabajador',
            rol: acc.rol || 'terreno',
            telefono: acc.telefono,
            email: acc.email,
          });
          reloadData();
          accionEjecutada = {
            tipo: 'agregar_trabajador',
            titulo: `Trabajador Incorporado: ${nuevoUser.nombre}`,
            detalles: nuevoUser,
            resultado_texto: `Rol: ${nuevoUser.rol.toUpperCase()} • WhatsApp: ${nuevoUser.telefono_whatsapp}`,
            link_destino: `/equipo`,
            link_texto: 'Ver Equipo ➔',
          };
          showToast(`👷‍♂️ ¡Trabajador "${nuevoUser.nombre}" agregado al equipo!`);
        } else if (acc.tipo === 'asignar_trabajador') {
          const ok = dataService.asignarTrabajadorAProyecto(
            acc.trabajador_nombre || '',
            acc.proyecto_nombre || ''
          );
          reloadData();
          accionEjecutada = {
            tipo: 'asignar_trabajador',
            titulo: `Cuadrilla Asignada`,
            detalles: acc,
            resultado_texto: ok
              ? `${acc.trabajador_nombre} fue asignado a la obra ${acc.proyecto_nombre}.`
              : `Se registró la asignación para ${acc.trabajador_nombre}.`,
            link_destino: `/proyectos`,
            link_texto: 'Ver Proyectos ➔',
          };
          showToast(`🔨 ¡Cuadrilla actualizada!`);
        } else if (acc.tipo === 'agendar_visita' || acc.tipo === 'agendar_evento') {
          const nuevoEvt = dataService.saveEventoAgenda({
            titulo: acc.titulo || 'Visita a Terreno',
            tipo: acc.tipo_evento || 'visita_terreno',
            fecha: acc.fecha || new Date(Date.now() + 86400000).toISOString().split('T')[0],
            hora: acc.hora || '10:00',
            comuna_lugar: acc.comuna_lugar || 'Santiago, Chile',
            descripcion: acc.descripcion || msgToSend,
            cliente_nombre: acc.cliente_nombre || 'Mandante',
            completado: false,
            origen: 'asistente_ia',
          });
          reloadData();
          accionEjecutada = {
            tipo: 'agendar_visita',
            titulo: `Visita Agendada: ${nuevoEvt.titulo}`,
            detalles: nuevoEvt,
            resultado_texto: `Fecha: ${formatDate(nuevoEvt.fecha)} a las ${nuevoEvt.hora} hrs • Lugar: ${nuevoEvt.comuna_lugar}`,
          };
          showToast(`📅 ¡Visita agendada en tu calendario de faena!`);
        }
      }

      const agentMsg: MensajeChatCotizador = {
        id: 'm-a-' + Date.now(),
        remitente: 'agente',
        texto: data.respuesta || 'He procesado tu instrucción.',
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        sugerencias: data.sugerencias,
        accion_ejecutada: accionEjecutada,
      };

      const updatedHistory = [...nextHistory, agentMsg];
      setMensajesChat(updatedHistory);
      dataService.saveChatSessionHistory(updatedHistory);
    } catch (err: any) {
      console.error(err);
      const errMsg: MensajeChatCotizador = {
        id: 'm-err-' + Date.now(),
        remitente: 'agente',
        texto:
          'Hubo un problema de conexión con Google Gemini. Por favor verifica tu red e intenta de nuevo.',
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      };
      const updatedHistory = [...nextHistory, errMsg];
      setMensajesChat(updatedHistory);
      dataService.saveChatSessionHistory(updatedHistory);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleToggleEvento = (id: string) => {
    dataService.toggleEventoAgenda(id);
    reloadData();
  };

  const handleDeleteEvento = (id: string) => {
    dataService.deleteEventoAgenda(id);
    reloadData();
    showToast('Evento eliminado de la agenda.');
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-kraft-100 font-sans pb-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-navy-900 text-white px-4 py-3 rounded-2xl shadow-2xl border-2 border-obra-orange flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-bottom-5">
          <Sparkles className="w-4 h-4 text-obra-orange shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <PlanSwitcherModal isOpen={isPlanModalOpen} onClose={() => setIsPlanModalOpen(false)} />

      {/* Navbar Superior */}
      <Navbar
        title="Copiloto Obrero IA"
        subtitle="Asistente de faena autónomo impulsado por Google Gemini 2.5 / 3.6 IA"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5DFC9] text-xs font-mono text-gray-700 hover:border-[#FF6A00] transition-colors shadow-sm"
            >
              <span className="w-2 h-2 rounded-full bg-[#6B8F72]"></span>
              <span>{getPlanDetails(activePlan).nombre}</span>
            </button>
          </div>
        }
      />

      <div className="p-4 md:p-6 max-w-7xl w-full mx-auto">
        <PlanLockOverlay
          isLocked={activePlan !== 'pro_ia'}
          featureName="Copiloto Obrero IA & Control Autónomo (Google Gemini)"
          requiredPlan="pro_ia"
          description="Conversa con el asistente inteligente para cotizar obras, crear proyectos en el sistema, incorporar trabajadores y agendar visitas en tiempo real."
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* ========================================================================= */}
            {/* COLUMNA PRINCIPAL: CHAT CONVERSACIONAL CON GEMINI (8 cols) */}
            {/* ========================================================================= */}
            <div className="lg:col-span-8 bg-white border border-kraft-200 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[580px]">
              
              {/* Header del Chat con Botón de Nueva Conversación */}
              <div className="bg-navy-900 text-white px-5 py-4 border-b border-navy-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-obra-orange flex items-center justify-center text-white shadow-md">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                      <span>Copiloto de Faena & Asistente IA</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Gemini 3.6 Online
                      </span>
                    </h3>
                    <p className="text-[11px] text-gray-300">
                      Escribe lo que necesitas y la IA cotizará o controlará la web por ti
                    </p>
                  </div>
                </div>

                {/* Botón Nueva Conversación */}
                <button
                  onClick={handleResetChat}
                  title="Iniciar nueva conversación limpia"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy-800 hover:bg-navy-700 text-gray-300 hover:text-white border border-navy-700 text-[11px] font-bold transition-all shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-obra-orange" />
                  <span className="hidden sm:inline">Nueva Conversación</span>
                </button>
              </div>

              {/* Feed de Conversación */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-kraft-50/40 text-xs">
                {mensajesChat.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.remitente === 'usuario' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 space-y-3 shadow-sm ${
                        m.remitente === 'usuario'
                          ? 'bg-navy-900 text-white rounded-br-xs'
                          : 'bg-white border border-kraft-200 text-navy-900 rounded-bl-xs'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[10px] text-gray-400">
                        {m.remitente === 'usuario' ? (
                          <User className="w-3.5 h-3.5 text-obra-orange" />
                        ) : (
                          <Bot className="w-3.5 h-3.5 text-obra-orange" />
                        )}
                        <span>{m.remitente === 'usuario' ? 'Tú (Jefe de Obra)' : 'Copiloto Obrero'}</span>
                        <span className="ml-auto font-mono text-[9px]">{m.timestamp}</span>
                      </div>

                      {/* Texto del Mensaje */}
                      <div className="whitespace-pre-line leading-relaxed text-xs space-y-2">
                        {m.texto}
                      </div>

                      {/* ============================================================= */}
                      {/* TARJETA INTERACTIVA DE ACCIÓN EJECUTADA POR LA IA */}
                      {/* ============================================================= */}
                      {m.accion_ejecutada && (
                        <div className="mt-3 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-obra-orange rounded-2xl p-3.5 space-y-2 text-navy-900 animate-in fade-in">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold uppercase text-obra-orange flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-obra-orange" />
                              <span>Acción Ejecutada en ObraTrack</span>
                            </span>
                            <span className="px-2 py-0.5 rounded bg-obra-green text-white text-[9px] font-bold">
                              ✓ GUARDADO
                            </span>
                          </div>

                          <h4 className="font-heading font-bold text-sm text-navy-900">
                            {m.accion_ejecutada.titulo}
                          </h4>
                          <p className="text-xs text-gray-700">{m.accion_ejecutada.resultado_texto}</p>

                          {m.accion_ejecutada.link_destino && (
                            <div className="pt-2 border-t border-obra-orange/20 flex items-center justify-end">
                              <Link
                                href={m.accion_ejecutada.link_destino}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-navy-900 hover:bg-navy-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                              >
                                <span>{m.accion_ejecutada.link_texto || 'Ver en la Web ➔'}</span>
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Sugerencias Rápidas */}
                    {m.sugerencias && m.sugerencias.length > 0 && m.remitente === 'agente' && (
                      <div className="flex flex-wrap gap-1.5 mt-2 max-w-[85%]">
                        {m.sugerencias.map((sug, sIdx) => (
                          <button
                            key={sIdx}
                            onClick={() => handleSendChat(sug)}
                            className="px-3 py-1.5 bg-white border border-kraft-200 hover:border-obra-orange text-navy-900 rounded-xl text-[11px] font-medium shadow-2xs transition-all hover:bg-orange-50/50 text-left"
                          >
                            💡 {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {isChatLoading && (
                  <div className="flex items-center gap-2.5 text-navy-900 bg-white border border-kraft-200 px-4 py-2.5 rounded-2xl w-fit shadow-xs animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin text-obra-orange" />
                    <span className="font-mono text-xs font-bold">Google Gemini pensando y analizando faena...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Barra de Entrada del Chat */}
              <div className="p-3 bg-white border-t border-kraft-200 flex items-center gap-2">
                <input
                  type="text"
                  value={inputChat}
                  onChange={(e) => setInputChat(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Escribe tu instrucción (ej: Créame una obra de radier para Carlos en Peñalolén por 3.5M)..."
                  className="flex-1 text-xs bg-kraft-50 border border-kraft-200 rounded-2xl px-4 py-3 text-navy-900 focus:outline-none focus:border-obra-orange focus:bg-white transition-all shadow-inner"
                />
                <button
                  onClick={() => handleSendChat()}
                  disabled={!inputChat.trim() || isChatLoading}
                  className="px-5 py-3 bg-obra-orange hover:bg-orange-600 text-white rounded-2xl font-heading font-bold text-xs flex items-center gap-2 disabled:opacity-50 transition-all shadow-md hover:shadow-lg"
                >
                  <span>Enviar</span>
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* PANEL LATERAL: CENTRO DE CONTROL EN VIVO (4 cols) */}
            {/* ========================================================================= */}
            <div className="lg:col-span-4 space-y-5">
              
              {/* Obras y Proyectos Creados */}
              <div className="bg-white border border-kraft-200 rounded-3xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-kraft-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-obra-orange" />
                    <h3 className="font-heading font-bold text-xs text-navy-900">
                      Obras en ObraTrack ({proyectos.length})
                    </h3>
                  </div>
                  <Link
                    href="/proyectos"
                    className="text-[11px] font-mono text-obra-orange hover:underline font-bold"
                  >
                    Ver todas ➔
                  </Link>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {proyectos.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">No hay obras creadas aún.</p>
                  ) : (
                    proyectos.slice(0, 4).map((p) => (
                      <Link
                        key={p.id}
                        href={`/proyectos/${p.id}/finanzas`}
                        className="block bg-kraft-50/60 hover:bg-kraft-100/80 border border-kraft-200 p-2.5 rounded-xl transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-navy-900 truncate">{p.nombre}</span>
                          <span className="text-[10px] font-mono font-bold text-emerald-600">
                            {formatCLP(p.monto_cotizado)}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 block">
                          📍 {p.comuna || 'Chile'} • {p.estado.toUpperCase()}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              {/* Equipo & Cuadrilla Activa */}
              <div className="bg-white border border-kraft-200 rounded-3xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-kraft-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-obra-green" />
                    <h3 className="font-heading font-bold text-xs text-navy-900">
                      Equipo de Faena ({usuarios.length})
                    </h3>
                  </div>
                  <Link
                    href="/equipo"
                    className="text-[11px] font-mono text-obra-green hover:underline font-bold"
                  >
                    Ver equipo ➔
                  </Link>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {usuarios.slice(0, 4).map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between bg-kraft-50/60 border border-kraft-200 p-2.5 rounded-xl text-xs"
                    >
                      <div>
                        <span className="font-bold text-navy-900 block">{u.nombre}</span>
                        <span className="text-[10px] font-mono text-gray-500">{u.rol.toUpperCase()}</span>
                      </div>
                      {u.telefono_whatsapp && (
                        <a
                          href={`https://wa.me/${u.telefono_whatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-lg shadow-xs"
                          title="Abrir WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Agenda de Terreno & Visitas */}
              <div className="bg-white border border-kraft-200 rounded-3xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-kraft-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    <h3 className="font-heading font-bold text-xs text-navy-900">
                      Agenda de Terreno ({eventosAgenda.length})
                    </h3>
                  </div>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {eventosAgenda.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">No hay visitas agendadas.</p>
                  ) : (
                    eventosAgenda.map((evt) => (
                      <div
                        key={evt.id}
                        className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                          evt.completado
                            ? 'bg-gray-50 border-gray-200 opacity-60'
                            : 'bg-kraft-50/60 border-kraft-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <button
                            onClick={() => handleToggleEvento(evt.id)}
                            className="flex items-start gap-1.5 text-left flex-1"
                          >
                            {evt.completado ? (
                              <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                            )}
                            <span
                              className={`font-bold text-[11px] ${
                                evt.completado ? 'line-through text-gray-500' : 'text-navy-900'
                              }`}
                            >
                              {evt.titulo}
                            </span>
                          </button>
                          <button
                            onClick={() => handleDeleteEvento(evt.id)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-[10px] font-mono text-gray-500 block pl-5">
                          📅 {formatDate(evt.fecha)} • {evt.hora || '10:00'} hrs • {evt.comuna_lugar || 'Chile'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        </PlanLockOverlay>
      </div>
    </div>
  );
}
