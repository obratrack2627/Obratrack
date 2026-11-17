"use client";
import Navbar from "@/components/Navbar";
import WhatsAppJefePanel from "@/components/WhatsAppJefePanel";
export default function ReportesWhatsAppPage() {
  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Navbar
        title="Reportes"
        subtitle="Actividad de terreno, evidencias fotográficas y avisos al equipo."
      />
      <div className="p-4 md:p-6 max-w-7xl mx-auto w-full">
        <WhatsAppJefePanel />
      </div>
    </div>
  );
}
