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
 * Registro estricto de nuevos usuarios en Supabase Auth
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
  if (!supabase || !isSupabaseConfigured()) {
    return {
      success: false,
      error: 'No se pudo conectar con el servidor de Supabase Auth. Verifica tu conexión a internet.',
    };
  }

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
      if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already exists')) {
        return {
          success: false,
          error: 'Este correo electrónico ya está registrado en Supabase. Por favor inicia sesión.',
        };
      }
      return { success: false, error: error.message };
    }

    if (!data?.user) {
      return {
        success: false,
        error: 'No se pudo crear el usuario en Supabase Auth.',
      };
    }

    // Si Supabase devuelve usuario existente sin identidades
    if (data.user.identities && data.user.identities.length === 0) {
      return {
        success: false,
        error: 'Este correo electrónico ya existe en Supabase Auth. Por favor inicia sesión.',
      };
    }

    const isConfirmationPending = !data.session;
    const userId = data.user.id;

    // Guardar perfil del usuario autenticado
    const existingUsers = dataService.getUsuarios();
    let localUser: Usuario = {
      id: userId,
      auth_user_id: userId,
      empresa_id: 'emp-1',
      nombre: cleanNombre,
      email: cleanEmail,
      rol: rol,
      telefono_whatsapp: cleanTelefono,
      created_at: data.user.created_at || new Date().toISOString(),
    };

    const updatedUsers = existingUsers.filter((u) => u.email.toLowerCase() !== cleanEmail);
    updatedUsers.push(localUser);

    if (typeof window !== 'undefined') {
      localStorage.setItem('obratrack_usuarios_v2', JSON.stringify(updatedUsers));
    }

    if (data.session) {
      dataService.setActiveUser(localUser);
    }

    return {
      success: true,
      user: localUser,
      isConfirmationPending,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error de conexión con Supabase Auth.',
    };
  }
}

/**
 * Inicio de sesión estricto contra Supabase Auth (solo cuentas reales)
 */
export async function signInWithSupabase(email: string, password: string): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !password) {
    return { success: false, error: 'Por favor ingresa tu correo y contraseña.' };
  }

  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Servidor de autenticación no disponible. Revisa tu conexión.',
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password,
    });

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        return {
          success: false,
          isConfirmationPending: true,
          error: 'Tu correo aún no ha sido confirmado en Supabase. Revisa tu bandeja de entrada o solicita un reenvío.',
        };
      }
      if (error.message === 'Invalid login credentials' || error.message.includes('invalid_credentials')) {
        return {
          success: false,
          error: 'Cuenta no encontrada o contraseña incorrecta en Supabase Auth. Verifica tus datos o crea una cuenta nueva.',
        };
      }
      return { success: false, error: error.message };
    }

    if (!data?.user) {
      return {
        success: false,
        error: 'No se pudo obtener la sesión de Supabase Auth.',
      };
    }

    // Usuario autenticado exitosamente en Supabase
    const metadata = data.user.user_metadata || {};
    const localList = dataService.getUsuarios();
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
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error de conexión con Supabase Auth.',
    };
  }
}

/**
 * Obtener la sesión activa actual desde Supabase Auth
 */
export async function getActiveSupabaseSession(): Promise<Usuario | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConfigured()) return null;

  try {
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
      return null;
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
    console.error('Error fetching active session:', err);
    return null;
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
  if (typeof window !== 'undefined') {
    localStorage.removeItem('obratrack_active_user_v2');
  }
}
