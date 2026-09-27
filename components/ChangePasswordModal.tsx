'use client';

import React, { useState } from 'react';
import {
  X,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { updatePasswordWithSupabase, resetPasswordWithSupabase } from '@/lib/supabase/auth';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  onSuccess?: () => void;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
  userEmail,
  onSuccess,
}: ChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoadingDirect, setIsLoadingDirect] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDirectUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden. Por favor verifica que sean iguales.');
      return;
    }

    setIsDirectUpdateLoading(true);

    try {
      const res = await updatePasswordWithSupabase(newPassword);
      setIsDirectUpdateLoading(false);

      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo actualizar la contraseña.');
        return;
      }

      setSuccessMsg('¡Contraseña actualizada correctamente en Supabase Auth!');
      setNewPassword('');
      setConfirmPassword('');
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 2000);
    } catch (err: any) {
      setIsDirectUpdateLoading(false);
      setErrorMsg(err.message || 'Error inesperado al cambiar contraseña.');
    }
  };

  const handleSendResetEmail = async () => {
    if (!userEmail) {
      setErrorMsg('No se identificó el correo del usuario actual.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoadingEmail(true);

    try {
      const res = await resetPasswordWithSupabase(userEmail);
      setIsLoadingEmail(false);

      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo enviar el correo de recuperación.');
        return;
      }

      setSuccessMsg(`Te hemos enviado un enlace de restablecimiento a ${userEmail}. Revisa tu bandeja de entrada o spam.`);
    } catch (err: any) {
      setIsLoadingEmail(false);
      setErrorMsg(err.message || 'Error al enviar correo.');
    }
  };

  // Helper setter for cleaner state
  function setIsDirectUpdateLoading(val: boolean) {
    setIsLoadingDirect(val);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-3xl w-full max-w-md p-6 shadow-2xl relative animate-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E5DFC9] dark:border-[#263040]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-heading text-[#1E1E1E] dark:text-white">
                Seguridad y Contraseña
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {userEmail || 'Gestionar clave de acceso'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificaciones */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Formulario directo */}
        <form onSubmit={handleDirectUpdate} className="mt-4 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
              Nueva Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                className="w-full pl-9 pr-10 py-2.5 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] font-sans"
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

          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 font-mono">
              Confirmar Nueva Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Repetir nueva contraseña"
                className="w-full pl-9 pr-10 py-2.5 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-[#1E1E1E] dark:text-white focus:outline-none focus:border-[#FF6A00] font-sans"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoadingDirect || !newPassword}
            className="w-full py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 font-heading uppercase tracking-wider transition-all disabled:opacity-50"
          >
            {isLoadingDirect ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Actualizando...</span>
              </>
            ) : (
              <span>Actualizar Contraseña</span>
            )}
          </button>
        </form>

        {/* Separador */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E5DFC9] dark:border-[#263040]" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-mono">
            <span className="bg-white dark:bg-[#141A23] px-2 text-gray-400">o por correo</span>
          </div>
        </div>

        {/* Opción Enviar Correo de Restablecimiento */}
        <div className="bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] p-3.5 rounded-2xl">
          <div className="flex items-start gap-2 mb-2">
            <Mail className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
            <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
              ¿Prefieres recibir un enlace de restablecimiento en tu bandeja de correo?
            </p>
          </div>
          <button
            type="button"
            onClick={handleSendResetEmail}
            disabled={isLoadingEmail || !userEmail}
            className="w-full py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-[#E5DFC9] dark:border-gray-700 text-gray-800 dark:text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            {isLoadingEmail ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Enviando enlace a {userEmail}...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 text-[#FF6A00]" />
                <span>Enviar correo de recuperación</span>
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-[#E5DFC9] dark:border-[#263040] flex items-center justify-center gap-1.5 text-[10px] text-gray-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-[#6B8F72]" />
          <span>Cifrado y validación directa en Supabase Auth</span>
        </div>
      </div>
    </div>
  );
}
