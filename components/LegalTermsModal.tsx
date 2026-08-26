'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  FileText,
  Lock,
  Scale,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Building2,
  Server,
  UserCheck,
} from 'lucide-react';

interface LegalTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'terminos' | 'privacidad' | 'ciberseguridad';
}

export default function LegalTermsModal({
  isOpen,
  onClose,
  initialTab = 'terminos',
}: LegalTermsModalProps) {
  const [activeTab, setActiveTab] = useState<'terminos' | 'privacidad' | 'ciberseguridad'>(initialTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0 bg-[#FAF8F5] dark:bg-[#0F141C]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-black text-base sm:text-lg text-gray-900 dark:text-white">
                Marco Legal & Términos de Servicio
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-sans">
                Cumplimiento normativo vigente en la República de Chile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 px-5 sm:px-6 gap-2 bg-white dark:bg-[#141A23] shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('terminos')}
            className={`py-3 px-3 text-xs font-heading font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'terminos'
                ? 'border-[#FF6A00] text-[#FF6A00]'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Términos y Condiciones (Ley 19.496)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacidad')}
            className={`py-3 px-3 text-xs font-heading font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'privacidad'
                ? 'border-[#FF6A00] text-[#FF6A00]'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Protección de Datos (Ley 21.719)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ciberseguridad')}
            className={`py-3 px-3 text-xs font-heading font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'ciberseguridad'
                ? 'border-[#FF6A00] text-[#FF6A00]'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Ciberseguridad & Portabilidad (Ley 21.663)</span>
          </button>
        </div>

        {/* Contenido con Scroll */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs text-gray-700 dark:text-gray-300 font-sans leading-relaxed">
          
          {activeTab === 'terminos' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 dark:text-amber-200 font-medium">
                  <strong>Transparencia al Consumidor (Ley N° 19.496):</strong> ObraTrack garantiza mecanismos simples de contratación y cancelación de planes sin cobros sorpresa ni renovaciones ocultas.
                </p>
              </div>

              <div>
                <h4 className="font-heading font-bold text-sm text-gray-900 dark:text-white mb-1">
                  1. Modelo Freemium y Suscripciones
                </h4>
                <p>
                  ObraTrack ofrece un plan Gratuito de acceso permanente y planes de suscripción mensual con funciones ampliadas de Inteligencia Artificial y gestión de obras. Los cobros se expresan en Pesos Chilenos (CLP) con indicación transparente de impuestos aplicables.
                </p>
              </div>

              <div>
                <h4 className="font-heading font-bold text-sm text-gray-900 dark:text-white mb-1">
                  2. Renovación Automática y Notificación Previa
                </h4>
                <p>
                  En caso de suscripciones de renovación mensual, el usuario será notificado con al menos <strong>5 días hábiles de anticipación</strong> antes del cargo automático a su medio de pago.
                </p>
              </div>

              <div>
                <h4 className="font-heading font-bold text-sm text-gray-900 dark:text-white mb-1">
                  3. Derecho de Cancelación Inmediata y sin Trabas
                </h4>
                <p>
                  El usuario podrá cancelar su suscripción o regresar al Plan Gratuito en cualquier momento directamente desde la sección <em>Planes</em> de su panel, manteniendo el acceso a las funciones contratadas hasta el fin del ciclo vigente.
                </p>
              </div>

              <div>
                <h4 className="font-heading font-bold text-sm text-gray-900 dark:text-white mb-1">
                  4. Propiedad Intelectual del Software (Ley N° 17.336)
                </h4>
                <p>
                  El código fuente, arquitectura, marcas y algoritmos de ObraTrack se encuentran amparados por las leyes de propiedad intelectual de Chile. La suscripción otorga una licencia de uso no exclusiva y no transferible.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'privacidad' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-emerald-900 dark:text-emerald-200 font-medium">
                  <strong>Titularidad y Secreto Comercial (Ley N° 21.719):</strong> La constructora o cliente es el único y exclusivo dueño de sus planos, presupuestos, cubicaciones e información técnica cargada en la plataforma.
                </p>
              </div>

              <div>
                <h4 className="font-heading font-bold text-sm text-gray-900 dark:text-white mb-1">
                  1. Confidencialidad de la Información Técnica y Planos
                </h4>
                <p>
                  ObraTrack no adquiere derecho alguno sobre la propiedad intelectual de los proyectos, memorias de cálculo, fotos de faena o cotizaciones comerciales ingresadas por los usuarios. Esta información se almacena con cifrado y aislamiento estricto por empresa.
                </p>
              </div>

              <div>
                <h4 className="font-heading font-bold text-sm text-gray-900 dark:text-white mb-1">
                  2. Matriz de Roles y Aislamiento de Accesos (RBAC)
                </h4>
                <p>
                  Para proteger secretos comerciales y datos laborales, el sistema aplica aislamiento por roles: los perfiles de <strong>Maestro Terreno</strong> únicamente visualizan sus tareas asignadas y el módulo de subida de fotos, estando completamente restringido su acceso a márgenes de ganancia, costos unitarios, estados de pago de clientes o nóminas completas.
                </p>
              </div>

              <div>
                <h4 className="font-heading font-bold text-sm text-gray-900 dark:text-white mb-1">
                  3. Tratamiento de RUT y Comunicaciones
                </h4>
                <p>
                  El RUT chileno es utilizado con el único fin de validar la autenticidad del contratista y prevenir suplantaciones. Las comunicaciones comerciales o boletines de precios requieren el consentimiento explícito e independiente del usuario y pueden desactivarse en cualquier momento.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'ciberseguridad' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-2xl flex items-start gap-2.5">
                <Server className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-900 dark:text-blue-200 font-medium">
                  <strong>Ley Marco de Ciberseguridad (Ley N° 21.663):</strong> Medidas de protección técnica, portabilidad de datos y destrucción segura ante la baja de servicios.
                </p>
              </div>

              <div>
                <h4 className="font-heading font-bold text-sm text-gray-900 dark:text-white mb-1">
                  1. Portabilidad de Datos (Sin Secuestro de Información)
                </h4>
                <p>
                  Todo titular de cuenta puede solicitar o descargar en cualquier momento una exportación completa de sus obras, reportes de faena, actividades Gantt y registros financieros en formatos abiertos estándar (JSON / CSV).
                </p>
              </div>

              <div>
                <h4 className="font-heading font-bold text-sm text-gray-900 dark:text-white mb-1">
                  2. Derecho de Supresión y Destrucción Segura de Datos
                </h4>
                <p>
                  En caso de cierre voluntario de cuenta, ObraTrack procederá a la eliminación segura y definitiva de los registros y archivos almacenados en la nube dentro de un plazo máximo de 30 días, exceptuando únicamente la información que deba conservarse por obligaciones tributarias legales (SII).
                </p>
              </div>

              <div>
                <h4 className="font-heading font-bold text-sm text-gray-900 dark:text-white mb-1">
                  3. Seguridad de Infraestructura & Cifrado
                </h4>
                <p>
                  El tráfico de datos se realiza bajo protocolo cifrado HTTPS / TLS 1.3, y las bases de datos cuentan con autenticación reforzada y respaldos automáticos distribuidos geográficamente.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 bg-[#FAF8F5] dark:bg-[#0F141C]">
          <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 font-mono">
            <UserCheck className="w-3.5 h-3.5 text-[#6B8F72] shrink-0" />
            <span>Jurisdicción: Tribunales Ordinarios de Santiago de Chile</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-[#1E1E1E] dark:bg-[#FF6A00] hover:bg-black text-white text-xs font-bold font-heading rounded-xl transition-all shadow-sm"
          >
            Entendido y Aceptado
          </button>
        </div>
      </div>
    </div>
  );
}