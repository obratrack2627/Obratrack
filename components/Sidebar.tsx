'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HardHat,
  LayoutDashboard,
  MessageSquareShare,
  Users,
  Building,
  Menu,
  X,
  ShieldCheck,
  PhoneCall,
  UserCog,
  Sparkles,
  Calculator,
} from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { Usuario, UserRole } from '@/types/database';

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);

  useEffect(() => {
    // Cargar usuario activo y reportes pendientes
    const user = dataService.getActiveUser();
    setActiveUser(user);

    const reports = dataService.getReportes();
    const pending = reports.filter((r) => r.estado === 'pendiente').length;
    setPendingReportsCount(pending);
  }, [pathname]);

  const handleRoleChange = (newRole: UserRole) => {
    const updated = dataService.setActiveUserRole(newRole);
    setActiveUser(updated);
  };

  const navItems = [
    {
      label: 'Proyectos & Obras',
      href: '/proyectos',
      icon: LayoutDashboard,
    },
    {
      label: 'Cotizador & Precios IA',
      href: '/cotizador',
      icon: Sparkles,
      highlight: true,
    },
    {
      label: 'Reportes WhatsApp',
      href: '/reportes',
      icon: MessageSquareShare,
      badge: pendingReportsCount > 0 ? pendingReportsCount : null,
    },
    {
      label: 'Equipo de Obra',
      href: '/equipo',
      icon: Users,
    },
    {
      label: 'Clientes',
      href: '/clientes',
      icon: Building,
    },
  ];

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-navy-800 text-white z-50 flex items-center justify-between px-4 border-b border-navy-700 shadow-md">
        <Link href="/proyectos" className="flex items-center gap-2 font-bold text-lg font-heading">
          <div className="w-8 h-8 rounded-md bg-obra-orange flex items-center justify-center text-white">
            <HardHat className="w-5 h-5" />
          </div>
          <span>Obra<span className="text-obra-orange">Track</span></span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-md hover:bg-navy-700 text-gray-200"
          aria-label="Abrir menú"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Desktop & Mobile Drawer */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-64 bg-blueprint text-white z-40 flex flex-col justify-between border-r border-navy-700 transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } pt-16 md:pt-0`}
      >
        {/* Brand Header */}
        <div>
          <div className="hidden md:flex items-center gap-3 px-6 py-6 border-b border-navy-700/60">
            <div className="w-10 h-10 rounded-lg bg-obra-orange flex items-center justify-center text-white shadow-lg">
              <HardHat className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl tracking-tight leading-none">
                Obra<span className="text-obra-orange">Track</span>
              </h1>
              <p className="text-[11px] text-gray-400 font-mono mt-1">PYME Constructora Chile</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/proyectos' && pathname?.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-obra-orange text-white font-semibold shadow-md'
                      : 'text-gray-300 hover:bg-navy-700 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : item.highlight ? 'text-obra-orange' : 'text-gray-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.highlight && !item.badge && (
                    <span className="bg-obra-orange/20 text-obra-orange border border-obra-orange/40 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">
                      IA
                    </span>
                  )}
                  {item.badge && (
                    <span className="bg-obra-red text-white text-[11px] font-bold px-2 py-0.5 rounded-full font-mono animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer / User Profile & Role Selector */}
        <div className="p-4 border-t border-navy-700/60 bg-navy-900/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-obra-orange" /> Rol Activo:
            </span>
            <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-navy-700 text-obra-orange font-mono">
              {activeUser?.rol || 'admin'}
            </span>
          </div>

          {/* Quick Role Switcher for Testing */}
          <select
            value={activeUser?.rol || 'admin'}
            onChange={(e) => handleRoleChange(e.target.value as UserRole)}
            className="w-full text-xs bg-navy-800 text-gray-200 border border-navy-600 rounded-md p-2 mb-3 focus:outline-none focus:border-obra-orange"
          >
            <option value="admin">Admin (Dueño - Control total)</option>
            <option value="supervisor">Supervisor (Aprueba reportes)</option>
            <option value="terreno">Terreno (Sólo WhatsApp)</option>
          </select>

          {/* User Meta Card */}
          <div className="flex items-center gap-3 bg-navy-800/80 p-2.5 rounded-lg border border-navy-700">
            <div className="w-8 h-8 rounded-full bg-navy-700 border border-navy-600 flex items-center justify-center font-bold text-xs text-white">
              {activeUser?.nombre.charAt(0) || 'G'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{activeUser?.nombre || 'Gonzalo Morales'}</p>
              <p className="text-[10px] text-gray-400 truncate">{activeUser?.email || 'admin@andinas.cl'}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
