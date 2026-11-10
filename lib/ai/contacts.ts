import { canonicalPhone } from '@/lib/phone';
import { validarRutChileno } from '@/lib/utils';
import { isDeveloperEmail } from '@/lib/auth-utils';
import { AIError } from './errors';

export const teamContactFields = ['nombre', 'email', 'telefono_whatsapp', 'rut'] as const;
export function contactVersion(user: Record<string, any>) {
  return Object.fromEntries(teamContactFields.map(key => [key, user[key] || null]));
}

export function validateContactAction(action: Record<string, any>) {
  const fields = action.tipo === 'actualizar_cliente'
    ? ['nuevo_nombre', 'email', 'telefono', 'rut', 'direccion', 'comuna']
    : ['nuevo_nombre', 'email', 'telefono', 'rut'];
  if (!fields.some(key => action[key] !== undefined))
    throw new AIError('CONTACT_INVALID', 'Indica qué dato quieres actualizar.', 422);
  // Las ediciones de contacto nunca cambian credenciales, roles ni empresa.
  for (const key of ['rol', 'auth_user_id', 'empresa_id', 'is_dev', 'password', 'email_acceso'])
    if (action[key] !== undefined)
      throw new AIError('CONTACT_FORBIDDEN', 'La edición de contactos no cambia roles ni credenciales de acceso.', 403);
  for (const key of fields) {
    if (action[key] === undefined) continue;
    if (typeof action[key] !== 'string')
      throw new AIError('CONTACT_INVALID', 'Los datos de contacto deben ser texto.', 422);
    action[key] = action[key].trim();
  }
  if (action.nuevo_nombre !== undefined && (!action.nuevo_nombre || action.nuevo_nombre.length > 150))
    throw new AIError('CONTACT_INVALID', 'Indica un nombre de hasta 150 caracteres.', 422);
  if (action.email) {
    action.email = action.email.toLowerCase();
    const parts = action.email.split('@');
    const domain = parts[1]?.split('.') || [];
    if (action.email.length > 100 || parts.length !== 2 || !parts[0] || /\s/.test(action.email) || domain.length < 2 || domain.some((s: string) => !s || !/^[a-z\d-]+$/i.test(s)))
      throw new AIError('CONTACT_INVALID', 'Revisa el correo de contacto; por ejemplo, nombre@empresa.cl.', 422);
  }
  if (action.telefono) {
    const phone = canonicalPhone(action.telefono);
    if (!phone || !/^[+\d\s().-]+$/.test(action.telefono)) throw new AIError('CONTACT_INVALID', 'Indica un teléfono válido; puedes usar 9 XXXX XXXX o +56 9 XXXX XXXX.', 422);
    action.telefono = `+${phone}`;
  }
  if (action.rut) {
    if (!/^[\d.kK-]+$/.test(action.rut) || !validarRutChileno(action.rut))
      throw new AIError('CONTACT_INVALID', 'Revisa el RUT y su dígito verificador.', 422);
    const clean = action.rut.replaceAll('.', '').replaceAll('-', '').toUpperCase();
    action.rut = `${clean.slice(0, -1)}-${clean.slice(-1)}`;
  }
  if ((action.direccion?.length || 0) > 1000 || (action.comuna?.length || 0) > 100)
    throw new AIError('CONTACT_INVALID', 'La dirección o comuna es demasiado extensa.', 422);
  return action;
}

export function checkTeamContact(target: any, action: any, users: any[]) {
  if (action.email && isDeveloperEmail(action.email) && action.email !== target.email?.trim().toLowerCase())
    throw new AIError('CONTACT_FORBIDDEN', 'Ese correo está reservado para una cuenta de administración del sistema.', 403);
  const duplicate = users.some(user => user.id !== target.id && (
    (action.email && user.email?.trim().toLowerCase() === action.email) ||
    (action.telefono && canonicalPhone(user.telefono_whatsapp || '') === canonicalPhone(action.telefono)) ||
    (action.rut && user.rut?.replaceAll('.', '').replaceAll('-', '').toUpperCase() === action.rut.replaceAll('-', ''))
  ));
  if (duplicate)
    throw new AIError('CONTACT_DUPLICATE', 'El correo, teléfono o RUT ya está vinculado a otro integrante. Revisa los datos antes de reintentar.', 409);
}

export function contactDatabaseMessage(error: any) {
  const message = String(error?.message || '');
  if (message.includes('CONTACT_CONFLICT')) return 'La ficha cambió mientras la editabas. Vuelve a solicitar el cambio con los datos actuales.';
  if (message.includes('CONTACT_DUPLICATE') || error?.code === '23505') return 'El correo, teléfono o RUT ya está vinculado a otra cuenta. Revisa el dato antes de reintentar.';
  if (message.includes('CONTACT_')) return 'No se pudo actualizar el contacto. Revisa sus datos y los permisos de tu cuenta.';
  if (['PGRST202', '42883', '42703'].includes(error?.code) || message.includes('No se permite modificar cuentas de acceso'))
    return 'La edición de contactos está pendiente de habilitar en la base de datos.';
  return null;
}
