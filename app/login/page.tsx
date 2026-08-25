'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { UserRole } from '@/types/database';
import Logo from '@/components/Logo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@andinas.cl');
  const [password, setPassword] = useState('********');
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    dataService.setActiveUserRole(selectedRole);

    if (selectedRole === 'terreno') {
      alert(
        'Los usuarios con rol "terreno" reportan directamente vía WhatsApp. Para acceder al panel web administrativo selecciona rol "admin" o "supervisor".'
      );
    } else {
      router.push('/proyectos');
    }
  };

  const handleQuickRoleSelect = (role: UserRole, userEmail: string) => {
    setSelectedRole(role);
    setEmail(userEmail);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-4 w-full relative overflow-hidden">
      {/* Fondo con detalles sutiles blueprint */}
      <div className="absolute inset-0 bg-blueprint-grid opacity-30 pointer-events-none"></div>

      <div className="w-full max-w-md bg-white border border-[#E5DFC9] rounded-3xl shadow-2xl p-8 relative z-10">
        {/* Brand Logo Oficial */}
        <div className="flex flex-col items-center text-center mb-6">
          <Logo variant="vertical" size="lg" withDescriptor={true} className="mb-2" />
          
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF8F5] border border-[#E5DFC9] text-[11px] font-heading mt-2">
            <span className="text-[#1E1E1E]">El</span>
            <span className="text-[#FF6A00] font-bold">copiloto</span>
            <span className="text-[#1E1E1E] font-bold">digital del constructor</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#6B8F72] ml-0.5" />
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 font-mono">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-[#FAF8F5] border border-[#E5DFC9] rounded-xl text-sm text-[#1E1E1E] focus:outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 font-sans transition-all"
                placeholder="tu@constructora.cl"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 font-mono">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-[#FAF8F5] border border-[#E5DFC9] rounded-xl text-sm text-[#1E1E1E] focus:outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 font-sans transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 font-mono">
              Rol de Acceso (Demo)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('admin', 'admin@andinas.cl')}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all text-center ${
                  selectedRole === 'admin'
                    ? 'bg-[#1E1E1E] text-white border-[#1E1E1E] shadow-md shadow-black/10'
                    : 'bg-[#FAF8F5] text-gray-700 border-[#E5DFC9] hover:bg-gray-100'
                }`}
              >
                Admin (Dueño)
              </button>
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('supervisor', 'supervisor@andinas.cl')}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all text-center ${
                  selectedRole === 'supervisor'
                    ? 'bg-[#1E1E1E] text-white border-[#1E1E1E] shadow-md shadow-black/10'
                    : 'bg-[#FAF8F5] text-gray-700 border-[#E5DFC9] hover:bg-gray-100'
                }`}
              >
                Supervisor
              </button>
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('terreno', 'carlos.terreno@andinas.cl')}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all text-center ${
                  selectedRole === 'terreno'
                    ? 'bg-[#1E1E1E] text-white border-[#1E1E1E] shadow-md shadow-black/10'
                    : 'bg-[#FAF8F5] text-gray-700 border-[#E5DFC9] hover:bg-gray-100'
                }`}
              >
                Terreno
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-3 py-3 bg-[#FF6A00] hover:bg-[#E55F00] text-white font-bold rounded-xl shadow-lg shadow-[#FF6A00]/25 hover:shadow-xl hover:shadow-[#FF6A00]/35 transition-all flex items-center justify-center gap-2 font-heading text-sm"
          >
            <span>Ingresar a ObraTrack</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-[#E5DFC9] flex items-center justify-center gap-2 text-xs text-gray-500 font-mono">
          <ShieldCheck className="w-4 h-4 text-[#6B8F72]" />
          <span>Supabase Auth & PostgreSQL pgvector</span>
        </div>
      </div>
    </div>
  );
}
