'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
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
} from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { Usuario, UserRole } from '@/types/database';
import Logo from '@/components/Logo';

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
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#1E1E1E] text-white z-50 flex items-center justify-between px-4 border-b border-[#2A2A2A] shadow-md">
        <Link href="/proyectos">
          <Logo variant="horizontal" theme="dark" size="sm" />
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-md hover:bg-[#2A2A2A] text-gray-200"
          aria-label="Abrir menú"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Desktop & Mobile Drawer */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-64 bg-blueprint text-white z-40 flex flex-col justify-between border-r border-[#2A2A2A] transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } pt-16 md:pt-0`}
      >
        {/* Brand Header */}
        <div>
          <div className="hidden md:flex flex-col px-5 py-5 border-b border-[#2A2A2A]">
            <Link href="/proyectos" className="hover:opacity-95 transition-opacity">
              <Logo variant="horizontal" theme="dark" size="md" withDescriptor={false} />
            </Link>
            <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center gap-1.5 text-[10px] font-heading font-medium text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6B8F72] animate-pulse"></span>
              <span>El <strong className="text-[#FF6A00]">copiloto</strong> digital del constructor</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3.5 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || (item.href !== '/proyectos' && pathname?.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#FF6A00] text-white font-semibold shadow-lg shadow-[#FF6A00]/25'
                      : 'text-gray-300 hover:bg-[#2A2A2A] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-5 h-5 ${
                        isActive ? 'text-white' : item.highlight ? 'text-[#FF6A00]' : 'text-gray-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.highlight && !item.badge && (
                    <span className="bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/40 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">
                      OpenAI
                    </span>
                  )}
                  {item.badge && (
                    <span className="bg-[#D94336] text-white text-[11px] font-bold px-2 py-0.5 rounded-full font-mono animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer: User Role Selector & WhatsApp Status */}
        <div className="p-3.5 border-t border-[#2A2A2A] bg-black/30 space-y-3">
          {/* WhatsApp Webhook Active Badge */}
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#2A2A2A]/80 border border-[#383838] text-[11px] font-mono text-gray-300">
            <div className="flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5 text-[#6B8F72]" />
              <span>WhatsApp Cloud API</span>
            </div>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6B8F72] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6B8F72]"></span>
            </span>
          </div>

          {/* Active User info & Role Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#FF6A00] text-white flex items-center justify-center font-bold text-xs">
                  {activeUser?.nombre.charAt(0) || 'U'}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-white truncate w-28">
                    {activeUser?.nombre.split(' ')[0]}
                  </p>
                  <p className="text-[10px] text-gray-400 font-mono capitalize">
                    Rol: {activeUser?.rol}
                  </p>
                </div>
              </div>
              <UserCog className="w-4 h-4 text-gray-400" />
            </div>

            {/* Quick Role Switcher (Simulación de roles) */}
            <div className="pt-2 border-t border-[#2A2A2A] flex items-center justify-between gap-1 text-[10px] font-mono">
              <span className="text-gray-400">Ver como:</span>
              <div className="flex gap-1">
                {(['admin', 'supervisor', 'terreno'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRoleChange(r)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors uppercase ${
                      activeUser?.rol === r
                        ? 'bg-[#FF6A00] text-white'
                        : 'bg-[#2A2A2A] text-gray-400 hover:text-white'
                    }`}
                  >
                    {r.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
