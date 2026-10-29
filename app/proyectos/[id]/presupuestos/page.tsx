"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProjectTabsHeader from "@/components/ProjectTabsHeader";
import PresupuestosPanel from "@/components/PresupuestosPanel";
import { dataService } from "@/lib/data-service";
import type { Proyecto } from "@/types/database";
export default function PresupuestosObraPage() {
  const id = useParams()?.id as string;
  const [project, setProject] = useState<Proyecto | null>(null);
  useEffect(() => {
    const refresh = () => setProject(dataService.getProyectoById(id));
    refresh();
    window.addEventListener("obratrack_cloud_synced", refresh);
    return () => window.removeEventListener("obratrack_cloud_synced", refresh);
  }, [id]);
  return (
    <div className="flex-1">
      <Navbar
        title="Presupuestos"
        subtitle={project?.nombre || "Presupuestos de la obra"}
      />
      <ProjectTabsHeader proyecto={project} />
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <PresupuestosPanel projectId={id} />
      </div>
    </div>
  );
}
