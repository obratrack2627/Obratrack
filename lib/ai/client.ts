"use client";
import { supabase } from "@/lib/supabase/client";
import { dataService } from "@/lib/data-service";
import { executeAI } from "./execute";
import { actionReply } from "./action-reply";
import { isMaterialComparison } from "@/lib/materials/types";
import type { CotizacionEstimacion } from "@/types/database";

export async function aiHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token)
    throw new Error("Inicia sesión nuevamente para usar el asistente.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session.access_token}`,
  };
}
export function aiContext() {
  return {
    proyectos: dataService
      .getProyectos()
      .slice(0, 50)
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        comuna: p.comuna,
        direccion: p.direccion,
        estado: p.estado,
        monto_cotizado: p.monto_cotizado,
        total_pagado: p.total_pagado,
        saldo_pendiente: p.saldo_pendiente,
        actividades: p.actividades?.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          porcentaje_avance: a.porcentaje_avance,
        })),
        trabajadores_ids: p.trabajadores_ids,
      })),
    trabajadores: dataService
      .getUsuarios()
      .map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol })),
    clientes: dataService
      .getClientes()
      .map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono })),
  };
}
export async function requestAI(url: string, body: any) {
  const response = await fetch(url, {
    method: "POST",
    headers: await aiHeaders(),
    body: JSON.stringify({ request_id: crypto.randomUUID(), ...body }),
    signal: AbortSignal.timeout(65000),
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "El servidor no devolvió una respuesta válida. Intenta nuevamente.",
    );
  }
  if (!response.ok || data.error)
    throw new Error(data.error || "No se pudo completar la solicitud.");
  if (!data.respuesta?.trim())
    throw new Error("La IA no incluyó una respuesta válida.");
  return data;
}
export async function applyAIResponse(data: any, projectId?: string) {
  // Una obra recién creada desde WhatsApp puede no existir todavía en la caché de esta pestaña.
  if (data.accion) {
    const current = await dataService.pullFromCloudServer();
    if (!current.success)
      throw new Error(
        "No se pudieron actualizar los datos de la obra. Reintenta antes de aplicar cambios.",
      );
  }
  const action = data.accion
    ? await executeAI(data.accion, projectId)
    : undefined;
  const cotizacion: CotizacionEstimacion | undefined =
    data.cotizacion || undefined;
  if (cotizacion)
    dataService.runLocalAI(() => dataService.saveCotizacion(cotizacion));
  const executed = action?.result || data.accion_ejecutada;
  const draft = data.accion_ejecutada?.detalles?.borrador_registro;
  if (executed && draft) executed.detalles = {...(executed.detalles || {}), borrador_registro:draft};
  for (const key of ['edicion_nombre_pendiente','preferencias_conversacion'])
    if (executed && Object.hasOwn(data.accion_ejecutada?.detalles || {}, key)) executed.detalles={...(executed.detalles || {}),[key]:data.accion_ejecutada.detalles[key]};
  return {
    texto: action?.warning || (action?.result ? actionReply(action.result) : data.respuesta),
    accion_ejecutada: executed,
    cotizacion_generada: cotizacion,
    comparacion_materiales: isMaterialComparison(data.comparacion_materiales)
      ? data.comparacion_materiales
      : undefined,
    pendiente_sincronizacion: action?.pendingId,
    sugerencias: data.sugerencias,
  };
}
