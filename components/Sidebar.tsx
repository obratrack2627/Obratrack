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
  ClipboardCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/data-service';
import { Usuario, UserRole, SubscriptionPlanId } from '@/types/database';
import { getPlanDetails } from '@/lib/plans';
import Logo from '@/components/Logo';
import PlanSwitcherModal from '@/components/PlanSwitcherModal';
import { signOutSupabase } from '@/lib/supabase/auth';
import ActionMenu from '@/components/ActionMenu';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import ThemeToggle from '@/components/ThemeToggle';

interface SidebarProps {
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-mobile-nav-open', mobileOpen);
    return () => document.documentElement.removeAttribute('data-mobile-nav-open');
  }, [mobileOpen]);

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
      await signOutSupabase();
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
    const syncHandler = () => loadSidebarData();

    window.addEventListener('obratrack_plan_changed', planChangeHandler);
    window.addEventListener('obratrack_cloud_synced', syncHandler);
    return () => {
      window.removeEventListener('obratrack_plan_changed', planChangeHandler);
      window.removeEventListener('obratrack_cloud_synced', syncHandler);
    };
  }, [pathname]);

  const currentPlanDetails = getPlanDetails(activePlan);

  const isTerreno = activeUser?.rol === 'terreno';

  interface NavItem {
    label: string;
    href: string;
    icon: any;
    highlight?: boolean;
    badge?: number | null;
    planBadge?: string;
  }

  const navItems: NavItem[] = isTerreno
    ? [
        {
          label: 'Obras Asignadas',
          href: '/proyectos',
          icon: Building,
        },
        {
          label: 'Asistencia',
          href: '/asistencia',
          icon: ClipboardCheck,
        },
        {
          label: 'WhatsApp & Reportes',
          href: '/reportes',
          icon: MessageSquareShare,
          badge: pendingReportsCount > 0 ? pendingReportsCount : null,
        },
        {
          label: 'ObraBot',
          href: '/cotizador',
          icon: Sparkles,
          highlight: true,
        },
      ]
    : [
        {
          label: 'Centro de Mando',
          href: '/dashboard',
          icon: LayoutDashboard,
        },
        {
          label: 'ObraBot',
          href: '/cotizador',
          icon: Sparkles,
          highlight: true,
        },
        {
          label: 'Obras y proyectos',
          href: '/proyectos',
          icon: Building,
        },
        {
          label: 'Asistencia',
          href: '/asistencia',
          icon: ClipboardCheck,
        },
        {
          label: 'WhatsApp',
          href: '/reportes',
          icon: MessageSquareShare,
          badge: pendingReportsCount > 0 ? pendingReportsCount : null,
        },
        {
          label: 'Equipo',
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

      <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} userEmail={activeUser?.email_acceso || activeUser?.email} />
      {/* Mobile Top Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#1E1E1E] text-white z-50 flex items-center justify-between px-4 border-b border-[#2A2A2A] shadow-md print:hidden">
        <Link href="/dashboard">
          <Logo variant="horizontal" theme="dark" size="sm" />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            aria-label="Ver mi cuenta" onClick={() => setIsPlanModalOpen(true)}
            className="px-2 py-1 rounded bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/40 text-[10px] font-bold font-mono"
          >
            Cuenta
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
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[35] transition-opacity animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Desktop & Mobile Drawer */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-64 bg-blueprint text-white z-40 flex flex-col justify-between border-r border-[#2A2A2A] transition-transform duration-300 shadow-2xl md:shadow-none print:hidden ${
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
            {navItems.filter(item => item.href !== '/planes').map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));

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
                  {item.badge && (
                    <span className="bg-[#D94336] text-white text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">
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
          
          {activeUser?.is_dev === true && <button type="button" onClick={() => setIsPlanModalOpen(true)} aria-label="Cambiar plan de desarrollo" className="text-xs text-obra-orange hover:underline">Plan de desarrollo</button>}

          {/* Active User info & Logout */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-[#FF6A00] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                  {activeUser?.nombre ? activeUser.nombre.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-white truncate w-24">
                    {activeUser?.nombre ? activeUser.nombre.split(' ')[0] : 'Usuario'}
                  </p>
                  <p className="text-[10px] text-[#FF6A00] font-mono capitalize">
                    {activeUser?.rol === 'admin'
                      ? 'Contratista / Admin'
                      : activeUser?.rol === 'supervisor'
                      ? 'Supervisor'
                      : 'Maestro Terreno'}
                  </p>
                </div>
              </div>
              
              <ActionMenu label="Cuenta" above>
                <Link href="/planes" onClick={() => setMobileOpen(false)}>Suscripción</Link>
                <button type="button" onClick={() => { setPasswordOpen(true); setMobileOpen(false); }}>Cambiar contraseña</button>
                <button type="button" onClick={handleLogout} className="text-red-600">Cerrar sesión</button>
              </ActionMenu>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
