'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  Zap,
  Shield,
  Bot,
  MessageSquare,
  ArrowRight,
  TrendingUp,
  Building,
  HelpCircle,
  CreditCard,
  Layers,
  Calculator,
  Download,
  FileText,
  AlertTriangle,
  RotateCcw,
  Scale,
  Lock,
} from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { exportService } from '@/lib/export-service';
import { PLANES_SUSCRIPCION, getPlanDetails } from '@/lib/plans';
import { SubscriptionPlanId } from '@/types/database';
import LegalTermsModal from '@/components/LegalTermsModal';
import { isDeveloperUser } from '@/lib/auth-utils';

export default function PlanesPage() {
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('gratis');
  const [isDev, setIsDev] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'terminos' | 'privacidad' | 'ciberseguridad'>('terminos');

  const loadPlan = () => {
    setActivePlan(dataService.getActivePlan());
  };

  useEffect(() => {
    const user = dataService.getActiveUser();
    setIsDev(isDeveloperUser(user));
    if (user?.rol === 'terreno') {
      window.location.href = '/proyectos';
      return;
    }
    loadPlan();
    const handler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    window.addEventListener('obratrack_plan_changed', handler);
    return () => window.removeEventListener('obratrack_plan_changed', handler);
  }, []);

  const handleSelectPlan = (planId: SubscriptionPlanId) => {
    if (!isDev) return;
    dataService.setActivePlan(planId);
    setActivePlan(planId);
    setSuccessToast(planId);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const matrizComparativa = [
    {
      categoria: 'Gestión de Obras & Control',
      items: [
        {
          nombre: 'Obras y Proyectos simultáneos',
          gratis: '1 obra activa',
          pro: 'Ilimitadas',
          pro_ia: 'Ilimitadas',
        },
        {
          nombre: 'Directorio de Clientes & Contactos',
          gratis: true,
          pro: true,
          pro_ia: true,
        },
        {
          nombre: 'Carta Gantt semanal interactiva',
          gratis: 'Básica',
          pro: 'Avanzada + Partidas',
          pro_ia: 'Actualizada por IA',
        },
        {
          nombre: 'Control de Pagos, Anticipos y Saldos',
          gratis: true,
          pro: true,
          pro_ia: true,
        },
        {
          nombre: 'Registro de Imprevistos con foto',
          gratis: 'Básico',
          pro: true,
          pro_ia: true,
        },
      ],
    },
    {
      categoria: 'Presupuestos & Rentabilidad con IA',
      items: [
        {
          nombre: 'Cotizador Inteligente & APU (Google Gemini 2.5 IA)',
          gratis: false,
          pro: true,
          pro_ia: true,
        },
        {
          nombre: 'Asesor de Cobro "¿Cuánto cobrar al mandante?" (3 niveles)',
          gratis: false,
          pro: true,
          pro_ia: true,
        },
        {
          nombre: 'Radar de precios más baratos en Chile (Sodimac, Construmart, Imperial, MTS, Easy)',
          gratis: false,
          pro: true,
          pro_ia: true,
        },
        {
          nombre: 'Gráficos financieros de rentabilidad (Donut chart)',
          gratis: false,
          pro: true,
          pro_ia: true,
        },
        {
          nombre: 'Exportación y envío directo a WhatsApp del cliente',
          gratis: false,
          pro: true,
          pro_ia: true,
        },
      ],
    },
    {
      categoria: 'WhatsApp Cloud API & Agentes Autónomos',
      items: [
        {
          nombre: 'Procesamiento de audios de faena (Google Gemini IA)',
          gratis: false,
          pro: false,
          pro_ia: true,
        },
        {
          nombre: 'Extracción automática de partidas y avance desde chat',
          gratis: false,
          pro: false,
          pro_ia: true,
        },
        {
          nombre: 'Detección automática de gastos e imprevistos por WhatsApp',
          gratis: false,
          pro: false,
          pro_ia: true,
        },
        {
          nombre: 'Cobranza y recordatorios automáticos a clientes',
          gratis: false,
          pro: false,
          pro_ia: true,
        },
        {
          nombre: 'Búsqueda semántica y vector search con pgvector en Supabase',
          gratis: false,
          pro: false,
          pro_ia: true,
        },
      ],
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#FAF8F5]">
      <Navbar
        title="Planes & Suscripciones ObraTrack"
        subtitle="Modelo de monetización SaaS y simulador interactivo para evaluación de proyectos"
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-500 bg-white border border-[#E5DFC9] px-3 py-1.5 rounded-lg shadow-sm">
              Plan Activo: <strong className="text-[#FF6A00] font-black">{getPlanDetails(activePlan).nombre}</strong>
            </span>
          </div>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-8">
        
        {/* Banner de Simulación para Desarrollador / Planes para Usuario */}
        <div className="bg-[#1E1E1E] text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-[#2A2A2A] relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#FF6A00]/15 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF6A00] text-white text-[11px] font-mono font-bold uppercase tracking-wider">
                {isDev ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Modo Desarrollador: Control de Planes</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-3.5 h-3.5" />
                    <span>Planes Oficiales ObraTrack</span>
                  </>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black font-heading tracking-tight">
                {isDev
                  ? 'Prueba cómo reacciona la plataforma según el plan contratado'
                  : 'Escala tu constructora con el plan ideal'}
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 font-sans">
                {isDev
                  ? 'Como desarrollador autorizado, puedes alternar entre planes en tiempo real para verificar los límites y permisos de la plataforma tanto en la interfaz como en Supabase.'
                  : 'Comienza con el Plan Gratis para ordenar tus primeras obras y da el salto a Pro o Pro IA cuando requieras cubicación con IA y automatizaciones.'}
              </p>
            </div>

            {/* Quick Switcher Buttons (Solo visible para Desarrollador) */}
            {isDev && (
              <div className="bg-[#2A2A2A] p-2 rounded-2xl border border-[#383838] flex flex-col sm:flex-row gap-2 shrink-0">
                {PLANES_SUSCRIPCION.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPlan(p.id)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-heading font-bold transition-all flex items-center justify-center gap-2 ${
                      activePlan === p.id
                        ? 'bg-[#FF6A00] text-white shadow-md shadow-[#FF6A00]/30'
                        : 'text-gray-300 hover:text-white hover:bg-black/30'
                    }`}
                  >
                    <span>{p.nombre}</span>
                    {activePlan === p.id && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {successToast && (
            <div className="mt-4 py-2 px-4 bg-[#6B8F72]/20 border border-[#6B8F72] text-[#85C492] text-xs font-mono font-bold rounded-xl inline-flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
              <CheckCircle2 className="w-4 h-4 text-[#6B8F72]" />
              <span>
                ¡Has activado el {getPlanDetails(successToast as SubscriptionPlanId).nombre}! Los límites y permisos se actualizaron en la plataforma y en Supabase.
              </span>
            </div>
          )}
        </div>

        {/* 3 Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANES_SUSCRIPCION.map((plan) => {
            const isSelected = activePlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 sm:p-8 border-2 transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#FF6A00] bg-white shadow-2xl shadow-[#FF6A00]/15 ring-4 ring-[#FF6A00]/10'
                    : 'border-[#E5DFC9] bg-white hover:border-gray-400 hover:shadow-lg'
                }`}
              >
                {/* Badge */}
                {plan.popular && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#FF6A00] text-white text-[11px] font-black uppercase tracking-wider px-4 py-1 rounded-full shadow-md">
                    {plan.badge}
                  </span>
                )}
                {plan.id === 'pro_ia' && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#6B8F72] text-white text-[11px] font-black uppercase tracking-wider px-4 py-1 rounded-full shadow-md">
                    {plan.badge}
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-heading font-black text-2xl text-[#1E1E1E]">
                        {plan.nombre}
                      </h3>
                      <p className="text-xs font-mono text-[#FF6A00] font-bold mt-0.5">
                        {plan.usuarioObjetivo}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="flex items-center gap-1 text-xs font-mono font-bold text-[#6B8F72] bg-[#6B8F72]/15 px-3 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Plan Activo
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-600 font-sans mt-3 leading-relaxed">
                    {plan.descripcion}
                  </p>

                  {/* Pricing Box */}
                  <div className="mt-6 p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5DFC9]">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-black font-mono text-[#1E1E1E]">
                        {plan.precioRangoTexto}
                      </span>
                      <span className="text-xs text-gray-500 font-mono font-semibold">CLP</span>
                    </div>
                    <p className="text-[11px] text-gray-500 font-mono mt-1">
                      {plan.periodo} • Sin contrato de permanencia
                    </p>
                  </div>

                  {/* Feature Highlights */}
                  <div className="mt-6 space-y-3">
                    <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-gray-500">
                      Incluye:
                    </p>
                    <ul className="space-y-2.5 text-xs text-gray-700 font-sans">
                      {plan.caracteristicas.map((caract, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <CheckCircle2
                            className={`w-4 h-4 mt-0.5 shrink-0 ${
                              plan.id === 'pro_ia'
                                ? 'text-[#6B8F72]'
                                : plan.id === 'pro'
                                ? 'text-[#FF6A00]'
                                : 'text-gray-400'
                            }`}
                          />
                          <span className="leading-snug">{caract}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Activation CTA */}
                {isDev ? (
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`mt-8 w-full py-3.5 px-6 rounded-2xl font-heading font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                      isSelected
                        ? 'bg-[#1E1E1E] text-white cursor-default shadow-md'
                        : plan.id === 'pro_ia'
                        ? 'bg-[#6B8F72] hover:bg-[#55735B] text-white shadow-lg shadow-[#6B8F72]/30'
                        : plan.id === 'pro'
                        ? 'bg-[#FF6A00] hover:bg-[#E55F00] text-white shadow-lg shadow-[#FF6A00]/30'
                        : 'bg-gray-200 hover:bg-gray-300 text-[#1E1E1E]'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[#6B8F72]" />
                        <span>Plan Actual en Ejecución</span>
                      </>
                    ) : (
                      <>
                        <span>Activar este Plan en Demo</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <div className="mt-8">
                    {isSelected ? (
                      <div className="w-full py-3.5 px-6 rounded-2xl bg-[#6B8F72]/15 text-[#55735B] border border-[#6B8F72]/30 font-heading font-bold text-sm text-center flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#6B8F72]" />
                        <span>Tu Plan Activo</span>
                      </div>
                    ) : (
                      <a
                        href="mailto:soporte@obratrack.cl?subject=Solicitud%20de%20Mejora%20a%20Plan%20Pro"
                        className={`w-full py-3.5 px-6 rounded-2xl font-heading font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                          plan.id === 'pro_ia'
                            ? 'bg-[#6B8F72] hover:bg-[#55735B] text-white shadow-lg shadow-[#6B8F72]/30'
                            : 'bg-[#FF6A00] hover:bg-[#E55F00] text-white shadow-lg shadow-[#FF6A00]/30'
                        }`}
                      >
                        <Lock className="w-4 h-4" />
                        <span>Contratar {plan.nombre}</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Matriz Comparativa Detallada */}
        <div className="bg-white border border-[#E5DFC9] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="text-center max-w-2xl mx-auto">
            <h3 className="text-xl sm:text-2xl font-black font-heading text-[#1E1E1E]">
              Comparativa Completa de Características
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 font-sans mt-1">
              Desglose detallado de capacidades por nivel de suscripción
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#1E1E1E]">
                  <th className="py-4 px-4 font-heading font-bold text-[#1E1E1E] text-sm w-2/5">
                    Funcionalidad
                  </th>
                  <th className="py-4 px-4 font-heading font-bold text-center text-gray-600 text-sm">
                    Gratis
                  </th>
                  <th className="py-4 px-4 font-heading font-bold text-center text-[#FF6A00] text-sm">
                    Plan Pro
                  </th>
                  <th className="py-4 px-4 font-heading font-bold text-center text-[#6B8F72] text-sm">
                    Plan Pro IA
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrizComparativa.map((bloque, bIdx) => (
                  <React.Fragment key={bIdx}>
                    <tr className="bg-[#FAF8F5]">
                      <td
                        colSpan={4}
                        className="py-2.5 px-4 font-mono font-bold text-[11px] uppercase tracking-wider text-gray-600 border-t border-b border-[#E5DFC9]"
                      >
                        {bloque.categoria}
                      </td>
                    </tr>
                    {bloque.items.map((item, iIdx) => (
                      <tr key={iIdx} className="border-b border-gray-100 hover:bg-gray-50/70">
                        <td className="py-3 px-4 font-sans text-gray-800 font-medium">
                          {item.nombre}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {typeof item.gratis === 'boolean' ? (
                            item.gratis ? (
                              <CheckCircle2 className="w-4 h-4 text-[#6B8F72] mx-auto" />
                            ) : (
                              <XCircle className="w-4 h-4 text-gray-300 mx-auto" />
                            )
                          ) : (
                            <span className="text-gray-600 font-semibold">{item.gratis}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {typeof item.pro === 'boolean' ? (
                            item.pro ? (
                              <CheckCircle2 className="w-4 h-4 text-[#FF6A00] mx-auto" />
                            ) : (
                              <XCircle className="w-4 h-4 text-gray-300 mx-auto" />
                            )
                          ) : (
                            <span className="text-[#FF6A00] font-bold">{item.pro}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono bg-[#6B8F72]/5">
                          {typeof item.pro_ia === 'boolean' ? (
                            item.pro_ia ? (
                              <CheckCircle2 className="w-4 h-4 text-[#6B8F72] mx-auto" />
                            ) : (
                              <XCircle className="w-4 h-4 text-gray-300 mx-auto" />
                            )
                          ) : (
                            <span className="text-[#6B8F72] font-bold">{item.pro_ia}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Marco Legal, Gestión de Suscripción & Portabilidad de Datos (Leyes 19.496, 21.719 y 21.663) */}
        <div className="bg-white border border-[#E5DFC9] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#6B8F72]/10 text-[#6B8F72] flex items-center justify-center shrink-0">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-heading text-[#1E1E1E]">
                  Protección al Consumidor & Portabilidad de Datos en Chile
                </h3>
                <p className="text-xs text-gray-500 font-sans">
                  Garantías legales de cancelación simple, transparencia de cobros y no-secuestro de información
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setLegalModalTab('terminos');
                setIsLegalModalOpen(true);
              }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl font-heading transition-colors inline-flex items-center gap-2 self-start sm:self-auto"
            >
              <FileText className="w-4 h-4 text-[#FF6A00]" />
              <span>Ver Marco Legal Completo</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tarjeta 1: Portabilidad & Respaldo */}
            <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5DFC9] flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-gray-900 font-heading">
                  <Download className="w-4 h-4 text-[#6B8F72]" />
                  <span>Portabilidad Total (Ley N° 21.663)</span>
                </div>
                <p className="text-xs text-gray-600 font-sans mt-1.5 leading-relaxed">
                  Tus planos, cotizaciones, registros de pagos y fotos son propiedad de tu constructora. Puedes descargar una copia completa de tu base de datos en formato abierto en cualquier momento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const ok = exportService.exportAllDataAsJSON();
                  if (ok) {
                    setSuccessToast('Respaldo descargado exitosamente en tu equipo.');
                    setTimeout(() => setSuccessToast(null), 3500);
                  }
                }}
                className="w-full py-2.5 px-4 bg-[#6B8F72] hover:bg-[#55735B] text-white rounded-xl text-xs font-heading font-bold transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>📥 Descargar Copia Completa de Obras (JSON)</span>
              </button>
            </div>

            {/* Tarjeta 2: Cancelación sin Trabas */}
            <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5DFC9] flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-gray-900 font-heading">
                  <RotateCcw className="w-4 h-4 text-[#FF6A00]" />
                  <span>Cancelación Simple & Sin Penalización (Ley N° 19.496)</span>
                </div>
                <p className="text-xs text-gray-600 font-sans mt-1.5 leading-relaxed">
                  Puedes dar de baja tu plan de pago o regresar al plan Gratuito con un solo clic, sin llamadas ni trámites ocultos.
                </p>
              </div>
              {activePlan !== 'gratis' ? (
                <button
                  type="button"
                  onClick={() => handleSelectPlan('gratis')}
                  className="w-full py-2.5 px-4 bg-gray-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 border border-transparent text-gray-800 rounded-xl text-xs font-heading font-bold transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Cancelar Suscripción y Volver a Plan Gratis</span>
                </button>
              ) : (
                <div className="py-2 px-3 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-mono font-bold text-center">
                  ✓ Actualmente estás en el Plan Gratuito (Sin cobros periódicos)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal de Términos Legales y Privacidad */}
        <LegalTermsModal
          isOpen={isLegalModalOpen}
          onClose={() => setIsLegalModalOpen(false)}
          initialTab={legalModalTab}
        />

      </div>
    </div>
  );
}
