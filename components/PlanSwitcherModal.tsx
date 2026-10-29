"use client";
import Link from "next/link";
import { X } from "lucide-react";
import { dataService } from "@/lib/data-service";
import { getPlanDetails } from "@/lib/plans";
export default function PlanSwitcherModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tu suscripción"
    >
      <div className="relative rounded-2xl bg-white dark:bg-gray-900 p-6 max-w-md w-full space-y-4">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">Tu suscripción</h2>
        <p className="text-sm">
          Plan actual:{" "}
          <strong>{getPlanDetails(dataService.getActivePlan()).nombre}</strong>.
        </p>
        <Link
          onClick={onClose}
          href="/planes"
          className="inline-block rounded-xl bg-obra-orange text-white px-4 py-2 text-sm"
        >
          Ver planes
        </Link>
      </div>
    </div>
  );
}
