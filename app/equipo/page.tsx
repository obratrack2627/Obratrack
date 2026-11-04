'use client';
import ModalOverlay from '@/components/ModalOverlay';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  Phone,
  Mail,
  ShieldCheck,
  Building2,
  HardHat,
  X,
  Trash2,
  Edit3,
  Search,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  BadgeCheck,
  KeyRound,
  Terminal,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { registrationFields } from '@/lib/registrations';
import { aiHeaders } from '@/lib/ai/client';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { dataService } from '@/lib/data-service';
import { formatRUT, validarRutChileno } from '@/lib/utils';
import { isDeveloperEmail } from '@/lib/auth-utils';
import { Usuario, Proyecto, UserRole } from '@/types/database';

export default function EquipoPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [userToDelete, setUserToDelete] = useState<Usuario | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | UserRole>('todos');

  // Formulario nuevo trabajador / maestro
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('+56 9 ');
  const [rol, setRol] = useState<UserRole>('terreno');

  // Formulario editar trabajador
  const [editNombre, setEditNombre] = useState('');
  const [editRut, setEditRut] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editRol, setEditRol] = useState<UserRole>('terreno');

  const loadData = () => {
    const active = dataService.getActiveUser();
    setActiveUser(active);
    const users = dataService.getUsuarios();
    const projs = dataService.getProyectos();
    setUsuarios(users);
    setProyectos(projs);
  };

  useEffect(() => {
    loadData();
    window.addEventListener('obratrack_cloud_synced', loadData);
    return () => window.removeEventListener('obratrack_cloud_synced', loadData);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatRUT(e.target.value);
    setRut(formatted);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const checked = registrationFields({ tipo: 'trabajador', nombre, rut, email, telefono, rol, proyecto_id: projectId });
    if (checked.missing.length) { showToast('Completa: ' + checked.missing.join(', ')); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/equipo/crear-usuario', {
        method: 'POST', headers: await aiHeaders(), body: JSON.stringify(checked.draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar el trabajador.');
      const synced = await dataService.pullFromCloudServer();
      setIsCreateModalOpen(false);
      setNombre(''); setRut(''); setEmail(''); setTelefono('+56 9 '); setRol('terreno'); setProjectId('');
      loadData();
      showToast(synced.success ? 'Trabajador registrado y vinculado a WhatsApp.' : 'Trabajador registrado. Reintenta la sincronización para actualizar el listado.');
    } catch (error) { showToast((error as Error).message); }
    finally { setSaving(false); }
  };

  const handleOpenEdit = (user: Usuario) => {
    setEditingUser(user);
    setEditNombre(user.nombre);
    setEditRut(user.rut || '');
    setEditEmail(user.email || '');
    setEditTelefono(user.telefono_whatsapp || '+56 9 ');
    setEditRol(user.rol);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editNombre.trim()) return;

    const isDev = isDeveloperEmail(editingUser.email) || editingUser.is_dev;

    if (editRut && editRut.trim()) {
      if (!validarRutChileno(editRut) && !isDev) {
        showToast('⚠️ El RUT ingresado no es válido según el formato chileno.');
        return;
      }
    }

    dataService.updateUsuario(editingUser.id, {
      nombre: editNombre.trim(),
      rut: editRut.trim() || undefined,
      email: editEmail.trim(),
      telefono_whatsapp: editTelefono.trim(),
      rol: isDev ? 'admin' : editRol,
      is_dev: isDev ? true : editingUser.is_dev,
    });

    setEditingUser(null);
    loadData();
    showToast(`Datos de "${editNombre.trim()}" actualizados con éxito.`);
  };

  const handleConfirmDelete = () => {
    if (!userToDelete) return;
    dataService.deleteUsuario(userToDelete.id);
    showToast(`Trabajador "${userToDelete.nombre}" eliminado del equipo.`);
    setUserToDelete(null);
    loadData();
  };

  // Filtrado reactivo
  const filteredUsers = useMemo(() => {
    return usuarios.filter((u) => {
      const matchRole = roleFilter === 'todos' || u.rol === roleFilter;
      const term = searchTerm.toLowerCase();
      const matchSearch =
        u.nombre.toLowerCase().includes(term) ||
        (u.email && u.email.toLowerCase().includes(term)) ||
        (u.telefono_whatsapp && u.telefono_whatsapp.toLowerCase().includes(term));
      return matchRole && matchSearch;
    });
  }, [usuarios, roleFilter, searchTerm]);

  // Contadores
  const countTerreno = usuarios.filter((u) => u.rol === 'terreno').length;
  const countSupervisor = usuarios.filter((u) => u.rol === 'supervisor').length;
  const countAdmin = usuarios.filter((u) => u.rol === 'admin').length;

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-navy-900 text-white border border-obra-orange/40 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-5 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-obra-orange" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Navbar
        title="Equipo de Obra & Cuadrilla"
        subtitle="Gestión de trabajadores, maestros, roles y vinculación con WhatsApp para reportes de terreno"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(true)}
              className="px-3.5 py-2 bg-white dark:bg-[#141A23] hover:bg-gray-50 dark:hover:bg-[#1A2230] text-[#1E1E1E] dark:text-white border border-[#E5DFC9] dark:border-[#263040] text-xs font-semibold rounded-xl shadow-sm flex items-center gap-1.5 font-heading transition-all"
              title="Cambiar contraseña de mi cuenta"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#FF6A00]" />
              <span>Seguridad & Clave</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm flex items-center gap-1.5 font-heading transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Trabajador</span>
            </button>
          </div>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* KPI Cards de Equipo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 tracking-wider">
                Total Cuadrilla
              </p>
              <h3 className="text-2xl font-bold font-heading text-navy-900 mt-1">
                {usuarios.length}
              </h3>
              <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                Personal activo en la empresa
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-navy-800 text-obra-orange flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 tracking-wider">
                Maestros en Terreno (WhatsApp)
              </p>
              <h3 className="text-2xl font-bold font-heading text-obra-green mt-1">
                {countTerreno}
              </h3>
              <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                Habilitados para reportar por audio
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-obra-green-light text-obra-green flex items-center justify-center">
              <HardHat className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 tracking-wider">
                Supervisores & Admins
              </p>
              <h3 className="text-2xl font-bold font-heading text-navy-900 mt-1">
                {countSupervisor + countAdmin}
              </h3>
              <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                Control de Gantt, Finanzas y Aprobación
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-obra-orange-light text-obra-orange flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="bg-white border border-kraft-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs text-navy-900 focus:outline-none focus:border-obra-orange font-sans"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtro por Rol */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              onClick={() => setRoleFilter('todos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all whitespace-nowrap ${
                roleFilter === 'todos'
                  ? 'bg-navy-800 text-white shadow-sm'
                  : 'bg-kraft-50 text-gray-600 hover:bg-kraft-100 border border-kraft-200'
              }`}
            >
              Todos ({usuarios.length})
            </button>
            <button
              onClick={() => setRoleFilter('terreno')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all whitespace-nowrap ${
                roleFilter === 'terreno'
                  ? 'bg-obra-green text-white shadow-sm'
                  : 'bg-kraft-50 text-gray-600 hover:bg-kraft-100 border border-kraft-200'
              }`}
            >
              👷 Terreno ({countTerreno})
            </button>
            <button
              onClick={() => setRoleFilter('supervisor')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all whitespace-nowrap ${
                roleFilter === 'supervisor'
                  ? 'bg-obra-orange text-white shadow-sm'
                  : 'bg-kraft-50 text-gray-600 hover:bg-kraft-100 border border-kraft-200'
              }`}
            >
              📋 Supervisores ({countSupervisor})
            </button>
            <button
              onClick={() => setRoleFilter('admin')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all whitespace-nowrap ${
                roleFilter === 'admin'
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'bg-kraft-50 text-gray-600 hover:bg-kraft-100 border border-kraft-200'
              }`}
            >
              🛡️ Admins ({countAdmin})
            </button>
          </div>
        </div>

        {/* Grid de Trabajadores */}
        {filteredUsers.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-[#E5DFC9] rounded-3xl p-10 text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[#FAF8F5] border border-[#E5DFC9] flex items-center justify-center mx-auto text-[#FF6A00]">
              <HardHat className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-heading font-black text-xl text-[#1E1E1E]">
                {searchTerm || roleFilter !== 'todos'
                  ? 'No se encontraron miembros'
                  : 'No tienes trabajadores registrados'}
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-1.5 max-w-md mx-auto leading-relaxed">
                {searchTerm || roleFilter !== 'todos'
                  ? 'Prueba modificando tus filtros o el término de búsqueda.'
                  : 'Agrega a tus maestros, capataces y supervisores para vincularlos a sus obras.'}
              </p>
            </div>
            {searchTerm || roleFilter !== 'todos' ? (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setRoleFilter('todos');
                }}
                className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-bold rounded-xl transition-all font-heading"
              >
                Limpiar filtros
              </button>
            ) : (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-5 py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-md transition-all inline-flex items-center gap-2 font-heading"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Primer Trabajador</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredUsers.map((user) => {
              const roleBadge =
                user.rol === 'admin'
                  ? 'bg-navy-800 text-white'
                  : user.rol === 'supervisor'
                  ? 'bg-obra-orange-light text-obra-orange border border-obra-orange/20'
                  : 'bg-obra-green-light text-obra-green border border-obra-green/20';

              const cleanPhone = (user.telefono_whatsapp || '').replace(/[^0-9]/g, '');

              // Obras asignadas al trabajador
              const obrasAsignadas = proyectos.filter((p) =>
                (p.trabajadores_ids || []).includes(user.id)
              );

              return (
                <div
                  key={user.id}
                  className="bg-white border border-kraft-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-11 h-11 rounded-2xl bg-kraft-100 border border-kraft-200 flex items-center justify-center font-bold text-navy-900 font-heading text-base shrink-0">
                          {user.nombre.charAt(0)}
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-heading font-bold text-sm text-navy-900 truncate">
                            {user.nombre}
                          </h3>
                          <span className={`inline-block text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md mt-0.5 ${roleBadge}`}>
                            {user.rol === 'admin' ? 'Administrador' : user.rol === 'supervisor' ? 'Supervisor' : 'Terreno'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(user)}
                          className="p-1.5 text-gray-400 hover:text-[#FF6A00] hover:bg-[#FF6A00]/10 rounded-lg transition-colors"
                          title="Editar datos"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {user.rol !== 'admin' && (
                          <button
                            type="button"
                            onClick={() => setUserToDelete(user)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar trabajador"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-gray-600 font-mono pt-3 border-t border-kraft-200/80">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate">
                          <Phone className="w-3.5 h-3.5 text-obra-green shrink-0" />
                          <a href={`tel:${user.telefono_whatsapp}`} className="hover:text-navy-900 truncate">
                            {user.telefono_whatsapp}
                          </a>
                        </div>
                        {cleanPhone && (
                          <a
                            href={`https://wa.me/${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 rounded text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors"
                            title="Abrir chat de WhatsApp"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-gray-500">
                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Obras de ${user.nombre}`}>
                    {obrasAsignadas.length ? obrasAsignadas.slice(0,2).map(p => <Link key={p.id} href={`/proyectos/${p.id}/gantt`} className="max-w-full truncate rounded-md bg-kraft-50 px-2 py-1 text-[11px] text-gray-600 hover:text-obra-orange" title={p.nombre}>{p.nombre}</Link>)
                      : <span className="text-[11px] text-gray-400">Sin obra asignada</span>}
                    {obrasAsignadas.length > 2 && <details className="text-[11px] text-gray-500"><summary className="cursor-pointer">+{obrasAsignadas.length-2} obras</summary>{obrasAsignadas.slice(2).map(p => <Link className="block py-1 hover:text-obra-orange" key={p.id} href={`/proyectos/${p.id}/gantt`}>{p.nombre}</Link>)}</details>}
                  </div>
                  <div className="pt-4 mt-4 border-t border-kraft-200/80 flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1 font-mono text-[11px]">
                      <HardHat className="w-3.5 h-3.5 text-obra-orange" />
                      <span>{user.rol === 'admin' || user.is_dev ? 'Panel web' : 'WhatsApp'}</span>
                    </span>
                    <span className="text-[10px] font-mono bg-kraft-100 text-navy-900 px-2 py-0.5 rounded">
                      {obrasAsignadas.length} {obrasAsignadas.length === 1 ? 'obra' : 'obras'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Modal: + Agregar Trabajador */}
      {isCreateModalOpen && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-obra-orange" />
                <span>Agregar trabajador</span>
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form aria-busy={saving} onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1" htmlFor="equipo-nombre">
                  Nombre Completo del Maestro *
                </label>
                <input
 id="equipo-nombre"                  type="text"
                  required
                  placeholder="Ej: Pedro Morales"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-gray-800 rounded-xl text-xs text-navy-900 dark:text-white focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase" htmlFor="equipo-rut">
                    RUT Chileno del Trabajador *
                  </label>
                  {rut && (
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        validarRutChileno(rut)
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      }`}
                    >
                      {validarRutChileno(rut) ? '✓ Válido' : '✗ Inválido'}
                    </span>
                  )}
                </div>
                <input
 id="equipo-rut"                  type="text"
                  required
                  placeholder="12.345.678-9"
                  value={rut}
                  onChange={handleRutChange}
                  className="w-full px-3.5 py-2 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-gray-800 rounded-xl text-xs text-navy-900 dark:text-white focus:outline-none focus:border-obra-orange font-mono"
                />
              </div>

              <div>
                <label htmlFor="worker-email" className="block text-[11px] font-mono font-semibold mb-1">Correo de contacto *</label>
                <input id="worker-email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-gray-800 rounded-xl text-xs" />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1" htmlFor="equipo-telefono">
                  WhatsApp Contacto *
                </label>
                <input
 id="equipo-telefono"                  type="tel"
                  required
                  placeholder="+56 9 1234 5678"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-gray-800 rounded-xl text-xs text-navy-900 dark:text-white font-mono focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1" htmlFor="equipo-rol">
                  Rol en la Constructora *
                </label>
                <select
 id="equipo-rol"                  value={rol}
                  onChange={(e) => setRol(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-gray-800 rounded-xl text-xs text-navy-900 dark:text-white focus:outline-none focus:border-obra-orange font-mono"
                >
                  <option value="terreno">👷 Terreno (Maestro - Vista reducida móvil / Fotos de faena)</option>
                  <option value="supervisor">Supervisor · WhatsApp</option>
                </select>
              </div>

              <div>
                <label htmlFor="worker-project" className="block text-[11px] font-mono font-semibold mb-1">Obra {rol === 'terreno' ? '*' : '(opcional)'}</label>
                <select id="worker-project" required={rol === 'terreno'} value={projectId} onChange={e => setProjectId(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-gray-800 rounded-xl text-xs">
                  <option value="">Selecciona una obra</option>
                  {proyectos.filter(p => p.estado !== 'terminado').map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !validarRutChileno(rut) || !email || (rol === 'terreno' && !projectId)}
                  className="px-5 py-2.5 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-bold rounded-xl shadow-sm font-heading disabled:opacity-50 transition-all"
                >
                  Registrar trabajador
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: Editar Trabajador */}
      {editingUser && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-obra-orange" />
                <span>Editar Datos de Trabajador</span>
              </h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1" htmlFor="equipo-editNombre">
                  Nombre Completo *
                </label>
                <input
 id="equipo-editNombre"                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1" htmlFor="equipo-editRut">
                  RUT Chileno (ej: 19.123.456-3)
                </label>
                <input
 id="equipo-editRut"                  type="text"
                  value={editRut}
                  onChange={(e) => setEditRut(formatRUT(e.target.value))}
                  placeholder="19.123.456-3"
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1" htmlFor="equipo-editTelefono">
                  Teléfono WhatsApp (formato E.164) *
                </label>
                <input
 id="equipo-editTelefono"                  type="tel"
                  required
                  value={editTelefono}
                  onChange={(e) => setEditTelefono(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1" htmlFor="equipo-editEmail">
                  Correo Electrónico
                </label>
                <input
 id="equipo-editEmail"                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1" htmlFor="equipo-editRol">
                  Rol en la Constructora *
                </label>
                <select
 id="equipo-editRol"                  value={editRol}
                  onChange={(e) => setEditRol(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-mono"
                >

                  <option value="admin">🛡️ Administrador / Contratista General</option>
                  <option value="supervisor">📋 Supervisor (Control de Gantt y Aprobación)</option>
                  <option value="terreno">👷 Terreno (Maestro / Capataz - Reporta por WhatsApp)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-bold rounded-xl shadow-sm font-heading"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: Confirmar Eliminar Trabajador */}
      {userToDelete && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <div>
              <h3 className="font-heading font-bold text-base text-navy-900">
                ¿Eliminar a {userToDelete.nombre}?
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-1">
                El usuario ya no podrá reportar por WhatsApp ni figurar en las cuadrillas activas.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modal de Cambio y Recuperación de Contraseña */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        userEmail={activeUser?.email}
        onSuccess={() => showToast('¡Contraseña actualizada con éxito!')}
      />

    </div>
  );
}
