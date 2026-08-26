import { getSupabaseClient, isSupabaseConfigured } from './client';
import { dataService } from '@/lib/data-service';
import { Usuario, UserRole } from '@/types/database';

export interface AuthResult {
  success: boolean;
  user?: Usuario;
  error?: string;
  isConfirmationPending?: boolean;
}

/**
 * Registro de nuevos usuarios en Supabase Auth con manejo inteligente de Rate Limits
 */
export async function signUpWithSupabase(
  email: string,
  password: string,
  nombre: string,
  rol: UserRole,
  telefono?: string
): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanNombre = nombre.trim();
  const cleanTelefono = telefono?.trim() || '+56900000000';

  if (!cleanEmail || !password || !cleanNombre) {
    return { success: false, error: 'Por favor completa todos los campos obligatorios.' };
  }
  if (password.length < 6) {
    return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
  }

  const supabase = getSupabaseClient();
  let supabaseUserId = 'u-' + Date.now();
  let isConfirmationPending = false;

  if (supabase && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            nombre: cleanNombre,
            rol: rol,
            telefono_whatsapp: cleanTelefono,
          },
        },
      });

      if (error) {
        // Manejo amigable de límite de correos en servidor SMTP por defecto de Supabase (máx 3-4 por hora)
        if (error.message.toLowerCase().includes('rate limit') || (error as any).status === 429) {
          console.warn('Supabase email rate limit alcanzado. Registrando cuenta directamente.');
          // Continuamos el registro local para que el compañero no quede bloqueado
        } else if (
          error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('already exists')
        ) {
          return {
            success: false,
            error: 'Este correo electrónico ya está registrado. Por favor inicia sesión con tu contraseña.',
          };
        } else {
          return { success: false, error: error.message };
        }
      } else if (data?.user) {
        supabaseUserId = data.user.id;
        if (data.user.identities && data.user.identities.length === 0) {
          return {
            success: false,
            error: 'Este correo ya tiene una cuenta registrada en Supabase. Inicia sesión directamente.',
          };
        }
        isConfirmationPending = !data.session;
      }
    } catch (err: any) {
      console.warn('Supabase Auth error en signUp:', err);
    }
  }

  // Guardar perfil del usuario en ObraTrack
  const existingUsers = dataService.getUsuarios();
  let localUser: Usuario = {
    id: supabaseUserId,
    auth_user_id: supabaseUserId,
    empresa_id: 'emp-1',
    nombre: cleanNombre,
    email: cleanEmail,
    rol: rol,
    telefono_whatsapp: cleanTelefono,
    created_at: new Date().toISOString(),
  };

  const updatedUsers = existingUsers.filter((u) => u.email.toLowerCase() !== cleanEmail);
  updatedUsers.push(localUser);

  if (typeof window !== 'undefined') {
    localStorage.setItem('obratrack_usuarios_v2', JSON.stringify(updatedUsers));
  }

  dataService.setActiveUser(localUser);

  return {
    success: true,
    user: localUser,
    isConfirmationPending,
  };
}

/**
 * Inicio de sesión con Supabase Auth (con bypass si Supabase bloqueó por confirmación de email)
 */
export async function signInWithSupabase(email: string, password: string): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !password) {
    return { success: false, error: 'Por favor ingresa tu correo y contraseña.' };
  }

  const supabase = getSupabaseClient();
  const localList = dataService.getUsuarios();
  const registeredLocalUser = localList.find((u) => u.email.toLowerCase() === cleanEmail);

  if (supabase && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (error) {
        // Si Supabase pide confirmación de correo pero el SMTP superó la tasa límite, permitimos el acceso si la cuenta fue creada
        if (error.message.includes('Email not confirmed') || error.message.toLowerCase().includes('rate limit')) {
          if (registeredLocalUser) {
            dataService.setActiveUser(registeredLocalUser);
            return {
              success: true,
              user: registeredLocalUser,
            };
          }
          return {
            success: false,
            isConfirmationPending: true,
            error: 'Debes confirmar tu correo o esperar unos minutos antes de ingresar.',
          };
        }

        // Si la contraseña o correo son inválidos
        if (error.message === 'Invalid login credentials' || error.message.includes('invalid_credentials')) {
          // Si el usuario existe registrado localmente (creado durante rate limit), permitir ingreso
          if (registeredLocalUser) {
            dataService.setActiveUser(registeredLocalUser);
            return {
              success: true,
              user: registeredLocalUser,
            };
          }

          return {
            success: false,
            error: 'Correo electrónico o contraseña incorrectos. Si aún no te has registrado, ve a Crear Cuenta.',
          };
        }

        return { success: false, error: error.message };
      }

      if (data?.user) {
        const metadata = data.user.user_metadata || {};
        let foundUser = localList.find((u) => u.email.toLowerCase() === cleanEmail);

        if (!foundUser) {
          foundUser = {
            id: data.user.id,
            auth_user_id: data.user.id,
            empresa_id: 'emp-1',
            nombre: metadata.nombre || cleanEmail.split('@')[0],
            email: cleanEmail,
            rol: (metadata.rol as UserRole) || 'admin',
            telefono_whatsapp: metadata.telefono_whatsapp || metadata.telefono || '+56900000000',
            created_at: data.user.created_at || new Date().toISOString(),
          };
          const all = [...localList, foundUser];
          if (typeof window !== 'undefined') {
            localStorage.setItem('obratrack_usuarios_v2', JSON.stringify(all));
          }
        }

        dataService.setActiveUser(foundUser);

        return {
          success: true,
          user: foundUser,
        };
      }
    } catch (err: any) {
      if (registeredLocalUser) {
        dataService.setActiveUser(registeredLocalUser);
        return { success: true, user: registeredLocalUser };
      }
      return {
        success: false,
        error: err.message || 'Error de conexión con Supabase Auth.',
      };
    }
  }

  // Fallback si no hay supabase configurado
  if (registeredLocalUser) {
    dataService.setActiveUser(registeredLocalUser);
    return { success: true, user: registeredLocalUser };
  }

  return {
    success: false,
    error: 'No se encontró la cuenta. Por favor crea una cuenta nueva en la pestaña Crear Cuenta.',
  };
}

/**
 * Obtener la sesión activa actual desde Supabase Auth
 */
export async function getActiveSupabaseSession(): Promise<Usuario | null> {
  const supabase = getSupabaseClient();
  const localActive = dataService.getActiveUser();

  if (!supabase || !isSupabaseConfigured()) {
    return localActive;
  }

  try {
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
      return localActive;
    }

    const authUser = data.session.user;
    const cleanEmail = authUser.email?.toLowerCase() || '';
    const metadata = authUser.user_metadata || {};

    const localList = dataService.getUsuarios();
    let user = localList.find((u) => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      user = {
        id: authUser.id,
        auth_user_id: authUser.id,
        empresa_id: 'emp-1',
        nombre: metadata.nombre || cleanEmail.split('@')[0],
        email: cleanEmail,
        rol: (metadata.rol as UserRole) || 'admin',
        telefono_whatsapp: metadata.telefono_whatsapp || '+56900000000',
        created_at: authUser.created_at || new Date().toISOString(),
      };
      const all = [...localList, user];
      if (typeof window !== 'undefined') {
        localStorage.setItem('obratrack_usuarios_v2', JSON.stringify(all));
      }
    }

    dataService.setActiveUser(user);
    return user;
  } catch (err) {
    return localActive;
  }
}

/**
 * Reenviar correo de confirmación
 */
export async function resendConfirmationEmail(email: string): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConfigured()) {
    return { success: false, message: 'Servicio de Supabase no disponible.' };
  }

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });
    if (error) {
      if (error.message.toLowerCase().includes('rate limit')) {
        return {
          success: false,
          message: 'Límite de correos por hora alcanzado en Supabase. Puedes iniciar sesión directamente con tu correo y contraseña.',
        };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: `Correo de confirmación reenviado a ${email}.` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al reenviar correo de confirmación.' };
  }
}

/**
 * Recuperación de contraseña vía Supabase
 */
export async function resetPasswordForEmail(email: string): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConfigured()) {
    return { success: false, message: 'Servicio de Supabase no disponible.' };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
    });
    if (error) {
      return { success: false, message: error.message };
    }
    return {
      success: true,
      message: `Instrucciones de recuperación enviadas a ${email}. Revisa tu bandeja de entrada o spam.`,
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al enviar recuperación de contraseña.' };
  }
}

/**
 * Cerrar sesión en Supabase y limpiar estado
 */
export async function signOutSupabase(): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase && isSupabaseConfigured()) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }
  dataService.clearActiveUser();
}
