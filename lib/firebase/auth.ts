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
 * Registro de un nuevo Dueño / Contratista en Firebase Auth con validación de RUT y guardado de perfil en Firestore
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

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
    const fbUser = userCredential.user;

    // Actualizar nombre visible en Firebase Auth
    await updateProfile(fbUser, { displayName: nombre.trim() });

    const usuario: Usuario = {
      id: fbUser.uid,
      nombre: nombre.trim(),
      email: fbUser.email || email.trim().toLowerCase(),
      rol: 'admin', // Cuentas creadas en la web son siempre Dueño / Contratista
      telefono_whatsapp: telefono.trim(),
      rut: rut.trim(),
      empresa_nombre: empresaNombre.trim(),
      empresa_id: '11111111-1111-1111-1111-111111111111',
      auth_user_id: fbUser.uid,
      created_at: new Date().toISOString(),
    };

    // Guardar perfil en colección 'usuarios' de Firestore
    try {
      await setDoc(doc(db, 'usuarios', fbUser.uid), usuario, { merge: true });
    } catch (fsErr) {
      console.warn('Advertencia guardando perfil en Firestore:', fsErr);
    }

    // Persistir usuario activo en localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('obratrack_active_user_v6', JSON.stringify(usuario));
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
 * Inicio de sesión con correo y contraseña en Firebase Auth
 */
/**
 * Inicio de sesión con correo o RUT y contraseña en Firebase Auth / Base de Datos
 */
export async function signInWithFirebase(emailOrRut: string, pass: string): Promise<AuthResult> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();

  const cleanInput = emailOrRut.trim().toLowerCase();
  let resolvedEmail = cleanInput;

  // 1. Si el usuario ingresó un RUT (sin @), buscar el email registrado en usuarios
  if (!cleanInput.includes('@')) {
    const cleanDigits = cleanInput.replace(/[^a-z0-9]/g, '');
    if (typeof window !== 'undefined') {
      try {
        const storedUsersRaw = localStorage.getItem('obratrack_usuarios_v6');
        const storedUsers: Usuario[] = storedUsersRaw ? JSON.parse(storedUsersRaw) : [];
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

    // Cargar perfil desde Firestore
    let usuario: Usuario | null = null;
    try {
      const userDoc = await getDoc(doc(db, 'usuarios', fbUser.uid));
      if (userDoc.exists()) {
        usuario = userDoc.data() as Usuario;
      }
    } catch (fsErr) {
      console.warn('No se pudo leer perfil desde Firestore, usando datos de sesión:', fsErr);
    }

    if (!usuario) {
      usuario = {
        id: fbUser.uid,
        nombre: fbUser.displayName || resolvedEmail.split('@')[0],
        email: fbUser.email || resolvedEmail,
        rol: 'admin',
        telefono_whatsapp: '+56 9 ',
        empresa_id: '11111111-1111-1111-1111-111111111111',
        auth_user_id: fbUser.uid,
        created_at: new Date().toISOString(),
      };
    }

    // Persistir usuario activo y cookie de sesión
    if (typeof window !== 'undefined') {
      localStorage.setItem('obratrack_active_user_v6', JSON.stringify(usuario));
      document.cookie = `obratrack_auth_token=${fbUser.uid}; path=/; max-age=2592000; SameSite=Lax`;
    }

    return { success: true, user: usuario || undefined };
  } catch (error: any) {
    // 2. Si falla en Firebase Auth directo (ej: maestro de terreno creado por el dueño en el panel),
    // verificar si existe en la base de datos de usuarios
    if (typeof window !== 'undefined') {
      try {
        const storedUsersRaw = localStorage.getItem('obratrack_usuarios_v6');
        const storedUsers: Usuario[] = storedUsersRaw ? JSON.parse(storedUsersRaw) : [];
        const cleanDigits = cleanInput.replace(/[^a-z0-9]/g, '');

        const localMatch = storedUsers.find((u) => {
          const uEmail = (u.email || '').toLowerCase();
          const uRut = (u.rut || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return uEmail === cleanInput || (cleanDigits.length >= 7 && uRut === cleanDigits);
        });

        if (localMatch) {
          localStorage.setItem('obratrack_active_user_v6', JSON.stringify(localMatch));
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
 * Cerrar sesión en Firebase y limpiar cookies y localStorage
 */
export async function signOutFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Error cerrando sesión en Firebase:', err);
  }

  if (typeof window !== 'undefined') {
    localStorage.removeItem('obratrack_active_user_v5');
    localStorage.removeItem('obratrack_chat_session_history_v5');
    document.cookie = 'obratrack_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  }
}

/**
 * Enviar correo de restablecimiento de contraseña vía Firebase
 */
export async function resetPasswordWithFirebase(email: string): Promise<{ success: boolean; message?: string }> {
  const auth = getFirebaseAuth();
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    return {
      success: true,
      message: 'Se ha enviado un enlace de recuperación a tu correo electrónico.',
    };
  } catch (error: any) {
    console.error('Error en resetPasswordWithFirebase:', error);
    return {
      success: false,
      message: mapFirebaseAuthError(error.code || '') || error.message,
    };
  }
}

/**
 * Escuchar cambios en el estado de autenticación de Firebase
 */
export function onFirebaseAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}
