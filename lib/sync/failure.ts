import { AIError } from "@/lib/ai/errors";

/** Traducir rechazos de escritura sin exponer SQL, valores ni detalles de la base. */
export function syncWriteFailure(
  error: { code?: string; message?: string },
  record: string,
) {
  let reason = "El servidor no pudo guardarlo. Inténtalo nuevamente.";
  if (error.code === "23503")
    reason =
      "Una obra, cliente o trabajador asociado ya no está disponible. Revisa su asignación.";
  else if (error.code === "23505")
    reason =
      "Uno de sus datos ya está registrado. Revisa los datos duplicados.";
  else if (
    ["23502", "23514", "22P02", "22007", "22008"].includes(error.code || "")
  )
    reason = "Revisa sus campos obligatorios, fechas y estado.";
  else if (
    error.code === "42501" ||
    (error.code === "P0001" &&
      /FORBIDDEN|PRIVILEGES|RESERVED/.test(error.message || ""))
  )
    reason = "La cuenta no tiene permiso para guardar este cambio.";
  else if (["PGRST204", "42703", "42P01"].includes(error.code || ""))
    reason = "Hay un problema de compatibilidad al guardar este registro.";
  return new AIError(
    "SYNC_SAVE",
    `No se pudo guardar ${record.slice(0, 160)}. ${reason} Los cambios siguen pendientes en este dispositivo.`,
    503,
  );
}

const publicCodes = new Set([
  "SYNC_SAVE",
  "SYNC_INVALID",
  "SYNC_FORBIDDEN",
  "PROJECT_FORBIDDEN",
  "TENANT_REQUIRED",
  "WEB_ROLE_FORBIDDEN",
  "DATABASE_READ",
  "SYNC_VERSION",
  "ORIGIN_FORBIDDEN",
]);
export function syncFailureMessage(status: number, payload: unknown): string {
  if (status === 401)
    return "Tu sesión necesita renovarse. Vuelve a iniciar sesión; los cambios pendientes se conservan en este dispositivo.";
  if (
    payload &&
    typeof payload === "object" &&
    "code" in payload &&
    "error" in payload &&
    publicCodes.has(String(payload.code)) &&
    typeof payload.error === "string" &&
    payload.error.trim()
  )
    return payload.error.slice(0, 600);
  return "No se pudieron subir los cambios de este dispositivo. Se conservan para reintentar.";
}
