'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  MessageSquareShare,
  CheckCircle2,
  XCircle,
  Edit3,
  Bot,
  User,
  Building2,
  Clock,
  Sparkles,
  AlertTriangle,
  Send,
  Volume2,
  X,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { ReporteWhatsApp, ReportStatus, SubscriptionPlanId } from '@/types/database';
import { formatCLP, formatDate } from '@/lib/utils';
import { getPlanDetails } from '@/lib/plans';
import PlanSwitcherModal from '@/components/PlanSwitcherModal';

export default function ReportesWhatsAppPage() {
  const [reportes, setReportes] = useState<ReporteWhatsApp[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'todos'>('todos');
  const [selectedReporte, setSelectedReporte] = useState<ReporteWhatsApp | null>(null);

  // Formulario de Corrección
  const [editAvance, setEditAvance] = useState<number>(0);
  const [editImprevistoMonto, setEditImprevistoMonto] = useState<number>(0);
  const [editImprevistoDesc, setEditImprevistoDesc] = useState<string>('');

  // Simulador de mensaje WhatsApp
  const [simulatedText, setSimulatedText] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  // Estado de suscripción
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  const loadData = () => {
    const reps = dataService.getReportes();
    const plan = dataService.getActivePlan();
    setReportes(reps);
    setActivePlan(plan);
  };

  useEffect(() => {
    loadData();
    const handler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    window.addEventListener('obratrack_plan_changed', handler);
    return () => window.removeEventListener('obratrack_plan_changed', handler);
  }, []);

  const filteredReportes = reportes.filter((r) => {
    if (statusFilter === 'todos') return true;
    return r.estado === statusFilter;
  });

  const handleAprobar = (id: string) => {
    dataService.aprobarReporte(id);
    loadData();
  };

  const handleRechazar = (id: string) => {
    dataService.rechazarReporte(id);
    loadData();
  };

  const openEditModal = (rep: ReporteWhatsApp) => {
    setSelectedReporte(rep);
    setEditAvance(rep.extraccion_ia?.avance_porcentaje || 0);
    setEditImprevistoMonto(rep.extraccion_ia?.imprevisto_monto_estimado || 0);
    setEditImprevistoDesc(rep.extraccion_ia?.imprevisto_descripcion || '');
  };

  const handleSaveCorrection = () => {
    if (!selectedReporte) return;
    dataService.aprobarReporte(selectedReporte.id, {
      avance_porcentaje: editAvance,
      imprevisto_monto: editImprevistoMonto,
      imprevisto_descripcion: editImprevistoDesc,
    });
    setSelectedReporte(null);
    loadData();
  };

  // Simular recepción de mensaje vía WhatsApp
  const handleSimulateWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedText.trim()) return;

    setIsSimulating(true);
    const usuarios = dataService.getUsuarios();
    const proyectos = dataService.getProyectos();
    const sender = usuarios.find((u) => u.rol === 'terreno') || usuarios[0];
    const targetProject = proyectos[0];

    // Simular extracción con IA
    setTimeout(() => {
      let avance = 50;
      let tieneImp = false;
      let impMonto = 0;
      let impDesc = null;

      const lower = simulatedText.toLowerCase();
      const numMatch = lower.match(/(\d+)%/);
      if (numMatch) avance = parseInt(numMatch[1], 10);

      if (lower.includes('compramos') || lower.includes('costó') || lower.includes('imprevisto') || lower.includes('roto') || lower.includes('pesos')) {
        tieneImp = true;
        const montoMatch = lower.match(/(\d+)\s*(mil|pesos|\$)/);
        if (montoMatch) {
          impMonto = parseInt(montoMatch[1], 10) * (montoMatch[2] === 'mil' ? 1000 : 1);
        } else {
          impMonto = 35000;
        }
        impDesc = 'Gasto imprevisto mencionado en el reporte de terreno';
      }

      dataService.createReporte({
        proyecto_id: targetProject.id,
        usuario_id: sender.id,
        mensaje_original: simulatedText.trim(),
        extraccion_ia: {
          actividad_detectada: targetProject.actividades?.[1]?.nombre || 'Montaje de Estructura',
          avance_porcentaje: avance,
          tiene_imprevisto: tieneImp,
          imprevisto_descripcion: impDesc,
          imprevisto_monto_estimado: impMonto,
        },
        estado: 'pendiente',
        fecha: new Date().toISOString(),
      });

      setSimulatedText('');
      setIsSimulating(false);
      loadData();
    }, 600);
  };

  const pendingCount = reportes.filter((r) => r.estado === 'pendiente').length;

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <PlanSwitcherModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />

      <Navbar
        title="Bandeja de Reportes WhatsApp (IA)"
        subtitle="Transcripción con OpenAI Whisper y extracción estructurada con GPT-4o-mini"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5DFC9] text-xs font-mono text-gray-700 hover:border-[#FF6A00] transition-colors shadow-sm"
            >
              <span className="w-2 h-2 rounded-full bg-[#6B8F72]"></span>
              <span>{getPlanDetails(activePlan).nombre}</span>
            </button>
            <span className="text-xs font-mono text-gray-500 bg-white border border-kraft-200 px-3 py-1.5 rounded-xl shadow-sm">
              Pendientes: <strong className="text-obra-orange">{pendingCount}</strong>
            </span>
          </div>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Banner si el usuario NO está en Plan Pro IA */}
        {activePlan !== 'pro_ia' && (
          <div className="p-4 rounded-2xl bg-[#6B8F72]/15 border border-[#6B8F72]/40 text-[#1E1E1E] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-[#6B8F72] shrink-0" />
              <div>
                <p className="text-xs font-bold font-heading">
                  Módulo de Automatización WhatsApp & Whisper (Exclusivo Plan Pro IA)
                </p>
                <p className="text-[11px] text-gray-600 font-sans">
                  El <strong>Plan Pro IA ($19.990 - $29.990)</strong> incluye recepción de audios de voz de maestros, transcripción automática con OpenAI Whisper y extracción de avances e imprevistos en tiempo real.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="px-3.5 py-1.5 bg-[#6B8F72] hover:bg-[#55735B] text-white text-xs font-bold rounded-xl shadow-sm transition-colors whitespace-nowrap"
            >
              ⚡ Simular Plan Pro IA en Demo
            </button>
          </div>
        )}
        
        {/* Simulador rápido de mensaje WhatsApp para testing */}
        <div className="bg-white border border-kraft-200 rounded-xl p-4 shadow-sm">
          <form onSubmit={handleSimulateWhatsApp} className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-mono text-navy-900 font-semibold flex-shrink-0">
              <MessageSquareShare className="w-4 h-4 text-obra-green" />
              <span>Simular Mensaje WhatsApp:</span>
            </div>
            <input
              type="text"
              placeholder="Ej: Don Gonzalo, avanzamos al 85% la techumbre pero tuvimos que comprar 3 sacos de cemento extra por 15 mil pesos."
              value={simulatedText}
              onChange={(e) => setSimulatedText(e.target.value)}
              className="flex-1 w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
            />
            <button
              type="submit"
              disabled={isSimulating}
              className="px-4 py-2 bg-navy-800 hover:bg-navy-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 font-heading shadow-sm flex-shrink-0 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5 text-obra-orange" />
              <span>{isSimulating ? 'Procesando IA...' : 'Enviar y Procesar'}</span>
            </button>
          </form>
        </div>

        {/* Filtro por Estado */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-heading transition-all ${
              statusFilter === 'todos'
                ? 'bg-navy-800 text-white shadow-sm'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            Todos ({reportes.length})
          </button>
          <button
            onClick={() => setStatusFilter('pendiente')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-heading transition-all ${
              statusFilter === 'pendiente'
                ? 'bg-obra-orange text-white shadow-sm'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            Pendientes ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('aprobado')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-heading transition-all ${
              statusFilter === 'aprobado'
                ? 'bg-obra-green text-white shadow-sm'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            Aprobados
          </button>
          <button
            onClick={() => setStatusFilter('rechazado')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-heading transition-all ${
              statusFilter === 'rechazado'
                ? 'bg-obra-red text-white shadow-sm'
                : 'bg-white border border-kraft-200 text-gray-600 hover:bg-kraft-50'
            }`}
          >
            Rechazados
          </button>
        </div>

        {/* Lista de Reportes WhatsApp */}
        <div className="space-y-4">
          {filteredReportes.length === 0 ? (
            <div className="bg-white border border-kraft-200 rounded-xl p-12 text-center">
              <MessageSquareShare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No hay reportes de WhatsApp en esta categoría.</p>
            </div>
          ) : (
            filteredReportes.map((rep) => {
              const extraccion = rep.extraccion_ia || {};

              return (
                <div
                  key={rep.id}
                  className={`bg-white border rounded-xl p-5 shadow-sm transition-all ${
                    rep.estado === 'pendiente'
                      ? 'border-obra-orange/60 ring-1 ring-obra-orange/20'
                      : 'border-kraft-200'
                  }`}
                >
                  {/* Encabezado del Reporte */}
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-kraft-200">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-navy-800 text-obra-orange flex items-center justify-center font-bold text-xs">
                        {rep.usuario?.nombre.charAt(0) || 'T'}
                      </div>
                      <div>
                        <h4 className="font-heading font-bold text-sm text-navy-900 flex items-center gap-2">
                          <span>{rep.usuario?.nombre || 'Operario Terreno'}</span>
                          <span className="text-[11px] font-mono text-gray-400">
                            ({rep.usuario?.telefono_whatsapp || 'WhatsApp'})
                          </span>
                        </h4>
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />
                          <span>{rep.proyecto?.nombre || 'Obra no identificada'}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-gray-400">
                        {new Date(rep.fecha).toLocaleTimeString('es-CL', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        • {formatDate(rep.fecha.split('T')[0])}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                          rep.estado === 'pendiente'
                            ? 'bg-obra-orange-light text-obra-orange animate-pulse'
                            : rep.estado === 'aprobado'
                            ? 'bg-obra-green-light text-obra-green'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {rep.estado}
                      </span>
                    </div>
                  </div>

                  {/* Cuerpo: Mensaje Original vs Extracción IA */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
                    
                    {/* Mensaje original / Transcripción */}
                    <div className="bg-kraft-50 border border-kraft-200/80 rounded-lg p-3.5">
                      <span className="text-[10px] font-mono uppercase text-gray-500 font-bold block mb-1.5 flex items-center gap-1">
                        {rep.transcripcion ? (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-obra-orange" />
                            <span>Audio Transcrito (Whisper):</span>
                          </>
                        ) : (
                          <>
                            <MessageSquareShare className="w-3.5 h-3.5 text-obra-green" />
                            <span>Mensaje de Texto Original:</span>
                          </>
                        )}
                      </span>
                      <p className="text-xs text-gray-800 leading-relaxed font-sans italic">
                        "{rep.transcripcion || rep.mensaje_original}"
                      </p>
                    </div>

                    {/* Extracción Estructurada por IA (Claude) */}
                    <div className="bg-navy-900 text-white rounded-lg p-3.5 space-y-2 border border-navy-700 shadow-inner">
                      <span className="text-[10px] font-mono uppercase text-obra-orange font-bold flex items-center gap-1">
                        <Bot className="w-3.5 h-3.5" />
                        <span>Extracción Inteligente (OpenAI GPT-4o-mini JSON):</span>
                      </span>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-gray-400 block text-[10px]">Actividad Detectada:</span>
                          <strong className="text-gray-200 truncate block">
                            {extraccion.actividad_detectada || 'No especificada'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">Avance Sugerido:</span>
                          <strong className="text-obra-orange text-sm">
                            {extraccion.avance_porcentaje !== null && extraccion.avance_porcentaje !== undefined
                              ? `${extraccion.avance_porcentaje}%`
                              : '-'}
                          </strong>
                        </div>
                      </div>

                      {extraccion.tiene_imprevisto && (
                        <div className="pt-2 border-t border-navy-700/80 text-xs font-mono">
                          <span className="text-obra-red text-[10px] font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Imprevisto de Costo Detectado:</span>
                          </span>
                          <p className="text-gray-300 text-[11px] mt-0.5">
                            {extraccion.imprevisto_descripcion || 'Sin descripción'}
                          </p>
                          <span className="text-obra-red font-bold block mt-0.5">
                            Monto Estimado: {formatCLP(extraccion.imprevisto_monto_estimado)}
                          </span>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Acciones de Aprobación */}
                  {rep.estado === 'pendiente' && (
                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                      <button
                        onClick={() => handleRechazar(rep.id)}
                        className="px-3 py-1.5 text-xs text-gray-500 hover:text-obra-red rounded-lg font-heading"
                      >
                        Rechazar
                      </button>
                      <button
                        onClick={() => openEditModal(rep)}
                        className="px-3.5 py-1.5 bg-kraft-100 hover:bg-kraft-200 text-navy-900 rounded-lg text-xs font-semibold flex items-center gap-1 font-heading"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Corregir Datos</span>
                      </button>
                      <button
                        onClick={() => handleAprobar(rep.id)}
                        className="px-4 py-1.5 bg-obra-green hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 font-heading shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Aprobar y Actualizar Obra</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Modal: Corregir Extracción IA */}
      {selectedReporte && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-obra-orange" />
                <span>Corregir Extracción antes de Aplicar</span>
              </h3>
              <button onClick={() => setSelectedReporte(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Porcentaje de Avance a Aplicar (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editAvance}
                  onChange={(e) => setEditAvance(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Descripción del Imprevisto (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Compra de pernos y anclajes"
                  value={editImprevistoDesc}
                  onChange={(e) => setEditImprevistoDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Monto Imprevisto (CLP)
                </label>
                <input
                  type="number"
                  value={editImprevistoMonto}
                  onChange={(e) => setEditImprevistoMonto(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setSelectedReporte(null)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveCorrection}
                  className="px-4 py-1.5 bg-obra-orange text-white text-xs font-semibold rounded-lg font-heading shadow-sm"
                >
                  Guardar y Aprobar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
