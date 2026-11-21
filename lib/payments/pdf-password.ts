/**
 * Obtiene los últimos 4 dígitos numéricos del cuerpo del RUT (sin guion ni dígito verificador)
 * para proteger con contraseña el PDF del Estado de Pago.
 */
export function deriveEdpPdfPassword(rut?: string | null): string | null {
  const raw = (rut || '').trim();
  if (!raw) return null;
  const bodyPart = raw.includes('-')
    ? raw.split('-')[0]
    : raw.replace(/[^0-9kK]/g, '').length >= 7
      ? raw.replace(/[^0-9kK]/g, '').slice(0, -1)
      : raw;
  const digits = bodyPart.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}
