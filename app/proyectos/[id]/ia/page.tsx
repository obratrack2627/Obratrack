'use client';
import MoneyAmount from '@/components/MoneyAmount';
import CompactSummary from '@/components/CompactSummary';
import { conversationRequest } from '@/lib/ai/conversation';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Bot,
  Trash2,
  Phone,
  Lock,
  ArrowRight,
} from 'lucide-react';
import ProjectTabsHeader from '@/components/ProjectTabsHeader';
import { ProjectWorkspaceSkeleton } from '@/components/PageSkeletons';
import { toast } from '@/components/ToastProvider';
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
} from '@/types/database';
import GoogleMapsProjectViewer from '@/components/GoogleMapsProjectViewer';
import ModalOverlay from '@/components/ModalOverlay';
import { requestAIStream, applyAIResponse } from '@/lib/ai/client';
import ObraBotWhatsAppLink from '@/components/ObraBotWhatsAppLink';
import {
  ObraBotComposer,
  ObraBotMessageBubble,
  ObraBotStreamingBubble,
  fileToChatImage,
} from '@/components/ObraBotChatShared';

export default function ProyectoIAPage() {
  const params = useParams();
  const projectId = params?.id as string;
  const abortRef = useRef<AbortController | null>(null);

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [materiales, setMateriales] = useState<MaterialProyecto[]>([]);
  const [bitacora, setBitacora] = useState<BitacoraEntrada[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [imprevistos, setImprevistos] = useState<Imprevisto[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('gratis');

  const [mensajes, setMensajes] = useState<MensajeChatProyecto[]>([]);
  const [inputTexto, setInputTexto] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [streamStage, setStreamStage] = useState('');
  const [streamText, setStreamText] = useState('');
  const [isMapsModalOpen, setIsMapsModalOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasAccess = ['pro', 'pro_ia'].includes(activePlan);

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
    setActivePlan(dataService.getActivePlan());

    const historialLocal = dataService.getProyectoChatHistorial(projectId);
    if (historialLocal.length > 0) {
      setMensajes(historialLocal);
    } else if (proj) {
      const bienvenida: MensajeChatProyecto = {
        id: 'welcome-' + projectId,
        proyecto_id: projectId,
        empresa_id: proj.empresa_id,
        remitente: 'agente',
        texto: `Estoy trabajando con la obra **${proj.nombre}**. Puedes consultar sus pendientes, cotizar un adicional, agendar visitas o subir una foto de avance/incidente.`,
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

    if (projectId) {
      void dataService.loadProyectoChatFromSupabase(projectId).then((synced) => {
        if (synced && synced.length > 0) {
          setMensajes(synced);
        }
      });
    }

    const planHandler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    const refresh = () => loadData();
    window.addEventListener('obratrack_plan_changed', planHandler);
    window.addEventListener('obratrack_cloud_synced', refresh);
    return () => {
      window.removeEventListener('obratrack_plan_changed', planHandler);
      window.removeEventListener('obratrack_cloud_synced', refresh);
    };
  }, [projectId]);

  useEffect(() => {
    const feed = messagesEndRef.current?.parentElement;
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
  }, [mensajes, cargando, streamText]);

  const showToast = (msg: string) => toast(msg);

  const handleLimpiarHistorial = () => setConfirmClearOpen(true);

  const confirmLimpiarHistorial = () => {
    setConfirmClearOpen(false);
    if (!projectId) return;
    dataService.clearProyectoChatHistorial(projectId);
    loadData();
    showToast('Historial del proyecto reiniciado.');
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const updateLocalMessage = (id: string, patch: Partial<MensajeChatProyecto>) => {
    setMensajes((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const handleEnviarMensaje = async (textoAEnviar?: string) => {
    const rawText = (textoAEnviar ?? inputTexto).trim();
    const fileToUse = textoAEnviar !== undefined ? null : attachedFile;
    if ((!rawText && !fileToUse) || cargando || !proyecto || !['pro', 'pro_ia'].includes(dataService.getActivePlan())) return;

    if (fileToUse && !fileToUse.type.startsWith('image/')) {
      showToast('En el chat de obra puedes adjuntar fotos JPG, PNG o WebP. Para planillas Excel o PDF usa el Cotizador.');
      return;
    }

    const displayUserText = fileToUse ? `${rawText ? rawText + '\n' : ''}📷 ${fileToUse.name}` : rawText;
    const userMsg: MensajeChatProyecto = {
      id: 'usr-p-' + Date.now(),
      proyecto_id: projectId,
      empresa_id: proyecto.empresa_id,
      remitente: 'usuario',
      texto: displayUserText,
      created_at: new Date().toISOString(),
    };

    dataService.saveProyectoMensajeChat(userMsg);
    setMensajes((prev) => [...prev, userMsg]);
    if (textoAEnviar === undefined) {
      setInputTexto('');
      setAttachedFile(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setCargando(true);
    setStreamStage('Cargando contexto de la obra…');
    setStreamText('');
    const startedAt = Date.now();

    try {
      const imagen = fileToUse ? await fileToChatImage(fileToUse) : undefined;
      const query = rawText || 'Analiza esta foto de la obra e indícame cómo registrarla.';
      const totalPagado = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
      const totalImprevistos = imprevistos.reduce((sum, i) => sum + Number(i.monto || 0), 0);
      const totalMateriales = materiales.reduce(
        (sum, m) => sum + Number(m.subtotal || m.cantidad * m.precio_unitario || 0),
        0,
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

      const data = await requestAIStream(
        `/api/proyectos/${projectId}/chat`,
        {
          mensaje: query,
          historial: conversationRequest(mensajes, query),
          contexto_proyecto: contextoProyecto,
          contexto_cotizacion: [...mensajes].reverse().find((m) => m.cotizacion_generada)?.cotizacion_generada,
          ...(imagen ? { imagen } : {}),
        },
        {
          onStage: (s) => setStreamStage(s),
          onText: (t) => setStreamText(t),
        },
        controller.signal,
      );
      const processed = await applyAIResponse(data, projectId, { confirmCritical: true });
      loadData();
      if (processed.accion_ejecutada && processed.accion_ejecutada.tipo !== 'solicitar_datos_persona') {
        showToast(processed.accion_ejecutada.titulo);
      }

      const agenteMsg: MensajeChatProyecto = {
        id: 'agt-p-' + Date.now(),
        proyecto_id: projectId,
        empresa_id: proyecto.empresa_id,
        remitente: 'agente',
        ...processed,
        latencia_ms: Date.now() - startedAt,
        created_at: new Date().toISOString(),
      };

      dataService.saveProyectoMensajeChat(agenteMsg);
      setMensajes((prev) => [...prev, agenteMsg]);
    } catch (err: any) {
      const aborted = err?.name === 'AbortError' || controller.signal.aborted;
      const errorMsg = err?.message || 'Error de comunicación con el asistente.';
      if (!aborted) showToast(errorMsg);
      const agenteErrorMsg: MensajeChatProyecto = {
        id: 'agt-err-' + Date.now(),
        proyecto_id: projectId,
        empresa_id: proyecto.empresa_id,
        remitente: 'agente',
        texto: aborted ? 'Solicitud detenida.' : `No pude procesar tu mensaje: ${errorMsg}`,
        es_error: !aborted,
        reintentar_texto: !aborted && rawText ? rawText : undefined,
        created_at: new Date().toISOString(),
      };
      setMensajes((prev) => [...prev, agenteErrorMsg]);
    } finally {
      abortRef.current = null;
      setCargando(false);
      setStreamStage('');
      setStreamText('');
    }
  };

  const handleConfirmCritical = async (messageId: string, rawResponse: Record<string, any>) => {
    setCargando(true);
    try {
      const processed = await applyAIResponse(rawResponse, projectId, { confirmCritical: false });
      updateLocalMessage(messageId, { ...processed, confirmacion_pendiente: undefined });
      loadData();
      if (processed.accion_ejecutada) showToast(processed.accion_ejecutada.titulo);
    } catch (err: any) {
      updateLocalMessage(messageId, {
        texto: err?.message || 'No se pudo ejecutar la acción.',
        confirmacion_pendiente: undefined,
        es_error: true,
      });
    } finally {
      setCargando(false);
    }
  };

  const handleCancelCritical = (messageId: string) => {
    updateLocalMessage(messageId, {
      texto: 'Acción cancelada. No se realizaron cambios.',
      confirmacion_pendiente: undefined,
    });
  };

  if (!proyecto) {
    return <ProjectWorkspaceSkeleton label="Cargando ObraBot..." />;
  }

  const totalPagado = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
  const saldoPendiente = Math.max(0, (proyecto.monto_cotizado || 0) - totalPagado);
  const pctAvance = proyecto.porcentaje_avance_ponderado || 0;

  return (
    <div className="flex-1 flex flex-col min-h-screen">
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

      <div className="p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6 flex-1 flex flex-col">
        <CompactSummary>
          <div className="workspace-metrics grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                <MoneyAmount value={proyecto.monto_cotizado || 0} />
              </p>
            </div>

            <div className="bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl p-3.5 shadow-sm">
              <p className="text-[10px] font-mono font-semibold uppercase text-gray-400">Saldo Por Cobrar</p>
              <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                <MoneyAmount value={saldoPendiente} />
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
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors"
                  title="Abrir WhatsApp del cliente"
                >
                  <Phone className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </CompactSummary>

        {!hasAccess ? (
          <div className="flex-1 bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-3xl bg-[#FF6A00]/15 text-[#FF6A00] flex items-center justify-center border border-[#FF6A00]/30 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>

            <div className="max-w-md space-y-2">
              <span className="px-2.5 py-1 bg-[#FF6A00]/20 text-[#FF6A00] rounded-full text-xs font-mono font-bold">
                PLAN PRO O PRO IA
              </span>
              <h3 className="text-xl font-heading font-black text-navy-900 dark:text-white">
                Cotizaciones y consultas de tu obra
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-sans leading-relaxed">
                Consulta materiales, prepara presupuestos y revisa la información de tu obra. Pro IA también permite registrar cambios desde el chat.
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
          <div className="bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-3xl shadow-sm flex flex-col overflow-hidden h-[calc(100dvh-14rem)] min-h-[360px] sm:min-h-[480px]">
            <div className="px-5 py-3.5 bg-gradient-to-r from-[#141A23] to-[#1E2638] text-white flex items-center justify-between border-b border-[#263040]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/20 border border-[#FF6A00]/40 flex items-center justify-center text-[#FF6A00] shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-heading font-bold text-xs tracking-wide flex items-center gap-2">
                    <span className="truncate">ObraBot · {proyecto.nombre}</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px] font-mono font-bold shrink-0">
                      Obra activa
                    </span>
                  </h4>
                  <p className="text-[10px] text-gray-400 font-sans">
                    Texto, dictado por voz y fotos de obra
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <ObraBotWhatsAppLink activePlan={activePlan} projectName={proyecto?.nombre} compact />
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

            <div className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto space-y-4 bg-kraft-50/40 dark:bg-[#0B0E14] text-xs font-sans">
              {mensajes.map((m) => (
                <ObraBotMessageBubble
                  key={m.id}
                  message={m}
                  onSelectSuggestion={(sug) => void handleEnviarMensaje(sug)}
                  onRetry={(retryText) => void handleEnviarMensaje(retryText)}
                  onConfirmCritical={handleConfirmCritical}
                  onCancelCritical={handleCancelCritical}
                  onFeedbackChange={(id, val) => updateLocalMessage(id, { feedback: val })}
                  onUndone={() => loadData()}
                />
              ))}

              {cargando && (
                <ObraBotStreamingBubble stage={streamStage} partialText={streamText} onStop={handleStop} />
              )}

              <div ref={messagesEndRef} />
            </div>

            <ObraBotComposer
              value={inputTexto}
              onChange={setInputTexto}
              onSubmit={() => void handleEnviarMensaje()}
              onStop={handleStop}
              busy={cargando}
              attachedFile={attachedFile}
              onAttachFile={setAttachedFile}
              placeholder="Pregunta, dicta por voz o adjunta una foto de esta obra…"
            />
          </div>
        )}
      </div>

      {confirmClearOpen && (
        <ModalOverlay
          onClose={() => setConfirmClearOpen(false)}
          aria-label="Confirmar reinicio de historial"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold font-heading text-navy-900 dark:text-white">
              ¿Reiniciar historial de conversación?
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Se limpiarán los mensajes locales del asistente para esta obra y volverá el saludo inicial.
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="px-4 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmLimpiarHistorial}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white"
              >
                Reiniciar historial
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
