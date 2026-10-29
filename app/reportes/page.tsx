'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  MessageSquareShare,
  Send,
  User,
  HardHat,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Image as ImageIcon,
  ExternalLink,
  CheckCheck,
  Bot,
  Paperclip,
  Copy,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Settings,
  Database,
  ArrowRight,
  X,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { aiHeaders } from '@/lib/ai/client';
import WhatsAppJefePanel from '@/components/WhatsAppJefePanel';
import { dataService } from '@/lib/data-service';
import {
  Cliente,
  Proyecto,
  Usuario,
  ReporteWhatsApp,
  SubscriptionPlanId,
} from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';
import { getPlanDetails } from '@/lib/plans';
import PlanSwitcherModal from '@/components/PlanSwitcherModal';
import PlanLockOverlay from '@/components/PlanLockOverlay';

interface MensajeBurbujaWA {
  id: string;
  remitente: 'usuario' | 'asistente';
  texto: string;
  timestamp: string;
  fotos?: string[];
  moduloAfectado?: string;
  obraLink?: { id: string; nombre: string } | null;
}

export default function ReportesWhatsAppPage() {
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [vistaActiva, setVistaActiva] = useState<'operacion' | 'configuracion'>('operacion');
  const [modoSimulador, setModoSimulador] = useState<'obrero' | 'cliente'>('obrero');

  // Datos sincronizados con Supabase
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [reportes, setReportes] = useState<ReporteWhatsApp[]>([]);
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);

  // Selección activa para probar en Simulador
  const [obreroSeleccionadoId, setObreroSeleccionadoId] = useState<string>('');
  const [obraObreroId, setObraObreroId] = useState<string>('');
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState<string>('');

  // Adjunto fotográfico en modo obrero
  const [fotoAdjunta, setFotoAdjunta] = useState<File | null>(null);
  const [fotoPreviewLocal, setFotoPreviewLocal] = useState<string | null>(null);

  // Estado webhook health check
  const [webhookStatus, setWebhookStatus] = useState<{
    ok?: boolean;
    cloud_api_configurada?: boolean;
  } | null>(null);

  // Historiales separados por modo para demostración limpia
  const [mensajesObrero, setMensajesObrero] = useState<MensajeBurbujaWA[]>([
    {
      id: 'wa-ob-init',
      remitente: 'asistente',
      texto:
        '👷 *Simulador de terreno*\n\nPrueba reportes desde aquí:\n• 📸 *Fotos de avance* o materiales\n• 📊 *Progreso de partidas* (ej. "Radier listo al 100%")\n• 🚨 *Avisos, incidentes o accidentes*\n• 🔄 *Cambios pedidos por el cliente*\n• 🕒 *Asistencia* (ej. "Presente hoy a las 08:00")\n\nGemini lo leerá y lo guardará automáticamente en la obra correspondiente en Supabase.',
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [mensajesCliente, setMensajesCliente] = useState<MensajeBurbujaWA[]>([
    {
      id: 'wa-cl-init',
      remitente: 'asistente',
      texto:
        '🏗️ *Atención Clientes ObraTrack IA*\n\n¡Hola! Escribe cómo va tu obra, solicita fotos de avance o consulta tu estado de pagos.\n_(Si escribes desde un número nuevo, indica tu Nombre o RUT)_.',
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputTexto, setInputTexto] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  const reloadLocalData = () => {
    const projs = dataService.getProyectos();
    const clis = dataService.getClientes();
    const usrs = dataService.getUsuarios();
    const reps = dataService.getReportes();

    setProyectos(projs);
    setClientes(clis);
    setUsuarios(usrs);
    setReportes(reps);
    setActivePlan(dataService.getActivePlan());

    if (!obreroSeleccionadoId && usrs.length > 0) {
      const terreno = usrs.find((u) => u.rol === 'terreno') || usrs[0];
      setObreroSeleccionadoId(terreno.id);
    }
    if (!obraObreroId && projs.length > 0) {
      setObraObreroId(projs[0].id);
    }
  };

  useEffect(() => {
    reloadLocalData();
    // Leer primero los cambios recibidos por teléfono; no subir una caché antigua.
    dataService.pullFromCloudServer().then(() => reloadLocalData());

    fetch('/api/webhook/whatsapp')
      .then((r) => r.json())
      .then((d) => setWebhookStatus(d))
      .catch(() => {});

    const onSync = () => reloadLocalData();
    window.addEventListener('obratrack_cloud_synced', onSync);
    return () => window.removeEventListener('obratrack_cloud_synced', onSync);
  }, []);

  const mensajesActuales = modoSimulador === 'obrero' ? mensajesObrero : mensajesCliente;

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajesObrero, mensajesCliente, modoSimulador, isLoading]);

  const handleSeleccionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoAdjunta(file);
    setFotoPreviewLocal(URL.createObjectURL(file));
  };

  const limpiarFotoAdjunta = () => {
    setFotoAdjunta(null);
    if (fotoPreviewLocal) URL.revokeObjectURL(fotoPreviewLocal);
    setFotoPreviewLocal(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSincronizarSupabaseManual = async () => {
    setIsSyncingCloud(true);
    try {
      await dataService.pullFromCloudServer();
      reloadLocalData();
      showToast('☁️ Sincronización completa con Supabase PostgreSQL & Storage.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleEnviarSimulador = async (textoRapido?: string) => {
    const texto = (textoRapido ?? inputTexto).trim();
    if (!texto && !fotoAdjunta) return;
    if (isLoading) return;

    const hora = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const burbujaUsuario: MensajeBurbujaWA = {
      id: 'u-' + Date.now(),
      remitente: 'usuario',
      texto: texto || '📸 Fotografía enviada desde terreno',
      timestamp: hora,
      fotos: fotoPreviewLocal ? [fotoPreviewLocal] : undefined,
    };

    if (modoSimulador === 'obrero') {
      setMensajesObrero((prev) => [...prev, burbujaUsuario]);
    } else {
      setMensajesCliente((prev) => [...prev, burbujaUsuario]);
    }

    const archivoAEnviar = fotoAdjunta;
    setInputTexto('');
    setFotoAdjunta(null);
    setFotoPreviewLocal(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsLoading(true);

    try {
      const activeUser = dataService.getActiveUser();
      const obreroObj = usuarios.find((u) => u.id === obreroSeleccionadoId);
      const clienteObj = clientes.find((c) => c.id === clienteSeleccionadoId);

      const formData = new FormData();
      formData.append('modo', modoSimulador);
      formData.append('texto', texto);
      formData.append('empresaId', activeUser?.empresa_id || 'e1111111-1111-4111-a111-111111111111');

      if (modoSimulador === 'obrero') {
        formData.append('telefono', obreroObj?.telefono_whatsapp || '+56911112222');
        formData.append('obreroNombre', obreroObj?.nombre || 'Maestro Terreno');
        if (obraObreroId) {
          formData.append('proyectoId', obraObreroId);
        }
        if (archivoAEnviar) {
          formData.append('foto', archivoAEnviar);
        }
      } else {
        formData.append('telefono', clienteObj?.telefono || '+56988887777');
        if (clienteObj) {
          formData.append('clienteId', clienteObj.id);
        }
        const hist = mensajesCliente.slice(-6).map((m) => ({
          rol: m.remitente === 'usuario' ? 'user' : 'model',
          texto: m.texto,
        }));
        formData.append('historial', JSON.stringify(hist));
      }

      const {Authorization}=await aiHeaders();
      const res = await fetch('/api/webhook/whatsapp/simulador', {
        method: 'POST',
        headers:{Authorization},
        body: formData,
      });

      const data = await res.json();
      if(!res.ok || data.error) throw new Error(data.error || 'No se pudo procesar el reporte.');

      // Traer de inmediato desde Supabase todo lo que Gemini acaba de guardar
      await dataService.pullFromCloudServer();
      reloadLocalData();

      if (data.clienteIdentificado?.id && !clienteSeleccionadoId) {
        setClienteSeleccionadoId(data.clienteIdentificado.id);
      }

      const burbujaRespuesta: MensajeBurbujaWA = {
        id: 'a-' + Date.now(),
        remitente: 'asistente',
        texto: data.respuestaTexto || 'Mensaje procesado en ObraTrack.',
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        fotos: data.fotosRespuesta,
        moduloAfectado: data.moduloAfectado,
        obraLink: data.proyectoAfectado,
      };

      if (modoSimulador === 'obrero') {
        setMensajesObrero((prev) => [...prev, burbujaRespuesta]);
        showToast(
          `✅ Guardado en Supabase: ${data.moduloAfectado || 'Bitácora'} (${
            data.proyectoAfectado?.nombre || 'Obra'
          })`
        );
      } else {
        setMensajesCliente((prev) => [...prev, burbujaRespuesta]);
      }
    } catch (err) {
      console.error(err);
      const errMsg: MensajeBurbujaWA = {
        id: 'err-' + Date.now(),
        remitente: 'asistente',
        texto: err instanceof Error ? err.message : 'No se pudo procesar el reporte.',
        timestamp: hora,
      };
      if (modoSimulador === 'obrero') {
        setMensajesObrero((prev) => [...prev, errMsg]);
      } else {
        setMensajesCliente((prev) => [...prev, errMsg]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReiniciarChat = () => {
    if (modoSimulador === 'obrero') {
      setMensajesObrero((prev) => [prev[0]]);
    } else {
      setClienteSeleccionadoId('');
      setMensajesCliente((prev) => [prev[0]]);
    }
    showToast('Conversación reiniciada.');
  };

  const copiarTexto = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    showToast(`📋 ${label} copiado al portapapeles.`);
  };

  const originUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://tu-dominio.vercel.app';
  const webhookFullUrl = `${originUrl}/api/webhook/whatsapp`;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#FAF8F5] dark:bg-[#0E131B] font-sans pb-16">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#111B21] text-white px-4 py-3 rounded-2xl shadow-2xl border border-[#25D366] flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="w-4 h-4 text-[#25D366] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <PlanSwitcherModal isOpen={isPlanModalOpen} onClose={() => setIsPlanModalOpen(false)} />

      <Navbar
        title="Centro WhatsApp IA (Terreno & Clientes)"
        subtitle="Integración bidireccional gratuita con Meta WhatsApp Cloud API Sandbox, Google Gemini Multimodal y Supabase"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleSincronizarSupabaseManual}
              disabled={isSyncingCloud}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] text-xs font-bold text-navy-900 dark:text-white hover:border-[#25D366] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#25D366] ${isSyncingCloud ? 'animate-spin' : ''}`} />
              <span>Sincronizar Supabase</span>
            </button>
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] text-xs font-mono text-gray-700 dark:text-gray-200"
            >
              <span className="w-2 h-2 rounded-full bg-[#25D366]" />
              <span>{getPlanDetails(activePlan).nombre}</span>
            </button>
          </div>
        }
      />

      <div className="p-4 md:p-6 max-w-7xl w-full mx-auto space-y-6">
        <WhatsAppJefePanel />
        <PlanLockOverlay
          isLocked={activePlan === 'gratis'}
          featureName="WhatsApp Bidireccional IA (Obreros & Clientes)"
          requiredPlan="pro"
          description="Permite que tus obreros suban fotos, avances, incidentes y asistencia por WhatsApp, y que tus clientes consulten el avance de sus obras 24/7 con Gemini."
        >
          {/* Selector Principal de Pestaña */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVistaActiva('operacion')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-heading font-bold transition-all ${
                  vistaActiva === 'operacion'
                    ? 'bg-[#25D366] text-[#111B21] shadow-md'
                    : 'bg-white dark:bg-[#141A23] text-gray-700 dark:text-gray-300 border border-kraft-200 dark:border-[#263040]'
                }`}
              >
                <MessageSquareShare className="w-4 h-4" />
                <span>Simulador en Vivo & Bandeja Supabase ({reportes.length})</span>
              </button>

              <button
                onClick={() => setVistaActiva('configuracion')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-heading font-bold transition-all ${
                  vistaActiva === 'configuracion'
                    ? 'bg-[#1E1E1E] dark:bg-[#FF6A00] text-white shadow-md'
                    : 'bg-white dark:bg-[#141A23] text-gray-700 dark:text-gray-300 border border-kraft-200 dark:border-[#263040]'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Conectar Número Gratis Meta Sandbox ($0)</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-gray-600 dark:text-gray-400">
              <Database className="w-3.5 h-3.5 text-[#25D366]" />
              <span>
                Webhook:{' '}
                <strong className="text-[#25D366]">
                  {webhookStatus?.ok ? 'ONLINE' : 'ACTIVO'}
                </strong>
              </span>
            </div>
          </div>

          {vistaActiva === 'configuracion' ? (
            /* ========================================================================= */
            /* PANEL DE CONFIGURACIÓN META WHATSAPP CLOUD API SANDBOX GRATIS ($0)        */
            /* ========================================================================= */
            <div className="bg-white dark:bg-[#141A23] rounded-2xl border border-kraft-200 dark:border-[#263040] p-6 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-kraft-100 dark:border-[#263040] pb-4">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#25D366]/15 text-[#25D366]">
                    CONEXIÓN OFICIAL CON META
                  </span>
                  <h2 className="text-lg font-heading font-bold text-navy-900 dark:text-white mt-2">
                    Guía Rápida: Vincular Número de Prueba Oficial de Meta WhatsApp Cloud API
                  </h2>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Empieza con el número de prueba de Meta y agrega tu teléfono personal como destinatario autorizado. La disponibilidad y condiciones dependen de Meta.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#FAF8F5] dark:bg-[#1A222D] p-4 rounded-xl border border-kraft-200 dark:border-[#263040] space-y-2">
                  <label className="text-xs font-bold text-navy-900 dark:text-white block">
                    1. URL de Devolución de Llamada (Callback Webhook URL)
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white dark:bg-[#141A23] px-3 py-2 rounded-lg border border-kraft-200 dark:border-[#263040] text-xs font-mono text-navy-900 dark:text-gray-200 overflow-x-auto">
                      {webhookFullUrl}
                    </code>
                    <button
                      onClick={() => copiarTexto(webhookFullUrl, 'URL del Webhook')}
                      className="p-2 rounded-lg bg-[#FF6A00] text-white hover:bg-[#E05E00]"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Si despliegas en Vercel usa tu dominio `.vercel.app/api/webhook/whatsapp` (o `ngrok http 3000` si pruebas en localhost).
                  </p>
                </div>

                <div className="bg-[#FAF8F5] dark:bg-[#1A222D] p-4 rounded-xl border border-kraft-200 dark:border-[#263040] space-y-2">
                  <label className="text-xs font-bold text-navy-900 dark:text-white block">
                    2. Identificador de Verificación (Verify Token)
                  </label>
                  <p className="text-xs text-gray-600">Crea un valor privado en Vercel como WHATSAPP_WEBHOOK_VERIFY_TOKEN y utiliza ese mismo valor en Meta. No uses un token de ejemplo.</p>
                </div>
              </div>

              <div className="bg-[#111B21] text-gray-200 p-4 rounded-xl space-y-2 font-mono text-xs">
                <p className="text-[#25D366] font-bold">
                  # 3. Variables en .env.local o Vercel Environment Variables:
                </p>
                <pre className="overflow-x-auto text-[11px] leading-relaxed text-gray-300">{`WHATSAPP_WEBHOOK_VERIFY_TOKEN=valor_privado_aleatorio
WHATSAPP_APP_SECRET=secreto_de_la_app_meta
WHATSAPP_CLOUD_API_ACCESS_TOKEN=token_de_meta
WHATSAPP_CLOUD_API_PHONE_NUMBER_ID=id_del_numero_bot
NEXT_PUBLIC_WHATSAPP_NUMBER=numero_del_bot_con_codigo_pais
SUPABASE_SERVICE_ROLE_KEY=clave_privada_del_servidor
GEMINI_API_KEY=clave_de_gemini`}</pre>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 space-y-1.5">
                  <h4 className="font-heading font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
                    <HardHat className="w-4 h-4 text-[#FF6A00]" />
                    <span>¿Cómo reconoce al jefe o trabajador?</span>
                  </h4>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Registra el celular del obrero en <Link href="/equipo" className="text-[#FF6A00] font-bold underline">Equipo de Obra</Link> . Cuando mande fotos, avances, accidentes, cambios o asistencia al número de prueba de WhatsApp, El remitente debe estar registrado y asignado a la obra; las acciones se guardan en Supabase.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-1.5">
                  <h4 className="font-heading font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
                    <User className="w-4 h-4 text-blue-500" />
                    <span>¿Cómo reconoce al Cliente?</span>
                  </h4>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    El simulador permite revisar las consultas de tus clientes. El número de gestión de ObraTrack reconoce a los usuarios registrados de tu empresa; la atención externa de clientes requiere una conexión separada.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* VISTA OPERATIVA: SIMULADOR DUAL EN VIVO + BANDEJA REAL SUPABASE           */
            /* ========================================================================= */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* COLUMNA IZQUIERDA (6 cols): SMARTPHONE DUAL OBRERO / CLIENTE */}
              <div className="lg:col-span-6 space-y-4">
                {/* Selector de Rol y Contexto del Simulador */}
                <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setModoSimulador('obrero')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-heading font-bold transition-all ${
                        modoSimulador === 'obrero'
                          ? 'bg-[#FF6A00] text-white shadow'
                          : 'bg-[#FAF8F5] dark:bg-[#1E2530] text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <HardHat className="w-4 h-4" />
                      <span>Modo 👷 Obrero (Sube a Web)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setModoSimulador('cliente')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-heading font-bold transition-all ${
                        modoSimulador === 'cliente'
                          ? 'bg-[#25D366] text-[#111B21] shadow'
                          : 'bg-[#FAF8F5] dark:bg-[#1E2530] text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <User className="w-4 h-4" />
                      <span>Modo 🧑‍💼 Cliente (Consulta)</span>
                    </button>
                  </div>

                  {modoSimulador === 'obrero' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 mb-1">
                          Obrero remitente
                        </label>
                        <select
                          value={obreroSeleccionadoId}
                          onChange={(e) => setObreroSeleccionadoId(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
                        >
                          {usuarios.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.nombre} ({u.rol})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 mb-1">
                          Obra destino (o auto-detectar por IA)
                        </label>
                        <select
                          value={obraObreroId}
                          onChange={(e) => setObraObreroId(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
                        >
                          <option value="">🤖 Detectar automáticamente por texto</option>
                          {proyectos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <label className="block text-[11px] font-bold text-gray-500 mb-1">
                        Simular WhatsApp de Cliente registrado (o déjalo libre para validar por RUT)
                      </label>
                      <select
                        value={clienteSeleccionadoId}
                        onChange={(e) => setClienteSeleccionadoId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
                      >
                        <option value="">🔒 Número nuevo (pedirá RUT / Nombre)</option>
                        {clientes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} {c.rut ? `• RUT ${c.rut}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Botones de Prueba Rápida en 1 Clic */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {modoSimulador === 'obrero' ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handleEnviarSimulador(
                              'Jefe, avanzamos hoy al 80% en la primera partida y quedó todo nivelado sin novedad.'
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] dark:bg-[#1E2530] hover:border-[#FF6A00] border border-kraft-200 dark:border-[#263040] text-[11px] font-medium text-navy-900 dark:text-gray-200"
                        >
                          📊 Reportar progreso 80%
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleEnviarSimulador(
                              'El cliente pidió agregar cerámica antideslizante en el acceso, necesitamos 12 cajas de porcelanato y 4 sacos de adhesivo.'
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] dark:bg-[#1E2530] hover:border-[#FF6A00] border border-kraft-200 dark:border-[#263040] text-[11px] font-medium text-navy-900 dark:text-gray-200"
                        >
                          🔄 Solicitud cambio/material
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleEnviarSimulador(
                              'Alerta: tuvimos un accidente leve por corte superficial en mano, aplicamos primeros auxilios.'
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] dark:bg-[#1E2530] hover:border-red-500 border border-kraft-200 dark:border-[#263040] text-[11px] font-medium text-red-600 dark:text-red-400"
                        >
                          🚨 Reportar accidente
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleEnviarSimulador('Presente hoy en la obra, llegamos a las 08:05 hrs.')
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] dark:bg-[#1E2530] hover:border-[#6B8F72] border border-kraft-200 dark:border-[#263040] text-[11px] font-medium text-[#6B8F72]"
                        >
                          🕒 Marcar asistencia
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handleEnviarSimulador(
                              'Hola, ¿cómo va el avance de mi obra, qué han hecho los maestros y cuál es mi estado de pagos?'
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] dark:bg-[#1E2530] hover:border-[#25D366] border border-kraft-200 dark:border-[#263040] text-[11px] font-medium text-navy-900 dark:text-gray-200"
                        >
                          🏗️ ¿Cómo va mi obra y pagos?
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleEnviarSimulador('¿Me puedes enviar las últimas fotos de avance de mi obra?')
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] dark:bg-[#1E2530] hover:border-[#25D366] border border-kraft-200 dark:border-[#263040] text-[11px] font-medium text-navy-900 dark:text-gray-200"
                        >
                          📸 Pedir fotos de avance
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Smartphone Mockup */}
                <div className="w-full max-w-md mx-auto bg-[#111B21] rounded-[40px] p-3 shadow-2xl border-4 border-gray-800">
                  <div className="w-28 h-3.5 bg-gray-800 rounded-full mx-auto mb-2" />
                  <div className="bg-[#0B141A] rounded-[30px] overflow-hidden flex flex-col h-[560px] border border-gray-800">
                    {/* Header WhatsApp */}
                    <div className="bg-[#202C33] text-white px-4 py-3 flex items-center justify-between border-b border-gray-800">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold ${
                            modoSimulador === 'obrero' ? 'bg-[#FF6A00]' : 'bg-[#25D366]'
                          }`}
                        >
                          {modoSimulador === 'obrero' ? (
                            <HardHat className="w-4 h-4" />
                          ) : (
                            <Bot className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-xs flex items-center gap-1">
                            <span>
                              {modoSimulador === 'obrero'
                                ? 'ObraTrack Terreno IA'
                                : 'ObraTrack Atención Clientes'}
                            </span>
                            <ShieldCheck className="w-3.5 h-3.5 text-[#25D366]" />
                          </h4>
                          <p className="text-[10px] text-[#25D366] font-mono">
                            Conectado a Supabase + Gemini
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={handleReiniciarChat}
                        className="p-1.5 rounded-full hover:bg-gray-700/50 text-gray-300"
                        title="Limpiar chat"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Mensajes */}
                    <div className="flex-1 p-3.5 overflow-y-auto space-y-3 text-xs">
                      {mensajesActuales.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            msg.remitente === 'usuario' ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div
                            className={`max-w-[86%] rounded-2xl p-3 space-y-2 shadow-sm ${
                              msg.remitente === 'usuario'
                                ? 'bg-[#005C4B] text-white'
                                : 'bg-[#202C33] text-gray-100'
                            }`}
                          >
                            {msg.fotos && msg.fotos.length > 0 && (
                              <div className="grid grid-cols-1 gap-1.5">
                                {msg.fotos.map((f, idx) => (
                                  <img
                                    key={idx}
                                    src={f}
                                    alt="Adjunto WhatsApp"
                                    className="w-full max-h-44 object-cover rounded-xl border border-white/10"
                                  />
                                ))}
                              </div>
                            )}

                            <div className="whitespace-pre-line leading-relaxed text-xs">
                              {msg.texto}
                            </div>

                            {msg.obraLink && (
                              <Link
                                href={`/proyectos/${msg.obraLink.id}/gantt`}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#25D366] hover:underline pt-1"
                              >
                                <span>Ver en obra: {msg.obraLink.nombre}</span>
                                <ArrowRight className="w-3 h-3" />
                              </Link>
                            )}

                            <div className="flex items-center justify-end gap-1 text-[10px] text-gray-300/70">
                              <span>{msg.timestamp}</span>
                              {msg.remitente === 'usuario' && (
                                <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      {isLoading && (
                        <div className="flex items-start">
                          <div className="bg-[#202C33] text-[#25D366] px-3.5 py-2.5 rounded-2xl text-xs font-mono animate-pulse">
                            🤖 Gemini procesando y sincronizando con Supabase...
                          </div>
                        </div>
                      )}
                      <div ref={chatBottomRef} />
                    </div>

                    {/* Preview de Foto Adjunta antes de enviar */}
                    {fotoPreviewLocal && modoSimulador === 'obrero' && (
                      <div className="bg-[#182229] px-3 py-2 border-t border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img
                            src={fotoPreviewLocal}
                            alt="Preview"
                            className="w-10 h-10 rounded-lg object-cover border border-[#25D366]"
                          />
                          <span className="text-[11px] text-gray-200 truncate max-w-[190px]">
                            {fotoAdjunta?.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={limpiarFotoAdjunta}
                          className="p-1 text-gray-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Barra Inferior de Escritura WhatsApp */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleEnviarSimulador();
                      }}
                      className="bg-[#202C33] p-2.5 flex items-center gap-2 border-t border-gray-800"
                    >
                      {modoSimulador === 'obrero' && (
                        <label
                          className="p-2 rounded-full hover:bg-gray-700 text-gray-300 cursor-pointer"
                          title="Subir foto desde terreno"
                        >
                          <Paperclip className="w-4 h-4 text-[#25D366]" />
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleSeleccionarFoto}
                            className="hidden"
                          />
                        </label>
                      )}

                      <input
                        type="text"
                        value={inputTexto}
                        onChange={(e) => setInputTexto(e.target.value)}
                        placeholder={
                          modoSimulador === 'obrero'
                            ? 'Escribe nota, avance, accidente o sube foto...'
                            : 'Pregunta cómo va tu obra...'
                        }
                        className="flex-1 bg-[#2A3942] text-white placeholder-gray-400 rounded-full px-3.5 py-2 text-xs focus:outline-none"
                      />

                      <button
                        type="submit"
                        disabled={isLoading || (!inputTexto.trim() && !fotoAdjunta)}
                        className="w-9 h-9 rounded-full bg-[#25D366] hover:bg-[#1EBE5D] disabled:opacity-40 text-[#111B21] flex items-center justify-center shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              {/* COLUMNA DERECHA (6 cols): BANDEJA EN VIVO SUPABASE + ENVÍO DIRECTO */}
              <div className="lg:col-span-6 space-y-5">
                <div className="bg-white dark:bg-[#141A23] rounded-2xl border border-kraft-200 dark:border-[#263040] p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white flex items-center gap-2">
                        <Database className="w-4 h-4 text-[#25D366]" />
                        <span>Bandeja en Vivo desde Supabase ({reportes.length})</span>
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        Registro automático de fotos, avances, reclamos/cambios, asistencias y consultas de clientes.
                      </p>
                    </div>
                  </div>

                  {reportes.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-500 border border-dashed border-kraft-200 dark:border-[#263040] rounded-xl">
                      Aún no hay mensajes procesados. Prueba uno de los botones rápidos en el simulador de la izquierda o envía un WhatsApp al número de prueba.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                      {reportes.map((rep) => {
                        const obra = proyectos.find((p) => p.id === rep.proyecto_id);
                        const esCliente = rep.remitente_tipo === 'cliente';
                        const linkModulo = obra
                          ? rep.modulo_afectado?.includes('Cambios')
                            ? `/proyectos/${obra.id}/cambios`
                            : rep.modulo_afectado?.includes('Asistencia')
                            ? `/proyectos/${obra.id}/asistencia`
                            : `/proyectos/${obra.id}/gantt`
                          : '/proyectos';

                        return (
                          <div
                            key={rep.id}
                            className="p-3.5 rounded-xl bg-[#FAF8F5] dark:bg-[#1A222D] border border-kraft-200 dark:border-[#263040] space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                                    esCliente
                                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                      : 'bg-[#FF6A00]/15 text-[#FF6A00]'
                                  }`}
                                >
                                  {esCliente ? '🧑‍💼 Cliente' : '👷 Obrero'}
                                </span>
                                <span className="text-xs font-bold text-navy-900 dark:text-white">
                                  {rep.nombre_remitente || 'Usuario WhatsApp'}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono text-gray-400">
                                {formatDate(rep.fecha)}
                              </span>
                            </div>

                            <p className="text-xs text-gray-700 dark:text-gray-200">
                              &ldquo;{rep.mensaje_original}&rdquo;
                            </p>

                            {rep.foto_url && (
                              <a
                                href={rep.foto_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={rep.foto_url}
                                  alt="Foto subida desde WhatsApp"
                                  className="w-full max-h-40 object-cover rounded-lg border border-kraft-200 dark:border-[#263040]"
                                />
                              </a>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-kraft-200/70 dark:border-[#263040] text-[11px]">
                              <span className="text-[#6B8F72] font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{rep.modulo_afectado || 'Sincronizado en ObraTrack'}</span>
                              </span>

                              {obra && (
                                <Link
                                  href={linkModulo}
                                  className="inline-flex items-center gap-1 font-bold text-[#FF6A00] hover:underline"
                                >
                                  <span>Ir a {obra.nombre}</span>
                                  <ArrowRight className="w-3 h-3" />
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Envío Directo de Informe de Avance a WhatsApp Real del Cliente */}
                <div className="bg-white dark:bg-[#141A23] rounded-2xl border border-kraft-200 dark:border-[#263040] p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white">
                    Enviar Reporte Ejecutivo Directo a WhatsApp de Clientes
                  </h3>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {clientes.map((c) => {
                      const ficha = dataService.obtenerFichaCompletaCliente(c.id);
                      const p0 = ficha?.proyectos[0];
                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF8F5] dark:bg-[#1A222D] border border-kraft-200 dark:border-[#263040]"
                        >
                          <div>
                            <p className="text-xs font-bold text-navy-900 dark:text-white">
                              {c.nombre}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              {p0
                                ? `${p0.proyecto.nombre} • ${p0.porcentaje_avance}% avance`
                                : c.telefono || 'Sin obra asignada'}
                            </p>
                          </div>
                          {p0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const msg = `🏗️ *REPORTE DE AVANCE OBRATRACK*\nEstimado/a *${c.nombre}*, su obra *${p0.proyecto.nombre}* registra un *${p0.porcentaje_avance}%* de avance.\n💰 Pagado: ${formatCLP(p0.total_pagado)} | Saldo: ${formatCLP(p0.saldo_pendiente)}.`;
                                const tel = (c.telefono || '+56987654321').replace(/[^0-9]/g, '');
                                window.open(
                                  `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`,
                                  '_blank'
                                );
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#25D366] text-[#111B21] text-[11px] font-bold"
                            >
                              <span>Abrir WA</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </PlanLockOverlay>
      </div>
    </div>
  );
}
