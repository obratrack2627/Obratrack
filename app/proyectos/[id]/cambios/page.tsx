'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Plus,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  RefreshCw,
  MessageSquareWarning,
  Package,
  Trash2,
  Upload,
  X,
  ArrowRight,
  Smartphone,
  Calendar,
  DollarSign,
} from 'lucide-react';
import ProjectTabsHeader from '@/components/ProjectTabsHeader';
import GoogleMapsProjectViewer from '@/components/GoogleMapsProjectViewer';
import { dataService } from '@/lib/data-service';
import {
  Proyecto,
  Cliente,
  ReclamoCambioObra,
  TipoReclamoCambio,
  PrioridadReclamoCambio,
  MaterialRequeridoCambio,
} from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';

export default function ProyectoCambiosPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [registros, setRegistros] = useState<ReclamoCambioObra[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [isMapsModalOpen, setIsMapsModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Estado del formulario de creación
  const [tipo, setTipo] = useState<TipoReclamoCambio>('solicitud_cambio');
  const [prioridad, setPrioridad] = useState<PrioridadReclamoCambio>('alta');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [solicitadoPor, setSolicitadoPor] = useState('');
  const [impactoMonto, setImpactoMonto] = useState<string>('0');
  const [impactoDias, setImpactoDias] = useState<string>('0');
  const [materiales, setMateriales] = useState<MaterialRequeridoCambio[]>([]);
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);
  const [isCalculandoIA, setIsCalculandoIA] = useState(false);

  // Campos para agregar un material manual rápido
  const [matNombre, setMatNombre] = useState('');
  const [matCant, setMatCant] = useState('1');
  const [matUnidad, setMatUnidad] = useState('unidad');
  const [matPrecio, setMatPrecio] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = () => {
    if (!projectId) return;
    const proj = dataService.getProyectoById(projectId);
    setProyecto(proj || null);
    if (proj?.cliente_id) {
      setCliente(dataService.getClienteById(proj.cliente_id) || null);
    }
    setRegistros(dataService.getReclamosCambios(projectId));
  };

  useEffect(() => {
    loadData();
    const onSync = () => loadData();
    window.addEventListener('obratrack_cloud_synced', onSync);
    return () => window.removeEventListener('obratrack_cloud_synced', onSync);
  }, [projectId]);

  const handleOpenNewModal = (defaultTipo: TipoReclamoCambio = 'solicitud_cambio') => {
    setTipo(defaultTipo);
    setPrioridad(defaultTipo === 'accidente' ? 'critica' : 'alta');
    setTitulo('');
    setDescripcion('');
    setSolicitadoPor(
      defaultTipo === 'solicitud_cambio' || defaultTipo === 'reclamo'
        ? cliente?.nombre || 'Mandante'
        : dataService.getActiveUser()?.nombre || 'Jefe de Terreno'
    );
    setImpactoMonto('0');
    setImpactoDias('0');
    setMateriales([]);
    setFotoUrl('');
    setIsModalOpen(true);
  };

  const handleAgregarMaterialManual = () => {
    if (!matNombre.trim()) return;
    const cantidad = Math.max(1, Number(matCant) || 1);
    const precio_unitario = Math.max(0, Number(matPrecio) || 0);
    const nuevo: MaterialRequeridoCambio = {
      nombre: matNombre.trim(),
      cantidad,
      unidad: matUnidad || 'unidad',
      precio_unitario,
      subtotal: cantidad * precio_unitario,
    };
    const nextMats = [...materiales, nuevo];
    setMateriales(nextMats);
    const sumaMats = nextMats.reduce((acc, m) => acc + m.subtotal, 0);
    if (Number(impactoMonto) < sumaMats) {
      setImpactoMonto(String(sumaMats));
    }
    setMatNombre('');
    setMatCant('1');
    setMatPrecio('');
  };

  const handleEliminarMaterialTemp = (idx: number) => {
    setMateriales((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCalcularMaterialesIA = async () => {
    if (!titulo.trim() && !descripcion.trim()) {
      showToast('Escribe primero qué pidió el cliente o cuál es la necesidad nueva.');
      return;
    }
    setIsCalculandoIA(true);
    try {
      const res = await fetch('/api/ia/cambio-materiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo,
          descripcion,
          nombreObra: proyecto?.nombre,
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.materiales)) {
        const sugeridos: MaterialRequeridoCambio[] = data.materiales.map((m: any) => {
          const cant = Number(m.cantidad) || 1;
          const pu = Number(m.precio_unitario) || 0;
          return {
            nombre: m.nombre || 'Insumo',
            cantidad: cant,
            unidad: m.unidad || 'unidad',
            precio_unitario: pu,
            subtotal: cant * pu,
          };
        });
        setMateriales(sugeridos);
        if (data.impacto_monto_sugerido > 0) {
          setImpactoMonto(String(data.impacto_monto_sugerido));
        }
        if (data.impacto_dias_sugerido > 0) {
          setImpactoDias(String(data.impacto_dias_sugerido));
        }
        showToast('✨ Gemini calculó los materiales nuevos, costo adicional y plazo estimado.');
      }
    } catch (err) {
      console.error(err);
      showToast('No se pudo conectar con Gemini en este momento.');
    } finally {
      setIsCalculandoIA(false);
    }
  };

  const handleUploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    setIsUploadingFoto(true);
    try {
      const uploaded = await dataService.uploadArchivoObra(file, projectId, 'bitacora-fotos');
      setFotoUrl(uploaded.publicUrl);
      showToast('📸 Evidencia fotográfica subida a Supabase Storage.');
    } catch (err: any) {
      showToast(err.message || 'Error subiendo fotografía.');
    } finally {
      setIsUploadingFoto(false);
    }
  };

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !titulo.trim()) return;

    dataService.createReclamoCambio({
      proyecto_id: projectId,
      cliente_id: cliente?.id,
      tipo,
      prioridad,
      estado: 'pendiente',
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || titulo.trim(),
      solicitado_por: solicitadoPor.trim() || 'Mandante',
      impacto_monto: Number(impactoMonto) || 0,
      impacto_dias: Number(impactoDias) || 0,
      materiales_requeridos: materiales,
      foto_url: fotoUrl || undefined,
      origen: 'web',
      fecha: new Date().toISOString().split('T')[0],
    });

    setIsModalOpen(false);
    loadData();
    showToast('✅ Registro guardado y sincronizado con Supabase.');
  };

  const handleAprobarEInyectar = (item: ReclamoCambioObra) => {
    const res = dataService.aprobarEInyectarCambioObra(item.id, {
      ajustarPresupuesto: true,
      ajustarPlazo: true,
    });
    if (res.exito) {
      loadData();
      showToast(
        `✅ Cambio aprobado: ${res.materialesAgregados} materiales cargados en Finanzas y presupuesto actualizado.`
      );
    }
  };

  const handleCambiarEstado = (id: string, nuevoEstado: ReclamoCambioObra['estado']) => {
    dataService.updateReclamoCambio(id, { estado: nuevoEstado });
    loadData();
    showToast(`Estado actualizado a ${nuevoEstado.toUpperCase()}.`);
  };

  const handleEliminar = (id: string) => {
    dataService.deleteReclamoCambio(id);
    loadData();
    showToast('Registro eliminado.');
  };

  const registrosFiltrados =
    filtroTipo === 'todos' ? registros : registros.filter((r) => r.tipo === filtroTipo);

  const totalCambiosMonto = registros
    .filter((r) => r.tipo === 'solicitud_cambio' && r.estado !== 'rechazado')
    .reduce((acc, r) => acc + (r.impacto_monto || 0), 0);

  const pendientesCount = registros.filter(
    (r) => r.estado === 'pendiente' || r.estado === 'en_revision'
  ).length;
  const reclamosIncidenciasCount = registros.filter(
    (r) => r.tipo === 'reclamo' || r.tipo === 'incidente'
  ).length;
  const accidentesCount = registros.filter((r) => r.tipo === 'accidente').length;

  const getTipoMeta = (t: TipoReclamoCambio) => {
    switch (t) {
      case 'solicitud_cambio':
        return {
          label: 'Solicitud de Cambio',
          badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
          icon: RefreshCw,
        };
      case 'reclamo':
        return {
          label: 'Reclamo Cliente',
          badge: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
          icon: MessageSquareWarning,
        };
      case 'incidente':
        return {
          label: 'Incidencia Terreno',
          badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
          icon: AlertTriangle,
        };
      case 'accidente':
        return {
          label: 'Accidente / Seguridad',
          badge: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
          icon: ShieldAlert,
        };
    }
  };

  if (!proyecto) {
    return (
      <div className="p-8 text-center text-gray-500 font-mono text-sm">
        Cargando información de la obra...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#FAF8F5] dark:bg-[#0E131B] pb-16">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1E1E1E] text-white px-4 py-3 rounded-2xl shadow-2xl border border-[#FF6A00] flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="w-4 h-4 text-[#FF6A00] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <ProjectTabsHeader
        proyecto={proyecto}
        cliente={cliente}
        onOpenMaps={() => setIsMapsModalOpen(true)}
      />

      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Encabezado de Acciones */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-heading font-bold text-navy-900 dark:text-white">
              Reclamos, Incidencias y Solicitudes de Cambio
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Gestiona requerimientos nuevos del cliente, materiales adicionales, observaciones e incidentes de terreno.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenNewModal('solicitud_cambio')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF6A00] hover:bg-[#E05E00] text-white text-xs font-heading font-bold shadow-md transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Solicitud de Cambio / Material</span>
            </button>
            <button
              onClick={() => handleOpenNewModal('incidente')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] hover:border-red-500 text-navy-900 dark:text-white text-xs font-heading font-bold shadow-sm transition-all"
            >
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Reportar Reclamo / Incidente</span>
            </button>
          </div>
        </div>

        {/* Tarjetas KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Adicionales / Cambios</span>
              <RefreshCw className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {formatCLP(totalCambiosMonto)}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Impacto económico acumulado</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Pendientes de Aprobación</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {pendientesCount}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Requieren decisión o cierre</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Reclamos e Incidencias</span>
              <MessageSquareWarning className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {reclamosIncidenciasCount}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Postventa y hallazgos técnicos</p>
          </div>

          <div className="bg-white dark:bg-[#141A23] p-4 rounded-2xl border border-kraft-200 dark:border-[#263040] shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Seguridad / Accidentes</span>
              <ShieldAlert className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-xl font-heading font-black text-navy-900 dark:text-white">
              {accidentesCount}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Prevención de riesgos en faena</p>
          </div>
        </div>

        {/* Filtros por Tipo */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'todos', label: `Todos (${registros.length})` },
            { id: 'solicitud_cambio', label: '🔄 Solicitudes de Cambio' },
            { id: 'reclamo', label: '📢 Reclamos Cliente' },
            { id: 'incidente', label: '⚠️ Incidencias Terreno' },
            { id: 'accidente', label: '🚨 Accidentes' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltroTipo(f.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-heading font-bold whitespace-nowrap transition-all ${
                filtroTipo === f.id
                  ? 'bg-[#1E1E1E] dark:bg-[#FF6A00] text-white shadow'
                  : 'bg-white dark:bg-[#141A23] text-gray-600 dark:text-gray-300 border border-kraft-200 dark:border-[#263040] hover:border-[#FF6A00]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista de Registros */}
        {registrosFiltrados.length === 0 ? (
          <div className="bg-white dark:bg-[#141A23] rounded-2xl border border-dashed border-kraft-300 dark:border-[#263040] p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center mx-auto">
              <RefreshCw className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-heading font-bold text-navy-900 dark:text-white">
              No hay solicitudes de cambio, reclamos ni incidencias registradas aún
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Cuando el cliente pida una modificación, se necesiten materiales nuevos o un obrero reporte un aviso/accidente desde WhatsApp, aparecerán aquí automáticamente.
            </p>
            <button
              onClick={() => handleOpenNewModal('solicitud_cambio')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF6A00] text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>Crear primera solicitud</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {registrosFiltrados.map((item) => {
              const meta = getTipoMeta(item.tipo);
              const Icon = meta.icon;
              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#141A23] rounded-2xl border border-kraft-200 dark:border-[#263040] p-5 shadow-sm space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.badge}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{meta.label}</span>
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                            item.prioridad === 'critica'
                              ? 'bg-red-600 text-white'
                              : item.prioridad === 'alta'
                              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                              : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          Prioridad {item.prioridad}
                        </span>

                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                            item.estado === 'aprobado' || item.estado === 'resuelto'
                              ? 'bg-[#6B8F72]/20 text-[#6B8F72]'
                              : item.estado === 'rechazado'
                              ? 'bg-red-500/15 text-red-500'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {item.estado}
                        </span>

                        {item.origen === 'whatsapp_ia' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30">
                            <Smartphone className="w-3 h-3" />
                            <span>Vía WhatsApp IA</span>
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-heading font-bold text-navy-900 dark:text-white">
                        {item.titulo}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                        {item.descripcion}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400 pt-1">
                        <span>📅 {formatDate(item.fecha)}</span>
                        {item.solicitado_por && <span>👤 Reportado/Solicitado por: {item.solicitado_por}</span>}
                        {item.impacto_monto > 0 && (
                          <span className="font-bold text-[#FF6A00]">
                            💰 Impacto Presupuesto: +{formatCLP(item.impacto_monto)}
                          </span>
                        )}
                        {item.impacto_dias > 0 && (
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            ⏱️ Plazo Adicional: +{item.impacto_dias} días
                          </span>
                        )}
                      </div>
                    </div>

                    {item.foto_url && (
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto(item.foto_url || null)}
                        className="shrink-0 group relative rounded-xl overflow-hidden border border-kraft-200 dark:border-gray-700 w-28 h-20"
                      >
                        <img
                          src={item.foto_url}
                          alt="Evidencia"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <span className="absolute inset-0 bg-black/35 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          Ver foto
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Lista de Materiales Nuevos Requeridos */}
                  {item.materiales_requeridos && item.materiales_requeridos.length > 0 && (
                    <div className="bg-[#FAF8F5] dark:bg-[#1A222D] rounded-xl p-3.5 border border-kraft-200 dark:border-[#263040] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-heading font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-[#FF6A00]" />
                          <span>Materiales Nuevos Requeridos ({item.materiales_requeridos.length})</span>
                        </span>
                        {item.materiales_inyectados && (
                          <Link
                            href={`/proyectos/${proyecto.id}/finanzas`}
                            className="text-[11px] font-bold text-[#6B8F72] hover:underline flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Cargados en Finanzas & Insumos</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {item.materiales_requeridos.map((m, idx) => (
                          <div
                            key={idx}
                            className="bg-white dark:bg-[#141A23] px-3 py-2 rounded-lg border border-kraft-200 dark:border-[#263040] flex items-center justify-between text-xs"
                          >
                            <span className="truncate font-medium text-navy-900 dark:text-gray-200">
                              {m.cantidad} {m.unidad} • {m.nombre}
                            </span>
                            <span className="font-mono font-bold text-gray-700 dark:text-gray-300 ml-2 shrink-0">
                              {formatCLP(m.subtotal || m.cantidad * m.precio_unitario)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Botonera de Acciones del Registro */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-kraft-100 dark:border-[#1E2530]">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.estado !== 'aprobado' && item.estado !== 'resuelto' && (
                        <>
                          {item.tipo === 'solicitud_cambio' || item.materiales_requeridos.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleAprobarEInyectar(item)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6B8F72] hover:bg-[#5A7B60] text-white text-xs font-heading font-bold shadow-sm transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Aprobar y Cargar Materiales a la Obra</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCambiarEstado(item.id, 'resuelto')}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6B8F72] hover:bg-[#5A7B60] text-white text-xs font-heading font-bold shadow-sm transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Marcar como Resuelto</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCambiarEstado(item.id, 'rechazado')}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Rechazar</span>
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleEliminar(item.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Eliminar registro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Crear Solicitud de Cambio / Reclamo / Incidente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-kraft-200 dark:border-[#263040] my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-kraft-100 dark:border-[#263040]">
              <h3 className="text-base sm:text-lg font-heading font-bold text-navy-900 dark:text-white">
                Registrar Solicitud de Cambio, Reclamo o Incidente
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardar} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-navy-900 dark:text-gray-200 mb-1">
                    Tipo de Registro
                  </label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoReclamoCambio)}
                    className="w-full px-3 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs font-medium text-navy-900 dark:text-white"
                  >
                    <option value="solicitud_cambio">🔄 Solicitud de Cambio / Adicional</option>
                    <option value="reclamo">📢 Reclamo de Cliente</option>
                    <option value="incidente">⚠️ Incidencia en Terreno</option>
                    <option value="accidente">🚨 Accidente / Seguridad</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-navy-900 dark:text-gray-200 mb-1">
                    Prioridad
                  </label>
                  <select
                    value={prioridad}
                    onChange={(e) => setPrioridad(e.target.value as PrioridadReclamoCambio)}
                    className="w-full px-3 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs font-medium text-navy-900 dark:text-white"
                  >
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-navy-900 dark:text-gray-200 mb-1">
                    Solicitado / Reportado por
                  </label>
                  <input
                    type="text"
                    value={solicitadoPor}
                    onChange={(e) => setSolicitadoPor(e.target.value)}
                    placeholder="Ej: Don Carlos / Maestro Juan"
                    className="w-full px-3 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-navy-900 dark:text-gray-200 mb-1">
                  Título Corto *
                </label>
                <input
                  type="text"
                  required
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej: Cliente solicita ampliar cobertizo de terraza en 12 m²"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-navy-900 dark:text-gray-200">
                    Detalle de la Necesidad / Incidencia
                  </label>
                  <button
                    type="button"
                    onClick={handleCalcularMaterialesIA}
                    disabled={isCalculandoIA}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-[11px] font-bold transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>
                      {isCalculandoIA
                        ? 'Calculando con Gemini...'
                        : '✨ Cubicar Materiales Nuevos con IA'}
                    </span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Describe qué pidió el cliente, qué materiales adicionales se requieren o qué ocurrió en terreno..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs text-navy-900 dark:text-white"
                />
              </div>

              {/* Impacto en Costo y Plazo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-navy-900 dark:text-gray-200 mb-1">
                    <DollarSign className="w-3.5 h-3.5 inline text-[#FF6A00]" /> Monto Adicional al Presupuesto (CLP)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={impactoMonto}
                    onChange={(e) => setImpactoMonto(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs font-mono text-navy-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-navy-900 dark:text-gray-200 mb-1">
                    <Calendar className="w-3.5 h-3.5 inline text-blue-500" /> Días Hábiles Adicionales en Plazo
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={impactoDias}
                    onChange={(e) => setImpactoDias(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1E2530] text-xs font-mono text-navy-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Constructor de Materiales Nuevos Requeridos */}
              <div className="bg-[#FAF8F5] dark:bg-[#1A222D] p-3.5 rounded-xl border border-kraft-200 dark:border-[#263040] space-y-3">
                <label className="block text-xs font-heading font-bold text-navy-900 dark:text-white">
                  🧱 Materiales Nuevos Requeridos para esta Solicitud
                </label>

                <div className="grid grid-cols-12 gap-2">
                  <input
                    type="text"
                    placeholder="Insumo (ej. Porcelanato 60x60)"
                    value={matNombre}
                    onChange={(e) => setMatNombre(e.target.value)}
                    className="col-span-5 px-2.5 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Cant."
                    value={matCant}
                    onChange={(e) => setMatCant(e.target.value)}
                    className="col-span-2 px-2 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Unidad"
                    value={matUnidad}
                    onChange={(e) => setMatUnidad(e.target.value)}
                    className="col-span-2 px-2 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="$ Unit."
                    value={matPrecio}
                    onChange={(e) => setMatPrecio(e.target.value)}
                    className="col-span-2 px-2 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] text-xs text-navy-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAgregarMaterialManual}
                    className="col-span-1 flex items-center justify-center rounded-lg bg-[#FF6A00] text-white hover:bg-[#E05E00]"
                    title="Agregar material"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {materiales.length > 0 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {materiales.map((m, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-white dark:bg-[#141A23] px-3 py-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] text-xs"
                      >
                        <span className="text-navy-900 dark:text-gray-200">
                          <strong>{m.cantidad} {m.unidad}</strong> — {m.nombre} ({formatCLP(m.precio_unitario)} c/u)
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#FF6A00]">
                            {formatCLP(m.subtotal)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleEliminarMaterialTemp(idx)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Adjuntar Evidencia Fotográfica */}
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-kraft-100 dark:bg-[#1E2530] border border-kraft-200 dark:border-[#263040] text-xs font-bold text-navy-900 dark:text-gray-200 cursor-pointer hover:border-[#FF6A00]">
                  <Upload className="w-4 h-4 text-[#FF6A00]" />
                  <span>{isUploadingFoto ? 'Subiendo a Supabase...' : 'Adjuntar Foto / Evidencia'}</span>
                  <input type="file" accept="image/*" onChange={handleUploadFoto} className="hidden" />
                </label>
                {fotoUrl && (
                  <span className="text-xs text-[#6B8F72] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Foto cargada en Supabase Storage
                  </span>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-kraft-100 dark:border-[#263040]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-kraft-100 dark:bg-[#1E2530] text-xs font-bold text-navy-900 dark:text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#E05E00] text-white text-xs font-heading font-bold shadow"
                >
                  Guardar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visor de Foto */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative max-w-2xl w-full bg-white dark:bg-[#141A23] rounded-2xl p-4">
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewPhoto}
              alt="Evidencia"
              className="w-full max-h-[75vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      <GoogleMapsProjectViewer
        proyecto={proyecto}
        isOpen={isMapsModalOpen}
        onClose={() => setIsMapsModalOpen(false)}
      />
    </div>
  );
}
