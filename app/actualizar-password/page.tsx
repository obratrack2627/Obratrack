'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  KeyRound,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import { supabase } from '@/lib/supabase/client';
import { updatePasswordWithSupabase } from '@/lib/supabase/auth';

export default function ActualizarPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Verificar si existe sesión activa o token de recuperación de Supabase
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          if (session) {
            setHasValidSession(true);
          } else {
            // Esperar evento onAuthStateChange por si Supabase está procesando el hash de la URL
            const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
              if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || !!newSession) {
                if (isMounted) {
                  setHasValidSession(true);
                  setIsCheckingSession(false);
                }
              }
            });

            // Si tras 1.5s no hay sesión, advertir al usuario
            setTimeout(() => {
              if (isMounted) {
                setIsCheckingSession(false);
              }
            }, 1500);

            return () => {
              authListener.subscription.unsubscribe();
            };
          }
          setIsCheckingSession(false);
        }
      } catch (err) {
        console.error('Error verificando sesión en actualizar-password:', err);
        if (isMounted) {
          setIsCheckingSession(false);
        }
      }
    }

    void checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Calcular fortaleza de contraseña (0 a 3)
  const getPasswordStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 6) score++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass) || /[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const strength = getPasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden. Por favor verifica que ambas sean idénticas.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await updatePasswordWithSupabase(newPassword);

      if (!result.success) {
        setErrorMsg(result.error || 'No se pudo actualizar la contraseña.');
        setIsLoading(false);
        return;
      }

      setSuccessMsg('¡Contraseña actualizada con éxito! Redirigiendo a ObraTrack...');
      setIsLoading(false);

      // Sincronizar cookie de sesión si existe usuario
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id && typeof window !== 'undefined') {
        document.cookie = `obratrack_auth_token=${session.user.id}; path=/; max-age=2592000; SameSite=Lax`;
      }

      setTimeout(() => {
        router.replace('/dashboard');
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error inesperado al cambiar contraseña.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F5F0E6] via-[#FAF8F5] to-[#EAE2D2] dark:from-[#06080C] dark:via-[#0D1117] dark:to-[#040609] flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
      
      {/* Resplandores difusos de ambiente */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#FF6A00]/12 dark:bg-[#FF6A00]/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-[#6B8F72]/15 dark:bg-[#2563EB]/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Retícula técnica milimétrica */}
      <svg className="absolute inset-0 w-full h-full opacity-35 dark:opacity-15 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-pattern-pwd" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.6" className="text-[#C8BFAB] dark:text-[#263040]" />
            <path d="M 19 20 L 21 20 M 20 19 L 20 21" stroke="currentColor" strokeWidth="0.8" className="text-[#FF6A00]/40 dark:text-[#FF6A00]/30" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern-pwd)" />
      </svg>

      {/* Botón de Tema */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Tarjeta de Formulario */}
      <div className="w-full max-w-md bg-white/95 dark:bg-[#141A23]/95 backdrop-blur-md border border-[#E5DFC9] dark:border-[#263040] rounded-3xl shadow-2xl p-6 sm:p-8 relative z-10 animate-in fade-in transition-all">
        
        {/* Logo */}
        <div className="flex flex-col items-center text-center mb-6">
          <Logo variant="vertical" size="md" withDescriptor={false} className="mb-2" />
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
            <KeyRound className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span>Restablecimiento de Credenciales</span>
          </div>
        </div>

        {/* Encabezado */}
        <div className="text-center mb-5">
          <h2 className="text-lg font-black font-heading text-[#1E1E1E] dark:text-white">
            Actualizar Contraseña
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Ingresa tu nueva clave de acceso para proteger tu cuenta de ObraTrack.
          </p>
        </div>

        {/* Notificaciones */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Si está verificando sesión o no hay sesión de recuperación */}
        {isCheckingSession ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin text-[#FF6A00]" />
            <span>Verificando enlace de recuperación...</span>
          </div>
        ) : !hasValidSession && !successMsg ? (
          <div className="space-y-4 text-center py-2 animate-in fade-in">
            <div className="p-4 bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 dark:border-amber-700/40 rounded-2xl text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <AlertTriangle className="w-6 h-6 text-[#FF6A00] mx-auto mb-2" />
              <p className="font-semibold mb-1">Enlace de recuperación requerido</p>
              <p>
                Para cambiar tu clave desde este acceso necesitas haber hecho clic en el enlace de recuperación enviado a tu correo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="w-full py-2.5 bg-[#1E1E1E] dark:bg-gray-800 hover:bg-black text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 font-heading"
            >
              <span>Ir al Inicio de Sesión</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
                Nueva Contraseña *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 font-sans transition-all"
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Indicador de Fortaleza */}
              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1 h-1.5 w-full">
                    <div
                      className={`h-full flex-1 rounded-full transition-all ${
                        strength >= 1 ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                    <div
                      className={`h-full flex-1 rounded-full transition-all ${
                        strength >= 2 ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                    <div
                      className={`h-full flex-1 rounded-full transition-all ${
                        strength >= 3 ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                  </div>
                  <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                    Seguridad:{' '}
                    <strong className="text-gray-700 dark:text-gray-200">
                      {strength === 1 ? 'Básica' : strength === 2 ? 'Media' : strength === 3 ? 'Segura' : 'Muy corta'}
                    </strong>
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
                Confirmar Nueva Contraseña *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 font-sans transition-all"
                  placeholder="Repite la nueva contraseña"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !!successMsg}
              className="w-full py-3 bg-[#FF6A00] hover:bg-[#E55F00] text-white font-bold rounded-xl shadow-lg shadow-[#FF6A00]/25 transition-all flex items-center justify-center gap-2 font-heading text-xs uppercase tracking-wider disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando en Supabase...</span>
                </>
              ) : (
                <>
                  <span>Guardar Nueva Contraseña</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer Seguridad */}
        <div className="mt-5 pt-3.5 border-t border-[#E5DFC9] dark:border-[#263040] flex items-center justify-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-[#6B8F72]" />
          <span>Protección de Credenciales Supabase Auth</span>
        </div>
      </div>
    </div>
  );
}
