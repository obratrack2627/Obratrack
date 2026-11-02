"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { dataService } from "@/lib/data-service";
import { PLANES_SUSCRIPCION, getPlanDetails } from "@/lib/plans";
import type { SubscriptionPlanId, Usuario } from "@/types/database";
import { formatCLP } from "@/lib/utils";
import LegalTermsModal from "@/components/LegalTermsModal";
import { exportService } from "@/lib/export-service";

export default function PlanesPage() {
  const [plan, setPlan] = useState<SubscriptionPlanId>("gratis");
  const [billingCycle, setBillingCycle] = useState<"mensual" | "anual">("mensual");
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [usage, setUsage] = useState({
    obrasActivas: 0,
    obrasTotales: 0,
    integrantesEquipo: 0,
    cotizacionesGuardadas: 0,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [legal, setLegal] = useState<
    "terminos" | "privacidad" | "ciberseguridad" | null
  >(null);

  useEffect(() => {
    const refresh = () => {
      setPlan(dataService.getActivePlan());
      setActiveUser(dataService.getActiveUser());
      const projs = dataService.getProyectos();
      setUsage({
        obrasActivas: projs.filter((p) => p.estado === "activo").length,
        obrasTotales: projs.length,
        integrantesEquipo: dataService.getUsuarios().length,
        cotizacionesGuardadas: dataService.getCotizaciones().length,
      });
    };
    refresh();
    window.addEventListener("obratrack_cloud_synced", refresh);
    window.addEventListener("obratrack_plan_changed", refresh);
    return () => {
      window.removeEventListener("obratrack_cloud_synced", refresh);
      window.removeEventListener("obratrack_plan_changed", refresh);
    };
  }, []);

  const currentPlanDetails = getPlanDetails(plan);
  const limiteTexto =
    currentPlanDetails.limiteObrasActivas === "ilimitadas"
      ? `${usage.obrasActivas} / Ilimitadas`
      : `${usage.obrasActivas} / ${currentPlanDetails.limiteObrasActivas}`;

  const handleExportBackup = () => {
    const ok = exportService.exportAllDataAsJSON();
    setToast(
      ok
        ? "Respaldo íntegro JSON descargado correctamente."
        : "No se pudo generar el respaldo de datos."
    );
    setTimeout(() => setToast(null), 3500);
  };

  const buildUpgradeMailto = (targetPlanName: string, precioEfectivo: number) => {
    const empresa = activeUser?.empresa_nombre || "Constructora";
    const rut = activeUser?.rut || "Por informar";
    const modalidad = billingCycle === "anual" ? "Anual (15% descuento)" : "Mensual";
    const subject = `Solicitud de activación ${targetPlanName} (${modalidad}) - ${empresa}`;
    const body =
      `Hola equipo ObraTrack,\n\n` +
      `Solicito activar el ${targetPlanName} en modalidad ${modalidad} (${formatCLP(precioEfectivo)}/mes).\n\n` +
      `Datos de la cuenta:\n` +
      `- Empresa: ${empresa}\n` +
      `- RUT: ${rut}\n` +
      `- Usuario: ${activeUser?.nombre || ""} (${activeUser?.email || ""})\n` +
      `- Plan actual: ${currentPlanDetails.nombre}\n`;
    return `mailto:soporte@obratrack.cl?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="flex-1 min-h-screen">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-2xl bg-navy-900 text-white border border-obra-orange/50 px-4 py-3 text-xs font-semibold shadow-2xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-obra-orange" />
          <span>{toast}</span>
        </div>
      )}

      <Navbar
        title="Planes y suscripción"
        subtitle={`Tu plan actual: ${currentPlanDetails.nombre}`}
      />

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Resumen de Consumo Actual del Tenant */}
        <section
          aria-label="Consumo actual de tu cuenta"
          className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-5 shadow-sm space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-heading font-bold text-navy-900 dark:text-white">
                Estado y Uso de tu Constructora
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {activeUser?.empresa_nombre || "Cuenta activa"} · Plan vigente:{" "}
                <span className="font-semibold text-obra-orange">
                  {currentPlanDetails.nombre}
                </span>
              </p>
            </div>

            {/* Selector ciclo de facturación */}
            <div className="inline-flex items-center rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-100 dark:bg-[#0B0F14] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setBillingCycle("mensual")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  billingCycle === "mensual"
                    ? "bg-white dark:bg-[#141A23] text-navy-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400"
                }`}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("anual")}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  billingCycle === "anual"
                    ? "bg-white dark:bg-[#141A23] text-navy-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400"
                }`}
              >
                <span>Anual</span>
                <span className="rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-mono">
                  -15%
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-3.5">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                <span className="font-mono uppercase text-[11px]">Obras Activas</span>
                <Building2 className="w-4 h-4 text-obra-orange" />
              </div>
              <p className="text-lg font-mono font-bold text-navy-900 dark:text-white mt-1">
                {limiteTexto}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {usage.obrasTotales} obra(s) registrada(s) en total
              </p>
            </div>

            <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-3.5">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                <span className="font-mono uppercase text-[11px]">Equipo y Cuadrilla</span>
                <Users className="w-4 h-4 text-obra-green" />
              </div>
              <p className="text-lg font-mono font-bold text-navy-900 dark:text-white mt-1">
                {usage.integrantesEquipo} usuario(s)
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Roles admin, supervisor y terreno
              </p>
            </div>

            <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-3.5">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                <span className="font-mono uppercase text-[11px]">Cotizaciones Locales</span>
                <FileText className="w-4 h-4 text-obra-orange" />
              </div>
              <p className="text-lg font-mono font-bold text-navy-900 dark:text-white mt-1">
                {usage.cotizacionesGuardadas}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Convertibles en obra en 1 clic
              </p>
            </div>

            <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-3.5">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                <span className="font-mono uppercase text-[11px]">Cobertura IA</span>
                <Sparkles className="w-4 h-4 text-obra-green" />
              </div>
              <p className="text-lg font-mono font-bold text-navy-900 dark:text-white mt-1">
                {plan === "pro_ia"
                  ? "Web + WhatsApp"
                  : plan === "pro"
                    ? "Copiloto Web"
                    : "Básico Manual"}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {plan === "gratis"
                  ? "Actualiza a Pro para cotizar con IA"
                  : "Motor Google Gemini habilitado"}
              </p>
            </div>
          </div>
        </section>

        {/* Tarjetas Comparativas de Planes */}
        <div className="grid md:grid-cols-3 gap-5">
          {PLANES_SUSCRIPCION.map((p) => {
            const precioMensual =
              billingCycle === "anual" && p.precioMensualCLP > 0
                ? Math.round((p.precioMensualCLP * 0.85) / 10) * 10
                : p.precioMensualCLP;
            const totalAnual = precioMensual * 12;
            const isCurrent = p.id === plan;

            return (
              <article
                key={p.id}
                className={`rounded-2xl border p-6 flex flex-col gap-4 transition-all ${
                  p.popular
                    ? "border-2 border-obra-orange bg-white dark:bg-[#141A23] shadow-md"
                    : "border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-navy-900 dark:text-white">
                    {p.nombre}
                  </h2>
                  <span
                    className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                      p.popular
                        ? "bg-obra-orange text-white"
                        : "bg-kraft-100 dark:bg-[#0B0F14] text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {p.badge}
                  </span>
                </div>

                <div>
                  <p className="text-2xl font-mono font-bold text-navy-900 dark:text-white">
                    {formatCLP(precioMensual)}
                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                      {" "}
                      /mes
                    </span>
                  </p>
                  {billingCycle === "anual" && p.precioMensualCLP > 0 && (
                    <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                      Facturado anual: {formatCLP(totalAnual)} / año
                    </p>
                  )}
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {p.descripcion}
                </p>

                <ul className="space-y-2 text-sm flex-1 text-gray-700 dark:text-gray-200">
                  {p.caracteristicas.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="text-obra-green font-bold">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <p className="rounded-xl bg-green-50 dark:bg-emerald-950/40 border border-green-200 dark:border-emerald-800/50 p-3 text-sm font-semibold text-green-800 dark:text-emerald-300 text-center">
                    Plan actual activo
                  </p>
                ) : (
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-obra-orange hover:bg-obra-orange-hover text-white p-3 text-center text-sm font-bold shadow-sm transition-colors"
                    href={buildUpgradeMailto(p.nombre, precioMensual)}
                  >
                    <Mail className="w-4 h-4" />
                    <span>Solicitar cambio a {p.nombre}</span>
                  </a>
                )}
              </article>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-obra-green shrink-0" />
            <span>
              Facturación en CLP para empresas y contratistas en Chile. Los cambios de suscripción se activan con soporte comercial.
            </span>
          </p>
          {plan !== "gratis" && (
            <a
              className="text-sm underline hover:text-obra-orange"
              href="mailto:soporte@obratrack.cl?subject=Cancelar%20suscripcion"
            >
              Solicitar cancelación de suscripción
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm border-t border-kraft-200 dark:border-[#263040] pt-4 text-gray-700 dark:text-gray-300">
          <button
            type="button"
            className="underline hover:text-obra-orange"
            onClick={() => setLegal("terminos")}
          >
            Términos de servicio
          </button>
          <button
            type="button"
            className="underline hover:text-obra-orange"
            onClick={() => setLegal("privacidad")}
          >
            Privacidad (Ley 21.719)
          </button>
          <button
            type="button"
            className="underline hover:text-obra-orange"
            onClick={() => setLegal("ciberseguridad")}
          >
            Seguridad (Ley 21.663)
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 underline font-semibold text-obra-orange"
            onClick={handleExportBackup}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar mis datos íntegros (JSON)</span>
          </button>
        </div>

        {legal && (
          <LegalTermsModal
            key={legal}
            isOpen
            onClose={() => setLegal(null)}
            initialTab={legal}
          />
        )}
      </div>
    </div>
  );
}
