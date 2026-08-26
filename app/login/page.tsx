'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  User,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Send,
  Phone,
} from 'lucide-react';
import { UserRole } from '@/types/database';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import { formatRUT, validarRutChileno } from '@/lib/utils';
import {
  signInWithFirebase,
  signUpWithFirebase,
  resetPasswordWithFirebase,
} from '@/lib/firebase/auth';
import { dataService } from '@/lib/data-service';

type AuthMode = 'signin' | 'signup' | 'forgot_password';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Iniciar Sesión
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Crear Cuenta (Exclusivo Dueño / Contratista)
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [telefono, setTelefono] = useState('+56 9 ');

  // Recuperación
  const [forgotEmail, setForgotEmail] = useState('');

  // Manejo de formateo de RUT en vivo
  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatRUT(raw);
    setRut(formatted);
  };

  // Manejo de inicio de sesión en Firebase Auth
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const result = await signInWithFirebase(email, password);
      if (!result.success) {
        setErrorMsg(result.error || 'Credenciales inválidas o cuenta no registrada en Firebase.');
        setIsLoading(false);
        return;
      }

      dataService.clearChatSessionHistory();
      setSuccessMsg('¡Cuenta verificada en Firebase! Ingresando al Centro de Mando...');
      setTimeout(() => {
        if (result.user?.rol === 'terreno') {
          alert(
            'Nota: Los trabajadores con rol "terreno" reportan directamente vía WhatsApp o vista de faena. Para la gestión integral ingresa como Dueño/Contratista.'
          );
        }
        let target = '/dashboard';
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const redirect = params.get('redirect');
          if (redirect && redirect.startsWith('/')) {
            target = redirect;
          }
        }
        router.replace(target);
      }, 400);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de autenticación.');
      setIsLoading(false);
    }
  };

  // Manejo de registro en Firebase Auth con validación estricta de RUT chileno
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // 1. Validación estricta de RUT chileno (Módulo 11)
    if (!validarRutChileno(rut)) {
      setErrorMsg('El RUT ingresado no es válido según el formato oficial chileno (Módulo 11). Verifica el número y dígito verificador.');
      return;
    }

    if (!empresaNombre || empresaNombre.trim().length < 3) {
      setErrorMsg('Debes ingresar el nombre o razón social de tu constructora / contratista.');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setErrorMsg('Las contraseñas no coinciden. Verifica que ambas sean iguales.');
      return;
    }
    if (signupPassword.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signUpWithFirebase(
        signupEmail,
        signupPassword,
        nombre,
        rut,
        empresaNombre,
        telefono
      );

      if (!result.success) {
        setErrorMsg(result.error || 'No se pudo crear la cuenta en Firebase.');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      setSuccessMsg('¡Cuenta de Dueño/Contratista verificada y creada con éxito! Ingresando...');
      setTimeout(() => {
        let target = '/dashboard';
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const redirect = params.get('redirect');
          if (redirect && redirect.startsWith('/')) {
            target = redirect;
          }
        }
        router.replace(target);
      }, 500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar la cuenta.');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setErrorMsg(null);
    setIsLoading(true);
    const res = await resetPasswordWithFirebase(forgotEmail);
    setIsLoading(false);
    if (res.success) {
      setSuccessMsg(res.message || 'Correo de recuperación enviado.');
    } else {
      setErrorMsg(res.message || 'No se pudo enviar el correo de recuperación.');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF8F5] dark:bg-[#0B0E14] flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
      
      {/* Fondo técnico blueprint */}
      <div className="absolute inset-0 bg-blueprint-grid opacity-25 dark:opacity-10 pointer-events-none"></div>

      {/* Botón de Modo Claro / Oscuro */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Card Principal */}
      <div className="w-full max-w-md bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-3xl shadow-xl p-6 sm:p-8 relative z-10 animate-in fade-in transition-all duration-300">
        
        {/* Logo & Marca */}
        <div className="flex flex-col items-center text-center mb-6">
          <Logo variant="vertical" size="md" withDescriptor={false} className="mb-2" />
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            El copiloto digital del constructor
          </p>
        </div>

        {/* Selector de Modo: Iniciar Sesión / Crear Cuenta */}
        {mode !== 'forgot_password' && (
          <div className="grid grid-cols-2 p-1 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-2 text-xs font-bold font-heading rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                mode === 'signin'
                  ? 'bg-[#1E1E1E] dark:bg-[#FF6A00] text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Iniciar Sesión</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-2 text-xs font-bold font-heading rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                mode === 'signup'
                  ? 'bg-[#FF6A00] text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-[#FF6A00]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Crear Cuenta</span>
            </button>
          </div>
        )}

        {/* Alertas */}
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

        {/* 1. VISTA: INICIAR SESIÓN */}
        {mode === 'signin' && (
          <form onSubmit={handleLogin} className="space-y-4 animate-in fade-in">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 font-sans transition-all"
                  placeholder="tu@constructora.cl"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider font-mono">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setMode('forgot_password');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-[11px] text-[#FF6A00] hover:underline font-mono"
                >
                  ¿Olvidaste tu clave?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 font-sans transition-all"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#FF6A00] hover:bg-[#E55F00] text-white font-bold rounded-xl shadow-lg shadow-[#FF6A00]/25 hover:shadow-xl hover:shadow-[#FF6A00]/35 transition-all flex items-center justify-center gap-2 font-heading text-xs uppercase tracking-wider disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verificando en Firebase...</span>
                </>
              ) : (
                <>
                  <span>Ingresar a ObraTrack</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* 2. VISTA: CREAR CUENTA (EXCLUSIVO DUEÑO / CONTRATISTA GENERAL) */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3 animate-in fade-in">
            {/* Aviso de Exclusividad */}
            <div className="p-3 bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 dark:border-amber-700/40 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#FF6A00]" />
              <p className="leading-snug">
                <strong>Registro exclusivo para Dueño o Contratista General:</strong> Valida tu empresa con RUT chileno. Los trabajadores de terreno operan desde WhatsApp o vista móvil.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
                Nombre del Dueño / Contratista *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Ej: Benjamín Achávar"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] font-sans"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider font-mono">
                    RUT Empresa / Personal *
                  </label>
                  {rut && (
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        validarRutChileno(rut)
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      }`}
                    >
                      {validarRutChileno(rut) ? '✓ Válido' : '✗ Inválido'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  maxLength={12}
                  placeholder="12.345.678-9"
                  value={rut}
                  onChange={handleRutChange}
                  className={`w-full px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none font-mono ${
                    rut && !validarRutChileno(rut)
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-[#E5DFC9] dark:border-[#263040] focus:border-[#FF6A00]'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
                  Constructora / Contratista *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Constructora Los Andes"
                  value={empresaNombre}
                  onChange={(e) => setEmpresaNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
                  Correo Electrónico *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="tu@constructora.cl"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
                  WhatsApp Contacto *
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    placeholder="+56 9 1234 5678"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
                  Contraseña *
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Mín 6 car."
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
                  Confirmar *
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Repetir"
                    value={signupConfirmPassword}
                    onChange={(e) => setSignupConfirmPassword(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || (!!rut && !validarRutChileno(rut))}
              className="w-full mt-2 py-3 bg-[#FF6A00] hover:bg-[#E55F00] text-white font-bold rounded-xl shadow-lg shadow-[#FF6A00]/25 transition-all flex items-center justify-center gap-2 font-heading text-xs uppercase tracking-wider disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validando RUT y creando cuenta...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Registrar Empresa & Entrar</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* 3. VISTA: RECUPERACIÓN DE CONTRASEÑA */}
        {mode === 'forgot_password' && (
          <div className="space-y-4 animate-in fade-in">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white font-heading">
                Recuperar Contraseña
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ingresa tu correo para recibir instrucciones de recuperación de Firebase.
              </p>
            </div>

            <form onSubmit={handleForgotPassword} className="space-y-3">
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00]"
                  placeholder="tu@constructora.cl"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar Correo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-xs"
                >
                  Volver
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Footer Seguridad */}
        <div className="mt-5 pt-3.5 border-t border-[#E5DFC9] dark:border-[#263040] flex items-center justify-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-[#6B8F72]" />
          <span>Acceso Protegido con Firebase Auth</span>
        </div>
      </div>
    </div>
  );
}
