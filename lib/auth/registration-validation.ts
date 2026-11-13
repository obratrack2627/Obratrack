import { canonicalPhone } from '@/lib/phone';
import { validarRutChileno } from '@/lib/utils';

export type RegistrationConflictField = 'rut' | 'telefono' | 'email';

export interface SignUpValidationInput {
  nombre: string;
  rut: string;
  email: string;
  telefono: string;
  empresaNombre?: string;
  signupPassword?: string;
  signupConfirmPassword?: string;
  acceptTerms?: boolean;
  requirePassword?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeEmail(email: string | null | undefined): string {
  return (email || '')
    .replace(/\uFF20/g, '@')
    .replace(/[\s\u00A0\u200B-\u200F\uFEFF]+/g, '');
}

export function isValidEmail(email: string | null | undefined): boolean {
  const clean = sanitizeEmail(email);
  return clean.length > 0 && clean.length <= 254 && EMAIL_REGEX.test(clean);
}

export function normalizeRutKey(rut: string | null | undefined): string {
  return (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

export function normalizePhoneKeyDigits(phone: string | null | undefined): string {
  return canonicalPhone(phone || '');
}

export function validateSignUpFields(args: SignUpValidationInput): string | null {
  if (args.nombre.trim().length < 2) {
    return 'Ingresa tu nombre completo.';
  }
  const cleanRut = args.rut.trim();
  if (cleanRut && !validarRutChileno(cleanRut)) {
    return 'El RUT ingresado no es válido. Revisa el dígito verificador (ej: 12.345.678-5).';
  }
  const cleanEmail = sanitizeEmail(args.email);
  if (!cleanEmail) {
    return 'Ingresa tu correo electrónico.';
  }
  if (!isValidEmail(cleanEmail)) {
    return 'Ingresa un correo electrónico válido (ej: nombre@dominio.cl).';
  }
  if (!canonicalPhone(args.telefono)) {
    return 'Ingresa un número de teléfono válido (ej: +56 9 1234 5678).';
  }
  const empresa = (args.empresaNombre || '').trim();
  if (empresa && empresa.length < 3) {
    return 'El nombre comercial debe tener al menos 3 caracteres.';
  }
  if (args.requirePassword !== false) {
    const pass = args.signupPassword || '';
    const confirm = args.signupConfirmPassword || '';
    if (pass.length < 6) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }
    if (pass !== confirm) {
      return 'Las contraseñas no coinciden.';
    }
    if (!args.acceptTerms) {
      return 'Debes aceptar los Términos y la Política de Privacidad.';
    }
  }
  return null;
}

const CONFLICT_LABELS: Record<RegistrationConflictField, string> = {
  rut: 'RUT',
  telefono: 'número de teléfono',
  email: 'correo electrónico',
};

export function formatRegistrationConflictMessage(
  conflicts: RegistrationConflictField[],
): string {
  const unique = (['rut', 'telefono', 'email'] as RegistrationConflictField[]).filter(
    (field) => conflicts.includes(field),
  );
  if (unique.length === 0) return '';
  if (unique.length === 1) {
    const field = unique[0];
    if (field === 'rut') {
      return 'Ese RUT ya está registrado. Si ya tienes cuenta, inicia sesión o recupera tu contraseña.';
    }
    if (field === 'telefono') {
      return 'Ese número de teléfono ya está registrado. Usa otro número o inicia sesión en tu cuenta.';
    }
    return 'Ese correo electrónico ya está registrado. Inicia sesión o recupera tu contraseña.';
  }
  const labels = unique.map((field) => CONFLICT_LABELS[field]);
  const joined =
    labels.length === 2
      ? `${labels[0]} y ${labels[1]}`
      : `${labels[0]}, ${labels[1]} y ${labels[2]}`;
  return `Ese ${joined} ya están registrados. Si ya tienes cuenta, inicia sesión o recupera tu contraseña.`;
}

export function mapContactDatabaseError(
  error: { code?: string; message?: string } | null | undefined,
): string | null {
  if (!error) return null;
  const code = error.code || '';
  const msg = error.message || '';

  if (msg.includes('CONTACT_INVALID_PHONE')) {
    return 'El teléfono debe ser un número válido (ej: +56 9 1234 5678).';
  }
  if (msg.includes('CONTACT_INVALID_RUT')) {
    return 'El RUT ingresado no es válido. Revisa el formato y dígito verificador.';
  }
  if (msg.includes('CONTACT_INVALID_EMAIL')) {
    return 'El correo electrónico ingresado no es válido.';
  }
  if (msg.includes('CONTACT_RESERVED_EMAIL')) {
    return 'Ese correo electrónico está reservado y no puede asignarse a otro usuario.';
  }
  if (msg.includes('CONTACT_INVALID_NAME') || msg.includes('CONTACT_INVALID')) {
    return 'Revisa el nombre y los datos de contacto ingresados.';
  }
  if (msg.includes('CONTACT_CONFLICT')) {
    return 'Otro usuario actualizó este contacto al mismo tiempo. Recarga e inténtalo nuevamente.';
  }
  if (msg.includes('CONTACT_DUPLICATE')) {
    return 'Ese teléfono, correo o RUT ya está registrado.';
  }
  if (msg.includes('REGISTRATION_DETAILS_REQUIRED')) {
    return 'Completa tu nombre completo y RUT personal para crear la cuenta.';
  }
  if (code === '23505') {
    if (/telefono/i.test(msg)) {
      return 'Ese número de teléfono ya está registrado.';
    }
    if (/rut/i.test(msg)) {
      return 'Ese RUT ya está registrado.';
    }
    if (/email|correo/i.test(msg)) {
      return 'Ese correo electrónico ya está registrado.';
    }
    return 'Uno de los datos ingresados (RUT, teléfono o correo) ya está registrado.';
  }
  return null;
}
