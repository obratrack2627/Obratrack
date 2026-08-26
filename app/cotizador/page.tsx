'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Calculator,
  ShoppingBag,
  MessageSquare,
  Calendar,
  CheckCircle2,
  TrendingDown,
  Percent,
  Layers,
  HardHat,
  Printer,
  PlusCircle,
  Clock,
  ShieldCheck,
  HelpCircle,
  RefreshCw,
  Sliders,
  DollarSign,
  Send,
  Bot,
  User,
  Search,
  Trash2,
  Edit3,
  Copy,
  FolderPlus,
  Plus,
  X,
  Lock,
  ArrowRight,
  MapPin,
  CalendarCheck,
  CheckSquare,
  Square,
  FileText,
  Zap,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import {
  CotizacionEstimacion,
  MensajeChatCotizador,
  Cliente,
  SubscriptionPlanId,
  EventoAgenda,
} from '@/types/database';
import { formatCLP, formatDate, formatThousands, parseThousands } from '@/lib/utils';
import { getPlanDetails } from '@/lib/plans';
import PlanSwitcherModal from '@/components/PlanSwitcherModal';
import PlanLockOverlay from '@/components/PlanLockOverlay';

export default function CotizadorPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'cotizador' | 'historial' | 'asistente' | 'radar'>('cotizador');
  const [resultSubTab, setResultSubTab] = useState<'cobro' | 'materiales' | 'radar' | 'gantt'>('cobro');

  const [cotizaciones, setCotizaciones] = useState<CotizacionEstimacion[]>([]);
  const [currentCotizacion, setCurrentCotizacion] = useState<CotizacionEstimacion | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [eventosAgenda, setEventosAgenda] = useState<EventoAgenda[]>([]);

  // Búsqueda y Modales
  const [searchCotizacion, setSearchCotizacion] = useState('');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingCotizacion, setEditingCotizacion] = useState<CotizacionEstimacion | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedPresupuesto, setCopiedPresupuesto] = useState(false);

  // Formulario Cotización IA
  const [descripcion, setDescripcion] = useState('');
  const [tipoObra, setTipoObra] = useState('Radier de Hormigón & Pavimentos');
  const [metrosCuadrados, setMetrosCuadrados] = useState<number>(35);
  const [comuna, setComuna] = useState('Peñalolén, Santiago');
  const [margenUtilidad, setMargenUtilidad] = useState<number>(30);
  const [calidad, setCalidad] = useState<'economico' | 'estandar' | 'premium'>('estandar');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Formulario Cotización Manual
  const [manualTitulo, setManualTitulo] = useState('');
  const [manualTipo, setManualTipo] = useState('Radier de Hormigón & Pavimentos');
  const [manualM2, setManualM2] = useState<number>(20);
  const [manualCostoDirecto, setManualCostoDirecto] = useState('');
  const [manualMargen, setManualMargen] = useState<number>(30);
  const [manualDescripcion, setManualDescripcion] = useState('');

  // Formulario Editar Cotización
  const [editTitulo, setEditTitulo] = useState('');
  const [editTipo, setEditTipo] = useState('');
  const [editM2, setEditM2] = useState<number>(20);
  const [editResumen, setEditResumen] = useState('');

  // Modal Crear Proyecto
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [fechaInicioProyecto, setFechaInicioProyecto] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Chat con Asistente Google Gemini
  const [mensajesChat, setMensajesChat] = useState<MensajeChatCotizador[]>([
    {
      id: 'm-init',
      remitente: 'agente',
      texto:
        '¡Hola! Soy tu Copiloto Inteligente de Obras impulsado por Google Gemini. Puedo responder dudas técnicas de edificación en Chile, calcular sacos de cemento, jornales de cuadrilla o agendar visitas a terreno y faenas si me lo indicas.',
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      sugerencias: [
        'Agéndame una visita a terreno para el viernes a las 10:00',
        '¿Cuánto rinde un saco de cemento en radier de 10cm?',
        '¿Cuánto cobrar por mano de obra de porcelanato?',
      ],
    },
  ]);
  const [inputChat, setInputChat] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Modal Nuevo Evento Agenda Manual
  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [nuevoEventoTitulo, setNuevoEventoTitulo] = useState('');
  const [nuevoEventoFecha, setNuevoEventoFecha] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [nuevoEventoHora, setNuevoEventoHora] = useState('10:00');
  const [nuevoEventoComuna, setNuevoEventoComuna] = useState('Santiago, Chile');
  const [nuevoEventoDesc, setNuevoEventoDesc] = useState('');

  // Planes
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  // Filtros Radar
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos');
  const [searchMaterial, setSearchMaterial] = useState<string>('');

  useEffect(() => {
    const list = dataService.getCotizaciones();
    setCotizaciones(list);
    if (list.length > 0 && !currentCotizacion) {
      setCurrentCotizacion(list[0]);
    }
    const cls = dataService.getClientes();
    setClientes(cls);
    if (cls.length > 0) setSelectedClienteId(cls[0].id);

    const agenda = dataService.getEventosAgenda();
    setEventosAgenda(agenda);

    const savedPlan = dataService.getActivePlan();
    if (savedPlan) setActivePlan(savedPlan);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Plantillas Rápidas
  const plantillasRapidas = [
    {
      label: '🧱 Radier 35 m²',
      tipo: 'Radier de Hormigón & Pavimentos',
      m2: 35,
      desc: 'Radier de hormigón armado H-20 de 10cm de espesor con malla Acma C-92, polietileno de 0.2mm, compactación mecánica y terminación afinada a platacho.',
    },
    {
      label: '🥩 Quincho & Terraza',
      tipo: 'Quinchos & Terrazas',
      m2: 25,
      desc: 'Construcción de quincho techado con estructura de pino oregón a la vista, mesón de hormigón con porcelanato, parrilla de fierro en ángulo y campana.',
    },
    {
      label: '🏠 Ampliación 40 m²',
      tipo: 'Ampliaciones & Segundo Piso',
      m2: 40,
      desc: 'Ampliación habitacional en estructura de Metalcon o pino seco, aislamiento lana de vidrio, revestimiento exterior en fibrocemento e interior en volcanita 10mm.',
    },
    {
      label: '🎨 Tabiquería & Pintura',
      tipo: 'Terminaciones & Pintura',
      m2: 60,
      desc: 'Levantamiento de tabiques interiores con perfiles de acero galvanizado, planchas de yeso cartón, masillado con huincha y 3 manos de látex lavable.',
    },
    {
      label: '💧 Red de Gasfitería',
      tipo: 'Instalaciones & Sanitarias',
      m2: 20,
      desc: 'Instalación completa de red de agua fría y caliente en PPR termofusión, desagües de PVC sanitario y conexión de 2 baños y cocina.',
    },
  ];

  const handleAplicarPlantilla = (tpl: (typeof plantillasRapidas)[0]) => {
    setDescripcion(tpl.desc);
    setTipoObra(tpl.tipo);
    setMetrosCuadrados(tpl.m2);
  };

  // Generar Cotización con Google Gemini
  const handleGenerarCotizacion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!descripcion.trim()) return;

    setIsLoading(true);
    setStatusMessage('Google Gemini 2.5/3.6 IA está cubicando materiales y calculando tarifas...');

    try {
      const response = await fetch('/api/cotizador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion,
          tipo_obra: tipoObra,
          metros_cuadrados: metrosCuadrados,
          comuna_region: comuna,
          margen_utilidad: margenUtilidad,
          calidad,
        }),
      });

      if (!response.ok) {
        throw new Error('Error al conectar con el motor de IA.');
      }

      const raw = await response.json();
      const data: CotizacionEstimacion = raw.cotizacion || raw;
      dataService.saveCotizacion(data);
      setCurrentCotizacion(data);
      setCotizaciones(dataService.getCotizaciones());
      setResultSubTab('cobro');
      showToast('¡Presupuesto generado con éxito con Google Gemini!');
    } catch (err: any) {
      console.error(err);
      showToast('Hubo un inconveniente al conectar con el servidor.');
    } finally {
      setIsLoading(false);
      setStatusMessage(null);
    }
  };

  // Recalcular margen con el slider
  const handleSliderMargenChange = (nuevoMargen: number) => {
    setMargenUtilidad(nuevoMargen);
    if (!currentCotizacion) return;

    const est = currentCotizacion.estructura_financiera;
    const baseCostos = est.costo_directo + est.gastos_generales_monto + est.imprevistos_monto;
    const nuevoMargenMonto = Math.round(baseCostos * (nuevoMargen / 100));
    const nuevoNeto = baseCostos + nuevoMargenMonto;
    const nuevoIva = Math.round(nuevoNeto * 0.19);
    const nuevoTotalConIva = nuevoNeto + nuevoIva;

    const updatedCotizacion: CotizacionEstimacion = {
      ...currentCotizacion,
      estructura_financiera: {
        ...est,
        margen_utilidad_porcentaje: nuevoMargen,
        margen_utilidad_monto: nuevoMargenMonto,
        precio_sugerido_neto: nuevoNeto,
        iva_19: nuevoIva,
        precio_total_con_iva: nuevoTotalConIva,
      },
    };

    setCurrentCotizacion(updatedCotizacion);
    dataService.saveCotizacion(updatedCotizacion);
  };

  // Compartir por WhatsApp
  const handleShareWhatsAppCliente = () => {
    if (!currentCotizacion) return;
    const est = currentCotizacion.estructura_financiera;
    const precioNeto = est.precio_sugerido_neto;
    const precioTotal = est.precio_total_con_iva;

    const text = `🏗️ *PROPUESTA DE PRESUPUESTO - ${currentCotizacion.titulo_proyecto.toUpperCase()}*

📍 *Ubicación:* ${currentCotizacion.comuna_region}
⏱️ *Plazo Estimado:* ${currentCotizacion.duracion_dias_estimada} días hábiles
📐 *Superficie:* ${currentCotizacion.metros_cuadrados ? `${currentCotizacion.metros_cuadrados} m²` : 'A convenir'}

💰 *VALOR DE LA OBRA:*
• Total Neto: $${precioNeto.toLocaleString('es-CL')} CLP
• Total con IVA (19%): $${precioTotal.toLocaleString('es-CL')} CLP

📋 *PLAN DE PAGO SUGERIDO:*
1️⃣ 40% Anticipo (Materiales e inicio)
2️⃣ 30% Avance Obra Gruesa / 50%
3️⃣ 20% Terminaciones e Instalaciones
4️⃣ 10% Recepción Conforme y Entrega

_Generado automáticamente con ObraTrack & Google Gemini IA._`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Copiar resumen
  const handleCopyPresupuesto = () => {
    if (!currentCotizacion) return;
    const est = currentCotizacion.estructura_financiera;
    const text = `PRESUPUESTO: ${currentCotizacion.titulo_proyecto}
Ubicación: ${currentCotizacion.comuna_region}
Plazo: ${currentCotizacion.duracion_dias_estimada} días
Monto Neto: $${est.precio_sugerido_neto.toLocaleString('es-CL')} CLP
Monto Total con IVA: $${est.precio_total_con_iva.toLocaleString('es-CL')} CLP`;
    navigator.clipboard.writeText(text);
    setCopiedPresupuesto(true);
    setTimeout(() => setCopiedPresupuesto(false), 2500);
    showToast('¡Presupuesto copiado al portapapeles!');
  };

  // Crear Proyecto
  const handleCrearProyecto = () => {
    if (!currentCotizacion) return;
    const nuevoProyecto = dataService.crearProyectoDesdeCotizacion(
      currentCotizacion,
      selectedClienteId,
      fechaInicioProyecto
    );
    setShowCreateModal(false);
    showToast('¡Proyecto creado con éxito!');
    router.push(`/proyectos/${nuevoProyecto.id}/gantt`);
  };

  // Enviar mensaje al Copiloto Gemini
  const handleSendChat = async (texto?: string) => {
    const msgToSend = texto || inputChat;
    if (!msgToSend.trim() || isChatLoading) return;

    const userMsg: MensajeChatCotizador = {
      id: 'm-u-' + Date.now(),
      remitente: 'usuario',
      texto: msgToSend,
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    };

    setMensajesChat((prev) => [...prev, userMsg]);
    setInputChat('');
    setIsChatLoading(true);

    try {
      const response = await fetch('/api/cotizador/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: msgToSend,
          historial: mensajesChat.slice(-8),
          contexto_cotizacion: currentCotizacion,
        }),
      });

      const data = await response.json();

      let accionEjecutada = undefined;
      // Si la IA ejecutó una acción de agendamiento
      if (data.accion && data.accion.tipo === 'agendar_evento') {
        const nuevoEvt = dataService.saveEventoAgenda({
          titulo: data.accion.titulo || 'Compromiso de Obra',
          tipo: data.accion.tipo_evento || 'visita_terreno',
          fecha: data.accion.fecha || new Date(Date.now() + 86400000).toISOString().split('T')[0],
          hora: data.accion.hora || '10:00',
          comuna_lugar: data.accion.comuna_lugar || 'Santiago, Chile',
          descripcion: data.accion.descripcion || msgToSend,
          cliente_nombre: data.accion.cliente_nombre || 'Mandante',
          completado: false,
          origen: 'asistente_ia',
        });
        setEventosAgenda(dataService.getEventosAgenda());
        accionEjecutada = {
          tipo: 'agendar_evento' as const,
          titulo: nuevoEvt.titulo,
          detalles: nuevoEvt,
          resultado_texto: `Agendado para el ${formatDate(nuevoEvt.fecha)} a las ${nuevoEvt.hora} hrs en ${nuevoEvt.comuna_lugar}.`,
        };
        showToast('📅 ¡Visita agendada automáticamente por el Asistente!');
      }

      const agentMsg: MensajeChatCotizador = {
        id: 'm-a-' + Date.now(),
        remitente: 'agente',
        texto: data.respuesta || 'He procesado tu consulta sobre la obra.',
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        sugerencias: data.sugerencias,
        accion_ejecutada: accionEjecutada,
      };

      setMensajesChat((prev) => [...prev, agentMsg]);
    } catch (err) {
      console.error(err);
      setMensajesChat((prev) => [
        ...prev,
        {
          id: 'm-err-' + Date.now(),
          remitente: 'agente',
          texto:
            'Hubo un problema de conexión con Google Gemini. Por favor verifica tu red e intenta de nuevo.',
          timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Guardar evento manual en la agenda
  const handleGuardarEventoManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEventoTitulo.trim()) return;

    dataService.saveEventoAgenda({
      titulo: nuevoEventoTitulo,
      tipo: 'visita_terreno',
      fecha: nuevoEventoFecha,
      hora: nuevoEventoHora,
      comuna_lugar: nuevoEventoComuna,
      descripcion: nuevoEventoDesc,
      completado: false,
      origen: 'manual',
    });
    setEventosAgenda(dataService.getEventosAgenda());
    setShowAgendaModal(false);
    setNuevoEventoTitulo('');
    setNuevoEventoDesc('');
    showToast('¡Evento guardado en la agenda!');
  };

  // Toggle estado de evento de agenda
  const handleToggleEvento = (id: string) => {
    dataService.toggleEventoAgenda(id);
    setEventosAgenda(dataService.getEventosAgenda());
  };

  // Eliminar evento de agenda
  const handleDeleteEvento = (id: string) => {
    dataService.deleteEventoAgenda(id);
    setEventosAgenda(dataService.getEventosAgenda());
    showToast('Evento eliminado de la agenda.');
  };

  const catalogoMateriales = dataService.getCatalogoMateriales();
  const filteredMateriales = catalogoMateriales.filter((item) => {
    const matchCat = filtroCategoria === 'todos' || item.categoria.toLowerCase() === filtroCategoria.toLowerCase();
    const matchSearch =
      item.nombre.toLowerCase().includes(searchMaterial.toLowerCase()) ||
      item.categoria.toLowerCase().includes(searchMaterial.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-kraft-100 font-sans pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-navy-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-obra-orange flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-bottom-5">
          <Sparkles className="w-4 h-4 text-obra-orange shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <PlanSwitcherModal isOpen={isPlanModalOpen} onClose={() => setIsPlanModalOpen(false)} />

      {/* Top Navbar */}
      <Navbar
        title="Cotizador Inteligente & Copiloto IA"
        subtitle="Cálculo de presupuestos, cubicación en Chile y asistente con Google Gemini 2.5 / 3.6 IA"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsManualModalOpen(true)}
              className="px-3 py-1.5 bg-white border border-kraft-200 hover:bg-kraft-50 text-navy-900 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-obra-orange" />
              <span>+ Cotización Manual</span>
            </button>
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5DFC9] text-xs font-mono text-gray-700 hover:border-[#FF6A00] transition-colors shadow-sm"
            >
              <span className="w-2 h-2 rounded-full bg-[#FF6A00]"></span>
              <span>{getPlanDetails(activePlan).nombre}</span>
            </button>
          </div>
        }
      />

      <div className="p-4 md:p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* ========================================================================= */}
        {/* SELECTOR DE PESTAÑAS PRINCIPALES (Limpio y Centrado en Contexto) */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-2 border-b border-kraft-200 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('cotizador')}
            className={`px-4 py-2.5 rounded-xl text-xs font-heading font-bold transition-all flex items-center gap-2 whitespace-nowrap shadow-sm ${
              activeTab === 'cotizador'
                ? 'bg-navy-900 text-white'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            <Calculator className="w-4 h-4 text-obra-orange" />
            <span>1. Cotizador Inteligente</span>
          </button>

          <button
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-2.5 rounded-xl text-xs font-heading font-bold transition-all flex items-center gap-2 whitespace-nowrap shadow-sm ${
              activeTab === 'historial'
                ? 'bg-navy-900 text-white'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            <FolderPlus className="w-4 h-4 text-amber-500" />
            <span>2. Mis Cotizaciones ({cotizaciones.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('asistente')}
            className={`px-4 py-2.5 rounded-xl text-xs font-heading font-bold transition-all flex items-center gap-2 whitespace-nowrap shadow-sm ${
              activeTab === 'asistente'
                ? 'bg-navy-900 text-white ring-2 ring-obra-orange/50'
                : 'bg-white border border-kraft-200 text-navy-900 hover:bg-kraft-50'
            }`}
          >
            <Bot className="w-4 h-4 text-obra-orange" />
            <span>3. Copiloto IA & Agenda ({eventosAgenda.length})</span>
            <span className="px-1.5 py-0.2 rounded bg-obra-orange text-white text-[9px] font-mono">GEMINI</span>
          </button>

          <button
            onClick={() => setActiveTab('radar')}
            className={`px-4 py-2.5 rounded-xl text-xs font-heading font-bold transition-all flex items-center gap-2 whitespace-nowrap shadow-sm ${
              activeTab === 'radar'
                ? 'bg-navy-900 text-white'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-obra-green" />
            <span>4. Radar Ferreterías Chile</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* PESTAÑA 1: COTIZADOR INTELIGENTE */}
        {/* ========================================================================= */}
        {activeTab === 'cotizador' && (
          <PlanLockOverlay
            isLocked={activePlan === 'gratis'}
            featureName="Cotizador & Cubicador Inteligente con Google Gemini IA"
            requiredPlan="pro"
            description="Calcula cubicaciones, asesor de cobro al mandante, compras en ferreterías y Carta Gantt en segundos."
          >
            <div className="space-y-6">
              {/* Formulario de Cotización en 3 Pasos */}
              <div className="bg-white border border-kraft-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-kraft-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-obra-orange/10 flex items-center justify-center text-obra-orange">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-heading font-bold text-navy-900">
                        Nuevo Presupuesto de Obra con Google Gemini IA
                      </h2>
                      <p className="text-xs text-gray-500">
                        Ingresa los datos básicos y la IA generará la cubicación y recomendación de cobro.
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono text-gray-500 bg-kraft-50 px-2.5 py-1 rounded-lg border border-kraft-200">
                    Motor: <strong>Gemini 2.5 / 3.6 Flash</strong>
                  </span>
                </div>

                {/* Paso 1: Plantillas rápidas */}
                <div className="space-y-2">
                  <label className="block text-xs font-heading font-bold text-gray-700">
                    Paso 1: Selecciona una plantilla rápida o describe tu obra libremente:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {plantillasRapidas.map((tpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAplicarPlantilla(tpl)}
                        className="px-3 py-1.5 bg-kraft-50 hover:bg-orange-50 hover:border-obra-orange border border-kraft-200 text-navy-900 rounded-xl text-xs font-medium transition-all text-left flex items-center gap-1.5"
                      >
                        <span>{tpl.label}</span>
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={3}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Ej: Radier de 35m2 con malla acma de 10cm de espesor y terminación afinada en Peñalolén..."
                    className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-xl p-3 text-navy-900 focus:outline-none focus:border-obra-orange"
                  />
                </div>

                {/* Paso 2: Parámetros clave */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div>
                    <label className="block text-[11px] font-mono text-gray-600 mb-1">
                      Superficie Estimada (m²)
                    </label>
                    <input
                      type="number"
                      value={metrosCuadrados}
                      onChange={(e) => setMetrosCuadrados(Number(e.target.value))}
                      className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-xl px-3 py-2 text-navy-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-gray-600 mb-1">
                      Comuna / Ubicación (Chile)
                    </label>
                    <input
                      type="text"
                      value={comuna}
                      onChange={(e) => setComuna(e.target.value)}
                      placeholder="Ej: Peñalolén, Santiago"
                      className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-xl px-3 py-2 text-navy-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-gray-600 mb-1">
                      Nivel de Terminaciones
                    </label>
                    <select
                      value={calidad}
                      onChange={(e) => setCalidad(e.target.value as any)}
                      className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-xl px-3 py-2 text-navy-900"
                    >
                      <option value="economico">Económica (Básica)</option>
                      <option value="estandar">Estándar (Relación precio/calidad óptima)</option>
                      <option value="premium">Premium (Acabados de primera línea)</option>
                    </select>
                  </div>
                </div>

                {/* Paso 3: Botón de Acción Principal */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-gray-500 font-mono">
                    {statusMessage && <span className="text-obra-orange animate-pulse font-bold">{statusMessage}</span>}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleGenerarCotizacion()}
                    disabled={isLoading || !descripcion.trim()}
                    className="w-full sm:w-auto px-6 py-3 bg-obra-orange hover:bg-orange-600 text-white rounded-xl text-xs font-heading font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Google Gemini IA Cubicando...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-white" />
                        <span>⚡ Calcular Presupuesto y Tarifas con Gemini IA</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Visualización del Resultado de la Cotización */}
              {currentCotizacion && (
                <div className="space-y-5">
                  {/* Tarjeta de Cabecera y Asesor de Cobro */}
                  <div className="bg-navy-900 text-white border border-navy-700 rounded-2xl p-5 md:p-6 shadow-xl space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-navy-700">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono uppercase bg-obra-orange text-white px-2 py-0.5 rounded font-bold">
                            {currentCotizacion.tipo_obra}
                          </span>
                          <span className="text-xs font-mono text-gray-400">
                            {currentCotizacion.metros_cuadrados} m² • {currentCotizacion.comuna_region} • {currentCotizacion.duracion_dias_estimada} días hábiles
                          </span>
                        </div>
                        <h3 className="font-heading font-bold text-xl text-white">
                          {currentCotizacion.titulo_proyecto}
                        </h3>
                        <p className="text-xs text-gray-300 max-w-3xl leading-relaxed">
                          {currentCotizacion.resumen_ejecutivo}
                        </p>
                      </div>

                      {/* Acciones Inmediatas */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={handleCopyPresupuesto}
                          className="px-3 py-1.5 bg-navy-800 hover:bg-navy-700 text-gray-200 border border-navy-600 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copiedPresupuesto ? '¡Copiado!' : 'Copiar'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleShareWhatsAppCliente}
                          className="px-3.5 py-1.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 shadow-md transition-all"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Enviar por WhatsApp</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCreateModal(true)}
                          className="px-3.5 py-1.5 bg-obra-green hover:bg-emerald-700 text-white rounded-xl text-xs font-heading font-bold flex items-center gap-1.5 shadow-md"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Crear Proyecto</span>
                        </button>
                      </div>
                    </div>

                    {/* 3 Niveles de Cobro al Mandante */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-heading font-bold text-xs text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                          <DollarSign className="w-4 h-4 text-obra-orange" />
                          <span>Tarifas Sugeridas de Cobro al Mandante (Google Gemini IA):</span>
                        </h4>
                        {currentCotizacion.recomendacion_cobro?.desglose_por_metro_cuadrado && (
                          <span className="text-xs font-mono text-amber-300">
                            Promedio: <strong>{formatCLP(currentCotizacion.recomendacion_cobro.desglose_por_metro_cuadrado)} / m²</strong>
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 1. Mínimo */}
                        <div className="bg-navy-800/80 border border-navy-600/80 rounded-xl p-4 space-y-1.5">
                          <span className="text-[10px] font-mono uppercase text-gray-400 font-bold block">
                            🥉 Precio Mínimo Rentable
                          </span>
                          <p className="text-2xl font-bold font-mono text-gray-200">
                            {formatCLP(
                              currentCotizacion.recomendacion_cobro?.precio_minimo_rentable ||
                                Math.round(currentCotizacion.estructura_financiera.costo_directo * 1.2)
                            )}
                          </p>
                          <p className="text-[11px] text-gray-300">
                            Margen mínimo de 15%. Para ganar licitaciones muy competidas sin incurrir en pérdidas.
                          </p>
                        </div>

                        {/* 2. Sugerido (Recomendado) */}
                        <div className="bg-navy-800/95 border-2 border-obra-orange rounded-xl p-4 space-y-1.5 relative shadow-lg">
                          <div className="absolute top-0 right-0 bg-obra-orange text-white text-[9px] font-mono font-bold px-2 py-0.5 rounded-bl-lg">
                            ⭐ RECOMENDADO
                          </div>
                          <span className="text-[10px] font-mono uppercase text-obra-orange font-bold block">
                            🥇 Precio Sugerido de Mercado
                          </span>
                          <p className="text-2xl font-bold font-mono text-white">
                            {formatCLP(currentCotizacion.estructura_financiera.precio_total_con_iva)}
                          </p>
                          <p className="text-[11px] text-gray-200">
                            Neto: {formatCLP(currentCotizacion.estructura_financiera.precio_sugerido_neto)} + IVA (19%). Margen del {currentCotizacion.estructura_financiera.margen_utilidad_porcentaje}%.
                          </p>
                        </div>

                        {/* 3. Premium */}
                        <div className="bg-navy-800/80 border border-purple-500/50 rounded-xl p-4 space-y-1.5">
                          <span className="text-[10px] font-mono uppercase text-purple-400 font-bold block">
                            💎 Precio Premium con Garantía
                          </span>
                          <p className="text-2xl font-bold font-mono text-purple-300">
                            {formatCLP(
                              currentCotizacion.recomendacion_cobro?.precio_premium_garantia ||
                                Math.round(currentCotizacion.estructura_financiera.precio_total_con_iva * 1.25)
                            )}
                          </p>
                          <p className="text-[11px] text-gray-300">
                            Para mandantes exigentes: incluye póliza de post-venta y terminaciones finas.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sub-Pestañas de Detalle (Estructura, Materiales, Radar, Gantt) */}
                  <div className="bg-white border border-kraft-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-kraft-200 pb-2 overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => setResultSubTab('cobro')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors ${
                          resultSubTab === 'cobro'
                            ? 'bg-navy-900 text-white'
                            : 'text-gray-600 hover:bg-kraft-50'
                        }`}
                      >
                        💰 Margen & Esquema de Pago
                      </button>
                      <button
                        type="button"
                        onClick={() => setResultSubTab('materiales')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors ${
                          resultSubTab === 'materiales'
                            ? 'bg-navy-900 text-white'
                            : 'text-gray-600 hover:bg-kraft-50'
                        }`}
                      >
                        🧱 Materiales ({currentCotizacion.materiales?.length || 0}) & Jornales ({currentCotizacion.mano_de_obra?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setResultSubTab('radar')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors ${
                          resultSubTab === 'radar'
                            ? 'bg-navy-900 text-white'
                            : 'text-gray-600 hover:bg-kraft-50'
                        }`}
                      >
                        🏪 Radar de Tiendas & Ahorro
                      </button>
                      <button
                        type="button"
                        onClick={() => setResultSubTab('gantt')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors ${
                          resultSubTab === 'gantt'
                            ? 'bg-navy-900 text-white'
                            : 'text-gray-600 hover:bg-kraft-50'
                        }`}
                      >
                        📅 Partidas & Plazos ({currentCotizacion.duracion_dias_estimada} días)
                      </button>
                    </div>

                    {/* SubTab 1: Margen & Esquema de Pago */}
                    {resultSubTab === 'cobro' && (
                      <div className="space-y-4 pt-2">
                        {/* Slider Margen */}
                        <div className="bg-kraft-50 border border-kraft-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-heading font-bold text-navy-900 flex items-center gap-1.5">
                              <Sliders className="w-4 h-4 text-obra-orange" />
                              <span>Ajustar Margen de Ganancia Neto:</span>
                            </span>
                            <span className="text-xs font-mono font-bold text-obra-orange bg-white px-3 py-1 rounded-md border border-kraft-200">
                              {margenUtilidad}% de Utilidad Neta
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-[11px] font-mono text-gray-500">15%</span>
                            <input
                              type="range"
                              min="15"
                              max="50"
                              step="1"
                              value={margenUtilidad}
                              onChange={(e) => handleSliderMargenChange(Number(e.target.value))}
                              className="flex-1 accent-obra-orange cursor-pointer h-2 bg-kraft-200 rounded-lg"
                            />
                            <span className="text-[11px] font-mono text-gray-500">50%</span>
                          </div>
                        </div>

                        {/* Esquema de Pago Seguro */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-kraft-50 border border-kraft-200 rounded-xl p-4 space-y-2">
                            <h4 className="font-heading font-bold text-xs text-navy-900 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-obra-green" />
                              <span>Plan de Pago Seguro Sugerido (40/30/20/10)</span>
                            </h4>
                            <ul className="space-y-1.5 text-xs text-gray-700">
                              <li className="flex items-start gap-2">
                                <span className="font-bold text-obra-orange">40%</span>
                                <span>Anticipo al firmar (Materiales iniciales y replanteo)</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="font-bold text-obra-orange">30%</span>
                                <span>Al terminar obra gruesa / 50% de avance físico</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="font-bold text-obra-orange">20%</span>
                                <span>Al finalizar terminaciones e instalaciones</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="font-bold text-obra-green">10%</span>
                                <span>Contra entrega de llaves y recepción conforme</span>
                              </li>
                            </ul>
                          </div>

                          <div className="bg-kraft-50 border border-kraft-200 rounded-xl p-4 space-y-2">
                            <h4 className="font-heading font-bold text-xs text-navy-900 flex items-center gap-1.5">
                              <HelpCircle className="w-4 h-4 text-obra-orange" />
                              <span>Estrategia de Negociación para el Mandante</span>
                            </h4>
                            <p className="text-xs text-gray-600 leading-relaxed">
                              {currentCotizacion.recomendacion_cobro?.estrategia_negociacion ||
                                'Destaca la compra en ferreterías con control de calidad (Construmart/Imperial) y la planificación con Carta Gantt para garantizar cero sobrecostos.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SubTab 2: Materiales & Mano de Obra */}
                    {resultSubTab === 'materiales' && (
                      <div className="space-y-4 pt-2">
                        {/* Tabla de Materiales */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border border-kraft-200 rounded-xl overflow-hidden">
                            <thead className="bg-kraft-50 text-gray-700 font-heading font-bold">
                              <tr>
                                <th className="p-2.5">Material / Insumo</th>
                                <th className="p-2.5">Cant.</th>
                                <th className="p-2.5">Precio Est.</th>
                                <th className="p-2.5">Mejor Tienda en Chile</th>
                                <th className="p-2.5 text-right">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-kraft-200 font-mono">
                              {currentCotizacion.materiales?.map((mat, idx) => (
                                <tr key={idx} className="hover:bg-kraft-50/50">
                                  <td className="p-2.5 font-sans font-medium text-navy-900">{mat.nombre}</td>
                                  <td className="p-2.5">{mat.cantidad} {mat.unidad}</td>
                                  <td className="p-2.5">{formatCLP(mat.precio_mas_barato || mat.precio_unitario_estimado)}</td>
                                  <td className="p-2.5">
                                    <span className="bg-emerald-50 text-obra-green border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold">
                                      {mat.mejor_tienda}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-right font-bold">{formatCLP(mat.subtotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Cuadrilla de Mano de Obra */}
                        <div className="bg-kraft-50 border border-kraft-200 rounded-xl p-4 space-y-2">
                          <h4 className="font-heading font-bold text-xs text-navy-900">
                            Estimación de Cuadrilla & Jornales de Faena:
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {currentCotizacion.mano_de_obra?.map((mo, idx) => (
                              <div key={idx} className="bg-white border border-kraft-200 rounded-lg p-3 text-xs">
                                <p className="font-bold text-navy-900">{mo.rol}</p>
                                <p className="text-gray-500 font-mono text-[11px]">
                                  {mo.cantidad_personas} pers. × {mo.dias_estimados} días @ {formatCLP(mo.valor_jornal_diario)}/día
                                </p>
                                <p className="font-bold font-mono text-obra-orange pt-1">
                                  Subtotal: {formatCLP(mo.subtotal)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SubTab 3: Radar de Tiendas */}
                    {resultSubTab === 'radar' && (
                      <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {currentCotizacion.radar_proveedores?.map((prov, idx) => (
                            <div key={idx} className="bg-kraft-50 border border-kraft-200 rounded-xl p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-heading font-bold text-sm text-navy-900">{prov.tienda}</span>
                                <span className="text-[10px] font-mono bg-emerald-100 text-obra-green px-2 py-0.5 rounded font-bold">
                                  {prov.categoria_destacada}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600">{prov.descuentos_disponibles}</p>
                              <div className="pt-2 border-t border-kraft-200 flex items-center justify-between text-xs font-mono">
                                <span className="text-gray-500">Ahorro Estimado:</span>
                                <strong className="text-obra-green">{formatCLP(prov.ahorro_estimado_total)}</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SubTab 4: Partidas Gantt */}
                    {resultSubTab === 'gantt' && (
                      <div className="space-y-4 pt-2">
                        <ul className="space-y-2">
                          {currentCotizacion.actividades_gantt?.map((act, idx) => (
                            <li key={idx} className="bg-kraft-50 border border-kraft-200 rounded-xl p-3 flex items-center justify-between text-xs">
                              <span className="font-medium text-navy-900">{act.orden || idx + 1}. {act.nombre}</span>
                              <span className="font-mono text-gray-500 bg-white px-2 py-0.5 rounded border border-kraft-200">
                                {act.dias} días estimados
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </PlanLockOverlay>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 2: HISTORIAL DE COTIZACIONES */}
        {/* ========================================================================= */}
        {activeTab === 'historial' && (
          <div className="bg-white border border-kraft-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-sm text-navy-900">
                Mis Cotizaciones Guardadas ({cotizaciones.length})
              </h3>
              <input
                type="text"
                value={searchCotizacion}
                onChange={(e) => setSearchCotizacion(e.target.value)}
                placeholder="Buscar cotización..."
                className="text-xs bg-kraft-50 border border-kraft-200 rounded-xl px-3 py-1.5 w-48 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cotizaciones
                .filter((c) => c.titulo_proyecto.toLowerCase().includes(searchCotizacion.toLowerCase()))
                .map((cot) => (
                  <div
                    key={cot.id}
                    className="border border-kraft-200 rounded-xl p-4 hover:border-obra-orange transition-all space-y-3 bg-kraft-50/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono text-obra-orange font-bold uppercase">
                          {cot.tipo_obra}
                        </span>
                        <h4 className="font-heading font-bold text-sm text-navy-900">{cot.titulo_proyecto}</h4>
                        <p className="text-[11px] text-gray-500">
                          {cot.comuna_region} • {cot.metros_cuadrados} m² • {formatDate(cot.fecha_creacion)}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-sm text-navy-900">
                        {formatCLP(cot.estructura_financiera.precio_total_con_iva)}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-kraft-200">
                      <button
                        onClick={() => {
                          setCurrentCotizacion(cot);
                          setActiveTab('cotizador');
                          showToast(`Cargada: ${cot.titulo_proyecto}`);
                        }}
                        className="px-3 py-1 bg-navy-900 text-white rounded-lg text-xs font-semibold hover:bg-navy-800"
                      >
                        Abrir
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 3: COPILOTO IA CONVERSACIONAL & AGENDA DE FAENAS */}
        {/* ========================================================================= */}
        {activeTab === 'asistente' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Columna Izquierda: Chat con Gemini (7 cols) */}
            <div className="lg:col-span-7 bg-white border border-kraft-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[640px]">
              {/* Header del Chat */}
              <div className="bg-navy-900 text-white p-4 border-b border-navy-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-obra-orange flex items-center justify-center text-white shadow-md">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                      <span>Copiloto de Faena & Asesor IA</span>
                      <span className="px-1.5 py-0.5 rounded bg-obra-orange text-white text-[9px] font-mono font-bold">
                        Gemini 3.6
                      </span>
                    </h3>
                    <p className="text-[11px] text-gray-400 font-mono">
                      Cubicaciones, consultas técnicas y agendamiento automático de visitas
                    </p>
                  </div>
                </div>
              </div>

              {/* Mensajes del Chat */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-kraft-50/40 text-xs">
                {mensajesChat.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.remitente === 'usuario' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 space-y-2 shadow-sm ${
                        m.remitente === 'usuario'
                          ? 'bg-navy-900 text-white rounded-br-none'
                          : 'bg-white border border-kraft-200 text-navy-900 rounded-bl-none'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[10px] text-gray-400">
                        {m.remitente === 'usuario' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-obra-orange" />}
                        <span>{m.remitente === 'usuario' ? 'Tú (Jefe de Obra)' : 'Copiloto Gemini'}</span>
                        <span className="ml-auto font-mono text-[9px]">{m.timestamp}</span>
                      </div>

                      <p className="whitespace-pre-line leading-relaxed text-xs">{m.texto}</p>

                      {/* Tarjeta de Acción Ejecutada si la IA agendó algo */}
                      {m.accion_ejecutada && (
                        <div className="bg-orange-50 border-2 border-obra-orange/60 rounded-xl p-3 space-y-1.5 text-navy-900 animate-in fade-in">
                          <span className="text-[10px] font-mono font-bold uppercase text-obra-orange flex items-center gap-1">
                            <CalendarCheck className="w-3.5 h-3.5" />
                            <span>¡Acción Ejecutada en la Agenda!</span>
                          </span>
                          <p className="font-bold text-xs">{m.accion_ejecutada.titulo}</p>
                          <p className="text-[11px] text-gray-600">{m.accion_ejecutada.resultado_texto}</p>
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
                            className="px-2.5 py-1 bg-white border border-kraft-200 hover:border-obra-orange text-navy-900 rounded-lg text-[10px] font-medium shadow-2xs transition-colors"
                          >
                            💡 {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {isChatLoading && (
                  <div className="flex items-center gap-2 text-gray-500 font-mono text-xs">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-obra-orange" />
                    <span>Gemini analizando la consulta...</span>
                  </div>
                )}
              </div>

              {/* Input Bar del Chat */}
              <div className="p-3 bg-white border-t border-kraft-200 flex items-center gap-2">
                <input
                  type="text"
                  value={inputChat}
                  onChange={(e) => setInputChat(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Escribe tu consulta o pide agendar una visita (ej: Agéndame visita el viernes a las 11 en Peñalolén)..."
                  className="flex-1 text-xs bg-kraft-50 border border-kraft-200 rounded-xl px-3.5 py-2.5 text-navy-900 focus:outline-none focus:border-obra-orange"
                />
                <button
                  onClick={() => handleSendChat()}
                  disabled={!inputChat.trim() || isChatLoading}
                  className="p-2.5 bg-obra-orange hover:bg-orange-600 text-white rounded-xl disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Columna Derecha: Agenda de Terreno en Vivo (5 cols) */}
            <div className="lg:col-span-5 bg-white border border-kraft-200 rounded-2xl shadow-sm p-5 space-y-4 flex flex-col h-[640px]">
              <div className="flex items-center justify-between pb-3 border-b border-kraft-100">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-obra-orange" />
                  <div>
                    <h3 className="font-heading font-bold text-sm text-navy-900">Agenda de Faena & Visitas</h3>
                    <p className="text-[11px] text-gray-500">Agendados por la IA o manualmente</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAgendaModal(true)}
                  className="px-2.5 py-1 bg-navy-900 hover:bg-navy-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Evento</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                {eventosAgenda.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 space-y-2">
                    <Calendar className="w-8 h-8 mx-auto text-gray-300" />
                    <p className="text-xs">No tienes eventos en tu agenda.</p>
                    <p className="text-[11px]">Pídele al Copiloto Gemini en el chat que agende una visita para ti.</p>
                  </div>
                ) : (
                  eventosAgenda.map((evt) => (
                    <div
                      key={evt.id}
                      className={`border rounded-xl p-3 space-y-2 transition-all text-xs ${
                        evt.completado
                          ? 'bg-gray-50 border-gray-200 opacity-60'
                          : 'bg-kraft-50/60 border-kraft-200 hover:border-obra-orange'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => handleToggleEvento(evt.id)}
                          className="flex items-start gap-2 text-left flex-1"
                        >
                          {evt.completado ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className={`font-bold block ${evt.completado ? 'line-through text-gray-500' : 'text-navy-900'}`}>
                              {evt.titulo}
                            </span>
                            <span className="text-[11px] font-mono text-gray-500 block">
                              📅 {formatDate(evt.fecha)} • ⏰ {evt.hora || '10:00'} hrs
                            </span>
                          </div>
                        </button>

                        <button
                          onClick={() => handleDeleteEvento(evt.id)}
                          className="text-gray-400 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {evt.comuna_lugar && (
                        <div className="flex items-center gap-1 text-[11px] text-gray-600 font-sans">
                          <MapPin className="w-3 h-3 text-obra-orange shrink-0" />
                          <span>{evt.comuna_lugar}</span>
                        </div>
                      )}

                      {evt.descripcion && (
                        <p className="text-[11px] text-gray-500 italic bg-white p-2 rounded-lg border border-kraft-200">
                          "{evt.descripcion}"
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 4: RADAR DE FERRETERÍAS EN CHILE */}
        {/* ========================================================================= */}
        {activeTab === 'radar' && (
          <div className="bg-white border border-kraft-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-kraft-100">
              <div>
                <h3 className="font-heading font-bold text-sm text-navy-900">
                  Radar Comparador de Insumos en Chile
                </h3>
                <p className="text-xs text-gray-500">
                  Precios actualizados en Construmart, Imperial, Sodimac, MTS y Barracas.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchMaterial}
                  onChange={(e) => setSearchMaterial(e.target.value)}
                  placeholder="Buscar material (cemento, OSB...)"
                  className="text-xs bg-kraft-50 border border-kraft-200 rounded-xl px-3 py-1.5 w-48 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-kraft-200 rounded-xl overflow-hidden">
                <thead className="bg-kraft-50 text-gray-700 font-heading font-bold">
                  <tr>
                    <th className="p-3">Material / Insumo</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3">Construmart</th>
                    <th className="p-3">Imperial</th>
                    <th className="p-3">Sodimac</th>
                    <th className="p-3">Mejor Opción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-kraft-200 font-mono">
                  {filteredMateriales.map((item, idx) => (
                    <tr key={idx} className="hover:bg-kraft-50/60">
                      <td className="p-3 font-sans font-medium text-navy-900">
                        {item.nombre}
                        <span className="block text-[10px] text-gray-500 font-mono">Unidad: {item.unidad}</span>
                      </td>
                      <td className="p-3 text-gray-600 font-sans">{item.categoria}</td>
                      <td className="p-3">{item.precios.construmart ? formatCLP(item.precios.construmart) : '-'}</td>
                      <td className="p-3">{item.precios.imperial ? formatCLP(item.precios.imperial) : '-'}</td>
                      <td className="p-3">{item.precios.sodimac ? formatCLP(item.precios.sodimac) : '-'}</td>
                      <td className="p-3">
                        <span className="bg-emerald-50 text-obra-green border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">
                          {item.mejor_tienda} ({formatCLP(item.precio_minimo)})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL CREAR PROYECTO DESDE COTIZACIÓN */}
      {showCreateModal && currentCotizacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-kraft-200 my-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-navy-900">
                Crear Proyecto en ObraTrack
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Se creará la obra <strong>"{currentCotizacion.titulo_proyecto}"</strong> con su Carta Gantt y presupuesto inicial.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Cliente / Mandante</label>
                <select
                  value={selectedClienteId}
                  onChange={(e) => setSelectedClienteId(e.target.value)}
                  className="w-full bg-kraft-50 border border-kraft-200 rounded-xl p-2.5 text-navy-900"
                >
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} {c.rut ? `(${c.rut})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Fecha de Inicio de Faenas</label>
                <input
                  type="date"
                  value={fechaInicioProyecto}
                  onChange={(e) => setFechaInicioProyecto(e.target.value)}
                  className="w-full bg-kraft-50 border border-kraft-200 rounded-xl p-2.5 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 text-gray-700 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearProyecto}
                className="px-4 py-2 bg-obra-green hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md"
              >
                Confirmar y Ver Carta Gantt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO EVENTO AGENDA MANUAL */}
      {showAgendaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-kraft-200 my-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-1.5">
                <Calendar className="w-5 h-5 text-obra-orange" />
                <span>Nuevo Evento o Visita a Terreno</span>
              </h3>
              <button onClick={() => setShowAgendaModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarEventoManual} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Título del Compromiso</label>
                <input
                  type="text"
                  value={nuevoEventoTitulo}
                  onChange={(e) => setNuevoEventoTitulo(e.target.value)}
                  placeholder="Ej: Visita de inspección de radier con Don Carlos"
                  required
                  className="w-full bg-kraft-50 border border-kraft-200 rounded-xl p-2.5 text-navy-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Fecha</label>
                  <input
                    type="date"
                    value={nuevoEventoFecha}
                    onChange={(e) => setNuevoEventoFecha(e.target.value)}
                    className="w-full bg-kraft-50 border border-kraft-200 rounded-xl p-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Hora</label>
                  <input
                    type="time"
                    value={nuevoEventoHora}
                    onChange={(e) => setNuevoEventoHora(e.target.value)}
                    className="w-full bg-kraft-50 border border-kraft-200 rounded-xl p-2.5 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Comuna / Lugar</label>
                <input
                  type="text"
                  value={nuevoEventoComuna}
                  onChange={(e) => setNuevoEventoComuna(e.target.value)}
                  placeholder="Ej: Peñalolén, Santiago"
                  className="w-full bg-kraft-50 border border-kraft-200 rounded-xl p-2.5 text-navy-900"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Notas / Instrucciones</label>
                <textarea
                  rows={2}
                  value={nuevoEventoDesc}
                  onChange={(e) => setNuevoEventoDesc(e.target.value)}
                  placeholder="Llevar huincha, nivel y revisar toma de agua..."
                  className="w-full bg-kraft-50 border border-kraft-200 rounded-xl p-2.5 text-navy-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAgendaModal(false)}
                  className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 text-gray-700 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-obra-orange hover:bg-orange-600 text-white rounded-xl font-bold shadow-md"
                >
                  Guardar en Agenda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
