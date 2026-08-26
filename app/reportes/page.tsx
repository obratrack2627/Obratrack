'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  MessageSquareShare,
  CheckCircle2,
  Phone,
  Send,
  Building2,
  User,
  Clock,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Image as ImageIcon,
  DollarSign,
  ExternalLink,
  Check,
  CheckCheck,
  Bot,
  Layers,
  ArrowRight,
  Smile,
  Paperclip,
  Mic,
  Copy,
  Info,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { Cliente, Proyecto, SubscriptionPlanId } from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';
import { getPlanDetails } from '@/lib/plans';
import PlanSwitcherModal from '@/components/PlanSwitcherModal';
import PlanLockOverlay from '@/components/PlanLockOverlay';

interface MensajeWhatsAppSimulado {
  id: string;
  remitente: 'cliente' | 'asistente';
  texto: string;
  timestamp: string;
  fotos?: string[];
  esAudio?: boolean;
}

export default function ReportesWhatsAppPage() {
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Estados de datos
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cliente autenticado en la sesión del chat de WhatsApp
  const [clienteAutenticadoId, setClienteAutenticadoId] = useState<string | null>(null);

  // Mensajes del simulador de WhatsApp
  const [mensajes, setMensajes] = useState<MensajeWhatsAppSimulado[]>([
    {
      id: 'wa-1',
      remitente: 'asistente',
      texto:
        '¡Hola! 👋 Bienvenido al servicio oficial de atención y seguimiento de obras de *ObraTrack*.\n\nPara consultar el avance, estado de pagos y fotos en tiempo real de tu obra contratada, por favor indícame tu *Nombre Completo* y *RUT* (ej: 15.432.890-1).',
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputTexto, setInputTexto] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Cargar datos
  const reloadData = () => {
    setClientes(dataService.getClientes());
    setProyectos(dataService.getProyectos());
    const plan = dataService.getActivePlan();
    if (plan) setActivePlan(plan);
  };

  useEffect(() => {
    reloadData();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, isLoading]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Enviar mensaje en el simulador
  const handleEnviarMensaje = async (textoPersonalizado?: string) => {
    const texto = textoPersonalizado || inputTexto;
    if (!texto.trim() || isLoading) return;

    const nuevoMensajeUsuario: MensajeWhatsAppSimulado = {
      id: 'wa-u-' + Date.now(),
      remitente: 'cliente',
      texto: texto,
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    };

    const nuevosMensajes = [...mensajes, nuevoMensajeUsuario];
    setMensajes(nuevosMensajes);
    setInputTexto('');
    setIsLoading(true);

    try {
      // 1. Obtener ficha si ya tenemos un cliente autenticado
      let fichaCliente = clienteAutenticadoId
        ? dataService.obtenerFichaCompletaCliente(clienteAutenticadoId)
        : null;

      // 2. Si no estaba autenticado, verificar si en este mensaje viene el RUT o Nombre
      if (!fichaCliente) {
        const clienteEncontrado = dataService.buscarClientePorRutONombre(texto);
        if (clienteEncontrado) {
          setClienteAutenticadoId(clienteEncontrado.id);
          fichaCliente = dataService.obtenerFichaCompletaCliente(clienteEncontrado.id);
        }
      }

      // 3. Preparar lista de clientes para que Gemini los reconozca
      const clientesDisponibles = dataService.getClientes().map((c) => ({
        id: c.id,
        nombre: c.nombre,
        rut: c.rut,
      }));

      // 4. Llamar a la API de WhatsApp con Gemini
      const response = await fetch('/api/webhook/whatsapp/cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: texto,
          historial: nuevosMensajes.slice(-8),
          cliente_autenticado: fichaCliente,
          clientes_disponibles: clientesDisponibles,
        }),
      });

      const data = await response.json();

      // Si Gemini detectó un RUT/Nombre para autenticar que no habíamos capturado
      if (data.autenticar_rut_o_nombre && !fichaCliente) {
        const match = dataService.buscarClientePorRutONombre(data.autenticar_rut_o_nombre);
        if (match) {
          setClienteAutenticadoId(match.id);
          showToast(`✅ Identidad verificada: ${match.nombre} (RUT: ${match.rut || 'OK'})`);
        }
      }

      const respuestaAsistente: MensajeWhatsAppSimulado = {
        id: 'wa-a-' + Date.now(),
        remitente: 'asistente',
        texto: data.respuesta || 'He recibido tu mensaje.',
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        fotos: data.fotos,
      };

      setMensajes((prev) => [...prev, respuestaAsistente]);
    } catch (error) {
      console.error(error);
      setMensajes((prev) => [
        ...prev,
        {
          id: 'wa-err-' + Date.now(),
          remitente: 'asistente',
          texto:
            '⚠️ Hubo un problema de conexión con el servidor de WhatsApp. Por favor intenta de nuevo.',
          timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReiniciarSimulador = () => {
    setClienteAutenticadoId(null);
    setMensajes([
      {
        id: 'wa-1',
        remitente: 'asistente',
        texto:
          '¡Hola! 👋 Bienvenido al servicio oficial de atención y seguimiento de obras de *ObraTrack*.\n\nPara consultar el avance, estado de pagos y fotos en tiempo real de tu obra contratada, por favor indícame tu *Nombre Completo* y *RUT* (ej: 15.432.890-1).',
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    showToast('Simulador de WhatsApp reiniciado.');
  };

  const handleSeleccionarClientePrueba = (c: Cliente) => {
    setClienteAutenticadoId(c.id);
    const ficha = dataService.obtenerFichaCompletaCliente(c.id);
    const primerProj = ficha?.proyectos[0];

    const textoIdentificacion = `Soy ${c.nombre}, mi RUT es ${c.rut || '15.432.890-1'}. ¿Cómo va mi obra?`;
    handleEnviarMensaje(textoIdentificacion);
    showToast(`Cliente seleccionado: ${c.nombre}`);
  };

  const handleEnviarFichaWhatsAppDirecto = (cliente: Cliente) => {
    const ficha = dataService.obtenerFichaCompletaCliente(cliente.id);
    if (!ficha || ficha.proyectos.length === 0) {
      showToast('Este cliente no tiene obras activas registradas.');
      return;
    }
    const p = ficha.proyectos[0];
    const mensajeWA = `🏗️ *INFORME DE AVANCE DE OBRA - OBRATRACK*
Estimado/a *${cliente.nombre}*, le compartimos el estado de su proyecto:

📌 *Proyecto:* ${p.proyecto.nombre}
📍 *Ubicación:* ${p.proyecto.direccion || p.proyecto.comuna || 'Chile'}
📊 *Avance General:* ${p.porcentaje_avance}%
💰 *Total Pagado:* ${formatCLP(p.total_pagado)} de ${formatCLP(p.total_contratado)}
⏳ *Saldo Restante:* ${formatCLP(p.saldo_pendiente)}
📅 *Término Estimado:* ${formatDate(p.proyecto.fecha_termino_estimada)}

_Puede consultar avances y fotos 24/7 respondiendo a este WhatsApp._`;

    const url = `https://wa.me/${(cliente.telefono || '+56987654321').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(mensajeWA)}`;
    window.open(url, '_blank');
    showToast(`Abriendo WhatsApp para ${cliente.nombre}...`);
  };

  const clienteActivoObj = clienteAutenticadoId
    ? dataService.getClienteById(clienteAutenticadoId)
    : null;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#FAF8F5] font-sans pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#111B21] text-white px-4 py-3 rounded-2xl shadow-2xl border border-[#25D366] flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-bottom-5">
          <Sparkles className="w-4 h-4 text-[#25D366] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <PlanSwitcherModal isOpen={isPlanModalOpen} onClose={() => setIsPlanModalOpen(false)} />

      {/* Navbar Superior */}
      <Navbar
        title="Seguimiento WhatsApp Clientes"
        subtitle="Asistente de IA para que los mandantes consulten estado de obra, fotos y pagos por WhatsApp"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5DFC9] text-xs font-mono text-gray-700 hover:border-[#25D366] transition-colors shadow-sm"
            >
              <span className="w-2 h-2 rounded-full bg-[#25D366]"></span>
              <span>{getPlanDetails(activePlan).nombre}</span>
            </button>
          </div>
        }
      />

      <div className="p-4 md:p-6 max-w-7xl w-full mx-auto">
        <PlanLockOverlay
          isLocked={activePlan === 'gratis'}
          featureName="Asistente de WhatsApp para Mandantes & Seguimiento de Obras"
          requiredPlan="pro"
          description="Permite que tus clientes consulten el avance de sus obras, estado de pagos y fotos de terreno directamente por WhatsApp con autenticación segura de RUT."
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* ========================================================================= */}
            {/* COLUMNA IZQUIERDA: SIMULADOR DE CELULAR SMARTPHONE WHATSAPP (7 cols) */}
            {/* ========================================================================= */}
            <div className="lg:col-span-7 flex flex-col items-center">
              
              {/* Contenedor del Smartphone */}
              <div className="w-full max-w-md bg-[#111B21] rounded-[42px] p-3 shadow-2xl border-4 border-gray-800 relative">
                
                {/* Notch / Cámara Superior */}
                <div className="w-32 h-4 bg-gray-800 rounded-full mx-auto mb-2 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-black/60"></div>
                </div>

                {/* Pantalla Interna de WhatsApp */}
                <div className="bg-[#0B141A] rounded-[32px] overflow-hidden flex flex-col h-[620px] border border-gray-800/80">
                  
                  {/* Header de WhatsApp */}
                  <div className="bg-[#202C33] text-white px-4 py-3 flex items-center justify-between border-b border-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center text-white font-bold text-sm shadow">
                          <Bot className="w-5 h-5" />
                        </div>
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#25D366] border-2 border-[#202C33]"></span>
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-white flex items-center gap-1.5">
                          <span>ObraTrack Asistente</span>
                          <ShieldCheck className="w-3.5 h-3.5 text-[#25D366]" />
                        </h4>
                        <p className="text-[10px] text-[#25D366] font-mono">
                          {clienteActivoObj
                            ? `Identificado: ${clienteActivoObj.nombre}`
                            : 'En línea • Cuenta oficial'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleReiniciarSimulador}
                      title="Reiniciar chat"
                      className="p-2 rounded-full hover:bg-gray-700/50 text-gray-300 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 text-gray-300" />
                    </button>
                  </div>

                  {/* Feed de Mensajes estilo WhatsApp */}
                  <div
                    className="flex-1 p-4 overflow-y-auto space-y-3 text-xs"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at center, rgba(37,211,102,0.03) 0%, transparent 70%)',
                    }}
                  >
                    {/* Aviso de Cifrado */}
                    <div className="bg-[#182229] text-gray-400 text-[10px] py-1.5 px-3 rounded-xl mx-auto w-fit text-center flex items-center gap-1.5 shadow-sm border border-gray-800">
                      <ShieldCheck className="w-3 h-3 text-[#25D366]" />
                      <span>Mensajes protegidos con autenticación de identidad por RUT</span>
                    </div>

                    {mensajes.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          msg.remitente === 'cliente' ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl p-3 space-y-2 shadow-sm relative ${
                            msg.remitente === 'cliente'
                              ? 'bg-[#005C4B] text-white rounded-tr-xs'
                              : 'bg-[#202C33] text-gray-100 rounded-tl-xs'
                          }`}
                        >
                          {/* Texto del Mensaje */}
                          <div className="whitespace-pre-line leading-relaxed text-xs">
                            {msg.texto}
                          </div>

                          {/* Fotografías enviadas por la IA */}
                          {msg.fotos && msg.fotos.length > 0 && (
                            <div className="grid grid-cols-2 gap-1.5 pt-1.5">
                              {msg.fotos.map((fotoUrl, fIdx) => (
                                <div
                                  key={fIdx}
                                  className="relative rounded-xl overflow-hidden border border-gray-700 group aspect-video bg-black"
                                >
                                  <img
                                    src={fotoUrl}
                                    alt="Foto de terreno"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 text-[9px] text-white rounded font-mono">
                                    📸 Faena {fIdx + 1}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Timestamp y Vistos */}
                          <div className="flex items-center justify-end gap-1 text-[9px] text-gray-400 font-mono pt-1">
                            <span>{msg.timestamp}</span>
                            {msg.remitente === 'cliente' && (
                              <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {isLoading && (
                      <div className="flex items-center gap-2 text-gray-300 bg-[#202C33] px-3.5 py-2 rounded-2xl w-fit text-xs animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-[#25D366] animate-ping"></span>
                        <span className="font-mono text-[11px]">Asistente escribiendo...</span>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Sugerencias Rápidas de Prueba */}
                  <div className="px-3 py-2 bg-[#111B21] border-t border-gray-800 flex gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
                    <button
                      onClick={() =>
                        handleEnviarMensaje('Soy Carlos Henríquez, RUT 15.432.890-1. ¿Cómo va mi obra?')
                      }
                      className="px-2.5 py-1 bg-[#202C33] hover:bg-[#2A3942] text-gray-200 rounded-lg whitespace-nowrap border border-gray-700 transition-colors"
                    >
                      👤 Carlos Henríquez
                    </button>
                    <button
                      onClick={() => handleEnviarMensaje('¿Cuánto he pagado y cuánto me falta?')}
                      className="px-2.5 py-1 bg-[#202C33] hover:bg-[#2A3942] text-gray-200 rounded-lg whitespace-nowrap border border-gray-700 transition-colors"
                    >
                      💰 Consultar Pagos
                    </button>
                    <button
                      onClick={() => handleEnviarMensaje('¿Me pueden mandar fotos del avance de hoy?')}
                      className="px-2.5 py-1 bg-[#202C33] hover:bg-[#2A3942] text-gray-200 rounded-lg whitespace-nowrap border border-gray-700 transition-colors"
                    >
                      📸 Pedir Fotos
                    </button>
                  </div>

                  {/* Input de Mensaje estilo WhatsApp */}
                  <div className="p-2.5 bg-[#202C33] flex items-center gap-2">
                    <input
                      type="text"
                      value={inputTexto}
                      onChange={(e) => setInputTexto(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleEnviarMensaje()}
                      placeholder="Escribe como mandante (ej: Mi RUT es 15.432.890-1)..."
                      className="flex-1 bg-[#2A3942] text-white placeholder-gray-400 text-xs px-4 py-2.5 rounded-full focus:outline-none focus:ring-1 focus:ring-[#25D366]"
                    />
                    <button
                      onClick={() => handleEnviarMensaje()}
                      disabled={!inputTexto.trim() || isLoading}
                      className="w-9 h-9 rounded-full bg-[#25D366] hover:bg-[#1EBE5D] text-white flex items-center justify-center disabled:opacity-50 transition-all shadow"
                    >
                      <Send className="w-4 h-4 ml-0.5" />
                    </button>
                  </div>

                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* COLUMNA DERECHA: DIRECTORIO DE MANDANTES & AUTOMATIZACIÓN (5 cols) */}
            {/* ========================================================================= */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Tarjeta de Clientes Registrados */}
              <div className="bg-white border border-[#E5DFC9] rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#FAF8F5] pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#25D366]" />
                    <h3 className="font-heading font-bold text-sm text-[#1E1E1E]">
                      Mandantes con Seguimiento ({clientes.length})
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    IA Activa
                  </span>
                </div>

                <p className="text-xs text-gray-600">
                  Haz clic en <strong>Probar en Simulador</strong> para autenticar automáticamente al cliente o en <strong>Enviar WhatsApp</strong> para enviarle su ficha oficial.
                </p>

                <div className="space-y-3">
                  {clientes.map((c) => {
                    const ficha = dataService.obtenerFichaCompletaCliente(c.id);
                    const primerProj = ficha?.proyectos[0];
                    const isSelected = clienteAutenticadoId === c.id;

                    return (
                      <div
                        key={c.id}
                        className={`p-4 rounded-2xl border transition-all space-y-2.5 ${
                          isSelected
                            ? 'bg-emerald-50/70 border-[#25D366] shadow-sm'
                            : 'bg-[#FAF8F5] border-[#E5DFC9] hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-bold text-xs text-[#1E1E1E] flex items-center gap-1.5">
                              <span>{c.nombre}</span>
                              {isSelected && (
                                <span className="px-1.5 py-0.5 bg-[#25D366] text-white text-[9px] font-bold rounded">
                                  ACTIVO
                                </span>
                              )}
                            </h4>
                            <span className="text-[11px] font-mono text-gray-500 block">
                              RUT: {c.rut || '15.432.890-1'} • 📞 {c.telefono || '+56 9 8765 4321'}
                            </span>
                          </div>
                        </div>

                        {primerProj && (
                          <div className="bg-white p-2.5 rounded-xl border border-[#E5DFC9] space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#1E1E1E] text-[11px] truncate">
                                {primerProj.proyecto.nombre}
                              </span>
                              <span className="font-mono font-bold text-emerald-600 text-[11px]">
                                {primerProj.porcentaje_avance}% Avance
                              </span>
                            </div>

                            {/* Barra de Progreso */}
                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-[#25D366] h-full rounded-full transition-all duration-500"
                                style={{ width: `${primerProj.porcentaje_avance}%` }}
                              ></div>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono pt-1">
                              <span>Pagado: {formatCLP(primerProj.total_pagado)}</span>
                              <span>Saldo: {formatCLP(primerProj.saldo_pendiente)}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handleSeleccionarClientePrueba(c)}
                            className="flex-1 py-2 px-3 bg-white hover:bg-gray-50 text-[#1E1E1E] border border-[#E5DFC9] rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                          >
                            <Bot className="w-3.5 h-3.5 text-[#25D366]" />
                            <span>Probar en Simulador</span>
                          </button>
                          <button
                            onClick={() => handleEnviarFichaWhatsAppDirecto(c)}
                            className="py-2 px-3 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Enviar WhatsApp</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Parámetros de Seguridad y Configuración */}
              <div className="bg-white border border-[#E5DFC9] rounded-3xl p-6 shadow-sm space-y-3">
                <h3 className="font-heading font-bold text-xs text-[#1E1E1E] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-obra-orange" />
                  <span>Seguridad de Identidad de Mandantes</span>
                </h3>
                <ul className="text-xs text-gray-600 space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Autenticación por RUT:</strong> El asistente solo entrega información financiera y de avance a clientes cuyo RUT coincida con el contrato.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Fotografías en Vivo:</strong> Envía imágenes reales cargadas en la bitácora de la faena.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>IA Conversacional:</strong> Respuestas analíticas impulsadas por Google Gemini.</span>
                  </li>
                </ul>
              </div>

            </div>
          </div>
        </PlanLockOverlay>
      </div>
    </div>
  );
}
