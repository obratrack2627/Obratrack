'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import BlueprintBrandPanel from '@/components/BlueprintBrandPanel';
import LegalTermsModal from '@/components/LegalTermsModal';
import { formatRUT, validarRutChileno } from '@/lib/utils';
import { canonicalPhone } from '@/lib/phone';
import {
  isValidEmail,
  sanitizeEmail,
  validateSignUpFields,
} from '@/lib/auth/registration-validation';
import {
  signInWithSupabase,
  signUpWithSupabase,
  resetPasswordWithSupabase,
  resendConfirmationEmail,
  resumeSupabaseSession,
} from '@/lib/supabase/auth';
import { dataService } from '@/lib/data-service';

type AuthMode = 'signin' | 'signup' | 'forgot_password' | 'confirm_email';
type LegalTab = 'terminos' | 'privacidad' | 'ciberseguridad';

const INPUT_CLASS =
  'h-11 w-full px-3.5 bg-[#FFFFFF] dark:bg-[#0F141C] border border-[#DCD6CA] hover:border-[#C6BFB2] dark:border-[#263040] dark:hover:border-[#344156] rounded-xl text-sm text-[#1E1E1E] dark:text-gray-100 placeholder:text-[#A39E95] dark:placeholder:text-gray-500 focus:outline-none focus:border-[#FF6A00] dark:focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15 transition-colors';

const LABEL_CLASS = 'block text-[13px] font-medium text-[#3A3835] dark:text-gray-300 mb-1.5';

const PRIMARY_BTN_CLASS =
  'h-11 w-full bg-[#FF6A00] hover:bg-[#E65F00] active:bg-[#D15600] text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm';

function isValidInternalRedirect(path: string | null): path is string {
  if (!path) return false;
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('://');
}

function resolveSafeRedirect(isTerreno: boolean): string {
  const defaultTarget = isTerreno ? '/proyectos' : '/dashboard';
  if (typeof window === 'undefined' || isTerreno) return defaultTarget;

  const redirectParam = new URLSearchParams(window.location.search).get('redirect');
  return isValidInternalRedirect(redirectParam) ? redirectParam : defaultTarget;
}

function resolveUrlAuthNotice(
  cuentaConfirmada: string | null,
  errorParam: string | null
): { success?: string; error?: string; forceSignIn?: boolean } {
  if (errorParam === 'acceso_whatsapp') return { error: 'Tu perfil trabaja por WhatsApp. El acceso web es exclusivo para administradores y desarrolladores.', forceSignIn: true };
  if (cuentaConfirmada === 'true') {
    return {
      success: 'Correo confirmado. Ya puedes iniciar sesión.',
      forceSignIn: true,
    };
  }
  if (errorParam === 'enlace_expirado') {
    return { error: 'El enlace expiró o ya fue utilizado. Solicita uno nuevo.' };
  }
  if (errorParam === 'error_autenticacion') {
    return { error: 'No se pudo validar el enlace. Inicia sesión o recupera tu clave.' };
  }
  return {};
}

async function executeSignInRequest(
  email: string,
  password: string
): Promise<{ ok: true; redirectTo: string } | { ok: false; errorMsg: string }> {
  const cleanIdent = email.includes('@') ? sanitizeEmail(email) : email.trim();
  if (!cleanIdent) {
    return { ok: false, errorMsg: 'Ingresa tu correo electrónico o RUT.' };
  }
  if (cleanIdent.includes('@') && !isValidEmail(cleanIdent)) {
    return { ok: false, errorMsg: 'El correo electrónico ingresado no es válido.' };
  }
  if (!cleanIdent.includes('@') && !validarRutChileno(cleanIdent)) {
    return { ok: false, errorMsg: 'El RUT ingresado no es válido.' };
  }
  if (!password) {
    return { ok: false, errorMsg: 'Ingresa tu contraseña.' };
  }
  try {
    const result = await signInWithSupabase(cleanIdent, password);
    if (!result.success) {
      return {
        ok: false,
        errorMsg: result.error || 'Correo o contraseña incorrectos.',
      };
    }

    dataService.clearChatSessionHistory();
    const isTerreno = result.user?.rol === 'terreno';
    return { ok: true, redirectTo: resolveSafeRedirect(isTerreno) };
  } catch (err: any) {
    return {
      ok: false,
      errorMsg: err?.message || 'Error al iniciar sesión.',
    };
  }
}

interface ExecuteSignUpArgs {
  signupEmail: string;
  signupPassword: string;
  nombre: string;
  rut: string;
  empresaNombre: string;
  telefono: string;
}

async function executeSignUpRequest(
  args: ExecuteSignUpArgs
): Promise<
  | { status: 'error'; message: string }
  | { status: 'confirm_email'; message: string }
  | { status: 'authenticated'; redirectTo: string }
> {
  try {
    const result = await signUpWithSupabase(
      args.signupEmail,
      args.signupPassword,
      args.nombre,
      args.rut,
      args.empresaNombre,
      args.telefono
    );

    if (!result.success) {
      return { status: 'error', message: result.error || 'No se pudo completar el registro.' };
    }

    if (result.emailConfirmationRequired) {
      return {
        status: 'confirm_email',
        message: 'Revisa tu bandeja de entrada para activar la cuenta.',
      };
    }

    return { status: 'authenticated', redirectTo: resolveSafeRedirect(false) };
  } catch (err: any) {
    return { status: 'error', message: err?.message || 'Error al registrar la cuenta.' };
  }
}

async function executeForgotPasswordRequest(
  forgotEmail: string
): Promise<{ ok: boolean; message: string }> {
  const res = await resetPasswordWithSupabase(forgotEmail);
  if (res.success) {
    return { ok: true, message: 'Enviamos un enlace de recuperación a tu correo.' };
  }
  return { ok: false, message: res.error || 'No se pudo enviar el enlace.' };
}

async function executeResendConfirmationRequest(
  signupEmail: string
): Promise<{ ok: boolean; message: string }> {
  const res = await resendConfirmationEmail(signupEmail);
  if (res.success) {
    return { ok: true, message: 'Correo de activación reenviado.' };
  }
  return { ok: false, message: res.error || 'No se pudo reenviar el correo.' };
}

function PasswordToggleButton({
  visible,
  onToggle,
}: {
  readonly visible: boolean;
  readonly onToggle: () => void;
}) {
  const label = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#9A948A] hover:text-[#1E1E1E] dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
    >
      {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );
}

function AuthStatusBanners({
  errorMsg,
  successMsg,
}: {
  readonly errorMsg: string | null;
  readonly successMsg: string | null;
}) {
  return (
    <>
      {errorMsg && (
        <div
          role="alert"
          className="mb-5 px-3.5 py-2.5 rounded-xl bg-red-50/80 dark:bg-red-950/35 border border-red-200/80 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2 leading-relaxed"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="mb-5 px-3.5 py-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2 leading-relaxed"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}
    </>
  );
}

interface SignInViewProps {
  readonly email: string;
  readonly password: string;
  readonly showPassword: boolean;
  readonly isLoading: boolean;
  readonly onEmailChange: (val: string) => void;
  readonly onPasswordChange: (val: string) => void;
  readonly onTogglePassword: () => void;
  readonly onForgotPassword: () => void;
  readonly onGoToSignUp: () => void;
  readonly onSubmit: (e: React.FormEvent) => void;
}

function SignInView(props: SignInViewProps) {
  return (
    <>
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-1 h-5 rounded-full bg-[#FF6A00]" />
        <h1 className="font-heading text-[20px] font-semibold text-[#1E1E1E] dark:text-white tracking-tight">
          Iniciar sesión
        </h1>
      </div>

      <form onSubmit={props.onSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="login-email" className={LABEL_CLASS}>
            Correo o RUT
          </label>
          <input
            id="login-email"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="username"
            value={props.email}
            onChange={(e) => props.onEmailChange(e.target.value)}
            className={INPUT_CLASS}
            placeholder="nombre@empresa.cl o 12.345.678-5"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="login-password"
              className="text-[13px] font-medium text-[#3A3835] dark:text-gray-300"
            >
              Contraseña
            </label>
            <button
              type="button"
              onClick={props.onForgotPassword}
              className="text-xs text-[#7D776E] hover:text-[#1E1E1E] dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              ¿Olvidaste tu clave?
            </button>
          </div>
          <div className="relative">
            <input
              id="login-password"
              name="password"
              type={props.showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={props.password}
              onChange={(e) => props.onPasswordChange(e.target.value)}
              className={`${INPUT_CLASS} pr-10`}
              placeholder="••••••••"
              required
            />
            <PasswordToggleButton visible={props.showPassword} onToggle={props.onTogglePassword} />
          </div>
        </div>

        <div className="pt-1">
          <button type="submit" disabled={props.isLoading} className={PRIMARY_BTN_CLASS}>
            {props.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ingresar'}
          </button>
        </div>
      </form>

      <div className="mt-6 pt-5 border-t border-[#EFECE6] dark:border-[#1E2633] text-center text-[13px] text-[#7D776E] dark:text-gray-400">
        ¿No tienes cuenta?{' '}
        <button
          type="button"
          onClick={props.onGoToSignUp}
          className="font-medium text-gray-900 dark:text-white hover:text-[#FF6A00] dark:hover:text-[#FF8533]"
        >
          Crear cuenta
        </button>
      </div>
    </>
  );
}

interface SignUpViewProps {
  readonly nombre: string;
  readonly rut: string;
  readonly empresaNombre: string;
  readonly signupEmail: string;
  readonly telefono: string;
  readonly signupPassword: string;
  readonly signupConfirmPassword: string;
  readonly showPassword: boolean;
  readonly acceptTerms: boolean;
  readonly isLoading: boolean;
  readonly onNombreChange: (val: string) => void;
  readonly onRutChange: (val: string) => void;
  readonly onEmpresaChange: (val: string) => void;
  readonly onEmailChange: (val: string) => void;
  readonly onTelefonoChange: (val: string) => void;
  readonly onPasswordChange: (val: string) => void;
  readonly onConfirmPasswordChange: (val: string) => void;
  readonly onTogglePassword: () => void;
  readonly onAcceptTermsChange: (checked: boolean) => void;
  readonly onOpenLegalTab: (tab: LegalTab) => void;
  readonly onGoToSignIn: () => void;
  readonly onSubmit: (e: React.FormEvent) => void;
}

function SignUpView(props: SignUpViewProps) {
  const isRutValid = props.rut ? validarRutChileno(props.rut) : true;
  const rutStateClass = isRutValid ? '' : 'border-red-400 focus:border-red-500';
  const hasTypedEmail = sanitizeEmail(props.signupEmail).length > 0;
  const isEmailValid = !hasTypedEmail || isValidEmail(props.signupEmail);
  const emailStateClass = isEmailValid ? '' : 'border-red-400 focus:border-red-500';
  const hasTypedPhone = props.telefono.replace(/\D/g, '').length > 3;
  const isPhoneValid = !hasTypedPhone || Boolean(canonicalPhone(props.telefono));
  const phoneStateClass = isPhoneValid ? '' : 'border-red-400 focus:border-red-500';

  return (
    <>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-1 h-5 rounded-full bg-[#FF6A00]" />
        <h1 className="font-heading text-[20px] font-semibold text-[#1E1E1E] dark:text-white tracking-tight">
          Crear cuenta
        </h1>
      </div>

      <form onSubmit={props.onSubmit} noValidate className="space-y-3.5">
        <div>
          <label htmlFor="signup-nombre" className={LABEL_CLASS}>
            Nombre completo
          </label>
          <input
            id="signup-nombre"
            name="nombre"
            type="text"
            autoComplete="name"
            required
            placeholder="Rodrigo Morales"
            value={props.nombre}
            onChange={(e) => props.onNombreChange(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="signup-empresa" className={LABEL_CLASS}>
              Nombre comercial (opcional)
            </label>
            <input
              id="signup-empresa"
              name="organization"
              type="text"
              autoComplete="organization"
              placeholder="Tu nombre o el de tu empresa"
              value={props.empresaNombre}
              onChange={(e) => props.onEmpresaChange(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="signup-rut"
                className="text-[13px] font-medium text-[#3A3835] dark:text-gray-300"
              >
                RUT personal (opcional)
              </label>
              {props.rut && !isRutValid && (
                <span className="text-[11px] text-red-600 dark:text-red-400">Inválido</span>
              )}
            </div>
            <input
              id="signup-rut"
              name="rut"
              type="text"
              maxLength={12}
              placeholder="12.345.678-5"
              value={props.rut}
              onChange={(e) => props.onRutChange(formatRUT(e.target.value))}
              className={`${INPUT_CLASS} font-mono ${rutStateClass}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="signup-email"
                className="text-[13px] font-medium text-[#3A3835] dark:text-gray-300"
              >
                Correo
              </label>
              {hasTypedEmail && !isEmailValid && (
                <span className="text-[11px] text-red-600 dark:text-red-400">Inválido</span>
              )}
            </div>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="contacto@empresa.cl"
              value={props.signupEmail}
              onChange={(e) => props.onEmailChange(e.target.value)}
              className={`${INPUT_CLASS} ${emailStateClass}`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="signup-telefono"
                className="text-[13px] font-medium text-[#3A3835] dark:text-gray-300"
              >
                Teléfono
              </label>
              {hasTypedPhone && !isPhoneValid && (
                <span className="text-[11px] text-red-600 dark:text-red-400">Inválido</span>
              )}
            </div>
            <input
              id="signup-telefono"
              name="tel"
              type="tel"
              autoComplete="tel"
              required
              placeholder="+56 9 1234 5678"
              value={props.telefono}
              onChange={(e) => props.onTelefonoChange(e.target.value)}
              className={`${INPUT_CLASS} font-mono ${phoneStateClass}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="signup-password" className={LABEL_CLASS}>
              Contraseña
            </label>
            <div className="relative">
              <input
                id="signup-password"
                name="new-password"
                type={props.showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="Mín. 6 caracteres"
                value={props.signupPassword}
                onChange={(e) => props.onPasswordChange(e.target.value)}
                className={`${INPUT_CLASS} pr-10`}
              />
              <PasswordToggleButton
                visible={props.showPassword}
                onToggle={props.onTogglePassword}
              />
            </div>
          </div>

          <div>
            <label htmlFor="signup-confirm-password" className={LABEL_CLASS}>
              Confirmar
            </label>
            <input
              id="signup-confirm-password"
              name="confirm-password"
              type={props.showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Repetir clave"
              value={props.signupConfirmPassword}
              onChange={(e) => props.onConfirmPasswordChange(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="flex items-start gap-2.5 pt-1">
          <input
            id="signup-accept-terms"
            type="checkbox"
            required
            checked={props.acceptTerms}
            onChange={(e) => props.onAcceptTermsChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#C8C0B2] text-[#FF6A00] focus:ring-[#FF6A00] shrink-0 cursor-pointer"
          />
          <span className="text-xs text-[#6E6A63] dark:text-gray-400 leading-relaxed">
            <label htmlFor="signup-accept-terms" className="cursor-pointer">
              Acepto los{' '}
            </label>
            <button
              type="button"
              onClick={() => props.onOpenLegalTab('terminos')}
              className="text-gray-900 dark:text-gray-200 underline underline-offset-2 hover:text-[#FF6A00]"
            >
              Términos
            </button>{' '}
            y la{' '}
            <button
              type="button"
              onClick={() => props.onOpenLegalTab('privacidad')}
              className="text-gray-900 dark:text-gray-200 underline underline-offset-2 hover:text-[#FF6A00]"
            >
              Política de Privacidad
            </button>
            .
          </span>
        </div>

        <div className="pt-1">
          <button
            type="submit"
            disabled={props.isLoading}
            className={PRIMARY_BTN_CLASS}
          >
            {props.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear cuenta'}
          </button>
        </div>
      </form>

      <div className="mt-5 pt-4 border-t border-[#EFECE6] dark:border-[#1E2633] text-center text-[13px] text-[#7D776E] dark:text-gray-400">
        ¿Ya tienes cuenta?{' '}
        <button
          type="button"
          onClick={props.onGoToSignIn}
          className="font-medium text-gray-900 dark:text-white hover:text-[#FF6A00] dark:hover:text-[#FF8533]"
        >
          Iniciar sesión
        </button>
      </div>
    </>
  );
}

function ForgotPasswordView({
  forgotEmail,
  isLoading,
  onEmailChange,
  onBack,
  onSubmit,
}: {
  readonly forgotEmail: string;
  readonly isLoading: boolean;
  readonly onEmailChange: (val: string) => void;
  readonly onBack: () => void;
  readonly onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-1 h-5 rounded-full bg-[#FF6A00]" />
        <h1 className="font-heading text-[20px] font-semibold text-[#1E1E1E] dark:text-white tracking-tight">
          Recuperar contraseña
        </h1>
      </div>
      <p className="text-[13px] text-[#7D776E] dark:text-gray-400 mb-5 pl-3.5">
        Enviaremos un enlace a tu correo para restablecer tu clave.
      </p>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="forgot-email" className={LABEL_CLASS}>
            Correo
          </label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            value={forgotEmail}
            onChange={(e) => onEmailChange(e.target.value)}
            className={INPUT_CLASS}
            placeholder="nombre@empresa.cl"
            required
          />
        </div>

        <button type="submit" disabled={isLoading} className={PRIMARY_BTN_CLASS}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar enlace'}
        </button>
      </form>

      <div className="mt-5 pt-4 border-t border-[#EFECE6] dark:border-[#1E2633] text-center">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] font-medium text-[#7D776E] hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          Volver a iniciar sesión
        </button>
      </div>
    </>
  );
}

function ConfirmEmailView({
  signupEmail,
  isResending,
  onResend,
  onGoToSignIn,
}: {
  readonly signupEmail: string;
  readonly isResending: boolean;
  readonly onResend: () => void;
  readonly onGoToSignIn: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-5 rounded-full bg-[#FF6A00]" />
        <h1 className="font-heading text-[20px] font-semibold text-[#1E1E1E] dark:text-white tracking-tight">
          Confirma tu correo
        </h1>
      </div>

      <p className="text-[13px] text-[#7D776E] dark:text-gray-400 leading-relaxed pl-3.5">
        Enviamos un enlace de activación a{' '}
        <span className="font-medium text-gray-900 dark:text-gray-200 break-all">
          {signupEmail || 'tu correo'}
        </span>
        .
      </p>

      <div className="pt-2 space-y-2.5">
        <button type="button" onClick={onGoToSignIn} className={PRIMARY_BTN_CLASS}>
          Ir a iniciar sesión
        </button>

        <button
          type="button"
          onClick={onResend}
          disabled={isResending}
          className="h-10 w-full text-xs font-medium text-[#7D776E] hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-50"
        >
          {isResending ? 'Reenviando...' : 'Reenviar correo de activación'}
        </button>
      </div>
    </div>
  );
}

function useUrlAuthNotice(
  searchParams: ReturnType<typeof useSearchParams>,
  onSuccess: (msg: string) => void,
  onError: (msg: string) => void,
  onForceSignIn: () => void
) {
  useEffect(() => {
    const notice = resolveUrlAuthNotice(
      searchParams.get('cuenta_confirmada'),
      searchParams.get('error')
    );
    if (notice.success) onSuccess(notice.success);
    if (notice.error) onError(notice.error);
    if (notice.forceSignIn) onForceSignIn();
  }, [searchParams, onSuccess, onError, onForceSignIn]);
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  useEffect(() => {
    if (searchParams.get('error') === 'acceso_whatsapp') return;
    let current = true;
    void resumeSupabaseSession().then(result => {
      if (!current || !result) return;
      if (result.success) router.replace(resolveSafeRedirect(false));
      else setErrorMsg(result.error || 'No se pudo renovar el acceso.');
    });
    return () => { current = false; };
  }, [router, searchParams]);
  const [showPassword, setShowPassword] = useState(false);

  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTab>('terminos');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [telefono, setTelefono] = useState('+56 9 ');

  const [forgotEmail, setForgotEmail] = useState('');

  const forceSignInMode = React.useCallback(() => setMode('signin'), []);
  useUrlAuthNotice(searchParams, setSuccessMsg, setErrorMsg, forceSignInMode);

  const openLegalTab = (tab: LegalTab) => {
    setLegalModalTab(tab);
    setIsLegalModalOpen(true);
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    const outcome = await executeSignInRequest(email, password);
    if (!outcome.ok) {
      setErrorMsg(outcome.errorMsg);
      setIsLoading(false);
      return;
    }

    router.replace(outcome.redirectTo);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanSignupEmail = sanitizeEmail(signupEmail).toLowerCase();
    const validationError = validateSignUpFields({
      nombre,
      rut,
      email: cleanSignupEmail,
      telefono,
      empresaNombre,
      signupPassword,
      signupConfirmPassword,
      acceptTerms,
    });
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setIsLoading(true);
    const outcome = await executeSignUpRequest({
      signupEmail: cleanSignupEmail,
      signupPassword,
      nombre,
      rut,
      empresaNombre,
      telefono,
    });
    setIsLoading(false);

    if (outcome.status === 'error') {
      setErrorMsg(outcome.message);
      return;
    }
    if (outcome.status === 'confirm_email') {
      setMode('confirm_email');
      setSuccessMsg(outcome.message);
      return;
    }
    router.replace(outcome.redirectTo);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const cleanForgot = sanitizeEmail(forgotEmail).toLowerCase();
    if (!isValidEmail(cleanForgot)) {
      setErrorMsg('Ingresa un correo electrónico válido para recuperar tu contraseña.');
      return;
    }
    setIsLoading(true);
    const outcome = await executeForgotPasswordRequest(cleanForgot);
    setIsLoading(false);
    setSuccessMsg(outcome.ok ? outcome.message : null);
    setErrorMsg(outcome.ok ? null : outcome.message);
  };

  const handleResendConfirmation = async () => {
    if (!signupEmail) return;
    setIsResending(true);
    setErrorMsg(null);
    const outcome = await executeResendConfirmationRequest(signupEmail);
    setIsResending(false);
    if (outcome.ok) setSuccessMsg(outcome.message);
    else setErrorMsg(outcome.message);
  };

  const cardWidthClass = mode === 'signup' ? 'max-w-[440px]' : 'max-w-[396px]';

  return (
    <div className="min-h-screen w-full flex flex-col lg:grid lg:grid-cols-12 bg-[#FAF8F5] dark:bg-[#0B0E14]">
      <BlueprintBrandPanel />

      <section className="flex-1 lg:col-span-7 flex flex-col items-center justify-center px-5 sm:px-10 py-12 relative overflow-hidden">
        {/* Retícula técnica de dibujo de planos / Blueprint grid tenue con personalidad de obra */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none opacity-40 dark:opacity-20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="arch-draft-grid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path
                d="M 36 0 L 0 0 0 36"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.6"
                className="text-[#D8D1C4] dark:text-[#253041]"
              />
              <path
                d="M 17 18 L 19 18 M 18 17 L 18 19"
                stroke="currentColor"
                strokeWidth="0.8"
                className="text-[#FF6A00]/40 dark:text-[#FF6A00]/30"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#arch-draft-grid)" />
        </svg>

        {/* Distintivo de ingeniería / faena */}
        <div className="relative z-10 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFEBE1]/80 dark:bg-[#141B26]/80 border border-[#DDD5C5] dark:border-[#263346] text-[11px] font-mono font-medium text-[#6B6355] dark:text-gray-300 mb-6 backdrop-blur-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00]" />
          <span>PORTAL DE ACCESO A FAENA</span>
        </div>

        <div
          className={`relative z-10 w-full ${cardWidthClass} bg-white/95 dark:bg-[#141A23]/95 backdrop-blur-sm border border-[#E7E2D8] dark:border-[#232C3B] rounded-2xl p-7 sm:p-8 shadow-[0_4px_24px_-4px_rgba(20,25,32,0.06)] dark:shadow-[0_16px_36px_-12px_rgba(0,0,0,0.55)] transition-all duration-200`}
        >
          <AuthStatusBanners errorMsg={errorMsg} successMsg={successMsg} />

          {mode === 'signin' && (
            <SignInView
              email={email}
              password={password}
              showPassword={showPassword}
              isLoading={isLoading}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onTogglePassword={() => setShowPassword((prev) => !prev)}
              onForgotPassword={() => {
                setForgotEmail(email);
                switchMode('forgot_password');
              }}
              onGoToSignUp={() => switchMode('signup')}
              onSubmit={handleLogin}
            />
          )}

          {mode === 'signup' && (
            <SignUpView
              nombre={nombre}
              rut={rut}
              empresaNombre={empresaNombre}
              signupEmail={signupEmail}
              telefono={telefono}
              signupPassword={signupPassword}
              signupConfirmPassword={signupConfirmPassword}
              showPassword={showPassword}
              acceptTerms={acceptTerms}
              isLoading={isLoading}
              onNombreChange={setNombre}
              onRutChange={setRut}
              onEmpresaChange={setEmpresaNombre}
              onEmailChange={setSignupEmail}
              onTelefonoChange={setTelefono}
              onPasswordChange={setSignupPassword}
              onConfirmPasswordChange={setSignupConfirmPassword}
              onTogglePassword={() => setShowPassword((prev) => !prev)}
              onAcceptTermsChange={setAcceptTerms}
              onOpenLegalTab={openLegalTab}
              onGoToSignIn={() => switchMode('signin')}
              onSubmit={handleSignUp}
            />
          )}

          {mode === 'forgot_password' && (
            <ForgotPasswordView
              forgotEmail={forgotEmail}
              isLoading={isLoading}
              onEmailChange={setForgotEmail}
              onBack={() => switchMode('signin')}
              onSubmit={handleForgotPassword}
            />
          )}

          {mode === 'confirm_email' && (
            <ConfirmEmailView
              signupEmail={signupEmail}
              isResending={isResending}
              onResend={handleResendConfirmation}
              onGoToSignIn={() => {
                setEmail(signupEmail);
                switchMode('signin');
              }}
            />
          )}
        </div>

        <footer className="relative z-10 mt-7 flex flex-wrap items-center justify-center gap-3 text-[11px] text-[#8C867C] dark:text-gray-500">
          <Link
            href="/precios"
            className="hover:text-gray-900 dark:hover:text-gray-300"
          >
            Planes y Precios
          </Link>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => openLegalTab('terminos')}
            className="hover:text-gray-900 dark:hover:text-gray-300"
          >
            Términos
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => openLegalTab('privacidad')}
            className="hover:text-gray-900 dark:hover:text-gray-300"
          >
            Privacidad
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => openLegalTab('ciberseguridad')}
            className="hover:text-gray-900 dark:hover:text-gray-300"
          >
            Seguridad
          </button>
        </footer>
      </section>

      <LegalTermsModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
        initialTab={legalModalTab}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-[#FAF8F5] dark:bg-[#0B0E14]">
          <Loader2 className="w-6 h-6 animate-spin text-[#FF6A00]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
