"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProjectTabsHeader from "@/components/ProjectTabsHeader";
import PresupuestosPanel from "@/components/PresupuestosPanel";
import GoogleMapsProjectViewer from "@/components/GoogleMapsProjectViewer";
import { dataService } from "@/lib/data-service";
import type { Cliente, Proyecto } from "@/types/database";
export default function PresupuestosObraPage() {
  const id = useParams()?.id as string;
  const [project, setProject] = useState<Proyecto | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [isMapsModalOpen, setIsMapsModalOpen] = useState(false);
  useEffect(() => {
    const refresh = () => {
      const proj = dataService.getProyectoById(id);
      setProject(proj);
      setCliente(proj?.cliente_id ? dataService.getClienteById(proj.cliente_id) || null : null);
    };
    refresh();
    window.addEventListener("obratrack_cloud_synced", refresh);
    return () => window.removeEventListener("obratrack_cloud_synced", refresh);
  }, [id]);
  return (
    <div className="flex-1">
      <ProjectTabsHeader
        proyecto={project}
        cliente={cliente}
        onOpenMaps={() => setIsMapsModalOpen(true)}
      />
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <PresupuestosPanel projectId={id} />
      </div>
      <GoogleMapsProjectViewer
        proyecto={project}
        isOpen={isMapsModalOpen}
        onClose={() => setIsMapsModalOpen(false)}
      />
    </div>
  );
}
