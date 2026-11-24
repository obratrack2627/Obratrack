"use client";
import { supabase } from "@/lib/supabase/client";
import { dataService } from "@/lib/data-service";
import { executeAI } from "./execute";
import { actionReply } from "./action-reply";
import { isMaterialComparison } from "@/lib/materials/types";
import type { CotizacionEstimacion } from "@/types/database";
import { createdProjectTeamDraft } from './team-assignment';

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
export async function requestAI(url: string, body: any, externalSignal?: AbortSignal) {
  const timeoutSignal = AbortSignal.timeout(65000);
  const signal =
    externalSignal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([timeoutSignal, externalSignal])
      : externalSignal || timeoutSignal;
  const response = await fetch(url, {
    method: "POST",
    headers: await aiHeaders(),
    body: JSON.stringify({ request_id: crypto.randomUUID(), ...body }),
    signal,
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

export async function requestAIStream(
  url: string,
  body: any,
  callbacks?: { onStage?: (stage: string) => void; onText?: (text: string) => void },
  externalSignal?: AbortSignal,
) {
  const timeoutSignal = AbortSignal.timeout(65000);
  const signal =
    externalSignal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([timeoutSignal, externalSignal])
      : externalSignal || timeoutSignal;
  const baseHeaders = await aiHeaders();
  const response = await fetch(url, {
    method: "POST",
    headers: { ...baseHeaders, Accept: "text/event-stream" },
    body: JSON.stringify({ request_id: crypto.randomUUID(), ...body }),
    signal,
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.error) {
      throw new Error(data?.error || "No se pudo completar la solicitud.");
    }
    if (!data.respuesta?.trim()) throw new Error("La IA no incluyó una respuesta válida.");
    callbacks?.onText?.(data.respuesta);
    return data;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalData: any = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let eventName = "message";
      let dataStr = "";
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
      }
      if (!dataStr) continue;
      let parsed: any;
      try { parsed = JSON.parse(dataStr); } catch { continue; }
      if (eventName === "stage" && typeof parsed?.stage === "string") {
        callbacks?.onStage?.(parsed.stage);
      } else if (eventName === "delta" && typeof parsed?.text === "string") {
        callbacks?.onText?.(parsed.text);
      } else if (eventName === "done") {
        finalData = parsed;
      } else if (eventName === "error") {
        streamError = parsed?.error || "No se pudo completar la solicitud.";
      }
    }
  }
  if (streamError) throw new Error(streamError);
  if (!finalData || !finalData.respuesta?.trim()) {
    throw new Error("El servidor no devolvió una respuesta completa. Intenta nuevamente.");
  }
  return finalData;
}

export async function downloadProtectedFile(url: string, fallbackName = "ObraTrack_Archivo") {
  const headers = await aiHeaders();
  const res = await fetch(url, { headers: { Authorization: headers.Authorization } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "No se pudo descargar el archivo.");
  }
  const cd = res.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(cd);
  const filename = match?.[1] || fallbackName;
  const blobUrl = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
}

export function describeCriticalAction(accion: any): string | null {
  if (!accion) return null;
  const list = accion.tipo === "lote_acciones" && Array.isArray(accion.acciones) ? accion.acciones : [accion];
  for (const item of list) {
    if (item?.tipo === "eliminar_proyecto") {
      return `Eliminar la obra${item.proyecto_nombre ? ` «${item.proyecto_nombre}»` : ""}`;
    }
    if (item?.tipo === "eliminar_evento") {
      return `Eliminar el compromiso «${item.titulo || "de la agenda"}»`;
    }
    if (item?.tipo === "actualizar_proyecto" && item.estado === "cancelada") {
      return `Marcar la obra${item.proyecto_nombre ? ` «${item.proyecto_nombre}»` : ""} como cancelada`;
    }
  }
  return null;
}

export async function applyAIResponse(
  data: any,
  projectId?: string,
  options?: { confirmCritical?: boolean },
) {
  const criticalSummary = options?.confirmCritical ? describeCriticalAction(data.accion) : null;
  if (criticalSummary) {
    return {
      texto: data.respuesta,
      confirmacion_pendiente: {
        resumen: criticalSummary,
        rawResponse: { ...data },
      },
      sugerencias: data.sugerencias,
    };
  }
  // Una obra recién creada desde WhatsApp puede no existir todavía en la caché de esta pestaña.
  if (data.accion) {
    const current = await dataService.pullFromCloudServer();
    if (!current.success)
      throw new Error(
        "No se pudieron actualizar los datos de la obra. Reintenta antes de aplicar cambios.",
      );
  }
  const savedDestination = data.accion_ejecutada?.tipo === 'obrabot_destino_cotizacion';
  const refreshed = savedDestination ? await dataService.pullFromCloudServer().catch(() => null) : null;
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
  const teamDraft = !action?.pendingId && !action?.warning ? createdProjectTeamDraft(action?.result) : undefined;
  if (executed && teamDraft) executed.detalles = {...(executed.detalles || {}), borrador_registro: {items: [], asignacion: teamDraft}};
  for (const key of ['edicion_nombre_pendiente','preferencias_conversacion'])
    if (executed && Object.hasOwn(data.accion_ejecutada?.detalles || {}, key)) executed.detalles={...(executed.detalles || {}),[key]:data.accion_ejecutada.detalles[key]};
  const actionText = action?.result
    ? [
        typeof data.respuesta_consulta === 'string' ? data.respuesta_consulta.trim() : '',
        actionReply(action.result),
        typeof data.respuesta_adicional === 'string' ? data.respuesta_adicional.trim() : '',
      ]
        .filter(Boolean)
        .filter((part, index, list) => list.indexOf(part) === index)
        .join('\n\n')
    : '';
  return {
    texto: action?.warning || actionText || (savedDestination && !refreshed?.success
      ? `${data.respuesta}\n\nActualiza la página para cargar los datos de la obra.`
      : data.respuesta),
    accion_ejecutada: executed,
    cotizacion_generada: cotizacion,
    comparacion_materiales: isMaterialComparison(data.comparacion_materiales)
      ? data.comparacion_materiales
      : undefined,
    pendiente_sincronizacion: action?.pendingId,
    job_id: action?.jobId,
    sugerencias: data.sugerencias,
  };
}
