import { supabase } from './client';
import { Usuario } from '@/types/database';
import { isDeveloperEmail } from '@/lib/auth-utils';
import { supabaseService } from './supabase-service';
import { dataService } from '@/lib/data-service';

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
  return process.env.NEXT_PUBLIC_APP_URL || 'https://obra-track-ruddy.vercel.app';
}

// Mapeo exhaustivo de errores de Supabase Auth en español
function mapSupabaseAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'Correo o contraseña incorrectos. Verifica tus credenciales.';
  }
  if (lower.includes('failed to fetch') || lower.includes('fetch failed') || lower.includes('networkerror')) {
    return 'Error de conexión con el servicio de autenticación. Verifica tu conexión o intenta nuevamente.';
  }
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return 'Este correo electrónico ya está registrado. Por favor inicia sesión o recupera tu clave.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Tu correo aún no ha sido confirmado. Revisa tu bandeja de entrada o solicita un nuevo correo de activación.';
  }
  if (lower.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
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

/**
 * Registro de un nuevo Dueño / Contratista con aislamiento Multi-Tenant en Supabase PostgreSQL
 * y envío automático de correo de confirmación de cuenta
 */
export async function signUpWithSupabase(
  email: string,
  pass: string,
  nombre: string,
  rut: string,
  empresaNombre: string,
  telefono: string = '+56 9 '
): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  const isDev = isDeveloperEmail(cleanEmail);
  const baseUrl = getRedirectBaseUrl();

  try {
    // 1. Registro en Supabase Auth con callback para confirmación de correo
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: pass,
      options: {
        emailRedirectTo: `${baseUrl}/auth/callback?next=/dashboard`,
        data: {
          display_name: nombre.trim(),
          rut: rut.trim(),
          empresa_nombre: empresaNombre.trim(),
          telefono: telefono.trim(),
        },
      },
    });

    if (authError) {
      return {
        success: false,
        error: mapSupabaseAuthError(authError.message),
      };
    }

    const authUserId = authData.user?.id || 'usr-' + Date.now();

    // 2. Multi-tenant: empresa única para nuevo usuario, o la base si es desarrollador
    const empresaId = isDev ? 'e1111111-1111-4111-a111-111111111111' : 'emp-' + Date.now();
    const planId = isDev ? 'pro_ia' : 'gratis';

    // 3. Crear empresa en Supabase PostgreSQL
    await supabaseService.saveEmpresa({
      id: empresaId,
      nombre: isDev ? 'Constructora ObraTrack SpA' : empresaNombre.trim(),
      rut: isDev ? '76.123.456-7' : rut.trim(),
      plan_id: planId,
    });

    const usuario: Usuario = {
      id: authUserId,
      nombre: nombre.trim(),
      email: cleanEmail,
      rol: 'admin',
      telefono_whatsapp: telefono.trim(),
      rut: rut.trim(),
      empresa_nombre: empresaNombre.trim(),
      empresa_id: empresaId,
      auth_user_id: authUserId,
      is_dev: isDev,
      created_at: new Date().toISOString(),
    };

    // 4. Crear registro en tabla relacional usuarios de Supabase
    await supabaseService.saveUsuario(usuario);

    // 5. Verificar si Supabase requiere confirmación de email (session es null al requerir confirmación)
    const emailConfirmationRequired = !authData.session;

    if (!emailConfirmationRequired) {
      // Si el proyecto tiene autoconfirmación habilitada, se inicia sesión inmediatamente
      dataService.setActiveUser(usuario);
      await dataService.loadTenantDataFromSupabase(empresaId);

      if (typeof window !== 'undefined') {
        document.cookie = `obratrack_auth_token=${authUserId}; path=/; max-age=2592000; SameSite=Lax`;
      }
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
  const cleanInput = emailOrRut.trim().toLowerCase();
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
      if (match && match.email) {
        resolvedEmail = match.email.toLowerCase();
      } else {
        // Fallback robusto: consultar directamente a Supabase PostgreSQL
        const dbUser = await supabaseService.getUsuarioByRut(cleanDigits);
        if (dbUser && dbUser.email) {
          resolvedEmail = dbUser.email.toLowerCase();
        }
      }
    } catch (err) {
      console.warn('Error resolviendo usuario por RUT:', err);
    }
  }

  try {
    const isDev = isDeveloperEmail(resolvedEmail);

    // 1. Iniciar sesión contra Supabase Auth
    let authData: any = null;
    let authError: any = null;

    const initialAttempt = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: pass,
    });
    authData = initialAttempt.data;
    authError = initialAttempt.error;

    // Si es desarrollador y falló la contraseña o el usuario no estaba sincronizado, auto-sincronizar
    if (authError && isDev) {
      try {
        const syncRes = await fetch('/api/auth/dev-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: resolvedEmail, password: pass }),
        });
        if (syncRes.ok) {
          const retry = await supabase.auth.signInWithPassword({
            email: resolvedEmail,
            password: pass,
          });
          if (!retry.error) {
            authData = retry.data;
            authError = null;
          }
        }
      } catch (syncErr) {
        console.warn('Error en dev-sync fallback:', syncErr);
      }
    }

    if (authError) {
      return {
        success: false,
        error: mapSupabaseAuthError(authError.message),
      };
    }

    const authUserId = authData.user?.id || 'usr-' + Date.now();

    // 2. Obtener perfil del usuario desde PostgreSQL en Supabase
    let usuario = await supabaseService.getUsuarioByEmail(resolvedEmail);

    if (!usuario) {
      const empresaId = isDev ? 'e1111111-1111-4111-a111-111111111111' : 'emp-' + Date.now();
      usuario = {
        id: authUserId,
        nombre: authData.user?.user_metadata?.display_name || resolvedEmail.split('@')[0],
        email: resolvedEmail,
        rol: 'admin',
        telefono_whatsapp: '+56 9 ',
        empresa_id: empresaId,
        auth_user_id: authUserId,
        is_dev: isDev,
        created_at: new Date().toISOString(),
      };
      await supabaseService.saveUsuario(usuario);
    } else {
      if (isDev) {
        usuario.is_dev = true;
      }
    }

    // 3. Activar usuario y cargar datos del inquilino desde Supabase
    dataService.setActiveUser(usuario);
    await dataService.loadTenantDataFromSupabase(usuario.empresa_id);

    if (typeof window !== 'undefined') {
      document.cookie = `obratrack_auth_token=${authUserId}; path=/; max-age=2592000; SameSite=Lax`;
    }

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
    if (typeof window !== 'undefined') {
      document.cookie = 'obratrack_auth_token=; path=/; max-age=0; SameSite=Lax';
    }
  }
}

/**
 * Restablecer contraseña mediante Supabase Auth enviando correo con enlace seguro
 */
export async function resetPasswordWithSupabase(email: string): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  const baseUrl = getRedirectBaseUrl();

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${baseUrl}/auth/callback?next=/actualizar-password`,
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseAuthError(error.message),
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
        error: mapSupabaseAuthError(error.message),
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
  const cleanEmail = email.trim().toLowerCase();
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
        error: mapSupabaseAuthError(error.message),
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
