import { Usuario } from '@/types/database';

/**
 * Correos autorizados exclusivamente como Desarrolladores / SuperAdmin de ObraTrack.
 * Tienen la capacidad de alternar planes libremente para demostraciones y pruebas.
 */
export const DEVELOPER_EMAILS: readonly string[] = [
  'obratrack2627@gmail.com',
  'benja105.achavar@gmail.com',
];

/**
 * Comprueba si una dirección de correo pertenece al desarrollador del sistema.
 */
export function isDeveloperEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return DEVELOPER_EMAILS.includes(clean);
}

/**
 * Comprueba si un usuario posee privilegios de desarrollador (ya sea por flag en BD o correo).
 */
export function isDeveloperUser(user?: Usuario | null): boolean {
  if (!user) return false;
  if (user.is_dev === true) return true;
  return isDeveloperEmail(user.email);
}
