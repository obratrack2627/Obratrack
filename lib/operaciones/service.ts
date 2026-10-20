import { supabase } from "@/lib/supabase/client";
import { dataService } from "@/lib/data-service";
import type { CotizacionObra, GestionObra } from "@/types/operaciones";
import { validarCotizacion } from "./calculos";

function empresa() {
  const id = dataService.getActiveUser()?.empresa_id;
  if (!id) throw new Error("Inicia sesión para guardar los cambios.");
  return id;
}
function fallo(error: { message: string; code?: string }) {
  if (["42P01", "PGRST202", "PGRST205"].includes(error.code || "")) {
    throw new Error(
      "Falta habilitar el flujo de obras en la base de datos. Contacta al administrador.",
    );
  }
  throw new Error(error.message || "No se pudo guardar. Intenta nuevamente.");
}
const cotizacion = (r: any): CotizacionObra => ({
  ...r.datos,
  id: r.id,
  empresa_id: r.empresa_id,
  cliente_id: r.cliente_id,
  proyecto_id: r.proyecto_id || undefined,
  revision: r.revision,
  updated_at: r.updated_at,
});
const gestion = (r: any): GestionObra => ({
  ...r.datos,
  proyecto_id: r.proyecto_id,
  empresa_id: r.empresa_id,
  revision: r.revision,
  updated_at: r.updated_at,
});

export const operacionesService = {
  async cargar() {
    const id = empresa();
    const [q, g] = await Promise.all([
      supabase
        .from("cotizaciones_obra")
        .select("*")
        .eq("empresa_id", id)
        .order("updated_at", { ascending: false }),
      supabase.from("gestion_obras").select("*").eq("empresa_id", id),
    ]);
    if (q.error) fallo(q.error);
    if (g.error) fallo(g.error);
    return {
      cotizaciones: (q.data || []).map(cotizacion),
      obras: (g.data || []).map(gestion),
    };
  },
  async guardarCotizacion(c: CotizacionObra) {
    validarCotizacion(c);
    const { data, error } = await supabase.rpc("guardar_cotizacion", {
      d: { ...c, empresa_id: empresa() },
      version: c.revision,
    });
    if (error) fallo(error);
    return cotizacion(Array.isArray(data) ? data[0] : data);
  },
  async convertir(c: CotizacionObra) {
    if (c.estado !== "Aprobada")
      throw new Error("Primero aprueba la cotización.");
    const { data, error } = await supabase.rpc("convertir_cotizacion", {
      cotizacion_id: c.id,
      version: c.revision,
    });
    if (error) fallo(error);
    return data as string;
  },
  async guardarGestion(g: GestionObra) {
    const { data, error } = await supabase.rpc("guardar_gestion", {
      d: { ...g, empresa_id: empresa() },
      version: g.revision,
    });
    if (error) fallo(error);
    return gestion(Array.isArray(data) ? data[0] : data);
  },
};
