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
  PhoneCall,
  UserCog,
  Sparkles,
  CreditCard,
  Zap,
  LogOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/data-service';
import { Usuario, UserRole, SubscriptionPlanId } from '@/types/database';
import { getPlanDetails } from '@/lib/plans';
import Logo from '@/components/Logo';
import PlanSwitcherModal from '@/components/PlanSwitcherModal';
import { signOutFirebase } from '@/lib/firebase/auth';
import ThemeToggle from '@/components/ThemeToggle';

interface SidebarProps {
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  const loadSidebarData = () => {
    const user = dataService.getActiveUser();
    setActiveUser(user);
    setActivePlan(dataService.getActivePlan());

    const pending = dataService
      .getReportes()
      .filter((r) => r.estado === 'pendiente').length;
    setPendingReportsCount(pending);
  };

  const handleLogout = async () => {
    try {
      await signOutFirebase();
    } catch (e) {
      console.error(e);
    }
    dataService.clearActiveUser();
    window.location.href = '/login';
  };

  useEffect(() => {
    loadSidebarData();

    const planChangeHandler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    window.addEventListener('obratrack_plan_changed', planChangeHandler);
    return () => window.removeEventListener('obratrack_plan_changed', planChangeHandler);
  }, [pathname]);

  const handleRoleChange = (newRole: UserRole) => {
    const updated = dataService.setActiveUserRole(newRole);
    setActiveUser(updated);
  };

  const currentPlanDetails = getPlanDetails(activePlan);

  const isTerreno = activeUser?.rol === 'terreno';

  const navItems = isTerreno
    ? [
        {
          label: 'Obras Asignadas',
          href: '/proyectos',
          icon: Building,
        },
        {
          label: 'Reportes & Avances',
          href: '/reportes',
          icon: MessageSquareShare,
          badge: pendingReportsCount > 0 ? pendingReportsCount : null,
        },
      ]
    : [
        {
          label: 'Centro de Mando',
          href: '/dashboard',
          icon: LayoutDashboard,
        },
        {
          label: 'Proyectos & Obras',
          href: '/proyectos',
          icon: Building,
        },
        {
          label: 'Copiloto Obrero IA',
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
          icon: Users,
        },
        {
          label: 'Planes & Precios',
          href: '/planes',
          icon: CreditCard,
          planBadge: currentPlanDetails.nombre.replace('Plan ', ''),
        },
      ];

  return (
    <>
      {/* Plan Switcher Modal para Evaluación */}
      <PlanSwitcherModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />

      {/* Mobile Top Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#1E1E1E] text-white z-50 flex items-center justify-between px-4 border-b border-[#2A2A2A] shadow-md">
        <Link href="/dashboard">
          <Logo variant="horizontal" theme="dark" size="sm" />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setIsPlanModalOpen(true)}
            className="px-2 py-1 rounded bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/40 text-[10px] font-bold font-mono"
          >
            {currentPlanDetails.nombre}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-md hover:bg-[#2A2A2A] text-gray-200"
            aria-label="Abrir menú"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-35 transition-opacity animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Desktop & Mobile Drawer */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-64 bg-blueprint text-white z-40 flex flex-col justify-between border-r border-[#2A2A2A] transition-transform duration-300 shadow-2xl md:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } pt-16 md:pt-0`}
      >
        {/* Brand Header */}
        <div>
          <div className="hidden md:flex flex-col px-5 py-5 border-b border-[#2A2A2A]">
            <Link href="/dashboard" className="hover:opacity-95 transition-opacity">
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
                  {item.planBadge && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono uppercase ${
                        activePlan === 'pro_ia'
                          ? 'bg-[#6B8F72]/20 text-[#85C492] border border-[#6B8F72]/50'
                          : activePlan === 'pro'
                          ? 'bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/50'
                          : 'bg-gray-800 text-gray-400 border border-gray-700'
                      }`}
                    >
                      {item.planBadge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer: Subscription Plan Widget & User Role Selector */}
        <div className="p-3.5 border-t border-[#2A2A2A] bg-black/30 space-y-3">
          
          {/* Plan Selector Widget (Demo & Evaluadores) */}
          <div className="p-2.5 rounded-xl bg-[#2A2A2A]/90 border border-[#383838] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">
                Suscripción:
              </span>
              <span
                className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded ${
                  activePlan === 'pro_ia'
                    ? 'bg-[#6B8F72] text-white'
                    : activePlan === 'pro'
                    ? 'bg-[#FF6A00] text-white'
                    : 'bg-gray-700 text-gray-200'
                }`}
              >
                {currentPlanDetails.nombre}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsPlanModalOpen(true)}
              className="w-full mt-1 py-1.5 px-2 bg-white/10 hover:bg-[#FF6A00] hover:text-white text-gray-300 rounded-lg text-[11px] font-heading font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Zap className="w-3 h-3 text-[#FF6A00] hover:text-white" />
              <span>Simular / Cambiar Plan</span>
            </button>
          </div>

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

          {/* Active User info & Logout */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-[#FF6A00] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                  {activeUser?.nombre ? activeUser.nombre.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-white truncate w-28">
                    {activeUser?.nombre ? activeUser.nombre.split(' ')[0] : 'Usuario'}
                  </p>
                  <p className="text-[10px] text-[#FF6A00] font-mono capitalize">
                    {activeUser?.rol === 'admin' ? 'Dueño / Admin' : activeUser?.rol === 'supervisor' ? 'Supervisor' : 'Maestro Terreno'}
                  </p>
                </div>
              </div>
              
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
