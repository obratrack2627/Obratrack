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
import LegalTermsModal from '@/components/LegalTermsModal';
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

  // Estados de Cumplimiento Legal (Ley 19.496, 21.719 y 21.663)
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'terminos' | 'privacidad' | 'ciberseguridad'>('terminos');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);

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
      const isTerreno = result.user?.rol === 'terreno';
      setSuccessMsg(
        isTerreno
          ? `¡Hola ${result.user?.nombre || 'Maestro'}! Ingresando a la vista de faena...`
          : '¡Cuenta verificada! Ingresando al Centro de Mando...'
      );

      setTimeout(() => {
        let target = isTerreno ? '/proyectos' : '/dashboard';
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const redirect = params.get('redirect');
          if (redirect && redirect.startsWith('/')) {
            target = isTerreno ? '/proyectos' : redirect;
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

    // 1. Validación de Términos y Condiciones Legales (Ley 19.496 y 21.719)
    if (!acceptTerms) {
      setErrorMsg('Debes leer y aceptar los Términos de Servicio y la Política de Privacidad y Confidencialidad de ObraTrack.');
      return;
    }

    // 2. Validación estricta de RUT chileno (Módulo 11)
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
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F5F0E6] via-[#FAF8F5] to-[#EAE2D2] dark:from-[#06080C] dark:via-[#0D1117] dark:to-[#040609] flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
      
      {/* Resplandores difusos ambientales (Warm Amber & Safety Green / Steel Slate) */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#FF6A00]/12 dark:bg-[#FF6A00]/10 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDuration: '6s' }}></div>
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-[#6B8F72]/15 dark:bg-[#2563EB]/10 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDuration: '8s' }}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#E5DFC9]/30 dark:bg-[#151D28]/30 rounded-full blur-3xl pointer-events-none"></div>

      {/* Retícula técnica milimétrica de plano / blueprint con cruces de arquitectura */}
      <svg className="absolute inset-0 w-full h-full opacity-35 dark:opacity-15 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.6" className="text-[#C8BFAB] dark:text-[#263040]" />
            <path d="M 19 20 L 21 20 M 20 19 L 20 21" stroke="currentColor" strokeWidth="0.8" className="text-[#FF6A00]/40 dark:text-[#FF6A00]/30" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
      </svg>

      {/* FIGURA 1: Grúa Torre Isométrica y Cota de Nivel (Esquina Superior Izquierda) */}
      <div className="absolute top-6 left-6 sm:top-12 sm:left-12 opacity-40 dark:opacity-25 pointer-events-none select-none hidden md:block">
        <svg width="220" height="180" viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#1E1E1E] dark:text-[#E5DFC9]">
          {/* Torre vertical */}
          <line x1="40" y1="40" x2="40" y2="160" stroke="currentColor" strokeWidth="1.5" />
          <line x1="60" y1="40" x2="60" y2="160" stroke="currentColor" strokeWidth="1.5" />
          {/* Enrejado torre */}
          <line x1="40" y1="60" x2="60" y2="80" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="60" y1="60" x2="40" y2="80" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="40" y1="100" x2="60" y2="120" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="60" y1="100" x2="40" y2="120" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="40" y1="140" x2="60" y2="160" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          {/* Cabina & Cúspide */}
          <polygon points="40,40 50,15 60,40" stroke="#FF6A00" strokeWidth="1.5" fill="none" />
          {/* Pluma horizontal principal */}
          <line x1="10" y1="40" x2="200" y2="40" stroke="currentColor" strokeWidth="1.5" />
          <line x1="50" y1="15" x2="160" y2="40" stroke="#FF6A00" strokeWidth="1" strokeDasharray="3 2" />
          <line x1="50" y1="15" x2="20" y2="40" stroke="currentColor" strokeWidth="1" />
          {/* Contrapeso */}
          <rect x="15" y="42" width="18" height="12" stroke="currentColor" strokeWidth="1" fill="#FF6A00" fillOpacity="0.2" />
          {/* Carro y cable con gancho */}
          <line x1="140" y1="40" x2="140" y2="95" stroke="#FF6A00" strokeWidth="1" strokeDasharray="2 2" />
          <circle cx="140" cy="98" r="3" stroke="#FF6A00" strokeWidth="1.5" />
          {/* Cotas técnicas */}
          <text x="68" y="30" fill="currentColor" className="text-[9px] font-mono font-bold tracking-widest opacity-80">+28.50m COTA GRÚA</text>
          <text x="68" y="150" fill="#FF6A00" className="text-[8px] font-mono font-semibold tracking-wider">OBRA.TRACK // 01</text>
        </svg>
      </div>

      {/* FIGURA 2: Celosía Estructural Warren & Cota Angular (Esquina Superior Derecha) */}
      <div className="absolute top-8 right-8 sm:top-14 sm:right-14 opacity-35 dark:opacity-20 pointer-events-none select-none hidden lg:block">
        <svg width="240" height="130" viewBox="0 0 240 130" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#1E1E1E] dark:text-[#E5DFC9]">
          {/* Cuerdas superior e inferior */}
          <line x1="10" y1="30" x2="230" y2="30" stroke="currentColor" strokeWidth="1.5" />
          <line x1="10" y1="90" x2="230" y2="90" stroke="currentColor" strokeWidth="1.5" />
          {/* Diagonales y montantes */}
          <line x1="10" y1="90" x2="45" y2="30" stroke="currentColor" strokeWidth="1.2" />
          <line x1="45" y1="30" x2="80" y2="90" stroke="#FF6A00" strokeWidth="1.2" />
          <line x1="80" y1="90" x2="115" y2="30" stroke="currentColor" strokeWidth="1.2" />
          <line x1="115" y1="30" x2="150" y2="90" stroke="currentColor" strokeWidth="1.2" />
          <line x1="150" y1="90" x2="185" y2="30" stroke="#FF6A00" strokeWidth="1.2" />
          <line x1="185" y1="30" x2="220" y2="90" stroke="currentColor" strokeWidth="1.2" />
          {/* Nodos circulares en uniones */}
          <circle cx="45" cy="30" r="3" fill="#FF6A00" />
          <circle cx="115" cy="30" r="3" fill="currentColor" />
          <circle cx="185" cy="30" r="3" fill="#FF6A00" />
          <circle cx="80" cy="90" r="3" fill="currentColor" />
          <circle cx="150" cy="90" r="3" fill="currentColor" />
          {/* Medidas y Cota */}
          <line x1="10" y1="105" x2="230" y2="105" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 3" />
          <path d="M 10 101 L 10 109 M 230 101 L 230 109" stroke="currentColor" strokeWidth="1" />
          <text x="95" y="120" fill="currentColor" className="text-[9px] font-mono font-bold tracking-widest">L = 12.00 METROS</text>
        </svg>
      </div>

      {/* FIGURA 3: Cubo Isométrico & Estratigrafía de Cimentación (Esquina Inferior Izquierda) */}
      <div className="absolute bottom-8 left-8 sm:bottom-12 sm:left-12 opacity-40 dark:opacity-25 pointer-events-none select-none hidden md:block">
        <svg width="220" height="190" viewBox="0 0 220 190" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#1E1E1E] dark:text-[#E5DFC9]">
          {/* Cubo isométrico 3D alambre */}
          {/* Cara Superior */}
          <polygon points="90,20 160,55 90,90 20,55" stroke="#FF6A00" strokeWidth="1.5" fill="#FF6A00" fillOpacity="0.06" />
          {/* Cara Izquierda */}
          <polygon points="20,55 90,90 90,160 20,125" stroke="currentColor" strokeWidth="1.5" fill="none" />
          {/* Cara Derecha */}
          <polygon points="90,90 160,55 160,125 90,160" stroke="currentColor" strokeWidth="1.5" fill="none" />
          {/* Línea de nivel de cimentación */}
          <line x1="20" y1="90" x2="90" y2="125" stroke="#6B8F72" strokeWidth="1.2" strokeDasharray="3 2" />
          <line x1="90" y1="125" x2="160" y2="90" stroke="#6B8F72" strokeWidth="1.2" strokeDasharray="3 2" />
          {/* Ejes x, y, z */}
          <line x1="90" y1="90" x2="90" y2="10" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
          {/* Leyenda técnica */}
          <text x="100" y="15" fill="#FF6A00" className="text-[8px] font-mono font-bold">EJE Z [HORMIGÓN H-25]</text>
          <text x="15" y="180" fill="currentColor" className="text-[8.5px] font-mono tracking-wider opacity-80">RADIER 3D // SECCIÓN 04</text>
        </svg>
      </div>

      {/* FIGURA 4: Perfil Viga I / Doble T y Coordenadas Geodésicas (Esquina Inferior Derecha) */}
      <div className="absolute bottom-8 right-8 sm:bottom-12 sm:right-12 opacity-40 dark:opacity-25 pointer-events-none select-none hidden md:block">
        <svg width="220" height="180" viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#1E1E1E] dark:text-[#E5DFC9]">
          {/* Perfil I-Beam Isométrico */}
          {/* Ala Superior */}
          <polygon points="80,30 180,60 160,70 60,40" stroke="currentColor" strokeWidth="1.5" fill="none" />
          {/* Alma central */}
          <line x1="120" y1="50" x2="120" y2="120" stroke="#FF6A00" strokeWidth="2" />
          <line x1="110" y1="46" x2="110" y2="116" stroke="currentColor" strokeWidth="1.2" />
          {/* Ala Inferior */}
          <polygon points="80,100 180,130 160,140 60,110" stroke="currentColor" strokeWidth="1.5" fill="#FF6A00" fillOpacity="0.08" />
          {/* Roseta de Orientación / Norte de Obra */}
          <g transform="translate(160, 110)">
            <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
            <polygon points="20,6 24,20 20,17 16,20" fill="#FF6A00" />
            <polygon points="20,34 24,20 20,23 16,20" fill="currentColor" opacity="0.6" />
            <text x="17" y="3" fill="#FF6A00" className="text-[7px] font-mono font-bold">N</text>
          </g>
          {/* Coordenadas de Obra */}
          <text x="35" y="165" fill="currentColor" className="text-[8.5px] font-mono tracking-widest font-semibold">COORD: 33°28'S 70°36'W</text>
        </svg>
      </div>

      {/* Botón de Modo Claro / Oscuro */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Card Principal */}
      <div className="w-full max-w-md bg-white/95 dark:bg-[#141A23]/95 backdrop-blur-md border border-[#E5DFC9] dark:border-[#263040] rounded-3xl shadow-2xl p-6 sm:p-8 relative z-10 animate-in fade-in transition-all duration-300">
        
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

            {/* Consentimientos Legales (Ley 19.496, Ley 21.719 y Ley 21.663) */}
            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#FF6A00] focus:ring-[#FF6A00] shrink-0"
                />
                <span className="text-[11px] text-gray-600 dark:text-gray-400 leading-tight">
                  He leído y acepto los{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setLegalModalTab('terminos');
                      setIsLegalModalOpen(true);
                    }}
                    className="text-[#FF6A00] underline font-semibold hover:text-[#E55F00]"
                  >
                    Términos de Servicio
                  </button>{' '}
                  y la{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setLegalModalTab('privacidad');
                      setIsLegalModalOpen(true);
                    }}
                    className="text-[#FF6A00] underline font-semibold hover:text-[#E55F00]"
                  >
                    Política de Privacidad y Confidencialidad
                  </button>{' '}
                  (Leyes N° 19.496 y 21.719).
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acceptMarketing}
                  onChange={(e) => setAcceptMarketing(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#FF6A00] focus:ring-[#FF6A00] shrink-0"
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                  (Opcional) Deseo recibir reportes de precios de materiales y novedades del sector por correo.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading || !acceptTerms || (!!rut && !validarRutChileno(rut))}
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

        {/* Footer Seguridad & Marco Legal */}
        <div className="mt-5 pt-3.5 border-t border-[#E5DFC9] dark:border-[#263040] flex flex-col items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#6B8F72]" />
            <span>Protección de Datos & Firebase Auth (Chile)</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
            <button
              type="button"
              onClick={() => {
                setLegalModalTab('terminos');
                setIsLegalModalOpen(true);
              }}
              className="hover:underline hover:text-gray-800 dark:hover:text-white"
            >
              Términos (Ley 19.496)
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                setLegalModalTab('privacidad');
                setIsLegalModalOpen(true);
              }}
              className="hover:underline hover:text-gray-800 dark:hover:text-white"
            >
              Privacidad (Ley 21.719)
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                setLegalModalTab('ciberseguridad');
                setIsLegalModalOpen(true);
              }}
              className="hover:underline hover:text-gray-800 dark:hover:text-white"
            >
              Ciberseguridad (Ley 21.663)
            </button>
          </div>
        </div>
      </div>

      {/* Modal Interactivo de Términos y Condiciones / Privacidad */}
      <LegalTermsModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
        initialTab={legalModalTab}
      />
    </div>
  );
}
