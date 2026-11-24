import { createHash } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { sendPushIdempotent } from '@/lib/push/server';

export function progressAfter(previous: any, step: string, fields: Record<string, unknown>, question: string, failed = false) {
  const orderedFields = Object.entries(fields).sort(([first], [second]) => first.localeCompare(second));
  const signature = createHash('sha256').update(JSON.stringify([step, orderedFields, question])).digest('hex');
  const repeats = previous?.firma === signature ? (previous.repeticiones || 0) + 1 : Number(failed);
  const seguimiento = { firma: signature, repeticiones: repeats };
  if (repeats < 2) return { seguimiento };
  return { seguimiento, pausa_humana: true, derivacion_humana: step, pendiente_humano: question };
}

export const pausedReply = 'Dejé esta gestión en Reportes de WhatsApp para que la revise un administrador de tu empresa. ObraBot queda en pausa. Para volver a hablar conmigo, escribe «Retomar ObraBot».';
export const resumeBot = (text: string) => /^retomar\s+obra\s*bot[.!]?$/i.test(text.trim());
export const recallsContact = (text: string) => /^(?:pero )?ya (?:te (?:di|envi[eé]|pas[eé]|dije|mand[eé])|lo (?:di|envi[eé]|pas[eé])) (?:el |mi |su |los |esos )?(?:n[uú]mero|tel[eé]fono|celular|correo|datos)(?: del cliente)?[.!]?$/i.test(text.trim());

export function notifyReview(db: any, receipt: any) {
  if (!receipt.acciones?.derivacion_humana) return;
  const task = sendPushIdempotent(db, 'obrabot-revision:' + receipt.message_id, {
    empresaId: receipt.empresa_id, roles: ['admin'], categoria: 'general',
    payload: { title: 'ObraBot necesita revisión', body: 'Hay una gestión pendiente en Reportes de WhatsApp.', url: '/reportes?tipo=revision_humana' },
  }).catch(() => {});
  try { waitUntil(task); } catch { /* El reporte ya está guardado. */ }
}
