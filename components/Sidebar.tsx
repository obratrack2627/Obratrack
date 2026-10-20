"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Building,
  Users,
  MessageSquare,
  Sparkles,
  Menu,
  X,
  LogOut,
  CreditCard,
} from "lucide-react";
import { dataService } from "@/lib/data-service";
import { signOutSupabase } from "@/lib/supabase/auth";
import type { Usuario } from "@/types/database";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<Usuario | null>(null);
  useEffect(() => {
    setUser(dataService.getActiveUser());
    setOpen(false);
  }, [pathname]);
  const items = [
    { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
    { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
    { href: "/proyectos", label: "Obras", icon: Building },
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/equipo", label: "Equipo", icon: Users },
    { href: "/reportes", label: "Reportes", icon: MessageSquare },
  ];
  return (
    <>
      <div className="op-no-print md:hidden fixed top-0 inset-x-0 h-16 bg-[#1E1E1E] text-white z-50 flex justify-between items-center px-4">
        <Link href="/dashboard">
          <Logo variant="horizontal" theme="dark" size="sm" />
        </Link>
        <button
          className="op-icon"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <button
          aria-label="Cerrar menú"
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 w-64 bg-[#1E1E1E] text-white z-40 border-r border-white/10 flex flex-col pt-16 md:pt-0 transition-transform ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className="hidden md:block p-6 border-b border-white/10">
          <Link href="/dashboard">
            <Logo
              variant="horizontal"
              theme="dark"
              size="md"
              withDescriptor={false}
            />
          </Link>
        </div>
        <nav className="p-4 space-y-1" aria-label="Navegación principal">
          {items
            .filter(
              (i) =>
                user?.rol !== "terreno" ||
                ["/proyectos", "/reportes"].includes(i.href),
            )
            .map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={pathname.startsWith(href) ? "page" : undefined}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm ${pathname.startsWith(href) ? "bg-[#FF6A00] text-white" : "text-gray-300 hover:bg-white/10"}`}
              >
                <Icon size={18} />
                {label}
              </Link>
            ))}
        </nav>
        <div className="mt-auto p-4 border-t border-white/10 space-y-1">
          <Link
            href="/cotizador"
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300"
          >
            <Sparkles size={18} />
            Asistente IA
          </Link>
          <Link
            href="/planes"
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300"
          >
            <CreditCard size={18} />
            Mi plan
          </Link>
          <div className="flex items-center justify-between px-4 pt-4">
            <span className="text-sm truncate">
              {user?.nombre || "Mi cuenta"}
            </span>
            <ThemeToggle />
          </div>
          <button
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-400"
            onClick={async () => {
              await signOutSupabase();
              dataService.clearActiveUser();
              window.location.href = "/login";
            }}
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
