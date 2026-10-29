"use client";
import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { dataService } from "@/lib/data-service";
import { PLANES_SUSCRIPCION, getPlanDetails } from "@/lib/plans";
import type { SubscriptionPlanId } from "@/types/database";
import { formatCLP } from "@/lib/utils";
import LegalTermsModal from "@/components/LegalTermsModal";
import { exportService } from "@/lib/export-service";
export default function PlanesPage() {
  const [plan, setPlan] = useState<SubscriptionPlanId>("gratis");
  const [legal, setLegal] = useState<
    "terminos" | "privacidad" | "ciberseguridad" | null
  >(null);
  useEffect(() => {
    const refresh = () => setPlan(dataService.getActivePlan());
    refresh();
    window.addEventListener("obratrack_cloud_synced", refresh);
    return () => window.removeEventListener("obratrack_cloud_synced", refresh);
  }, []);
  return (
    <div className="flex-1">
      <Navbar
        title="Planes y suscripción"
        subtitle={`Tu plan actual: ${getPlanDetails(plan).nombre}`}
      />
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="grid md:grid-cols-3 gap-5">
          {PLANES_SUSCRIPCION.map((p) => (
            <article
              key={p.id}
              className="rounded-2xl border bg-white p-6 flex flex-col gap-4"
            >
              <h2 className="text-xl font-bold">{p.nombre}</h2>
              <p className="text-2xl font-mono font-bold">
                {formatCLP(p.precioMensualCLP)}
                <span className="text-sm font-normal"> /mes</span>
              </p>
              <p className="text-sm text-gray-600">{p.descripcion}</p>
              <ul className="space-y-2 text-sm flex-1">
                {p.caracteristicas.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              {p.id === plan ? (
                <p className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
                  Plan actual
                </p>
              ) : (
                <a
                  className="rounded-xl bg-obra-orange text-white p-3 text-center text-sm"
                  href={`mailto:soporte@obratrack.cl?subject=${encodeURIComponent("Solicitud de " + p.nombre)}`}
                >
                  Solicitar cambio de plan
                </a>
              )}
            </article>
          ))}
        </div>
        <p className="text-sm text-gray-600">
          Los cambios de suscripción se coordinan con soporte.
        </p>
        {plan !== "gratis" && (
          <a
            className="inline-block text-sm underline"
            href="mailto:soporte@obratrack.cl?subject=Cancelar%20suscripcion"
          >
            Solicitar cancelación de suscripción
          </a>
        )}
        <div className="flex flex-wrap gap-4 text-sm border-t pt-4">
          <button className="underline" onClick={() => setLegal("terminos")}>
            Términos de servicio
          </button>
          <button className="underline" onClick={() => setLegal("privacidad")}>
            Privacidad
          </button>
          <button
            className="underline"
            onClick={() => setLegal("ciberseguridad")}
          >
            Seguridad
          </button>
          <button
            className="underline"
            onClick={() => exportService.exportAllDataAsJSON()}
          >
            Exportar mis datos
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
