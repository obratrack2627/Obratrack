import { supabase } from './client';
import { Usuario } from '@/types/database';
import { supabaseService } from './supabase-service';
import { dataService } from '@/lib/data-service';
import { canAccessWeb, WEB_ACCESS_ERROR } from '@/lib/auth/access';
import { establishWebSession, clearWebSession } from '@/lib/auth/session-client';
import { sanitizeEmail } from '@/lib/auth/registration-validation';

export interface AuthResult {
  success: boolean;
  user?: Usuario;
  error?: string;
  emailConfirmationRequired?: boolean;
  message?: string;
}

// Obtener la URL base para redirecciones (producción o desarrollo local)
export function getRedirectBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'https://obratrack-5zwn.vercel.app';
}

// Mapeo exhaustivo de errores de Supabase Auth en español
export function mapSupabaseAuthError(message: string, code?: string): string {
  const lower = (message || '').toLowerCase();
  const normalizedCode = (code || '').toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'Correo o contraseña incorrectos. Verifica tus credenciales.';
  }
  if (lower.includes('failed to fetch') || lower.includes('fetch failed') || lower.includes('networkerror')) {
    return 'Error de conexión con el servicio de autenticación. Verifica tu conexión o intenta nuevamente.';
  }
  if (
    normalizedCode === 'user_already_exists' ||
    lower.includes('user already registered') ||
    lower.includes('already exists')
  ) {
    return 'Este correo electrónico ya está registrado. Por favor inicia sesión o recupera tu clave.';
  }
  if (lower.includes('database error saving new user')) {
    return 'No se pudo crear la cuenta. Verifica que tu RUT, número de teléfono y correo no estén ya registrados e inténtalo nuevamente.';
  }
  if (lower.includes('contact_duplicate') || lower.includes('duplicate key')) {
    return 'Ese RUT, número de teléfono o correo electrónico ya está registrado.';
  }
  if (lower.includes('contact_invalid_phone')) {
    return 'El número de teléfono ingresado no es válido (ej: +56 9 1234 5678).';
  }
  if (lower.includes('contact_invalid_rut')) {
    return 'El RUT ingresado no es válido. Revisa el dígito verificador.';
  }
  if (lower.includes('registration_details_required')) {
    return 'Completa tu nombre completo y RUT personal para crear la cuenta.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Tu correo aún no ha sido confirmado. Revisa tu bandeja de entrada o solicita un nuevo correo de activación.';
  }
  if (lower.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (
    normalizedCode === 'same_password' ||
    lower.includes('same_password') ||
    lower.includes('new password should be different')
  ) {
    return 'La nueva contraseña debe ser diferente a la contraseña actual.';
  }
  if (
    normalizedCode === 'weak_password' ||
    lower.includes('weak_password') ||
    lower.includes('weak password')
  ) {
    return 'La contraseña es muy débil. Usa al menos 6 caracteres combinando letras y números.';
  }
  if (
    normalizedCode === 'email_address_not_authorized' ||
    lower.includes('email address not authorized')
  ) {
    return 'No se pudo enviar el correo de confirmación porque Supabase sigue usando el correo por defecto (requiere SMTP personalizado o autorizar el correo en el equipo de Supabase).';
  }
  if (
    normalizedCode === 'email_address_invalid' ||
    lower.includes('email_address_invalid') ||
    lower.includes('unable to validate email address') ||
    /email address .* is invalid/i.test(lower)
  ) {
    return 'Supabase Auth rechazó la dirección de correo ingresada. Verifica que no tenga espacios ni caracteres especiales.';
  }
  if (normalizedCode === 'signup_disabled' || lower.includes('signup is disabled')) {
    return 'El registro de nuevas cuentas está deshabilitado temporalmente.';
  }
  if (
    normalizedCode === 'over_email_send_rate_limit' ||
    normalizedCode === 'over_request_rate_limit' ||
    lower.includes('for security purposes, you can only request this') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    return 'Demasiados intentos seguidos. Por favor espera un momento e intenta nuevamente.';
  }
  if (lower.includes('token has expired') || lower.includes('token expired') || lower.includes('invalid token')) {
    return 'El enlace de confirmación o recuperación ha expirado o es inválido. Solicita uno nuevo.';
  }
  if (lower.includes('user not found')) {
    return 'No se encontró ninguna cuenta asociada a este correo electrónico.';
  }
  return message || 'Ocurrió un error de autenticación en Supabase.';
}

async function ownProfile(): Promise<Usuario> {
  const { data, error } = await supabase.rpc('completar_registro_actual');
  const profile = Array.isArray(data) ? data[0] : data;
  if (error || !profile?.id || !profile?.empresa_id) throw new Error('No se pudo completar el perfil de tu empresa. Revisa los datos de registro o contacta con administración.');
  const company = await supabaseService.getEmpresaById(profile.empresa_id);
  return { ...profile, empresa_nombre: company?.nombre || '' } as Usuario;
}
async function activateProfile(usuario: Usuario, token: string) {
  if (!canAccessWeb(usuario)) {
    await supabase.auth.signOut();
    await clearWebSession();
    dataService.clearActiveUser();
    throw new Error(WEB_ACCESS_ERROR);
  }
  await establishWebSession(token);
  const previous = dataService.getActiveUser();
  if (!previous || previous.id !== usuario.id || previous.empresa_id !== usuario.empresa_id) dataService.clearChatSessionHistory();
  dataService.setActiveUser(usuario);
}

export async function resumeSupabaseSession(): Promise<AuthResult | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) return null;
  try {
    const usuario = await ownProfile();
    await activateProfile(usuario, data.session.access_token);
    await dataService.loadTenantDataFromSupabase(usuario.empresa_id);
    return { success: true, user: usuario };
  } catch (cause) { return { success: false, error: (cause as Error).message }; }
}

/**
 * Registro de un nuevo Dueño / Contratista con aislamiento Multi-Tenant en Supabase PostgreSQL
 * y envío automático de correo de confirmación de cuenta
 */
async function precheckRegistration(payload: {
  nombre: string;
  rut: string;
  email: string;
  telefono: string;
  empresaNombre: string;
}): Promise<string | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch('/api/auth/validar-registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.status >= 400 && response.status < 500 && response.status !== 404) {
      const data = await response.json().catch(() => null);
      if (data?.error && typeof data.error === 'string') {
        return data.error;
      }
    }
  } catch {
    // Si la prevalidación no responde por red, Supabase Auth aplica las restricciones en servidor.
  }
  return null;
}

export async function signUpWithSupabase(
  email: string,
  pass: string,
  nombre: string,
  rut: string,
  empresaNombre: string,
  telefono: string = '+56 9 '
): Promise<AuthResult> {
  const cleanEmail = sanitizeEmail(email).toLowerCase();
  const baseUrl = getRedirectBaseUrl();

  try {
    const precheckError = await precheckRegistration({
      nombre: nombre.trim(),
      rut: rut.trim(),
      email: cleanEmail,
      telefono: telefono.trim(),
      empresaNombre: empresaNombre.trim(),
    });
    if (precheckError) {
      return {
        success: false,
        error: precheckError,
      };
    }

    // 1. Registro en Supabase Auth con callback para confirmación de correo
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: pass,
      options: {
        emailRedirectTo: `${baseUrl}/auth/callback?next=/dashboard`,
        data: {
          display_name: nombre.trim(),
          rut: rut.trim(),
          empresa_nombre: empresaNombre.trim() || nombre.trim(),
          telefono: telefono.trim(),
        },
      },
    });

    if (authError) {
      return {
        success: false,
        error: mapSupabaseAuthError(authError.message, (authError as { code?: string }).code),
      };
    }

    if (Array.isArray(authData?.user?.identities) && authData.user.identities.length === 0) {
      return {
        success: false,
        error: 'Este correo electrónico ya está registrado. Por favor inicia sesión o recupera tu contraseña.',
      };
    }

    const emailConfirmationRequired = !authData.session;
    let usuario: Usuario | undefined;
    if (!emailConfirmationRequired) {
      usuario = await ownProfile();
      await activateProfile(usuario, authData.session!.access_token);
      await dataService.loadTenantDataFromSupabase(usuario.empresa_id);
    }

    return {
      success: true,
      user: usuario,
      emailConfirmationRequired,
      message: emailConfirmationRequired
        ? `Te hemos enviado un correo de confirmación a ${cleanEmail}. Por favor revisa tu bandeja de entrada o spam para activar tu cuenta.`
        : 'Cuenta creada con éxito.',
    };
  } catch (error: any) {
    console.error('Error en signUpWithSupabase:', error);
    return {
      success: false,
      error: mapSupabaseAuthError(error.message || 'Error al crear la cuenta en Supabase.'),
    };
  }
}

/**
 * Inicio de sesión seguro en Supabase Auth con resolución de email o RUT
 */
export async function signInWithSupabase(emailOrRut: string, pass: string): Promise<AuthResult> {
  const cleanInput = (emailOrRut.includes('@') ? sanitizeEmail(emailOrRut) : emailOrRut.trim()).toLowerCase();
  let resolvedEmail = cleanInput;

  // Si no es un email pero parece RUT chileno, resolver el email correspondiente
  if (!cleanInput.includes('@')) {
    const cleanDigits = cleanInput.replace(/[^a-z0-9]/g, '');
    try {
      const storedUsers = dataService.getUsuarios();
      const match = storedUsers.find((u) => {
        const uRut = (u.rut || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return uRut.length >= 7 && uRut === cleanDigits;
      });
      if (match && (match.email_acceso || match.email)) {
        resolvedEmail = (match.email_acceso || match.email).toLowerCase();
      } else {
        // Fallback robusto: consultar directamente a Supabase PostgreSQL
        const dbUser = await supabaseService.getUsuarioByRut(cleanDigits);
        if (dbUser && (dbUser.email_acceso || dbUser.email)) {
          resolvedEmail = (dbUser.email_acceso || dbUser.email).toLowerCase();
        }
      }
    } catch (err) {
      console.warn('Error resolviendo usuario por RUT:', err);
    }
  }

  try {
    // 1. Iniciar sesión contra Supabase Auth
    let authData: any = null;
    let authError: any = null;

    const initialAttempt = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: pass,
    });
    authData = initialAttempt.data;
    authError = initialAttempt.error;

    if (authError) {
      return {
        success: false,
        error: mapSupabaseAuthError(authError.message, (authError as { code?: string }).code),
      };
    }

    if (!authData?.user?.id || !authData.session) return { success: false, error: 'No se pudo iniciar una sesión válida.' };
    const usuario = await ownProfile();
    await activateProfile(usuario, authData.session.access_token);
    await dataService.loadTenantDataFromSupabase(usuario.empresa_id);

    return { success: true, user: usuario };
  } catch (error: any) {
    console.error('Error en signInWithSupabase:', error);
    return {
      success: false,
      error: mapSupabaseAuthError(error.message || 'Error al iniciar sesión en Supabase.'),
    };
  }
}

/**
 * Cerrar sesión en Supabase Auth y limpiar almacenamiento local
 */
export async function signOutSupabase(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Error cerrando sesión en Supabase:', err);
  } finally {
    dataService.clearActiveUser();
    await clearWebSession();
  }
}

/**
 * Restablecer contraseña mediante Supabase Auth enviando correo con enlace seguro
 */
export async function resetPasswordWithSupabase(email: string): Promise<AuthResult> {
  const cleanEmail = sanitizeEmail(email).toLowerCase();
  const baseUrl = getRedirectBaseUrl();

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${baseUrl}/auth/callback?next=/actualizar-password`,
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseAuthError(error.message, (error as { code?: string }).code),
      };
    }

    return {
      success: true,
      message: 'Te hemos enviado un correo con instrucciones para restablecer tu contraseña. Por favor revisa tu bandeja de entrada o spam.',
    };
  } catch (error: any) {
    console.error('Error en resetPasswordWithSupabase:', error);
    return {
      success: false,
      error: mapSupabaseAuthError(error.message || 'Error al enviar correo de recuperación.'),
    };
  }
}

/**
 * Actualizar contraseña del usuario autenticado en Supabase Auth
 */
export async function updatePasswordWithSupabase(newPassword: string): Promise<AuthResult> {
  try {
    if (!newPassword || newPassword.length < 6) {
      return {
        success: false,
        error: 'La nueva contraseña debe tener al menos 6 caracteres.',
      };
    }

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseAuthError(error.message, (error as { code?: string }).code),
      };
    }

    return {
      success: true,
      message: 'Tu contraseña ha sido actualizada exitosamente.',
    };
  } catch (error: any) {
    console.error('Error en updatePasswordWithSupabase:', error);
    return {
      success: false,
      error: mapSupabaseAuthError(error.message || 'Error al actualizar contraseña.'),
    };
  }
}

/**
 * Reenviar correo de confirmación de registro
 */
export async function resendConfirmationEmail(email: string): Promise<AuthResult> {
  const cleanEmail = sanitizeEmail(email).toLowerCase();
  const baseUrl = getRedirectBaseUrl();

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
      options: {
        emailRedirectTo: `${baseUrl}/auth/callback?next=/dashboard`,
      },
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseAuthError(error.message, (error as { code?: string }).code),
      };
    }

    return {
      success: true,
      message: `Correo de confirmación reenviado a ${cleanEmail}. Por favor revisa tu bandeja.`,
    };
  } catch (error: any) {
    console.error('Error en resendConfirmationEmail:', error);
    return {
      success: false,
      error: mapSupabaseAuthError(error.message || 'Error al reenviar correo de confirmación.'),
    };
  }
}
