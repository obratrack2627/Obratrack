import { AIError } from '@/lib/ai/errors';

export const ATTENDANCE_MANAGEMENT_MESSAGE = 'La asistencia solo la puede registrar o corregir un supervisor o jefe de obra. Un mensaje del trabajador no acredita su presencia en terreno.';

export function assertAttendanceManager(user: { rol?: string } | null | undefined) {
  if (!user || !['admin', 'supervisor'].includes(user.rol || ''))
    throw new AIError('ATTENDANCE_FORBIDDEN', ATTENDANCE_MANAGEMENT_MESSAGE, 403);
}

export function isAttendanceManagementRequest(message: string) {
  const text = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const command = /\b(?:marca\w*|registr\w*|anot\w*|corrig\w*|actualiz\w*|pon\w*|borra\w*|elimin\w*|cambia\w*|justifica\w*)\b/.test(text);
  const attendance = /\b(?:asistencia|inasistencia|jornada|presente|ausente|atraso|atrasado)\b|\b(?:mi|su|la) (?:entrada|salida)\b|\bhora (?:de )?(?:entrada|salida)\b/.test(text);
  const material = /\b(?:entrada|salida) (?:de )?(?:materiales?|camion|cemento|planchas?|sacos?|mercaderia)\b/.test(text);
  return command && attendance && !material;
}
