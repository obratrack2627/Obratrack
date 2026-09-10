import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from './config';
import { Usuario, UserRole } from '@/types/database';
import { isDeveloperEmail } from '@/lib/auth-utils';
import { supabaseService } from '@/lib/supabase/supabase-service';
import { dataService } from '@/lib/data-service';

export interface AuthResult {
  success: boolean;
  user?: Usuario;
  error?: string;
}

// Mapeo amigable de errores de Firebase Auth en español
function mapFirebaseAuthError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Este correo electrónico ya está registrado. Por favor inicia sesión.';
    case 'auth/invalid-email':
      return 'El formato del correo electrónico no es válido.';
    case 'auth/weak-password':
      return 'La contraseña es muy débil. Debe tener al menos 6 caracteres.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Correo o contraseña incorrectos. Verifica tus credenciales.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Por favor intenta más tarde o restablece tu contraseña.';
    case 'auth/network-request-failed':
      return 'Error de conexión de red. Verifica tu conexión a internet.';
    case 'auth/user-disabled':
      return 'Esta cuenta ha sido inhabilitada. Contacta al soporte.';
    default:
      return 'Ocurrió un error de autenticación. Inténtalo nuevamente.';
  }
}

/**
 * Registro de un nuevo Dueño / Contratista con aislamiento Multi-Tenant en Supabase
 * Si es el correo del desarrollador (benja105.achavar@gmail.com) -> is_dev = true y plan pro_ia
 * Si es cualquier otro correo nuevo -> is_dev = false y plan gratis
 */
export async function signUpWithFirebase(
  email: string,
  pass: string,
  nombre: string,
  rut: string,
  empresaNombre: string,
  telefono: string = '+56 9 '
): Promise<AuthResult> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  const cleanEmail = email.trim().toLowerCase();
  const isDev = isDeveloperEmail(cleanEmail);

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
    const fbUser = userCredential.user;

    // Actualizar nombre visible en Firebase Auth
    await updateProfile(fbUser, { displayName: nombre.trim() });

    // Multi-tenant: empresa única para nuevo usuario, o la base si es dev
    const empresaId = isDev ? 'e1111111-1111-4111-a111-111111111111' : 'emp-' + Date.now();
    const planId = isDev ? 'pro_ia' : 'gratis';

    // 1. Crear empresa en Supabase
    await supabaseService.saveEmpresa({
      id: empresaId,
      nombre: isDev ? 'Constructora ObraTrack SpA' : empresaNombre.trim(),
      rut: isDev ? '76.123.456-7' : rut.trim(),
      plan_id: planId,
    });

    const usuario: Usuario = {
      id: fbUser.uid,
      nombre: nombre.trim(),
      email: cleanEmail,
      rol: 'admin',
      telefono_whatsapp: telefono.trim(),
      rut: rut.trim(),
      empresa_nombre: empresaNombre.trim(),
      empresa_id: empresaId,
      auth_user_id: fbUser.uid,
      is_dev: isDev,
      created_at: new Date().toISOString(),
    };

    // 2. Crear usuario en Supabase
    await supabaseService.saveUsuario(usuario);

    // 3. Respaldo en Firestore
    try {
      await setDoc(doc(db, 'usuarios', fbUser.uid), usuario, { merge: true });
    } catch (fsErr) {
      console.warn('Advertencia guardando perfil en Firestore:', fsErr);
    }

    // 4. Activar usuario y cargar tenant en DataService
    dataService.setActiveUser(usuario);
    await dataService.loadTenantDataFromSupabase(empresaId);

    if (typeof window !== 'undefined') {
      document.cookie = `obratrack_auth_token=${fbUser.uid}; path=/; max-age=2592000; SameSite=Lax`;
    }

    return { success: true, user: usuario };
  } catch (error: any) {
    console.error('Error en signUpWithFirebase:', error);
    return {
      success: false,
      error: mapFirebaseAuthError(error.code || '') || error.message,
    };
  }
}

/**
 * Inicio de sesión con correo o RUT y contraseña con verificación en Supabase
 */
export async function signInWithFirebase(emailOrRut: string, pass: string): Promise<AuthResult> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();

  const cleanInput = emailOrRut.trim().toLowerCase();
  let resolvedEmail = cleanInput;

  // 1. Si el usuario ingresó un RUT (sin @), buscar el email registrado
  if (!cleanInput.includes('@')) {
    const cleanDigits = cleanInput.replace(/[^a-z0-9]/g, '');
    if (typeof window !== 'undefined') {
      try {
        const storedUsers = dataService.getUsuarios();
        const match = storedUsers.find((u) => {
          const uRut = (u.rut || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return uRut.length >= 7 && uRut === cleanDigits;
        });
        if (match && match.email) {
          resolvedEmail = match.email.toLowerCase();
        }
      } catch (err) {
        console.warn('Error buscando por RUT:', err);
      }
    }
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, resolvedEmail, pass);
    const fbUser = userCredential.user;
    const isDev = isDeveloperEmail(resolvedEmail);

    // 1. Buscar en Supabase para obtener su empresa_id y rol real
    let usuario = await supabaseService.getUsuarioByEmail(resolvedEmail);

    if (!usuario) {
      // Intentar leer desde Firestore si no estaba en Supabase aún
      try {
        const userDoc = await getDoc(doc(db, 'usuarios', fbUser.uid));
        if (userDoc.exists()) {
          usuario = userDoc.data() as Usuario;
        }
      } catch (fsErr) {
        console.warn('No se pudo leer perfil desde Firestore:', fsErr);
      }
    }

    if (!usuario) {
      const empresaId = isDev ? 'e1111111-1111-4111-a111-111111111111' : 'emp-' + Date.now();
      usuario = {
        id: fbUser.uid,
        nombre: fbUser.displayName || resolvedEmail.split('@')[0],
        email: fbUser.email || resolvedEmail,
        rol: 'admin',
        telefono_whatsapp: '+56 9 ',
        empresa_id: empresaId,
        auth_user_id: fbUser.uid,
        is_dev: isDev,
        created_at: new Date().toISOString(),
      };
      await supabaseService.saveUsuario(usuario);
    } else {
      if (isDev) {
        usuario.is_dev = true;
      }
    }

    // 2. Establecer usuario activo y cargar datos del inquilino desde Supabase
    dataService.setActiveUser(usuario);
    await dataService.loadTenantDataFromSupabase(usuario.empresa_id);

    if (typeof window !== 'undefined') {
      document.cookie = `obratrack_auth_token=${fbUser.uid}; path=/; max-age=2592000; SameSite=Lax`;
    }

    return { success: true, user: usuario };
  } catch (error: any) {
    // Fallback: usuarios locales o maestros de faena creados sin Firebase Auth
    if (typeof window !== 'undefined') {
      try {
        const storedUsers = dataService.getUsuarios();
        const cleanDigits = cleanInput.replace(/[^a-z0-9]/g, '');

        const localMatch = storedUsers.find((u) => {
          const uEmail = (u.email || '').toLowerCase();
          const uRut = (u.rut || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return uEmail === cleanInput || (cleanDigits.length >= 7 && uRut === cleanDigits);
        });

        if (localMatch) {
          if (isDeveloperEmail(localMatch.email)) {
            localMatch.is_dev = true;
          }
          dataService.setActiveUser(localMatch);
          await dataService.loadTenantDataFromSupabase(localMatch.empresa_id);
          document.cookie = `obratrack_auth_token=${localMatch.id}; path=/; max-age=2592000; SameSite=Lax`;
          return { success: true, user: localMatch };
        }
      } catch (localErr) {
        console.warn('Error en fallback de inicio de sesión:', localErr);
      }
    }

    console.error('Error en signInWithFirebase:', error);
    return {
      success: false,
      error: mapFirebaseAuthError(error.code || '') || error.message,
    };
  }
}

/**
 * Cerrar sesión y limpiar estado de sesión
 */
export async function signOutFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Error cerrando sesión en Firebase:', err);
  } finally {
    dataService.clearActiveUser();
    if (typeof window !== 'undefined') {
      document.cookie = 'obratrack_auth_token=; path=/; max-age=0';
    }
  }
}

/**
 * Envío de correo para restablecimiento de contraseña
 */
export async function resetPasswordWithFirebase(
  email: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const auth = getFirebaseAuth();
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    return {
      success: true,
      message: 'Se ha enviado un correo con instrucciones para restablecer tu contraseña.',
    };
  } catch (error: any) {
    console.error('Error en resetPasswordWithFirebase:', error);
    return {
      success: false,
      error: mapFirebaseAuthError(error.code || '') || error.message,
    };
  }
}

/**
 * Escuchar cambios en el estado de autenticación
 */
export function onAuthStateChange(callback: (user: FirebaseUser | null) => void) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}
