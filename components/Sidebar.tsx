'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquareShare,
  Users,
  Building,
  Building2,
  Menu,
  X,
  UserCog,
  Sparkles,
  CreditCard,
  AlertTriangle,
  ClipboardCheck,
  Bell,
} from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { Usuario, SubscriptionPlanId } from '@/types/database';
import { getPlanDetails } from '@/lib/plans';
import Logo from '@/components/Logo';
import { signOutSupabase } from '@/lib/supabase/auth';
import ActionMenu from '@/components/ActionMenu';
import ModalOverlay from '@/components/ModalOverlay';
import ThemeToggle from '@/components/ThemeToggle';
import PushNotificationsControl from '@/components/PushNotificationsControl';

const PlanSwitcherModal = dynamic(() => import('@/components/PlanSwitcherModal'), { ssr: false });
const ChangePasswordModal = dynamic(() => import('@/components/ChangePasswordModal'), { ssr: false });
const ProfileSettingsModal = dynamic(() => import('@/components/ProfileSettingsModal'), { ssr: false });

export default function Sidebar() {
  const pathname = usePathname();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<'perfil' | 'empresa' | 'cotizaciones' | 'notificaciones'>('perfil');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [logoutConfirmPending, setLogoutConfirmPending] = useState<number | null>(null);

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

  const performLogout = async (discardPending: boolean) => {
    setLogoutConfirmPending(null);
    try {
      await signOutSupabase(discardPending);
    } catch (e) {
      console.error(e);
    }
    dataService.clearActiveUser();
    window.location.href = '/login?logout=1';
  };

  const handleLogout = async () => {
    const pending = dataService.pendingCloudChanges();
    if (pending > 0) {
      setLogoutConfirmPending(pending);
      return;
    }
    await performLogout(false);
  };

  useEffect(() => {
    loadSidebarData();

    const planChangeHandler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    const syncHandler = () => loadSidebarData();
    const openProfileHandler = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: 'perfil' | 'empresa' | 'cotizaciones' | 'notificaciones' }>).detail?.tab || 'perfil';
      setProfileInitialTab(tab);
      setProfileOpen(true);
      setMobileOpen(false);
    };

    window.addEventListener('obratrack_plan_changed', planChangeHandler);
    window.addEventListener('obratrack_cloud_synced', syncHandler);
    window.addEventListener('obratrack_profile_updated', syncHandler);
    window.addEventListener('obratrack_open_profile', openProfileHandler);
    return () => {
      window.removeEventListener('obratrack_plan_changed', planChangeHandler);
      window.removeEventListener('obratrack_cloud_synced', syncHandler);
      window.removeEventListener('obratrack_profile_updated', syncHandler);
      window.removeEventListener('obratrack_open_profile', openProfileHandler);
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
          label: 'Reportes',
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
          label: 'Reportes',
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
          icon: Building2,
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
      {isPlanModalOpen && (
        <PlanSwitcherModal
          isOpen={isPlanModalOpen}
          onClose={() => setIsPlanModalOpen(false)}
        />
      )}

      {passwordOpen && (
        <ChangePasswordModal
          isOpen={passwordOpen}
          onClose={() => setPasswordOpen(false)}
          userEmail={activeUser?.email_acceso || activeUser?.email}
        />
      )}
      {profileOpen && (
        <ProfileSettingsModal
          isOpen={profileOpen}
          initialTab={profileInitialTab}
          onClose={() => setProfileOpen(false)}
          onRequestChangePassword={() => setPasswordOpen(true)}
        />
      )}
      {logoutConfirmPending !== null && (
        <ModalOverlay
          onClose={() => setLogoutConfirmPending(null)}
          aria-label="Confirmar cierre de sesión"
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#263040] bg-[#141A23] text-white p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold font-heading">
                  Cambios pendientes por sincronizar
                </h2>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Hay {logoutConfirmPending} cambios locales pendientes de guardar en la nube. Si cierras sesión ahora se descartarán de este dispositivo.
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLogoutConfirmPending(null)}
                className="px-4 py-2 rounded-xl border border-[#2E3A4D] text-xs font-semibold text-gray-200 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void performLogout(true)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white"
              >
                Descartar y cerrar sesión
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
      {/* Mobile Top Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#1E1E1E] text-white z-50 flex items-center justify-between px-4 border-b border-[#2A2A2A] shadow-md print:hidden">
        <Link href="/dashboard">
          <Logo variant="horizontal" theme="dark" size="sm" />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Mi perfil"
            title="Mi perfil y empresa"
            onClick={() => {
              setProfileInitialTab('perfil');
              setProfileOpen(true);
            }}
            className="p-1.5 rounded bg-[#2A2A2A] hover:bg-[#353535] text-gray-200 border border-[#3A3A3A]"
          >
            <UserCog className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Ver mi cuenta"
            onClick={() => setIsPlanModalOpen(true)}
            className="px-2 py-1 rounded bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/40 text-[10px] font-bold font-mono"
          >
            {currentPlanDetails.nombre.replace('Plan ', '')}
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
              <Logo variant="horizontal" theme="dark" size="md" withTagline className="[&_p]:mt-1 [&_p]:text-[9px] [&_p]:leading-3 [&_p]:text-gray-400 [&_p]:whitespace-nowrap" />
            </Link>
          </div>

          {/* Navigation Links */}
          <nav data-tour-zone="sidebar-nav" className="p-3.5 space-y-1">
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
          <PushNotificationsControl headless />
          {activeUser?.is_dev === true && <button type="button" onClick={() => setIsPlanModalOpen(true)} aria-label="Cambiar plan de desarrollo" className="text-xs text-obra-orange hover:underline">Plan de desarrollo</button>}

          {/* Active User info & Logout */}
          <div data-tour-zone="sidebar-account" className="space-y-2">
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
              
              <ActionMenu label="Cuenta" above darkSurface>
                <button type="button" onClick={() => { setProfileInitialTab('perfil'); setProfileOpen(true); setMobileOpen(false); }}>Editar perfil</button>
                <button type="button" onClick={() => { setProfileInitialTab('notificaciones'); setProfileOpen(true); setMobileOpen(false); }} className="flex items-center gap-2 font-medium !text-[#FF6A00]">
                  <Bell size={15} className="shrink-0 text-[#FF6A00]" />
                  <span>Notificaciones Push</span>
                </button>
                <Link href="/planes" onClick={() => setMobileOpen(false)}>Suscripción</Link>
                <button type="button" onClick={() => { setPasswordOpen(true); setMobileOpen(false); }}>Cambiar contraseña</button>
                <button type="button" onClick={handleLogout} className="!text-red-400 hover:!text-red-300">Cerrar sesión</button>
              </ActionMenu>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
