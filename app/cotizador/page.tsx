'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Calculator,
  ShoppingBag,
  MessageSquare,
  Building2,
  Calendar,
  CheckCircle2,
  TrendingDown,
  Percent,
  Layers,
  Users,
  HardHat,
  Tag,
  ArrowRight,
  Printer,
  PlusCircle,
  Clock,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Sliders,
  DollarSign,
  FileSpreadsheet,
  Send,
  Bot,
  User,
  ExternalLink,
  ChevronDown,
  Search,
  Trash2,
  Edit3,
  Copy,
  FolderPlus,
  Plus,
  X,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { CotizacionEstimacion, MensajeChatCotizador, Cliente, SubscriptionPlanId } from '@/types/database';
import { formatCLP, formatDate, formatThousands, parseThousands } from '@/lib/utils';
import { getPlanDetails } from '@/lib/plans';
import PlanSwitcherModal from '@/components/PlanSwitcherModal';
import PlanLockOverlay from '@/components/PlanLockOverlay';

export default function CotizadorPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'cotizador' | 'radar' | 'chat' | 'historial'>('cotizador');
  const [cotizaciones, setCotizaciones] = useState<CotizacionEstimacion[]>([]);
  const [currentCotizacion, setCurrentCotizacion] = useState<CotizacionEstimacion | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  // Gestión & CRUD de Cotizaciones
  const [searchCotizacion, setSearchCotizacion] = useState('');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingCotizacion, setEditingCotizacion] = useState<CotizacionEstimacion | null>(null);
  const [cotizacionToDelete, setCotizacionToDelete] = useState<CotizacionEstimacion | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Formulario Cotización Manual
  const [manualTitulo, setManualTitulo] = useState('');
  const [manualTipo, setManualTipo] = useState('Quinchos & Terrazas');
  const [manualM2, setManualM2] = useState<number>(20);
  const [manualCostoDirecto, setManualCostoDirecto] = useState('');
  const [manualMargen, setManualMargen] = useState<number>(30);
  const [manualDescripcion, setManualDescripcion] = useState('');

  // Formulario Editar Cotización
  const [editTitulo, setEditTitulo] = useState('');
  const [editTipo, setEditTipo] = useState('');
  const [editM2, setEditM2] = useState<number>(20);
  const [editResumen, setEditResumen] = useState('');

  // Formulario de cotización IA
  const [descripcion, setDescripcion] = useState('');
  const [tipoObra, setTipoObra] = useState('Quinchos & Terrazas');
  const [metrosCuadrados, setMetrosCuadrados] = useState<number>(25);
  const [comuna, setComuna] = useState('Santiago, Chile');
  const [margenUtilidad, setMargenUtilidad] = useState<number>(30);
  const [calidad, setCalidad] = useState<'economico' | 'estandar' | 'premium'>('estandar');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Chat con el Agente
  const [mensajesChat, setMensajesChat] = useState<MensajeChatCotizador[]>([
    {
      id: 'm-init',
      remitente: 'agente',
      texto:
        '¡Hola! Soy tu Agente Experto de Costos y Obras en Chile. Puedo ayudarte a calcular cuánto cobrar por tus proyectos, comparar dónde están los materiales más baratos (Sodimac, Construmart, Imperial, MTS) o sugerirte cómo optimizar tus presupuestos sin perder margen.',
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      sugerencias: [
        '¿Dónde comprar madera y OSB al mejor precio?',
        '¿Cuánto cobrar por m2 de radier en Santiago?',
        '¿Cómo estructurar los estados de pago con el cliente?',
      ],
    },
  ]);
  const [inputChat, setInputChat] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Modal para crear proyecto
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [fechaInicioProyecto, setFechaInicioProyecto] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Buscador de Radar de Materiales
  const [busquedaMaterial, setBusquedaMaterial] = useState('');
  const catalogoMateriales = dataService.getCatalogoMateriales();

  // Estado de suscripción
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  useEffect(() => {
    const list = dataService.getCotizaciones();
    setCotizaciones(list);
    if (list.length > 0 && !currentCotizacion) {
      setCurrentCotizacion(list[0]);
    }
    const cls = dataService.getClientes();
    setClientes(cls);
    if (cls.length > 0) {
      setSelectedClienteId(cls[0].id);
    }
    const plan = dataService.getActivePlan();
    setActivePlan(plan);

    const handler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    window.addEventListener('obratrack_plan_changed', handler);
    return () => window.removeEventListener('obratrack_plan_changed', handler);
  }, []);

  // Prompts rápidos para probar en 1 clic
  const quickTemplates = [
    {
      titulo: 'Quincho 28m² con Radier y Techumbre',
      tipo: 'Quinchos & Terrazas',
      m2: 28,
      prompt: 'Construcción de quincho rústico de 28m2 con radier de hormigón H-20 de 10cm, pilares y vigas a la vista en Pino Oregón, techumbre en teja asfáltica sobre OSB, parrilla de ladrillo refractario y piso en porcelanato exterior.',
    },
    {
      titulo: 'Ampliación Segundo Piso 35m² en Metalcon',
      tipo: 'Ampliaciones',
      m2: 35,
      prompt: 'Ampliación habitacional de 35m2 en segundo piso con estructura completa de Metalcon, aislación térmica en lana de vidrio, tabiques de Volcanita, placas exteriores de fibrocemento Permanit y piso flotante 8mm.',
    },
    {
      titulo: 'Radier de Hormigón 50m² Estacionamiento',
      tipo: 'Obra Gruesa',
      m2: 50,
      prompt: 'Construcción de radier de 50m2 para estacionamiento de vehículos, espesor 12cm, con base estabilizada compactada, polietileno 0.2mm, malla electrosoldada Acma C-92 y corte de juntas de dilatación.',
    },
    {
      titulo: 'Remodelación Integral Baño y Cocina',
      tipo: 'Remodelaciones',
      m2: 18,
      prompt: 'Remodelación completa de baño y cocina (18m2 totales): retiro de cerámicas antiguas, instalación de nuevo porcelanato 60x60 en piso y muros con Bekron DA, renovación de red de agua en PPR y cambio de artefactos sanitarios.',
    },
  ];

  const handleApplyTemplate = (tpl: typeof quickTemplates[0]) => {
    setDescripcion(tpl.prompt);
    setTipoObra(tpl.tipo);
    setMetrosCuadrados(tpl.m2);
  };

  const [copiedPresupuesto, setCopiedPresupuesto] = useState(false);

  // Compartir cotización estructurada por WhatsApp al Cliente
  const handleShareWhatsAppCliente = () => {
    if (!currentCotizacion) return;
    const est = currentCotizacion.estructura_financiera;
    const rec = currentCotizacion.recomendacion_cobro;
    const precioNeto = est.precio_sugerido_neto;
    const precioTotal = est.precio_total_con_iva;

    const text = `🏗️ *PROPUESTA DE PRESUPUESTO - ${currentCotizacion.titulo_proyecto.toUpperCase()}*

📍 *Comuna / Ubicación:* ${currentCotizacion.comuna_region}
⏱️ *Plazo Estimado:* ${currentCotizacion.duracion_dias_estimada} días hábiles
📐 *Superficie:* ${currentCotizacion.metros_cuadrados ? `${currentCotizacion.metros_cuadrados} m²` : 'A convenir'}

💰 *VALOR DE LA OBRA:*
• Total Neto: $${precioNeto.toLocaleString('es-CL')} CLP
• Total con IVA (19%): $${precioTotal.toLocaleString('es-CL')} CLP

📋 *PLAN DE PAGO SUGERIDO:*
1️⃣ 40% Anticipo (Materiales e inicio de faena)
2️⃣ 30% Avance Obra Gruesa / 50%
3️⃣ 20% Terminaciones e Instalaciones
4️⃣ 10% Recepción Conforme y Entrega

_Generado automáticamente con ObraTrack & Google Gemini 2.5 IA._`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Copiar resumen de presupuesto al portapapeles
  const handleCopyPresupuesto = () => {
    if (!currentCotizacion) return;
    const est = currentCotizacion.estructura_financiera;
    const text = `PRESUPUESTO DE OBRA: ${currentCotizacion.titulo_proyecto}
Ubicación: ${currentCotizacion.comuna_region}
Plazo: ${currentCotizacion.duracion_dias_estimada} días
Monto Neto: $${est.precio_sugerido_neto.toLocaleString('es-CL')} CLP
Monto Total con IVA: $${est.precio_total_con_iva.toLocaleString('es-CL')} CLP
Generado con ObraTrack.`;
    navigator.clipboard.writeText(text);
    setCopiedPresupuesto(true);
    setTimeout(() => setCopiedPresupuesto(false), 3000);
  };

  // Generar Cotización llamando al Backend API (Google Gemini 2.5)
  const handleGenerarCotizacion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!descripcion.trim()) return;

    setIsLoading(true);
    setStatusMessage('Google Gemini 2.5 IA está cubicando materiales y analizando precios en Chile...');

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
        throw new Error('No se pudo generar la cotización');
      }

      const raw = await response.json();
      const data: CotizacionEstimacion = raw.cotizacion || raw;
      dataService.saveCotizacion(data);
      setCurrentCotizacion(data);
      setCotizaciones(dataService.getCotizaciones());
      setStatusMessage(null);
    } catch (err: any) {
      console.error(err);
      setStatusMessage('Hubo un problema al conectar con la IA. Usando catálogo local.');
    } finally {
      setIsLoading(false);
    }
  };

  // Recalcular margen en vivo con el slider
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

  // Crear Proyecto en ObraTrack a partir de la Cotización
  const handleCrearProyecto = () => {
    if (!currentCotizacion) return;
    const nuevoProyecto = dataService.crearProyectoDesdeCotizacion(
      currentCotizacion,
      selectedClienteId,
      fechaInicioProyecto
    );
    setShowCreateModal(false);
    router.push(`/proyectos/${nuevoProyecto.id}/gantt`);
  };

  // Enviar mensaje al Agente de IA
  const handleSendChat = async (texto?: string) => {
    const msgToSend = texto || inputChat;
    if (!msgToSend.trim()) return;

    const nuevoMsgUsuario: MensajeChatCotizador = {
      id: 'u-' + Date.now(),
      remitente: 'usuario',
      texto: msgToSend.trim(),
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    };

    const nuevoHistorial = [...mensajesChat, nuevoMsgUsuario];
    setMensajesChat(nuevoHistorial);
    setInputChat('');
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/cotizador/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: msgToSend.trim(),
          historial: nuevoHistorial.slice(-6),
          contexto_cotizacion: currentCotizacion,
        }),
      });

      const data = await res.json();
      const nuevoMsgAgente: MensajeChatCotizador = {
        id: 'a-' + Date.now(),
        remitente: 'agente',
        texto: data.respuesta || 'Entendido. Estoy a tu disposición para optimizar costos.',
        timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        sugerencias: data.sugerencias || [],
      };
      setMensajesChat([...nuevoHistorial, nuevoMsgAgente]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleOpenEditCotizacion = (cot: CotizacionEstimacion) => {
    setEditingCotizacion(cot);
    setEditTitulo(cot.titulo_proyecto);
    setEditTipo(cot.tipo_obra);
    setEditM2(cot.metros_cuadrados || 20);
    setEditResumen(cot.resumen_ejecutivo);
  };

  const handleSaveEditCotizacion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCotizacion || !editTitulo.trim()) return;

    const updated: CotizacionEstimacion = {
      ...editingCotizacion,
      titulo_proyecto: editTitulo.trim(),
      tipo_obra: editTipo || editingCotizacion.tipo_obra,
      metros_cuadrados: editM2,
      resumen_ejecutivo: editResumen.trim() || editingCotizacion.resumen_ejecutivo,
    };

    dataService.saveCotizacion(updated);
    const all = dataService.getCotizaciones();
    setCotizaciones(all);
    if (currentCotizacion?.id === updated.id) {
      setCurrentCotizacion(updated);
    }
    setEditingCotizacion(null);
    showToast(`Cotización "${editTitulo.trim()}" actualizada.`);
  };

  const handleSaveManualCotizacion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitulo.trim()) return;
    const costoDir = parseThousands(manualCostoDirecto);
    const margenMonto = Math.round(costoDir * (manualMargen / 100));
    const gastosGen = Math.round(costoDir * 0.08);
    const imprevistos = Math.round(costoDir * 0.05);
    const neto = costoDir + margenMonto + gastosGen + imprevistos;
    const iva = Math.round(neto * 0.19);
    const total = neto + iva;

    const newCot: CotizacionEstimacion = {
      id: 'cot-' + Date.now(),
      titulo_proyecto: manualTitulo.trim(),
      tipo_obra: manualTipo,
      metros_cuadrados: manualM2,
      comuna_region: comuna,
      resumen_ejecutivo: manualDescripcion.trim() || `Presupuesto manual para ${manualTitulo}`,
      duracion_dias_estimada: 15,
      estructura_financiera: {
        costo_materiales_total: Math.round(costoDir * 0.55),
        costo_mano_obra_total: Math.round(costoDir * 0.45),
        costo_directo: costoDir,
        gastos_generales_porcentaje: 8,
        gastos_generales_monto: gastosGen,
        imprevistos_porcentaje: 5,
        imprevistos_monto: imprevistos,
        margen_utilidad_porcentaje: manualMargen,
        margen_utilidad_monto: margenMonto,
        precio_sugerido_neto: neto,
        iva_19: iva,
        precio_total_con_iva: total,
        ahorro_compras_estrategicas: Math.round(costoDir * 0.07),
      },
      materiales: [],
      mano_de_obra: [
        {
          rol: 'Maestro Mayor',
          cantidad_personas: 1,
          dias_estimados: 10,
          valor_jornal_diario: 45000,
          subtotal: 450000,
        },
        {
          rol: 'Ayudante',
          cantidad_personas: 1,
          dias_estimados: 10,
          valor_jornal_diario: 28000,
          subtotal: 280000,
        },
      ],
      actividades_gantt: [
        { nombre: 'Trazado y preparación', dias: 3, orden: 1 },
        { nombre: 'Ejecución principal', dias: 7, orden: 2 },
        { nombre: 'Terminaciones y entrega', dias: 5, orden: 3 },
      ],
      radar_proveedores: [],
      consejos_experto_pyme: [
        'Definir estados de pago claros por avance de partidas.',
        'Considerar compras por volumen en barracas para abaratar costos.',
      ],
      fecha_creacion: new Date().toISOString().split('T')[0],
    };

    dataService.saveCotizacion(newCot);
    setCotizaciones(dataService.getCotizaciones());
    setCurrentCotizacion(newCot);
    setIsManualModalOpen(false);
    setManualTitulo('');
    setManualCostoDirecto('');
    setManualDescripcion('');
    setActiveTab('cotizador');
    showToast(`Cotización "${manualTitulo}" creada exitosamente.`);
  };

  const handleDuplicateCotizacion = (cot: CotizacionEstimacion) => {
    const duplicated: CotizacionEstimacion = {
      ...cot,
      id: 'cot-' + Date.now(),
      titulo_proyecto: `${cot.titulo_proyecto} (Copia)`,
    };
    dataService.saveCotizacion(duplicated);
    setCotizaciones(dataService.getCotizaciones());
    setCurrentCotizacion(duplicated);
    showToast(`Cotización duplicada con éxito.`);
  };

  const handleDeleteCotizacion = (id: string) => {
    dataService.deleteCotizacion(id);
    const updated = dataService.getCotizaciones();
    setCotizaciones(updated);
    if (currentCotizacion?.id === id) {
      setCurrentCotizacion(updated[0] || null);
    }
    setCotizacionToDelete(null);
    showToast(`Cotización eliminada.`);
  };

  const filteredMateriales = catalogoMateriales.filter((m) => {
    if (!busquedaMaterial) return true;
    return (
      m.nombre.toLowerCase().includes(busquedaMaterial.toLowerCase()) ||
      m.categoria.toLowerCase().includes(busquedaMaterial.toLowerCase()) ||
      m.mejor_tienda.toLowerCase().includes(busquedaMaterial.toLowerCase())
    );
  });

  const filteredCotizaciones = cotizaciones.filter((c) => {
    if (!searchCotizacion) return true;
    const term = searchCotizacion.toLowerCase();
    return (
      c.titulo_proyecto.toLowerCase().includes(term) ||
      c.tipo_obra.toLowerCase().includes(term) ||
      c.comuna_region.toLowerCase().includes(term) ||
      (c.resumen_ejecutivo && c.resumen_ejecutivo.toLowerCase().includes(term))
    );
  });

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-kraft-50/40">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-navy-900 text-white border border-obra-orange/40 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-5 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-obra-orange" />
          <span>{toastMessage}</span>
        </div>
      )}

      <PlanSwitcherModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />

      <Navbar
        title="Cotizador Inteligente & Radar de Precios IA"
        subtitle="Cálculo de cobro al cliente, cubicación y radar de insumos más baratos en Chile con Google Gemini 2.5 Pro / Flash IA"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsManualModalOpen(true)}
              className="px-3 py-1.5 bg-white border border-kraft-200 hover:bg-kraft-50 text-navy-900 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm font-heading"
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
            <button
              onClick={() => setActiveTab('chat')}
              className="px-3 py-1.5 bg-[#1E1E1E] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:bg-[#2A2A2A]"
            >
              <Bot className="w-3.5 h-3.5 text-obra-orange" />
              <span>Consultar al Agente IA</span>
            </button>
          </div>
        }
      />

      <div className="p-4 md:p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Banner si el usuario está en Plan Gratis */}
        {activePlan === 'gratis' && (
          <div className="p-4 rounded-2xl bg-[#FF6A00]/10 border border-[#FF6A00]/30 text-[#1E1E1E] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-[#FF6A00] shrink-0" />
              <div>
                <p className="text-xs font-bold font-heading">
                  Módulo de Cotización con IA & Radar de Ferreterías (Exclusivo Plan Pro y Pro IA)
                </p>
                <p className="text-[11px] text-gray-600 font-sans">
                  El <strong>Plan Pro ($9.990 - $14.990)</strong> incluye cubicación automática con Google Gemini 2.5 IA, asesor de cobro al mandante y comparador de precios en Sodimac, Construmart e Imperial.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="px-3.5 py-1.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-sm transition-colors whitespace-nowrap"
            >
              ⚡ Simular Plan Pro en Demo
            </button>
          </div>
        )}
        {/* Selector de Pestañas */}
        <div className="flex items-center gap-2 border-b border-kraft-200 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('cotizador')}
            className={`px-4 py-2 rounded-lg text-xs font-heading font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'cotizador'
                ? 'bg-navy-800 text-white shadow-sm'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            <Calculator className="w-4 h-4 text-obra-orange" />
            <span>Cotizador & Presupuesto IA</span>
            {activePlan === 'gratis' && <Lock className="w-3.5 h-3.5 text-amber-500 ml-0.5" />}
          </button>
          <button
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-2 rounded-lg text-xs font-heading font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'historial'
                ? 'bg-navy-800 text-white shadow-sm'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            <FolderPlus className="w-4 h-4 text-amber-500" />
            <span>Mis Cotizaciones ({cotizaciones.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('radar')}
            className={`px-4 py-2 rounded-lg text-xs font-heading font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'radar'
                ? 'bg-navy-800 text-white shadow-sm'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-obra-green" />
            <span>Radar de Precios en Chile</span>
            {activePlan === 'gratis' && <Lock className="w-3.5 h-3.5 text-amber-500 ml-0.5" />}
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 rounded-lg text-xs font-heading font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-navy-800 text-white shadow-sm'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <span>Chat Asesor de Obras</span>
            {activePlan === 'gratis' && <Lock className="w-3.5 h-3.5 text-amber-500 ml-0.5" />}
          </button>
        </div>

        {/* ========================================================================= */}
        {/* PESTAÑA 1: COTIZADOR & PRESUPUESTO */}
        {/* ========================================================================= */}
        {activeTab === 'cotizador' && (
          <PlanLockOverlay
            isLocked={activePlan === 'gratis'}
            featureName="Cotizador & Cubicador Inteligente con Google Gemini 2.5 IA"
            requiredPlan="pro"
            description="Genera cubicación de insumos, cálculo de jornales de cuadrilla, asesor de cobro al mandante y Carta Gantt en segundos usando Inteligencia Artificial de Google."
          >
            <div className="space-y-6">
              {/* Formulario y Plantillas Rápidas */}
              <div className="bg-white border border-kraft-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-obra-orange/10 text-obra-orange flex items-center justify-center font-bold">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  <div>
                    <h2 className="font-heading font-bold text-base text-navy-900">
                      Describir Proyecto o Usar Plantilla Rápida
                    </h2>
                    <p className="text-xs text-gray-500">
                      El Agente IA cubicará materiales, jornales chilenos y te dirá en qué ferretería comprar más barato.
                    </p>
                  </div>
                </div>

                {cotizaciones.length > 1 && (
                  <select
                    onChange={(e) => {
                      const selected = cotizaciones.find((c) => c.id === e.target.value);
                      if (selected) setCurrentCotizacion(selected);
                    }}
                    value={currentCotizacion?.id || ''}
                    className="text-xs bg-kraft-50 border border-kraft-200 rounded-lg px-2.5 py-1.5 text-navy-900 font-mono"
                  >
                    {cotizaciones.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.titulo_proyecto.slice(0, 35)}...
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Plantillas en botones rápidos */}
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-[11px] font-mono text-gray-400 flex items-center gap-1 self-center">
                  <Tag className="w-3 h-3" /> Ejemplos:
                </span>
                {quickTemplates.map((t, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyTemplate(t)}
                    className="text-xs bg-kraft-50 hover:bg-kraft-100 text-navy-800 border border-kraft-200 rounded-lg px-3 py-1 font-medium transition-all"
                  >
                    {t.titulo}
                  </button>
                ))}
              </div>

              {/* Formulario */}
              <form onSubmit={handleGenerarCotizacion} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 font-heading mb-1">
                    Descripción del Trabajo / Requisitos del Cliente:
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Ej: Construcción de terraza de 30m2 con radier de 10cm, pilares de pino Oregón 6x6, vigas a la vista, techumbre en teja asfáltica y piso de porcelanato antideslizante..."
                    className="w-full px-3.5 py-2.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs text-navy-900 focus:outline-none focus:border-obra-orange focus:bg-white transition-all resize-none font-sans"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-gray-600 mb-1">Tipo de Obra</label>
                    <select
                      value={tipoObra}
                      onChange={(e) => setTipoObra(e.target.value)}
                      className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-lg px-3 py-2 text-navy-900"
                    >
                      <option value="Quinchos & Terrazas">Quinchos & Terrazas</option>
                      <option value="Ampliaciones">Ampliaciones & Segundos Pisos</option>
                      <option value="Remodelaciones">Remodelación Baño/Cocina</option>
                      <option value="Obra Gruesa">Radieres & Pavimentos</option>
                      <option value="Pintura & Terminaciones">Pintura & Terminaciones</option>
                      <option value="Techumbre & Estructuras">Techumbre & Cubiertas</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-gray-600 mb-1">Superficie (m² aprox.)</label>
                    <input
                      type="number"
                      min="1"
                      value={metrosCuadrados}
                      onChange={(e) => setMetrosCuadrados(Number(e.target.value))}
                      className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-lg px-3 py-2 text-navy-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-gray-600 mb-1">Ubicación / Comuna</label>
                    <input
                      type="text"
                      value={comuna}
                      onChange={(e) => setComuna(e.target.value)}
                      placeholder="Ej: Peñalolén, Santiago"
                      className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-lg px-3 py-2 text-navy-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-gray-600 mb-1">Nivel de Calidad</label>
                    <select
                      value={calidad}
                      onChange={(e) => setCalidad(e.target.value as any)}
                      className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-lg px-3 py-2 text-navy-900"
                    >
                      <option value="economico">Económica (Standard básico)</option>
                      <option value="estandar">Estándar (Óptima relación precio/calidad)</option>
                      <option value="premium">Premium (Acabados de lujo / maderas nobles)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-gray-500 font-mono">
                    {statusMessage && <span className="text-obra-orange animate-pulse font-bold">{statusMessage}</span>}
                  </span>

                  <button
                    type="submit"
                    disabled={isLoading || !descripcion.trim()}
                    className="w-full sm:w-auto px-6 py-2.5 bg-obra-orange hover:bg-orange-600 text-white rounded-xl text-xs font-heading font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Google Gemini 2.5 IA Cubicando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>⚡ Calcular Presupuesto & Precios Más Baratos</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Visualización de la Cotización Actual */}
            {currentCotizacion && (
              <div className="space-y-6">
                {/* Header de la Cotización y Resumen Financiero */}
                <div className="bg-navy-900 text-white border border-navy-700 rounded-2xl p-6 shadow-xl space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-navy-700">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase bg-obra-orange text-white px-2 py-0.5 rounded font-bold">
                          {currentCotizacion.tipo_obra}
                        </span>
                        <span className="text-xs font-mono text-gray-400">
                          {currentCotizacion.metros_cuadrados} m² • {currentCotizacion.comuna_region}
                        </span>
                      </div>
                      <h3 className="font-heading font-bold text-xl text-white">
                        {currentCotizacion.titulo_proyecto}
                      </h3>
                      <p className="text-xs text-gray-300 max-w-3xl leading-relaxed">
                        {currentCotizacion.resumen_ejecutivo}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePrint}
                        className="px-3 py-1.5 bg-navy-800 hover:bg-navy-700 text-gray-200 border border-navy-600 rounded-lg text-xs font-medium flex items-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5 text-gray-400" />
                        <span>Imprimir</span>
                      </button>
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-obra-green hover:bg-emerald-700 text-white rounded-lg text-xs font-heading font-bold flex items-center gap-1.5 shadow-md"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Crear Proyecto en ObraTrack</span>
                      </button>
                    </div>
                  </div>

                  {/* Tarjetas de Métricas Financieras Principales */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Precio Final Sugerido a Cobrar */}
                    <div className="bg-navy-800/90 border-2 border-obra-orange rounded-xl p-4 space-y-1 shadow-lg relative overflow-hidden">
                      <div className="absolute -right-2 -bottom-2 opacity-10">
                        <DollarSign className="w-20 h-20 text-obra-orange" />
                      </div>
                      <span className="text-[10px] font-mono uppercase text-obra-orange font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Cobro Sugerido al Cliente (Neto)
                      </span>
                      <p className="text-2xl font-bold font-mono text-white">
                        {formatCLP(currentCotizacion.estructura_financiera.precio_sugerido_neto)}
                      </p>
                      <p className="text-[11px] font-mono text-gray-400">
                        Con IVA 19%: <strong>{formatCLP(currentCotizacion.estructura_financiera.precio_total_con_iva)}</strong>
                      </p>
                    </div>

                    {/* Costo Directo de la Obra */}
                    <div className="bg-navy-800/60 border border-navy-700 rounded-xl p-4 space-y-1">
                      <span className="text-[10px] font-mono uppercase text-gray-400 font-bold">
                        Costo Directo Real (Obra)
                      </span>
                      <p className="text-xl font-bold font-mono text-gray-200">
                        {formatCLP(currentCotizacion.estructura_financiera.costo_directo)}
                      </p>
                      <p className="text-[11px] font-mono text-gray-400">
                        Materiales ({formatCLP(currentCotizacion.estructura_financiera.costo_materiales_total)}) + Cuadrilla ({formatCLP(currentCotizacion.estructura_financiera.costo_mano_obra_total)})
                      </p>
                    </div>

                    {/* Margen de Ganancia Neto para el Contratista */}
                    <div className="bg-navy-800/60 border border-navy-700 rounded-xl p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase text-obra-green font-bold">
                          Tu Utilidad Neta Estimada
                        </span>
                        <span className="text-xs font-mono font-bold text-obra-orange">
                          {currentCotizacion.estructura_financiera.margen_utilidad_porcentaje}%
                        </span>
                      </div>
                      <p className="text-xl font-bold font-mono text-obra-green">
                        {formatCLP(currentCotizacion.estructura_financiera.margen_utilidad_monto)}
                      </p>
                      <p className="text-[11px] font-mono text-gray-400">
                        Gastos Generales: {formatCLP(currentCotizacion.estructura_financiera.gastos_generales_monto)}
                      </p>
                    </div>

                    {/* Ahorro Estratégico en Tiendas */}
                    <div className="bg-navy-800/60 border border-emerald-500/40 rounded-xl p-4 space-y-1">
                      <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" />
                        Ahorro Radar en Tiendas
                      </span>
                      <p className="text-xl font-bold font-mono text-emerald-400">
                        {formatCLP(currentCotizacion.estructura_financiera.ahorro_compras_estrategicas)}
                      </p>
                      <p className="text-[11px] font-mono text-gray-300">
                        Comprando en los proveedores recomendados
                      </p>
                    </div>
                  </div>

                  {/* Slider Interactivo de Ajuste de Margen */}
                  <div className="bg-navy-800/70 border border-navy-700 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-heading font-semibold text-gray-200 flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-obra-orange" />
                        <span>Ajustar Margen de Ganancia en Tiempo Real:</span>
                      </span>
                      <span className="text-xs font-mono font-bold text-obra-orange bg-navy-900 px-3 py-1 rounded-md border border-navy-700">
                        {margenUtilidad}% de Margen Neto
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-[11px] font-mono text-gray-400">15%</span>
                      <input
                        type="range"
                        min="15"
                        max="50"
                        step="1"
                        value={margenUtilidad}
                        onChange={(e) => handleSliderMargenChange(Number(e.target.value))}
                        className="flex-1 accent-obra-orange cursor-pointer h-2 bg-navy-700 rounded-lg"
                      />
                      <span className="text-[11px] font-mono text-gray-400">50%</span>
                    </div>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* 💼 ASESOR DE COBRO AL MANDANTE: ¿CUÁNTO COBRAR? (GOOGLE GEMINI IA) */}
                {/* ========================================================================= */}
                <div className="bg-gradient-to-br from-navy-900 via-navy-800 to-[#141A23] border-2 border-obra-orange/40 rounded-2xl p-5 md:p-6 shadow-xl space-y-5 text-white animate-in fade-in duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-navy-700">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-obra-orange text-white flex items-center justify-center font-bold shadow-md shrink-0">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-heading font-bold text-base md:text-lg text-white flex items-center gap-2 flex-wrap">
                          <span>Asesor de Cobro al Cliente: ¿Cuánto Cobrar?</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-obra-orange text-white font-bold">
                            Google Gemini 2.5 IA
                          </span>
                        </h3>
                        <p className="text-xs text-gray-300 font-sans">
                          Recomendación de tarifas según mercado chileno, costos directos y margen óptimo de ganancia
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleCopyPresupuesto}
                        className="px-3 py-1.5 bg-navy-700 hover:bg-navy-600 text-gray-200 border border-navy-600 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                      >
                        {copiedPresupuesto ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedPresupuesto ? '¡Copiado!' : 'Copiar Resumen'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleShareWhatsAppCliente}
                        className="px-3.5 py-1.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 shadow-md transition-all"
                        title="Abrir WhatsApp para enviar presupuesto formateado al cliente"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar por WhatsApp al Cliente</span>
                      </button>
                    </div>
                  </div>

                  {/* 3 Niveles de Cobro al Cliente */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 1. Mínimo de Entrada */}
                    <div className="bg-navy-800/80 border border-navy-600/80 rounded-xl p-4 space-y-2 hover:border-gray-400 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400">
                          🥉 Precio Mínimo Rentable
                        </span>
                        <span className="text-[9px] font-mono bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                          Licitación
                        </span>
                      </div>
                      <p className="text-2xl font-bold font-mono text-gray-200">
                        {formatCLP(
                          currentCotizacion.recomendacion_cobro?.precio_minimo_rentable ||
                            Math.round(currentCotizacion.estructura_financiera.costo_directo * 1.2)
                        )}
                      </p>
                      <p className="text-[11px] text-gray-300 font-sans leading-relaxed">
                        Tarifa ajustada con 15% de margen mínimo. Ideal para ganar licitaciones o trabajos de alta competencia sin incurrir en pérdidas.
                      </p>
                    </div>

                    {/* 2. Sugerido de Mercado (Recomendado) */}
                    <div className="bg-navy-800/95 border-2 border-obra-orange rounded-xl p-4 space-y-2 relative shadow-lg overflow-hidden">
                      <div className="absolute top-0 right-0 bg-obra-orange text-white text-[9px] font-mono font-bold px-2 py-0.5 rounded-bl-lg">
                        ⭐ RECOMENDADO
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-obra-orange">
                          🥇 Precio Estándar de Mercado
                        </span>
                      </div>
                      <p className="text-2xl font-bold font-mono text-white">
                        {formatCLP(
                          currentCotizacion.recomendacion_cobro?.precio_sugerido_mercado ||
                            currentCotizacion.estructura_financiera.precio_total_con_iva
                        )}
                      </p>
                      <p className="text-[11px] text-gray-200 font-sans leading-relaxed">
                        Margen óptimo ({currentCotizacion.estructura_financiera.margen_utilidad_porcentaje}%) que cubre costos directos, gastos generales, imprevistos y utilidad neta justa.
                      </p>
                    </div>

                    {/* 3. Premium */}
                    <div className="bg-navy-800/80 border border-purple-500/50 rounded-xl p-4 space-y-2 hover:border-purple-400 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-400">
                          💎 Precio Premium con Garantía
                        </span>
                        <span className="text-[9px] font-mono bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded">
                          Alta Exigencia
                        </span>
                      </div>
                      <p className="text-2xl font-bold font-mono text-purple-300">
                        {formatCLP(
                          currentCotizacion.recomendacion_cobro?.precio_premium_garantia ||
                            Math.round(currentCotizacion.estructura_financiera.precio_total_con_iva * 1.25)
                        )}
                      </p>
                      <p className="text-[11px] text-gray-300 font-sans leading-relaxed">
                        Para mandantes exigentes: incluye póliza de post-venta, acabados de primera línea y atención prioritaria en faena.
                      </p>
                    </div>
                  </div>

                  {/* Desglose de Pago Seguro & Consejos de Negociación */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-navy-700 text-xs">
                    <div className="bg-navy-800/60 rounded-xl p-3.5 space-y-2 border border-navy-700">
                      <h4 className="font-heading font-bold text-xs text-obra-orange flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Esquema de Pago Seguro Sugerido (40/30/20/10)</span>
                      </h4>
                      <ul className="space-y-1.5 text-[11px] text-gray-300 font-sans">
                        {(
                          currentCotizacion.recomendacion_cobro?.formas_pago_recomendadas || [
                            '40% al firmar e iniciar (Materiales iniciales y fletes)',
                            '30% al terminar obra gruesa / 50% de avance físico',
                            '20% al finalizar instalaciones y pinturas finas',
                            '10% de retención contra entrega de llaves conforme',
                          ]
                        ).map((forma, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-obra-green shrink-0 mt-0.5" />
                            <span>{forma}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-navy-800/60 rounded-xl p-3.5 space-y-2 border border-navy-700">
                      <h4 className="font-heading font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4" />
                        <span>Estrategia de Negociación para el Mandante</span>
                      </h4>
                      <p className="text-[11px] text-gray-300 leading-relaxed font-sans">
                        {currentCotizacion.recomendacion_cobro?.estrategia_negociacion ||
                          'Presenta el presupuesto destacando la compra en ferreterías con control de calidad (Construmart/Imperial) y la planificación con Carta Gantt para evitar sobrecostos.'}
                      </p>
                      {currentCotizacion.recomendacion_cobro?.desglose_por_metro_cuadrado && (
                        <p className="text-[11px] font-mono text-amber-300">
                          📍 Tarifa promedio por m²: <strong>{formatCLP(currentCotizacion.recomendacion_cobro.desglose_por_metro_cuadrado)} / m²</strong>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Radar de Tiendas Recomendadas para este Proyecto */}
                {currentCotizacion.radar_proveedores && currentCotizacion.radar_proveedores.length > 0 && (
                  <div className="bg-white border border-kraft-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-obra-green" />
                        <div>
                          <h3 className="font-heading font-bold text-base text-navy-900">
                            Radar de Tiendas Más Económicas en Chile
                          </h3>
                          <p className="text-xs text-gray-500">
                            Dónde comprar cada grupo de materiales para maximizar tu ganancia en esta obra.
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-obra-green bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                        Ahorro Estimado: {formatCLP(currentCotizacion.estructura_financiera.ahorro_compras_estrategicas)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {currentCotizacion.radar_proveedores.map((tienda, idx) => (
                        <div key={idx} className="bg-kraft-50/70 border border-kraft-200 rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-heading font-bold text-sm text-navy-900">
                              {tienda.tienda}
                            </span>
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                              {tienda.nivel_precio === 'mas_barato' ? 'Más Económico' : 'Promedio'}
                            </span>
                          </div>
                          <p className="text-xs text-navy-800 font-medium">{tienda.categoria_destacada}</p>
                          <p className="text-[11px] text-gray-500 font-mono">{tienda.descuentos_disponibles}</p>
                          <ul className="text-[11px] text-gray-600 space-y-1 pt-1 border-t border-kraft-200">
                            {tienda.ventajas?.map((v, i) => (
                              <li key={i} className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-obra-green flex-shrink-0" />
                                <span>{v}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Desglose Detallado de Materiales y Cubicaciones */}
                <div className="bg-white border border-kraft-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-obra-orange" />
                      <h3 className="font-heading font-bold text-base text-navy-900">
                        Cubicación de Materiales & Comparativa de Precios
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-gray-600">
                      Total Insumos: <strong>{formatCLP(currentCotizacion.estructura_financiera.costo_materiales_total)}</strong>
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-kraft-100 text-navy-900 font-heading font-bold border-b border-kraft-200">
                        <tr>
                          <th className="p-3">Material / Insumo</th>
                          <th className="p-3">Cantidad</th>
                          <th className="p-3">P. Unit. Estimado</th>
                          <th className="p-3">Mejor Tienda en Chile</th>
                          <th className="p-3">Precio Más Barato</th>
                          <th className="p-3 text-right">Subtotal</th>
                          <th className="p-3 text-right">Ahorro</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-kraft-200 font-mono">
                        {currentCotizacion.materiales?.map((mat, idx) => (
                          <tr key={idx} className="hover:bg-kraft-50/80 transition-colors">
                            <td className="p-3 font-sans font-medium text-navy-900">
                              {mat.nombre}
                              {mat.alternativa_economica && (
                                <span className="block text-[10px] text-gray-500 font-mono">
                                  Alt: {mat.alternativa_economica}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-gray-700">
                              {mat.cantidad} {mat.unidad}
                            </td>
                            <td className="p-3 text-gray-500">{formatCLP(mat.precio_unitario_estimado)}</td>
                            <td className="p-3">
                              <span className="inline-flex items-center gap-1 font-bold text-navy-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                                {mat.mejor_tienda}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-obra-green">{formatCLP(mat.precio_mas_barato)}</td>
                            <td className="p-3 text-right font-bold text-navy-900">{formatCLP(mat.subtotal)}</td>
                            <td className="p-3 text-right text-emerald-600 font-bold">
                              +{formatCLP(mat.ahorro_estimado)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Desglose de Mano de Obra y Cuadrilla */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Mano de Obra */}
                  <div className="bg-white border border-kraft-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-navy-800" />
                      <h3 className="font-heading font-bold text-base text-navy-900">
                        Cuadrilla & Mano de Obra (Jornales Chile)
                      </h3>
                    </div>

                    <div className="space-y-2">
                      {currentCotizacion.mano_de_obra?.map((mo, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-kraft-50 border border-kraft-200 rounded-xl text-xs"
                        >
                          <div>
                            <p className="font-heading font-bold text-navy-900">{mo.rol}</p>
                            <p className="text-[11px] font-mono text-gray-500">
                              {mo.cantidad_personas} persona(s) • {mo.dias_estimados} días • Jornal: {formatCLP(mo.valor_jornal_diario)}/día
                            </p>
                          </div>
                          <span className="font-mono font-bold text-navy-900 text-sm">
                            {formatCLP(mo.subtotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Carta Gantt Sugerida */}
                  <div className="bg-white border border-kraft-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-obra-orange" />
                        <h3 className="font-heading font-bold text-base text-navy-900">
                          Partidas de Carta Gantt Sugeridas
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-gray-500">
                        Duración: <strong>{currentCotizacion.duracion_dias_estimada} días</strong>
                      </span>
                    </div>

                    <div className="space-y-2">
                      {currentCotizacion.actividades_gantt?.map((act, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 bg-kraft-50 border border-kraft-200 rounded-lg text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-navy-800 text-white flex items-center justify-center text-[10px] font-bold font-mono">
                              {act.orden}
                            </span>
                            <span className="font-medium text-navy-900">{act.nombre}</span>
                          </div>
                          <span className="font-mono text-gray-600 bg-white border border-kraft-200 px-2 py-0.5 rounded text-[11px]">
                            {act.dias} días
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Consejos del Experto PYME */}
                {currentCotizacion.consejos_experto_pyme && currentCotizacion.consejos_experto_pyme.length > 0 && (
                  <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 space-y-2">
                    <h4 className="font-heading font-bold text-sm text-amber-900 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Recomendaciones del Asesor Experto para esta Obra</span>
                    </h4>
                    <ul className="space-y-1.5 text-xs text-amber-900 font-sans">
                      {currentCotizacion.consejos_experto_pyme.map((tip, i) => (
                        <li key={i} className="leading-relaxed">
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            </div>
          </PlanLockOverlay>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 2: RADAR DE PRECIOS EN CHILE */}
        {/* ========================================================================= */}
        {activeTab === 'radar' && (
          <PlanLockOverlay
            isLocked={activePlan === 'gratis'}
            featureName="Radar de Precios en Ferreterías de Chile"
            requiredPlan="pro"
            description="Compara precios de cemento, madera, fierros y terminaciones en Construmart, Imperial, Sodimac Constructor y Red MTS para optimizar las compras de tus obras."
          >
          <div className="space-y-6">
            <div className="bg-white border border-kraft-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-obra-green" />
                    <span>Radar de Materiales y Comparativa en Tiendas Chilenas</span>
                  </h2>
                  <p className="text-xs text-gray-500">
                    Precios actualizados de referencia en Construmart, Sodimac Constructor, Imperial, Red MTS y Easy.
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar insumo (cemento, pino, fierro)..."
                    value={busquedaMaterial}
                    onChange={(e) => setBusquedaMaterial(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs text-navy-900 focus:outline-none focus:border-obra-orange font-sans"
                  />
                </div>
              </div>

              {/* Guía rápida de tiendas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-orange-50/70 border border-orange-200">
                  <span className="font-heading font-bold text-xs text-orange-950 block">Imperial Barracas</span>
                  <p className="text-[11px] text-orange-800 mt-0.5">
                    Líder en maderas secas, vigas Oregón, tableros OSB y tejas asfálticas. Hasta 22% de ahorro.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                  <span className="font-heading font-bold text-xs text-blue-950 block">Construmart / MTS</span>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    Mejor precio en cemento Melón/Polpaico, fierros estriados A63 y mallas electrosoldadas.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <span className="font-heading font-bold text-xs text-emerald-950 block">Areneras Locales</span>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Compra de áridos por m³ o camión tolva de 6m³ ahorra hasta 30% respecto a sacos.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200">
                  <span className="font-heading font-bold text-xs text-purple-950 block">Easy / Sodimac</span>
                  <p className="text-[11px] text-purple-800 mt-0.5">
                    Ideal para saldos de porcelanatos, griferías, cerámicas y adhesivos especiales.
                  </p>
                </div>
              </div>

              {/* Tabla Comparativa de Precios */}
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left text-xs">
                  <thead className="bg-kraft-100 text-navy-900 font-heading font-bold border-b border-kraft-200">
                    <tr>
                      <th className="p-3">Material / Insumo</th>
                      <th className="p-3">Categoría</th>
                      <th className="p-3">Construmart</th>
                      <th className="p-3">Imperial</th>
                      <th className="p-3">Sodimac</th>
                      <th className="p-3">Red MTS / Barraca</th>
                      <th className="p-3">Mejor Opción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-kraft-200 font-mono">
                    {filteredMateriales.map((item, idx) => (
                      <tr key={idx} className="hover:bg-kraft-50 transition-colors">
                        <td className="p-3 font-sans font-medium text-navy-900">
                          {item.nombre}
                          <span className="block text-[10px] text-gray-500 font-mono">Unidad: {item.unidad}</span>
                        </td>
                        <td className="p-3 text-gray-600 font-sans">{item.categoria}</td>
                        <td className="p-3">
                          {item.precios.construmart ? formatCLP(item.precios.construmart) : '-'}
                        </td>
                        <td className="p-3">
                          {item.precios.imperial ? formatCLP(item.precios.imperial) : '-'}
                        </td>
                        <td className="p-3">
                          {item.precios.sodimac ? formatCLP(item.precios.sodimac) : '-'}
                        </td>
                        <td className="p-3">
                          {item.precios.mts ? formatCLP(item.precios.mts) : item.precios.barraca ? formatCLP(item.precios.barraca) : '-'}
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 font-bold text-obra-green bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                            {item.mejor_tienda} ({formatCLP(item.precio_minimo)})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          </PlanLockOverlay>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 3: CHAT ASESOR CON EL AGENTE IA */}
        {/* ========================================================================= */}
        {activeTab === 'chat' && (
          <PlanLockOverlay
            isLocked={activePlan === 'gratis'}
            featureName="Chat Asesor Experto en Obras (Google Gemini 2.5 Pro / Flash IA)"
            requiredPlan="pro_ia"
            description="Consulta directamente con el Agente de IA para calcular costos de jornales, resolver partidas constructivas complejas y optimizar cotizaciones."
          >
          <div className="bg-white border border-kraft-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[650px]">
            {/* Header del Chat */}
            <div className="bg-navy-900 text-white p-4 border-b border-navy-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-obra-orange flex items-center justify-center text-white shadow-md">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm text-white">
                    Asesor de Obras & Costos ObraTrack (Google Gemini 2.5 IA)
                  </h3>
                  <p className="text-[11px] text-gray-400 font-mono">
                    Especialista en cubicaciones, optimización de presupuestos y precios en Chile
                  </p>
                </div>
              </div>

              {currentCotizacion && (
                <span className="text-[11px] font-mono text-obra-orange bg-navy-800 border border-navy-700 px-3 py-1 rounded-lg">
                  Contexto: {currentCotizacion.titulo_proyecto.slice(0, 25)}...
                </span>
              )}
            </div>

            {/* Mensajes */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-kraft-50/50">
              {mensajesChat.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.remitente === 'usuario' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.remitente === 'agente' && (
                    <div className="w-8 h-8 rounded-full bg-navy-800 text-obra-orange flex items-center justify-center font-bold text-xs flex-shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-xl rounded-2xl p-4 text-xs space-y-2 shadow-sm ${
                      msg.remitente === 'usuario'
                        ? 'bg-navy-800 text-white rounded-tr-none'
                        : 'bg-white text-navy-900 border border-kraft-200 rounded-tl-none'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-line font-sans">{msg.texto}</p>
                    <span className="text-[10px] font-mono opacity-50 block text-right">{msg.timestamp}</span>

                    {msg.sugerencias && msg.sugerencias.length > 0 && (
                      <div className="pt-2 border-t border-kraft-200 space-y-1">
                        <span className="text-[10px] font-mono text-gray-500 font-bold block">Preguntas sugeridas:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sugerencias.map((sug, i) => (
                            <button
                              key={i}
                              onClick={() => handleSendChat(sug)}
                              className="text-[11px] bg-kraft-50 hover:bg-kraft-100 text-navy-800 border border-kraft-200 px-2.5 py-1 rounded-md transition-colors"
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {msg.remitente === 'usuario' && (
                    <div className="w-8 h-8 rounded-full bg-obra-orange text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}

              {isChatLoading && (
                <div className="flex gap-3 items-center text-xs text-gray-500 italic">
                  <div className="w-8 h-8 rounded-full bg-navy-800 text-obra-orange flex items-center justify-center font-bold">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  </div>
                  <span>El Agente de IA está analizando la respuesta...</span>
                </div>
              )}
            </div>

            {/* Input del Chat */}
            <div className="p-3 bg-white border-t border-kraft-200">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChat();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Pregúntale al agente (ej: ¿Dónde compro vigas de pino Oregón más baratas?)..."
                  value={inputChat}
                  onChange={(e) => setInputChat(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-kraft-50 border border-kraft-200 rounded-xl text-xs text-navy-900 focus:outline-none focus:border-obra-orange font-sans"
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !inputChat.trim()}
                  className="px-4 py-2.5 bg-obra-orange hover:bg-orange-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>Enviar</span>
                </button>
              </form>
            </div>
          </div>
          </PlanLockOverlay>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 4: MIS COTIZACIONES / HISTORIAL & GESTIÓN */}
        {/* ========================================================================= */}
        {activeTab === 'historial' && (
          <div className="space-y-6">
            <div className="bg-white border border-kraft-200 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                  <FolderPlus className="w-5 h-5 text-amber-500" />
                  <span>Historial & Gestión de Cotizaciones Guardadas</span>
                </h2>
                <p className="text-xs text-gray-500 font-sans mt-0.5">
                  Gestiona tus presupuestos generados con IA o manualmente, duplica variantes y conviértelas en obras activas.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar presupuesto..."
                    value={searchCotizacion}
                    onChange={(e) => setSearchCotizacion(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs text-navy-900 focus:outline-none focus:border-obra-orange font-sans"
                  />
                </div>
                <button
                  onClick={() => setIsManualModalOpen(true)}
                  className="px-3.5 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 font-heading whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Nueva</span>
                </button>
              </div>
            </div>

            {filteredCotizaciones.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-[#E5DFC9] rounded-3xl p-10 text-center max-w-xl mx-auto space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-[#FAF8F5] border border-[#E5DFC9] flex items-center justify-center mx-auto text-[#FF6A00]">
                  <Calculator className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-heading font-black text-xl text-[#1E1E1E]">
                    {searchCotizacion ? 'No se encontraron cotizaciones' : 'No tienes cotizaciones guardadas'}
                  </h3>
                  <p className="text-xs text-gray-500 font-sans mt-1.5 max-w-md mx-auto leading-relaxed">
                    {searchCotizacion
                      ? `No hay resultados para "${searchCotizacion}".`
                      : 'Calcula tu primer presupuesto con el asistente de IA o ingresa una cotización manual.'}
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('cotizador')}
                  className="px-5 py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-md transition-all inline-flex items-center gap-2 font-heading"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Ir al Cotizador IA</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredCotizaciones.map((cot) => {
                  const est = cot.estructura_financiera;
                  const isCurrent = currentCotizacion?.id === cot.id;

                  return (
                    <div
                      key={cot.id}
                      className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                        isCurrent ? 'border-obra-orange ring-2 ring-obra-orange/20' : 'border-kraft-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="overflow-hidden">
                            <span className="text-[10px] font-mono uppercase bg-kraft-100 text-gray-700 px-2 py-0.5 rounded font-bold">
                              {cot.tipo_obra}
                            </span>
                            <h3 className="font-heading font-bold text-base text-navy-900 mt-1 truncate leading-snug">
                              {cot.titulo_proyecto}
                            </h3>
                            <p className="text-xs text-gray-500 font-mono mt-0.5">
                              {cot.metros_cuadrados} m² • {cot.comuna_region}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDuplicateCotizacion(cot)}
                              className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-kraft-100 rounded-lg transition-colors"
                              title="Duplicar cotización"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditCotizacion(cot)}
                              className="p-1.5 text-gray-400 hover:text-[#FF6A00] hover:bg-[#FF6A00]/10 rounded-lg transition-colors"
                              title="Editar datos básicos"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCotizacionToDelete(cot)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar cotización"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {cot.resumen_ejecutivo && (
                          <p className="text-xs text-gray-600 line-clamp-2 my-2 font-sans leading-relaxed">
                            {cot.resumen_ejecutivo}
                          </p>
                        )}

                        <div className="bg-kraft-50 border border-kraft-200/70 rounded-xl p-3 space-y-1.5 my-3">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500 font-mono">Cobro Neto:</span>
                            <span className="font-mono font-bold text-navy-900">
                              {formatCLP(est.precio_sugerido_neto)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500 font-mono">Con IVA 19%:</span>
                            <span className="font-mono font-bold text-obra-green">
                              {formatCLP(est.precio_total_con_iva)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs pt-1 border-t border-kraft-200/70">
                            <span className="text-gray-500 font-mono">Margen Neto ({est.margen_utilidad_porcentaje}%):</span>
                            <span className="font-mono font-semibold text-obra-orange">
                              {formatCLP(est.margen_utilidad_monto)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-kraft-200">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentCotizacion(cot);
                            setActiveTab('cotizador');
                          }}
                          className="py-2 px-3 bg-navy-800 hover:bg-navy-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all font-heading"
                        >
                          <Calculator className="w-3.5 h-3.5 text-obra-orange" />
                          <span>Ver / Desglose</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentCotizacion(cot);
                            setShowCreateModal(true);
                          }}
                          className="py-2 px-3 bg-obra-green hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all font-heading"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Crear Obra</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: + Cotización Manual */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-obra-orange" />
                <span>Nueva Cotización Manual</span>
              </h3>
              <button onClick={() => setIsManualModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualCotizacion} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Título del Proyecto / Presupuesto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Remodelación Completa Baño Principal"
                  value={manualTitulo}
                  onChange={(e) => setManualTitulo(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans font-semibold text-navy-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Tipo de Obra
                  </label>
                  <select
                    value={manualTipo}
                    onChange={(e) => setManualTipo(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange"
                  >
                    <option value="Quinchos & Terrazas">Quinchos & Terrazas</option>
                    <option value="Ampliaciones">Ampliaciones</option>
                    <option value="Remodelaciones">Remodelaciones</option>
                    <option value="Obra Gruesa">Obra Gruesa</option>
                    <option value="Pintura & Terminaciones">Pintura & Terminaciones</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Superficie (m²)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={manualM2}
                    onChange={(e) => setManualM2(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Costo Directo (CLP) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xs">$</span>
                    <input
                      type="text"
                      required
                      placeholder="3.500.000"
                      value={manualCostoDirecto}
                      onChange={(e) => setManualCostoDirecto(formatThousands(e.target.value))}
                      className="w-full pl-7 pr-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono font-bold text-navy-900 focus:outline-none focus:border-obra-orange"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Margen Utilidad (%)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="60"
                    value={manualMargen}
                    onChange={(e) => setManualMargen(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Descripción / Alcance
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles de partidas, materiales considerados, etc."
                  value={manualDescripcion}
                  onChange={(e) => setManualDescripcion(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-bold rounded-xl shadow-sm font-heading"
                >
                  Guardar Cotización
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Cotización */}
      {editingCotizacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-obra-orange" />
                <span>Editar Cotización</span>
              </h3>
              <button onClick={() => setEditingCotizacion(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCotizacion} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Título de la Cotización *
                </label>
                <input
                  type="text"
                  required
                  value={editTitulo}
                  onChange={(e) => setEditTitulo(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans font-semibold text-navy-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Tipo de Obra
                  </label>
                  <input
                    type="text"
                    value={editTipo}
                    onChange={(e) => setEditTipo(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Superficie (m²)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editM2}
                    onChange={(e) => setEditM2(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Resumen Ejecutivo
                </label>
                <textarea
                  rows={3}
                  value={editResumen}
                  onChange={(e) => setEditResumen(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setEditingCotizacion(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-bold rounded-xl shadow-sm font-heading"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminar Cotización */}
      {cotizacionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-navy-900">
                ¿Eliminar cotización &quot;{cotizacionToDelete.titulo_proyecto}&quot;?
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-1">
                Esta acción removerá el presupuesto del historial guardado.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCotizacionToDelete(null)}
                className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteCotizacion(cotizacionToDelete.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear Proyecto desde la Cotización */}
      {showCreateModal && currentCotizacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-obra-green" />
                <span>Crear Proyecto en ObraTrack</span>
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              Se creará un nuevo proyecto con el presupuesto neto cotizado (
              <strong>{formatCLP(currentCotizacion.estructura_financiera.precio_sugerido_neto)}</strong>) y su Carta
              Gantt preconfigurada con {currentCotizacion.actividades_gantt?.length || 4} partidas automáticas.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 font-heading mb-1">Nombre de la Obra</label>
                <input
                  type="text"
                  defaultValue={currentCotizacion.titulo_proyecto}
                  className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-xl px-3.5 py-2 text-navy-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 font-heading mb-1">Cliente Asociado</label>
                <select
                  value={selectedClienteId}
                  onChange={(e) => setSelectedClienteId(e.target.value)}
                  className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-xl px-3.5 py-2 text-navy-900"
                >
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.rut || 'RUT S/I'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 font-heading mb-1">Fecha de Inicio</label>
                <input
                  type="date"
                  value={fechaInicioProyecto}
                  onChange={(e) => setFechaInicioProyecto(e.target.value)}
                  className="w-full text-xs bg-kraft-50 border border-kraft-200 rounded-xl px-3.5 py-2 text-navy-900 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCrearProyecto}
                className="px-5 py-2 bg-obra-green hover:bg-emerald-700 text-white rounded-xl text-xs font-heading font-bold shadow-sm flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar y Ver Carta Gantt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
