'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HardHat, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { UserRole } from '@/types/database';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@andinas.cl');
  const [password, setPassword] = useState('********');
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    dataService.setActiveUserRole(selectedRole);

    if (selectedRole === 'terreno') {
      alert('Los usuarios con rol "terreno" reportan directamente vía WhatsApp. Para acceder al panel web administrativo selecciona rol "admin" o "supervisor".');
    } else {
      router.push('/proyectos');
    }
  };

  const handleQuickRoleSelect = (role: UserRole, userEmail: string) => {
    setSelectedRole(role);
    setEmail(userEmail);
  };

  return (
    <div className="min-h-screen bg-kraft-100 flex items-center justify-center p-4 w-full">
      <div className="w-full max-w-md bg-white border border-kraft-200 rounded-2xl shadow-xl p-8">
        
        {/* Brand Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-navy-800 text-white flex items-center justify-center shadow-lg mb-3 border-2 border-obra-orange">
            <HardHat className="w-8 h-8 text-obra-orange" />
          </div>
          <h1 className="text-2xl font-bold font-heading text-navy-900">
            Obra<span className="text-obra-orange">Track</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-sans">
            Gestión de Obras & WhatsApp IA para PYMEs Constructoras
          </p>
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
                className="w-full pl-9 pr-4 py-2.5 bg-kraft-50 border border-kraft-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-obra-orange focus:ring-1 focus:ring-obra-orange font-sans"
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
                className="w-full pl-9 pr-4 py-2.5 bg-kraft-50 border border-kraft-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-obra-orange focus:ring-1 focus:ring-obra-orange font-sans"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 font-mono">
              Rol de Acceso (Demo)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('admin', 'admin@andinas.cl')}
                className={`py-2 px-2 text-xs font-semibold rounded-lg border transition-all text-center ${
                  selectedRole === 'admin'
                    ? 'bg-navy-800 text-white border-navy-800 shadow-sm'
                    : 'bg-kraft-50 text-gray-700 border-kraft-200 hover:bg-kraft-100'
                }`}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('supervisor', 'supervisor@andinas.cl')}
                className={`py-2 px-2 text-xs font-semibold rounded-lg border transition-all text-center ${
                  selectedRole === 'supervisor'
                    ? 'bg-navy-800 text-white border-navy-800 shadow-sm'
                    : 'bg-kraft-50 text-gray-700 border-kraft-200 hover:bg-kraft-100'
                }`}
              >
                Supervisor
              </button>
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('terreno', 'carlos.terreno@andinas.cl')}
                className={`py-2 px-2 text-xs font-semibold rounded-lg border transition-all text-center ${
                  selectedRole === 'terreno'
                    ? 'bg-navy-800 text-white border-navy-800 shadow-sm'
                    : 'bg-kraft-50 text-gray-700 border-kraft-200 hover:bg-kraft-100'
                }`}
              >
                Terreno
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-2 py-3 bg-obra-orange hover:bg-obra-orange-hover text-white font-semibold rounded-lg shadow-md transition-all flex items-center justify-center gap-2 font-heading text-sm"
          >
            <span>Iniciar Sesión</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Chile PYME badge footer */}
        <div className="mt-8 pt-4 border-t border-kraft-200 flex items-center justify-center gap-2 text-xs text-gray-500 font-mono">
          <ShieldCheck className="w-4 h-4 text-obra-green" />
          <span>Supabase Auth & RLS Protegido</span>
        </div>

      </div>
    </div>
  );
}
