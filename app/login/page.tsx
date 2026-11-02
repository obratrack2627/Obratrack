'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Lock,
  Mail,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  User,
  Building2,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Send,
  Phone,
  Check,
} from 'lucide-react';
import Logo from '@/components/Logo';
import LegalTermsModal from '@/components/LegalTermsModal';
import { formatRUT, validarRutChileno } from '@/lib/utils';
import {
  signInWithSupabase,
  signUpWithSupabase,
  resetPasswordWithSupabase,
  resendConfirmationEmail,
} from '@/lib/supabase/auth';
import { dataService } from '@/lib/data-service';

type AuthMode = 'signin' | 'signup' | 'forgot_password' | 'confirm_email';
type LegalTab = 'terminos' | 'privacidad' | 'ciberseguridad';

const INPUT_BASE_CLASS =
  'h-11 w-full bg-[#FFFFFF] dark:bg-[#0F141C] border border-[#D5CEC0] dark:border-[#263040] rounded-xl text-sm text-[#1E1E1E] dark:text-gray-100 placeholder:text-[#9A9A9A] dark:placeholder:text-gray-500 focus:outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15 transition-colors';

const HEADER_COPY: Record<AuthMode, { title: string; subtitle: string }> = {
  signin: {
    title: 'Ingresa a tu cuenta',
    subtitle: 'Accede al panel de obras, presupuestos y control financiero.',
  },
  signup: {
    title: 'Registra tu constructora',
    subtitle: 'Crea la cuenta titular de tu empresa para gestionar obras y cuadrillas.',
  },
  forgot_password: {
    title: 'Recuperar contraseña',
    subtitle: 'Ingresa tu correo y te enviaremos un enlace seguro para restablecer tu clave.',
  },
  confirm_email: {
    title: 'Confirma tu correo electrónico',
    subtitle: 'Activa tu acceso desde el mensaje enviado a tu casilla corporativa.',
  },
};

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

interface SignUpValidationArgs {
  acceptTerms: boolean;
  rut: string;
  empresaNombre: string;
  signupPassword: string;
  signupConfirmPassword: string;
}

function validateSignUpFields(args: SignUpValidationArgs): string | null {
  if (!args.acceptTerms) {
    return 'Debes aceptar los Términos de Servicio y la Política de Privacidad para registrar tu empresa.';
  }
  if (!validarRutChileno(args.rut)) {
    return 'El RUT ingresado no es válido según el cálculo oficial chileno (Módulo 11).';
  }
  if (args.empresaNombre.trim().length < 3) {
    return 'Ingresa el nombre comercial o razón social de tu constructora o contratista.';
  }
  if (args.signupPassword !== args.signupConfirmPassword) {
    return 'Las contraseñas ingresadas no coinciden.';
  }
  if (args.signupPassword.length < 6) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  return null;
}

function resolveUrlAuthNotice(
  cuentaConfirmada: string | null,
  errorParam: string | null
): { success?: string; error?: string; forceSignIn?: boolean } {
  if (cuentaConfirmada === 'true') {
    return {
      success: 'Tu correo fue confirmado correctamente. Ya puedes ingresar a tu cuenta.',
      forceSignIn: true,
    };
  }
  if (errorParam === 'enlace_expirado') {
    return {
      error:
        'El enlace de confirmación o recuperación expiró o ya fue utilizado. Solicita uno nuevo.',
    };
  }
  if (errorParam === 'error_autenticacion') {
    return {
      error:
        'No pudimos validar el enlace de acceso. Inicia sesión nuevamente o solicita recuperar tu contraseña.',
    };
  }
  return {};
}

function CorporateLeftPanel() {
  return (
    <>
      {/* Encabezado compacto móvil (< lg) */}
      <header className="lg:hidden bg-[#141920] border-b border-[#232B36] relative">
        <div className="h-[3px] w-full bg-[#FF6A00]" />
        <div className="px-5 py-3.5 pr-16 flex items-center justify-between">
          <Logo variant="horizontal" theme="dark" size="sm" />
          <span className="text-[11px] font-medium text-[#94A3B8] hidden sm:inline">
            Gestión de Obras · Chile
          </span>
        </div>
      </header>

      {/* Panel Institucional Izquierdo (Desktop lg+) */}
      <aside className="hidden lg:flex lg:col-span-5 bg-[#141920] text-white border-r border-[#232B36] flex-col justify-between relative overflow-hidden select-none">
        <div className="h-[3px] w-full bg-[#FF6A00] shrink-0" />

        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #FFFFFF 1px, transparent 1px), linear-gradient(to bottom, #FFFFFF 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 flex-1 flex flex-col justify-between p-10 xl:p-12">
          <div className="flex items-center justify-between gap-4">
            <Logo variant="horizontal" theme="dark" size="md" />
            <span className="text-xs font-medium text-[#94A3B8] tracking-tight">
              Plataforma B2B · Chile
            </span>
          </div>

          <div className="my-auto py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#FF6A00] mb-3">
              Control de Obra y Presupuestos
            </p>
            <h2 className="font-heading text-[28px] xl:text-[32px] font-bold leading-[1.18] tracking-tight text-white">
              Presupuestos, avance físico y estados de pago en un solo lugar.
            </h2>
            <p className="text-[15px] leading-relaxed text-[#94A3B8] mt-3.5 max-w-md">
              Diseñado para constructoras y contratistas en Chile. Centraliza cubicaciones con IVA
              (19%), Carta Gantt por partidas, compras de materiales y reportes desde terreno sin
              depender de planillas sueltas.
            </p>

            {/* Resumen Ejecutivo Sobrio de Obra */}
            <div className="mt-8 rounded-xl bg-[#1B222C] border border-[#2A3442] overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-[#2A3442] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    Remodelación Comercial Providencia
                  </p>
                  <p className="text-[11px] text-[#94A3B8] truncate mt-0.5">
                    Mandante: Inmobiliaria Santa Elena SpA · Obra activa
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#86EFAC] bg-[#14532D]/40 border border-[#166534]/60 px-2.5 py-0.5 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]" />
                  En ejecución
                </span>
              </div>

              <div className="grid grid-cols-3 divide-x divide-[#2A3442] bg-[#171D26]">
                <div className="px-3.5 py-3">
                  <p className="text-[11px] text-[#94A3B8]">Presupuesto neto</p>
                  <p className="font-mono text-xs xl:text-[13px] font-semibold text-white mt-1">
                    $42.850.000
                  </p>
                </div>
                <div className="px-3.5 py-3">
                  <p className="text-[11px] text-[#94A3B8]">Avance físico</p>
                  <p className="font-mono text-xs xl:text-[13px] font-semibold text-white mt-1">
                    68% ejecutado
                  </p>
                  <div className="h-1 w-full bg-[#2A3442] rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full w-[68%] bg-[#FF6A00] rounded-full" />
                  </div>
                </div>
                <div className="px-3.5 py-3">
                  <p className="text-[11px] text-[#94A3B8]">Estado de pago</p>
                  <p className="font-mono text-xs xl:text-[13px] font-semibold text-[#E2E8F0] mt-1">
                    EDP-002 al día
                  </p>
                </div>
              </div>
            </div>

            <ul className="mt-6 space-y-2.5 text-[13px] text-[#CBD5E1]">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                <span>Estados de pago con retención contractual, anticipos e IVA (19%)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                <span>Perfiles diferenciados para administración de obra y jefes de terreno</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#FF6A00] shrink-0" />
                <span>Entorno multiempresa validado con RUT chileno (Módulo 11)</span>
              </li>
            </ul>
          </div>

          <div className="pt-5 border-t border-[#232B36] flex items-center justify-between text-xs text-[#64748B]">
            <span>© {new Date().getFullYear()} ObraTrack Chile</span>
            <span>Operación en las 16 regiones del país</span>
          </div>
        </div>
      </aside>
    </>
  );
}

interface PasswordToggleButtonProps {
  readonly visible: boolean;
  readonly onToggle: () => void;
}

function PasswordToggleButton({ visible, onToggle }: PasswordToggleButtonProps) {
  const label = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#8C857B] hover:text-[#1E1E1E] dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
    >
      {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );
}

interface SignInSectionProps {
  readonly email: string;
  readonly password: string;
  readonly showPassword: boolean;
  readonly isLoading: boolean;
  readonly onEmailChange: (val: string) => void;
  readonly onPasswordChange: (val: string) => void;
  readonly onTogglePassword: () => void;
  readonly onForgotPassword: () => void;
  readonly onSubmit: (e: React.FormEvent) => void;
}

function SignInSection({
  email,
  password,
  showPassword,
  isLoading,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onForgotPassword,
  onSubmit,
}: SignInSectionProps) {
  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="login-email"
            className="block text-sm font-medium text-[#1E1E1E] dark:text-gray-200 mb-1.5"
          >
            Correo electrónico
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#8C857B] dark:text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className={`${INPUT_BASE_CLASS} pl-10 pr-3.5`}
              placeholder="nombre@constructora.cl"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="login-password"
              className="text-sm font-medium text-[#1E1E1E] dark:text-gray-200"
            >
              Contraseña
            </label>
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-xs font-medium text-[#C85200] dark:text-[#FF8533] hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#8C857B] dark:text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className={`${INPUT_BASE_CLASS} pl-10 pr-10`}
              placeholder="Ingresa tu contraseña"
              required
            />
            <PasswordToggleButton visible={showPassword} onToggle={onTogglePassword} />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="h-11 w-full mt-2 bg-[#FF6A00] hover:bg-[#E55F00] active:bg-[#CC5500] text-white font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verificando acceso...</span>
            </>
          ) : (
            <>
              <span>Ingresar al panel</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-5 pt-4 border-t border-[#E5DFC9] dark:border-[#1E2633]">
        <p className="text-xs text-[#666666] dark:text-gray-400 leading-relaxed">
          <strong className="font-semibold text-[#1E1E1E] dark:text-gray-200">
            ¿Acceso de terreno?
          </strong>{' '}
          Si eres jefe de obra o maestro, ingresa con el correo y clave habilitados por el
          administrador de tu constructora.
        </p>
      </div>
    </>
  );
}

interface SignUpSectionProps {
  readonly nombre: string;
  readonly rut: string;
  readonly empresaNombre: string;
  readonly signupEmail: string;
  readonly telefono: string;
  readonly signupPassword: string;
  readonly signupConfirmPassword: string;
  readonly showPassword: boolean;
  readonly acceptTerms: boolean;
  readonly acceptMarketing: boolean;
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
  readonly onAcceptMarketingChange: (checked: boolean) => void;
  readonly onOpenLegalTab: (tab: LegalTab) => void;
  readonly onSubmit: (e: React.FormEvent) => void;
}

function RutStatusBadge({ rut, isValid }: { readonly rut: string; readonly isValid: boolean }) {
  if (!rut) return null;
  const badgeClass = isValid
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
  return (
    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${badgeClass}`}>
      {isValid ? 'Válido' : 'Revisar'}
    </span>
  );
}

function SignUpSection(props: SignUpSectionProps) {
  const isRutValid = props.rut ? validarRutChileno(props.rut) : true;
  const rutBorderClass = isRutValid
    ? 'border-[#D5CEC0] dark:border-[#263040] focus:border-[#FF6A00] focus:ring-[#FF6A00]/15'
    : 'border-red-500 focus:border-red-500 focus:ring-red-500/15';

  return (
    <form onSubmit={props.onSubmit} className="space-y-3.5">
      <div className="p-3.5 rounded-xl bg-[#F2EDE2] dark:bg-[#141A23] border border-[#E2DAC9] dark:border-[#263040] text-xs text-[#4A4640] dark:text-gray-300 leading-relaxed">
        Registro para titulares de constructoras o contratistas generales. Una vez creada la cuenta
        podrás agregar obras y habilitar usuarios de terreno.
      </div>

      <div>
        <label
          htmlFor="signup-nombre"
          className="block text-sm font-medium text-[#1E1E1E] dark:text-gray-200 mb-1"
        >
          Nombre del responsable
        </label>
        <div className="relative">
          <User className="w-4 h-4 text-[#8C857B] dark:text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="signup-nombre"
            name="nombre"
            type="text"
            autoComplete="name"
            required
            placeholder="Ej. Rodrigo Morales"
            value={props.nombre}
            onChange={(e) => props.onNombreChange(e.target.value)}
            className={`${INPUT_BASE_CLASS} pl-10 pr-3.5`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="signup-rut"
              className="text-sm font-medium text-[#1E1E1E] dark:text-gray-200"
            >
              RUT empresa o personal
            </label>
            <RutStatusBadge rut={props.rut} isValid={isRutValid} />
          </div>
          <input
            id="signup-rut"
            name="rut"
            type="text"
            required
            maxLength={12}
            placeholder="76.543.210-K"
            value={props.rut}
            onChange={(e) => props.onRutChange(formatRUT(e.target.value))}
            className={`h-11 w-full px-3.5 bg-[#FFFFFF] dark:bg-[#0F141C] border rounded-xl text-sm font-mono text-[#1E1E1E] dark:text-gray-100 placeholder:text-[#9A9A9A] focus:outline-none focus:ring-2 transition-colors ${rutBorderClass}`}
          />
        </div>

        <div>
          <label
            htmlFor="signup-empresa"
            className="block text-sm font-medium text-[#1E1E1E] dark:text-gray-200 mb-1"
          >
            Constructora / Contratista
          </label>
          <div className="relative">
            <Building2 className="w-4 h-4 text-[#8C857B] dark:text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="signup-empresa"
              name="organization"
              type="text"
              autoComplete="organization"
              required
              placeholder="Constructora Los Andes"
              value={props.empresaNombre}
              onChange={(e) => props.onEmpresaChange(e.target.value)}
              className={`${INPUT_BASE_CLASS} pl-10 pr-3.5`}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="signup-email"
            className="block text-sm font-medium text-[#1E1E1E] dark:text-gray-200 mb-1"
          >
            Correo corporativo
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#8C857B] dark:text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="contacto@empresa.cl"
              value={props.signupEmail}
              onChange={(e) => props.onEmailChange(e.target.value)}
              className={`${INPUT_BASE_CLASS} pl-10 pr-3.5`}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="signup-telefono"
            className="block text-sm font-medium text-[#1E1E1E] dark:text-gray-200 mb-1"
          >
            Teléfono / WhatsApp
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-[#8C857B] dark:text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="signup-telefono"
              name="tel"
              type="tel"
              autoComplete="tel"
              required
              placeholder="+56 9 1234 5678"
              value={props.telefono}
              onChange={(e) => props.onTelefonoChange(e.target.value)}
              className={`${INPUT_BASE_CLASS} pl-10 pr-3.5 font-mono`}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="signup-password"
            className="block text-sm font-medium text-[#1E1E1E] dark:text-gray-200 mb-1"
          >
            Contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#8C857B] dark:text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
              className={`${INPUT_BASE_CLASS} pl-10 pr-10`}
            />
            <PasswordToggleButton visible={props.showPassword} onToggle={props.onTogglePassword} />
          </div>
        </div>

        <div>
          <label
            htmlFor="signup-confirm-password"
            className="block text-sm font-medium text-[#1E1E1E] dark:text-gray-200 mb-1"
          >
            Confirmar contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#8C857B] dark:text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="signup-confirm-password"
              name="confirm-password"
              type={props.showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Repite tu clave"
              value={props.signupConfirmPassword}
              onChange={(e) => props.onConfirmPasswordChange(e.target.value)}
              className={`${INPUT_BASE_CLASS} pl-10 pr-3.5`}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2.5 pt-1">
        <div className="flex items-start gap-2.5">
          <input
            id="signup-accept-terms"
            type="checkbox"
            required
            checked={props.acceptTerms}
            onChange={(e) => props.onAcceptTermsChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#C8C0B0] text-[#FF6A00] focus:ring-[#FF6A00] shrink-0 cursor-pointer"
          />
          <span className="text-xs text-[#555555] dark:text-gray-400 leading-relaxed">
            <label htmlFor="signup-accept-terms" className="cursor-pointer">
              He leído y acepto los{' '}
            </label>
            <button
              type="button"
              onClick={() => props.onOpenLegalTab('terminos')}
              className="text-[#C85200] dark:text-[#FF8533] underline font-medium hover:text-[#E55F00]"
            >
              Términos de Servicio
            </button>{' '}
            y la{' '}
            <button
              type="button"
              onClick={() => props.onOpenLegalTab('privacidad')}
              className="text-[#C85200] dark:text-[#FF8533] underline font-medium hover:text-[#E55F00]"
            >
              Política de Privacidad
            </button>{' '}
            (Leyes N° 19.496 y 21.719).
          </span>
        </div>

        <div className="flex items-start gap-2.5">
          <input
            id="signup-accept-marketing"
            type="checkbox"
            checked={props.acceptMarketing}
            onChange={(e) => props.onAcceptMarketingChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#C8C0B0] text-[#FF6A00] focus:ring-[#FF6A00] shrink-0 cursor-pointer"
          />
          <label
            htmlFor="signup-accept-marketing"
            className="text-xs text-[#666666] dark:text-gray-400 leading-relaxed cursor-pointer select-none"
          >
            Deseo recibir actualizaciones sobre precios de materiales y mejoras de la plataforma
            (opcional).
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={props.isLoading || !props.acceptTerms || !isRutValid}
        className="h-11 w-full mt-2 bg-[#FF6A00] hover:bg-[#E55F00] active:bg-[#CC5500] text-white font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
      >
        {props.isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Registrando empresa...</span>
          </>
        ) : (
          <>
            <span>Crear cuenta de empresa</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );
}

interface ForgotPasswordSectionProps {
  readonly forgotEmail: string;
  readonly isLoading: boolean;
  readonly onEmailChange: (val: string) => void;
  readonly onBack: () => void;
  readonly onSubmit: (e: React.FormEvent) => void;
}

function ForgotPasswordSection({
  forgotEmail,
  isLoading,
  onEmailChange,
  onBack,
  onSubmit,
}: ForgotPasswordSectionProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="forgot-email"
          className="block text-sm font-medium text-[#1E1E1E] dark:text-gray-200 mb-1.5"
        >
          Correo electrónico registrado
        </label>
        <div className="relative">
          <Mail className="w-4 h-4 text-[#8C857B] dark:text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            value={forgotEmail}
            onChange={(e) => onEmailChange(e.target.value)}
            className={`${INPUT_BASE_CLASS} pl-10 pr-3.5`}
            placeholder="nombre@constructora.cl"
            required
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
        <button
          type="submit"
          disabled={isLoading}
          className="h-11 flex-1 bg-[#FF6A00] hover:bg-[#E55F00] text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Enviando enlace...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Enviar enlace de recuperación</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="h-11 px-4 bg-[#ECE7DC] dark:bg-[#1A2230] hover:bg-[#E2DAC9] dark:hover:bg-[#222C3D] text-[#1E1E1E] dark:text-gray-200 font-medium rounded-xl text-sm flex items-center justify-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>
      </div>
    </form>
  );
}

interface ConfirmEmailSectionProps {
  readonly signupEmail: string;
  readonly isResending: boolean;
  readonly onResend: () => void;
  readonly onGoToSignIn: () => void;
}

function ConfirmEmailSection({
  signupEmail,
  isResending,
  onResend,
  onGoToSignIn,
}: ConfirmEmailSectionProps) {
  return (
    <div className="p-6 rounded-2xl bg-[#FFFFFF] dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] space-y-4">
      <div className="w-11 h-11 rounded-xl bg-[#FF6A00]/10 border border-[#FF6A00]/20 flex items-center justify-center text-[#FF6A00]">
        <Mail className="w-5 h-5" />
      </div>

      <div className="space-y-2">
        <p className="text-sm text-[#4A4A4A] dark:text-gray-300 leading-relaxed">
          Enviamos un enlace de activación a la siguiente dirección:
        </p>
        <p className="text-sm font-mono font-semibold text-[#1E1E1E] dark:text-white bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] px-3 py-2 rounded-lg break-all">
          {signupEmail || 'tu correo corporativo'}
        </p>
        <p className="text-xs text-[#666666] dark:text-gray-400 leading-relaxed">
          Abre el mensaje y confirma tu cuenta antes de iniciar sesión. Si no aparece en unos
          minutos, revisa tu carpeta de correo no deseado.
        </p>
      </div>

      <div className="pt-2 space-y-2.5">
        <button
          type="button"
          onClick={onResend}
          disabled={isResending}
          className="h-10 w-full bg-[#FAF8F5] dark:bg-[#0F141C] hover:bg-[#EFECE4] dark:hover:bg-[#1A2230] border border-[#D5CEC0] dark:border-[#263040] text-[#1E1E1E] dark:text-gray-200 font-medium rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {isResending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Reenviando correo...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              <span>Reenviar correo de activación</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onGoToSignIn}
          className="h-10 w-full bg-[#1E1E1E] dark:bg-[#FF6A00] hover:bg-black dark:hover:bg-[#E55F00] text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors"
        >
          <span>Ir a iniciar sesión</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

async function executeSignInRequest(
  email: string,
  password: string
): Promise<{ ok: true; welcomeMsg: string; redirectTo: string } | { ok: false; errorMsg: string }> {
  try {
    const result = await signInWithSupabase(email, password);
    if (!result.success) {
      return {
        ok: false,
        errorMsg:
          result.error ||
          'Correo o contraseña incorrectos. Verifica tus datos e inténtalo nuevamente.',
      };
    }

    dataService.clearChatSessionHistory();
    const isTerreno = result.user?.rol === 'terreno';
    const welcomeName = result.user?.nombre || 'Jefe de Terreno';
    const welcomeMsg = isTerreno
      ? `Bienvenido, ${welcomeName}. Abriendo tus obras asignadas...`
      : 'Acceso verificado. Abriendo panel de control...';

    return { ok: true, welcomeMsg, redirectTo: resolveSafeRedirect(isTerreno) };
  } catch (err: any) {
    return {
      ok: false,
      errorMsg: err?.message || 'Error al iniciar sesión. Inténtalo nuevamente.',
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
  | { status: 'authenticated'; message: string; redirectTo: string }
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
      return {
        status: 'error',
        message: result.error || 'No fue posible completar el registro de la cuenta.',
      };
    }

    if (result.emailConfirmationRequired) {
      return {
        status: 'confirm_email',
        message:
          result.message || 'Te enviamos un correo de activación. Revisa tu bandeja de entrada.',
      };
    }

    return {
      status: 'authenticated',
      message: 'Empresa registrada correctamente. Ingresando al panel...',
      redirectTo: resolveSafeRedirect(false),
    };
  } catch (err: any) {
    return {
      status: 'error',
      message: err?.message || 'Error al registrar la cuenta.',
    };
  }
}

async function executeForgotPasswordRequest(
  forgotEmail: string
): Promise<{ ok: boolean; message: string }> {
  const res = await resetPasswordWithSupabase(forgotEmail);
  if (res.success) {
    return {
      ok: true,
      message:
        res.message ||
        'Te enviamos las instrucciones de recuperación. Revisa tu bandeja de entrada o correo no deseado.',
    };
  }
  return { ok: false, message: res.error || 'No se pudo enviar el correo de recuperación.' };
}

async function executeResendConfirmationRequest(
  signupEmail: string
): Promise<{ ok: boolean; message: string }> {
  const res = await resendConfirmationEmail(signupEmail);
  if (res.success) {
    return { ok: true, message: res.message || 'Correo de activación reenviado correctamente.' };
  }
  return { ok: false, message: res.error || 'No se pudo reenviar el correo de activación.' };
}

function ModeSwitcher({
  mode,
  onSwitch,
}: {
  readonly mode: AuthMode;
  readonly onSwitch: (next: AuthMode) => void;
}) {
  if (mode !== 'signin' && mode !== 'signup') return null;

  const activeClass =
    'bg-[#FFFFFF] dark:bg-[#1E2633] text-[#1E1E1E] dark:text-white shadow-sm font-semibold';
  const inactiveClass =
    'text-[#5C5852] dark:text-gray-400 hover:text-[#1E1E1E] dark:hover:text-gray-200';

  return (
    <div className="grid grid-cols-2 p-1 rounded-xl bg-[#ECE7DC] dark:bg-[#121821] border border-[#DFD8C8] dark:border-[#263040] mb-6">
      <button
        type="button"
        aria-pressed={mode === 'signin'}
        onClick={() => onSwitch('signin')}
        className={`h-9 text-sm rounded-lg transition-all font-medium ${
          mode === 'signin' ? activeClass : inactiveClass
        }`}
      >
        Iniciar sesión
      </button>
      <button
        type="button"
        aria-pressed={mode === 'signup'}
        onClick={() => onSwitch('signup')}
        className={`h-9 text-sm rounded-lg transition-all font-medium ${
          mode === 'signup' ? activeClass : inactiveClass
        }`}
      >
        Crear cuenta
      </button>
    </div>
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
          className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-300 text-xs sm:text-[13px] flex items-start gap-2.5 leading-snug"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="mb-5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs sm:text-[13px] flex items-start gap-2.5 leading-snug"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}
    </>
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
  const [showPassword, setShowPassword] = useState(false);

  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTab>('terminos');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);

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

    setSuccessMsg(outcome.welcomeMsg);
    setTimeout(() => router.replace(outcome.redirectTo), 350);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const validationError = validateSignUpFields({
      acceptTerms,
      rut,
      empresaNombre,
      signupPassword,
      signupConfirmPassword,
    });
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setIsLoading(true);
    const outcome = await executeSignUpRequest({
      signupEmail,
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
    setSuccessMsg(outcome.message);
    setTimeout(() => router.replace(outcome.redirectTo), 450);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);
    const outcome = await executeForgotPasswordRequest(forgotEmail);
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

  return (
    <div className="min-h-screen w-full flex flex-col lg:grid lg:grid-cols-12 bg-[#FAF8F5] dark:bg-[#0B0E14]">
      <CorporateLeftPanel />

      <section className="flex-1 lg:col-span-7 flex flex-col justify-center items-center px-5 sm:px-10 lg:px-14 pt-8 pb-10 lg:py-12">
        <div className="w-full max-w-[440px]">
          <div className="mb-6">
            <h1 className="font-heading text-2xl sm:text-[26px] font-bold text-[#1E1E1E] dark:text-white tracking-tight">
              {HEADER_COPY[mode].title}
            </h1>
            <p className="text-sm text-[#666666] dark:text-gray-400 mt-1 leading-relaxed">
              {HEADER_COPY[mode].subtitle}
            </p>
          </div>

          <ModeSwitcher mode={mode} onSwitch={switchMode} />
          <AuthStatusBanners errorMsg={errorMsg} successMsg={successMsg} />

          {mode === 'signin' && (
            <SignInSection
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
              onSubmit={handleLogin}
            />
          )}

          {mode === 'signup' && (
            <SignUpSection
              nombre={nombre}
              rut={rut}
              empresaNombre={empresaNombre}
              signupEmail={signupEmail}
              telefono={telefono}
              signupPassword={signupPassword}
              signupConfirmPassword={signupConfirmPassword}
              showPassword={showPassword}
              acceptTerms={acceptTerms}
              acceptMarketing={acceptMarketing}
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
              onAcceptMarketingChange={setAcceptMarketing}
              onOpenLegalTab={openLegalTab}
              onSubmit={handleSignUp}
            />
          )}

          {mode === 'forgot_password' && (
            <ForgotPasswordSection
              forgotEmail={forgotEmail}
              isLoading={isLoading}
              onEmailChange={setForgotEmail}
              onBack={() => switchMode('signin')}
              onSubmit={handleForgotPassword}
            />
          )}

          {mode === 'confirm_email' && (
            <ConfirmEmailSection
              signupEmail={signupEmail}
              isResending={isResending}
              onResend={handleResendConfirmation}
              onGoToSignIn={() => {
                setEmail(signupEmail);
                switchMode('signin');
              }}
            />
          )}

          <footer className="mt-8 pt-5 border-t border-[#E5DFC9] dark:border-[#1E2633]">
            <div className="flex flex-wrap items-center justify-center sm:justify-start divide-x divide-[#D5CEC0] dark:divide-[#263040] text-xs text-[#666666] dark:text-gray-400">
              <button
                type="button"
                onClick={() => openLegalTab('terminos')}
                className="pr-3 py-0.5 hover:text-[#1E1E1E] dark:hover:text-white hover:underline transition-colors"
              >
                Términos (Ley 19.496)
              </button>
              <button
                type="button"
                onClick={() => openLegalTab('privacidad')}
                className="px-3 py-0.5 hover:text-[#1E1E1E] dark:hover:text-white hover:underline transition-colors"
              >
                Privacidad (Ley 21.719)
              </button>
              <button
                type="button"
                onClick={() => openLegalTab('ciberseguridad')}
                className="pl-3 py-0.5 hover:text-[#1E1E1E] dark:hover:text-white hover:underline transition-colors"
              >
                Seguridad (Ley 21.663)
              </button>
            </div>
          </footer>
        </div>
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
          <Loader2 className="w-7 h-7 animate-spin text-[#FF6A00]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
