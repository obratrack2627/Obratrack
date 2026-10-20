"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { dataService } from "@/lib/data-service";
import { operacionesService } from "./service";
import type { Cliente, Proyecto, Usuario } from "@/types/database";
import type { CotizacionObra, GestionObra } from "@/types/operaciones";

export function useOperaciones() {
  const [datos, setDatos] = useState<{
    proyectos: Proyecto[];
    clientes: Cliente[];
    usuarios: Usuario[];
    cotizaciones: CotizacionObra[];
    obras: GestionObra[];
  }>({
    proyectos: [],
    clientes: [],
    usuarios: [],
    cotizaciones: [],
    obras: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const tenant = dataService.getActiveUser()?.empresa_id;
      if (!tenant) throw new Error("Inicia sesión para ver tus obras.");
      const [p, c, u, operacion] = await Promise.all([
        supabase
          .from("proyectos")
          .select(
            "*, cliente:clientes(*), actividades(*), pagos(*), materiales:materiales_proyecto(*), imprevistos(*), bitacora:bitacora_entradas(*)",
          )
          .eq("empresa_id", tenant)
          .order("created_at", { ascending: false }),
        supabase
          .from("clientes")
          .select("*")
          .eq("empresa_id", tenant)
          .order("nombre"),
        supabase
          .from("usuarios")
          .select("*")
          .eq("empresa_id", tenant)
          .order("nombre"),
        operacionesService.cargar(),
      ]);
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      if (u.error) throw u.error;
      const proyectos = (p.data || []).map((row) => ({
        ...row,
        monto_cotizado: Number(row.monto_cotizado || 0),
        pagos: (row.pagos || []).map((x: any) => ({
          ...x,
          monto: Number(x.monto || 0),
        })),
        materiales: (row.materiales || []).map((x: any) => ({
          ...x,
          subtotal: Number(x.subtotal || 0),
        })),
        imprevistos: (row.imprevistos || []).map((x: any) => ({
          ...x,
          monto: Number(x.monto_adicional ?? x.monto ?? 0),
          fecha: x.fecha_reporte || x.fecha,
        })),
        bitacora: (row.bitacora || []).map((x: any) => ({
          ...x,
          fecha: x.fecha?.slice(0, 10),
        })),
      })) as Proyecto[];
      setDatos({
        proyectos,
        clientes: c.data as Cliente[],
        usuarios: u.data as Usuario[],
        ...operacion,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : (e as { message?: string }).message ||
              "No se pudieron cargar los datos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  return { ...datos, loading, error, cargar };
}
