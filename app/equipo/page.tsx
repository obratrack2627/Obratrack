'use client';
import CompactSummary from '@/components/CompactSummary';
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
  Terminal,
  LayoutGrid,
  List,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { parseSpecialties } from '@/lib/team-specialties';
import { registrationFields } from '@/lib/registrations';
import { aiHeaders } from '@/lib/ai/client';
import { dataService } from '@/lib/data-service';
import { formatRUT, validarRutChileno } from '@/lib/utils';
import { canonicalPhone } from '@/lib/phone';
import { isDeveloperEmail } from '@/lib/auth-utils';
import {
  formatRegistrationConflictMessage,
  isValidEmail,
  normalizePhoneKeyDigits,
  normalizeRutKey,
  type RegistrationConflictField,
} from '@/lib/auth/registration-validation';
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

  // Filtros y Vista
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | UserRole>('todos');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Formulario nuevo trabajador / maestro
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('+56 9 ');
  const [rol, setRol] = useState<UserRole>('terreno');
  const [especialidades, setEspecialidades] = useState('');

  // Formulario editar trabajador
  const [editNombre, setEditNombre] = useState('');
  const [editRut, setEditRut] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editRol, setEditRol] = useState<UserRole>('terreno');
  const [editEspecialidades, setEditEspecialidades] = useState('');

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
    try {
      const checked = registrationFields({ tipo: 'trabajador', nombre, rut, email, telefono, rol, proyecto_id: projectId, especialidades: parseSpecialties(especialidades) });
      if (checked.missing.length) { showToast('Completa: ' + checked.missing.join(', ')); return; }
      setSaving(true);
      const response = await fetch('/api/equipo/crear-usuario', {
        method: 'POST', headers: await aiHeaders(), body: JSON.stringify(checked.draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar el trabajador.');
      const synced = await dataService.pullFromCloudServer();
      setIsCreateModalOpen(false);
      setNombre(''); setRut(''); setEmail(''); setTelefono('+56 9 '); setRol('terreno'); setProjectId(''); setEspecialidades('');
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
    const validPhone = canonicalPhone(user.telefono_whatsapp || '');
    setEditTelefono(validPhone ? `+${validPhone}` : '+56 9 ');
    setEditRol(user.rol);
    setEditEspecialidades((user.especialidades || []).join(", "));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editNombre.trim()) {
      showToast('⚠️ Ingresa el nombre completo del trabajador.');
      return;
    }

    const isDev = isDeveloperEmail(editingUser.email) || editingUser.is_dev;
    const cleanRut = editRut.trim();
    if (cleanRut && !validarRutChileno(cleanRut) && !isDev) {
      showToast('⚠️ El RUT ingresado no es válido según el formato chileno.');
      return;
    }

    const cleanEmail = editEmail.trim();
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      showToast('⚠️ El correo electrónico ingresado no es válido.');
      return;
    }

    const trimmedPhone = editTelefono.trim();
    const isDefaultEmptyPhone =
      !trimmedPhone || trimmedPhone === '+56 9' || trimmedPhone === '+569' || trimmedPhone === '569';
    const validPhone = isDefaultEmptyPhone ? '' : canonicalPhone(trimmedPhone);
    if (!isDefaultEmptyPhone && !validPhone) {
      showToast('⚠️ Ingresa un número de teléfono válido (ej: +56 9 1234 5678).');
      return;
    }

    const otherUsers = usuarios.filter((u) => u.id !== editingUser.id);
    const targetRut = normalizeRutKey(cleanRut);
    const targetEmail = cleanEmail.toLowerCase();
    const conflicts: RegistrationConflictField[] = [];
    if (targetRut && otherUsers.some((u) => normalizeRutKey(u.rut) === targetRut)) {
      conflicts.push('rut');
    }
    if (validPhone && otherUsers.some((u) => normalizePhoneKeyDigits(u.telefono_whatsapp) === validPhone)) {
      conflicts.push('telefono');
    }
    if (targetEmail && otherUsers.some((u) => (u.email || '').trim().toLowerCase() === targetEmail)) {
      conflicts.push('email');
    }
    if (conflicts.length > 0) {
      showToast(`⚠️ ${formatRegistrationConflictMessage(conflicts)}`);
      return;
    }

    let specialties: string[];
    try { specialties = parseSpecialties(editEspecialidades); }
    catch (error) { showToast((error as Error).message); return; }
    dataService.updateUsuario(editingUser.id, {
      especialidades: specialties,
      nombre: editNombre.trim(),
      rut: cleanRut || undefined,
      email: cleanEmail,
      telefono_whatsapp: validPhone ? `+${validPhone}` : '',
      rol: isDev ? 'admin' : editRol,
      is_dev: isDev ? true : editingUser.is_dev,
    });

    setEditingUser(null);
    loadData();
    showToast(`Datos de "${editNombre.trim()}" actualizados con éxito.`);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    dataService.deleteUsuario(userToDelete.id);
    try { await dataService.confirmarCambios(); showToast('Eliminación guardada.'); }
    catch(error) { showToast(error instanceof Error ? error.message : 'Eliminación pendiente de sincronización.'); }
    setUserToDelete(null);
    loadData();
  };

  // Filtrado reactivo
  const filteredUsers = useMemo(() => {
    return usuarios.filter((u) => {
      const matchRole = roleFilter === 'todos' || u.rol === roleFilter;
      const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const term = normalize(searchTerm);
      const matchSearch =
        normalize(u.nombre).includes(term) ||
        (u.especialidades || []).some(value => normalize(value).includes(term)) ||
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
        title="Equipo"
        subtitle="Personas y obras asignadas."
        action={
          <div className="flex items-center gap-2">

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
        <CompactSummary><div className="workspace-metrics grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                Total Cuadrilla
              </p>
              <div className="w-8 h-8 rounded-lg bg-navy-800 text-obra-orange flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold font-heading text-navy-900 dark:text-white">
              {usuarios.length}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              Personal activo en la empresa
            </p>
          </div>

          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                Maestros en Terreno (WhatsApp)
              </p>
              <div className="w-8 h-8 rounded-lg bg-obra-green-light dark:bg-obra-green/15 text-obra-green flex items-center justify-center shrink-0">
                <HardHat className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold font-heading text-obra-green">
              {countTerreno}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              Habilitados para reportar por audio
            </p>
          </div>

          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                Supervisores & Admins
              </p>
              <div className="w-8 h-8 rounded-lg bg-obra-orange-light dark:bg-obra-orange/15 text-obra-orange flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold font-heading text-navy-900 dark:text-white">
              {countSupervisor + countAdmin}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              Control de Gantt, Finanzas y Aprobación
            </p>
          </div>
        </div></CompactSummary>

        {/* Barra de Filtros y Búsqueda */}
        <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3 min-w-0">
          {/* Fila Superior: Buscador + Selector de Vista */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar nombre, especialidad, teléfono o correo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-10 pr-8 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] rounded-xl text-xs text-navy-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-obra-orange focus:bg-white dark:focus:bg-[#141A23] transition-colors font-sans"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full hover:bg-kraft-200 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-center text-xs transition-colors"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-kraft-50 dark:bg-[#0F141C] p-1 rounded-xl border border-kraft-200 dark:border-[#263040] h-10">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 h-full rounded-lg text-xs font-heading font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    viewMode === 'list'
                      ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900 shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-kraft-100 dark:hover:bg-[#1E2530]'
                  }`}
                  title="Vista en Lista"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Lista</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`px-2.5 h-full rounded-lg text-xs font-heading font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900 shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-kraft-100 dark:hover:bg-[#1E2530]'
                  }`}
                  title="Vista en Tarjetas"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Tarjetas</span>
                </button>
              </div>
            </div>
          </div>

          {/* Fila Inferior: Pestañas por Rol */}
          <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-kraft-100 dark:border-[#1E2530] min-w-0">
            <div
              role="tablist"
              aria-label="Filtrar equipo por rol"
              className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0 -mx-1 px-1"
            >
              {(
                [
                  {
                    value: 'todos',
                    label: 'Todos',
                    count: usuarios.length,
                    dot: 'bg-gray-400',
                    activeClass:
                      'bg-navy-900 text-white border-navy-900 dark:bg-white dark:text-navy-900 dark:border-white shadow-sm',
                  },
                  {
                    value: 'terreno',
                    label: 'Terreno',
                    count: countTerreno,
                    dot: 'bg-obra-green',
                    activeClass: 'bg-obra-green text-white border-obra-green shadow-sm',
                  },
                  {
                    value: 'supervisor',
                    label: 'Supervisores',
                    count: countSupervisor,
                    dot: 'bg-obra-orange',
                    activeClass: 'bg-obra-orange text-white border-obra-orange shadow-sm',
                  },
                  {
                    value: 'admin',
                    label: 'Administradores',
                    count: countAdmin,
                    dot: 'bg-blue-500',
                    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-sm',
                  },
                ] as const
              ).map((tab) => {
                const isActive = roleFilter === tab.value;
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    key={tab.value}
                    onClick={() => setRoleFilter(tab.value)}
                    className={`h-8 px-3 rounded-xl text-xs font-heading font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap border transition-all ${
                      isActive
                        ? tab.activeClass
                        : 'bg-kraft-50 dark:bg-[#0F141C] text-gray-600 dark:text-gray-300 border-kraft-200 dark:border-[#263040] hover:bg-kraft-100 dark:hover:bg-[#1E2530]'
                    }`}
                  >
                    {tab.value !== 'todos' && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isActive ? 'bg-white dark:bg-current' : tab.dot
                        }`}
                      />
                    )}
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
                        isActive
                          ? 'bg-white/20 text-current'
                          : 'bg-kraft-200/70 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {(searchTerm || roleFilter !== 'todos') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setRoleFilter('todos');
                }}
                className="text-xs font-heading font-bold text-obra-orange hover:underline shrink-0 pl-2 whitespace-nowrap"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Listado de Trabajadores */}
        {filteredUsers.length === 0 ? (
          <div className="bg-white dark:bg-[#141A23] border-2 border-dashed border-[#E5DFC9] dark:border-[#263040] rounded-3xl p-10 text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] flex items-center justify-center mx-auto text-[#FF6A00]">
              <HardHat className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-heading font-black text-xl text-[#1E1E1E] dark:text-white">
                {searchTerm || roleFilter !== 'todos'
                  ? 'No se encontraron miembros'
                  : 'No tienes trabajadores registrados'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-sans mt-1.5 max-w-md mx-auto leading-relaxed">
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
                className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 dark:bg-[#1E2530] dark:hover:bg-[#263040] text-navy-900 dark:text-white text-xs font-bold rounded-xl transition-all font-heading"
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
        ) : viewMode === 'list' ? (
          /* Vista Moderna en Lista Compacta */
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl overflow-hidden shadow-sm">
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-3 bg-[#FAF8F5] dark:bg-[#1A222D] border-b border-kraft-200 dark:border-[#263040] text-[11px] font-mono font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <div className="col-span-4">Integrante y Rol</div>
              <div className="col-span-3">Contacto / WhatsApp</div>
              <div className="col-span-3">Obras Asignadas</div>
              <div className="col-span-1 text-center">Canal</div>
              <div className="col-span-1 text-right">Acciones</div>
            </div>

            <div className="divide-y divide-kraft-100 dark:divide-[#1E2530]">
              {filteredUsers.map((user) => {
                const roleBadge =
                  user.rol === 'admin'
                    ? 'bg-navy-800 text-white'
                    : user.rol === 'supervisor'
                    ? 'bg-obra-orange-light dark:bg-obra-orange/15 text-obra-orange border border-obra-orange/20'
                    : 'bg-obra-green-light dark:bg-obra-green/15 text-obra-green border border-obra-green/20';

                const cleanPhone = canonicalPhone(user.telefono_whatsapp || '');
                const obrasAsignadas = proyectos.filter((p) =>
                  (p.trabajadores_ids || []).includes(user.id)
                );

                return (
                  <div
                    key={user.id}
                    data-team-member={user.id}
                    className="px-4 py-3.5 sm:px-5 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-start lg:items-center hover:bg-kraft-50/70 dark:hover:bg-[#1A222D]/60 transition-colors"
                  >
                    {/* Integrante y Rol */}
                    <div className="lg:col-span-4 flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-kraft-100 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] flex items-center justify-center font-bold text-navy-900 dark:text-white font-heading text-sm shrink-0">
                          {user.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-heading font-bold text-sm text-navy-900 dark:text-white truncate">
                              {user.nombre}
                            </h3>
                            <span
                              className={`inline-block text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md shrink-0 ${roleBadge}`}
                            >
                              {user.rol === 'admin'
                                ? 'Administrador'
                                : user.rol === 'supervisor'
                                ? 'Supervisor'
                                : 'Terreno'}
                            </span>
                          </div>
                          {user.rut && (
                            <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate mt-0.5">
                              RUT {formatRUT(user.rut)}
                            </p>
                          )}
                          {!!user.especialidades?.length && (
                            <div className="mt-1.5 flex flex-wrap gap-1" aria-label={`Especialidades de ${user.nombre}`}>
                              {user.especialidades.map((name) => (
                                <span
                                  key={name}
                                  className="max-w-full break-words rounded-md border border-obra-orange/20 bg-obra-orange/10 px-1.5 py-0.5 text-[10px] font-sans text-gray-700 dark:text-gray-200"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Canal visible rápido en móvil */}
                      <span className="lg:hidden inline-flex items-center gap-1 text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] px-2 py-0.5 rounded-md shrink-0">
                        <HardHat className="w-3 h-3 text-obra-orange" />
                        <span>{user.rol === 'admin' || user.is_dev ? 'Panel web' : 'WhatsApp'}</span>
                      </span>
                    </div>

                    {/* Contacto / WhatsApp */}
                    <div className="lg:col-span-3 space-y-1 text-xs font-mono text-gray-600 dark:text-gray-300 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {cleanPhone ? (
                          <>
                            <a
                              href={`tel:+${cleanPhone}`}
                              className="inline-flex items-center gap-1.5 text-obra-green hover:underline truncate"
                            >
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              <span>+{cleanPhone}</span>
                            </a>
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 rounded text-[10px] font-bold inline-flex items-center gap-1 shrink-0 transition-colors"
                              title="Abrir chat de WhatsApp"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </a>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-gray-400">
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            <span>Sin teléfono</span>
                          </span>
                        )}
                      </div>

                      {user.email && (
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
                          <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </div>
                      )}
                    </div>

                    {/* Obras Asignadas */}
                    <div
                      className="lg:col-span-3 flex flex-wrap items-center gap-1.5 min-w-0"
                      aria-label={`Obras de ${user.nombre}`}
                    >
                      <span className="text-[10px] font-mono font-bold bg-kraft-100 dark:bg-[#0F141C] border border-kraft-200/80 dark:border-[#263040] text-navy-900 dark:text-gray-200 px-2 py-0.5 rounded-md shrink-0">
                        {obrasAsignadas.length} {obrasAsignadas.length === 1 ? 'obra' : 'obras'}
                      </span>
                      {obrasAsignadas.length > 0 ? (
                        <>
                          {obrasAsignadas.slice(0, 2).map((p) => (
                            <Link
                              key={p.id}
                              href={`/proyectos/${p.id}/gantt`}
                              className="max-w-[160px] truncate rounded-md bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300 hover:text-obra-orange transition-colors"
                              title={p.nombre}
                            >
                              {p.nombre}
                            </Link>
                          ))}
                          {obrasAsignadas.length > 2 && (
                            <details className="text-[11px] text-gray-500 dark:text-gray-400">
                              <summary className="cursor-pointer font-mono hover:text-obra-orange">
                                +{obrasAsignadas.length - 2} más
                              </summary>
                              <div className="mt-1 space-y-0.5">
                                {obrasAsignadas.slice(2).map((p) => (
                                  <Link
                                    className="block py-0.5 hover:text-obra-orange font-mono"
                                    key={p.id}
                                    href={`/proyectos/${p.id}/gantt`}
                                  >
                                    {p.nombre}
                                  </Link>
                                ))}
                              </div>
                            </details>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-gray-400">Sin obra asignada</span>
                      )}
                    </div>

                    {/* Canal (desktop) */}
                    <div className="hidden lg:flex lg:col-span-1 items-center justify-center">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        <HardHat className="w-3.5 h-3.5 text-obra-orange shrink-0" />
                        <span>{user.rol === 'admin' || user.is_dev ? 'Web' : 'WhatsApp'}</span>
                      </span>
                    </div>

                    {/* Acciones */}
                    <div className="lg:col-span-1 flex items-center justify-end gap-1 pt-1 lg:pt-0 border-t border-kraft-100 dark:border-[#1E2530] lg:border-t-0">
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
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                          title="Eliminar trabajador"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Vista en Tarjetas */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredUsers.map((user) => {
              const roleBadge =
                user.rol === 'admin'
                  ? 'bg-navy-800 text-white'
                  : user.rol === 'supervisor'
                  ? 'bg-obra-orange-light dark:bg-obra-orange/15 text-obra-orange border border-obra-orange/20'
                  : 'bg-obra-green-light dark:bg-obra-green/15 text-obra-green border border-obra-green/20';

              const cleanPhone = canonicalPhone(user.telefono_whatsapp || '');

              // Obras asignadas al trabajador
              const obrasAsignadas = proyectos.filter((p) =>
                (p.trabajadores_ids || []).includes(user.id)
              );

              return (
                <div
                  key={user.id}
                  data-team-member={user.id}
                  className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-11 h-11 rounded-2xl bg-kraft-100 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] flex items-center justify-center font-bold text-navy-900 dark:text-white font-heading text-base shrink-0">
                          {user.nombre.charAt(0)}
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-heading font-bold text-sm text-navy-900 dark:text-white truncate">
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
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                            title="Eliminar trabajador"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {!!user.especialidades?.length && <div className="mb-3 flex flex-wrap gap-1.5" aria-label={`Especialidades de ${user.nombre}`}>
                      {user.especialidades.map(name => <span key={name} className="max-w-full break-words rounded-md border border-obra-orange/15 bg-obra-orange/5 px-2 py-1 text-[11px] text-gray-700 dark:text-gray-200">{name}</span>)}
                    </div>}
                    <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300 font-mono pt-3 border-t border-kraft-200/80 dark:border-[#263040]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate">
                          <Phone className="w-3.5 h-3.5 text-obra-green shrink-0" />
                          {cleanPhone ? (
                            <a href={`tel:+${cleanPhone}`} className="hover:text-navy-900 dark:hover:text-white truncate">
                              +{cleanPhone}
                            </a>
                          ) : (
                            <span className="text-gray-400">Sin teléfono</span>
                          )}
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

                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Obras de ${user.nombre}`}>
                    {obrasAsignadas.length ? obrasAsignadas.slice(0,2).map(p => <Link key={p.id} href={`/proyectos/${p.id}/gantt`} className="max-w-full truncate rounded-md bg-kraft-50 dark:bg-[#0F141C] px-2 py-1 text-[11px] text-gray-600 dark:text-gray-300 hover:text-obra-orange" title={p.nombre}>{p.nombre}</Link>)
                      : <span className="text-[11px] text-gray-400">Sin obra asignada</span>}
                    {obrasAsignadas.length > 2 && <details className="text-[11px] text-gray-500 dark:text-gray-400"><summary className="cursor-pointer">+{obrasAsignadas.length-2} obras</summary>{obrasAsignadas.slice(2).map(p => <Link className="block py-1 hover:text-obra-orange" key={p.id} href={`/proyectos/${p.id}/gantt`}>{p.nombre}</Link>)}</details>}
                  </div>
                  <div className="pt-4 mt-4 border-t border-kraft-200/80 dark:border-[#263040] flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1 font-mono text-[11px]">
                      <HardHat className="w-3.5 h-3.5 text-obra-orange" />
                      <span>{user.rol === 'admin' || user.is_dev ? 'Panel web' : 'WhatsApp'}</span>
                    </span>
                    <span className="text-[10px] font-mono bg-kraft-100 dark:bg-[#0F141C] text-navy-900 dark:text-white px-2 py-0.5 rounded">
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
                <label htmlFor="equipo-especialidades" className="block text-xs font-semibold mb-1">Especialidades <span className="font-normal text-gray-500">(opcional)</span></label>
                <input id="equipo-especialidades" value={especialidades} onChange={e => setEspecialidades(e.target.value)} maxLength={800} placeholder="Carpintería, gasfitería, pintura" aria-describedby="equipo-especialidades-help" className="w-full min-w-0 px-3.5 py-2 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-gray-800 rounded-xl text-xs focus:outline-none focus:border-obra-orange" />
                <p id="equipo-especialidades-help" className="mt-1 text-[11px] text-gray-500">Separa cada especialidad con una coma.</p>
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
                  <option value="terreno">Terreno · WhatsApp</option>
                  <option value="supervisor">Supervisor · WhatsApp</option>
                </select>
              </div>

              <div>
                <label htmlFor="worker-project" className="block text-[11px] font-mono font-semibold mb-1">Obra {rol === 'terreno' ? '*' : '(opcional)'}</label>
                <select id="worker-project" required={rol === 'terreno'} value={projectId} onChange={e => setProjectId(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-gray-800 rounded-xl text-xs">
                  <option value="">Selecciona una obra</option>
                  {proyectos.filter(p => p.estado !== 'terminado' && p.estado !== 'cancelada').map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
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
                <label htmlFor="equipo-editEspecialidades" className="block text-xs font-semibold mb-1">Especialidades <span className="font-normal text-gray-500">(opcional)</span></label>
                <input id="equipo-editEspecialidades" value={editEspecialidades} onChange={e => setEditEspecialidades(e.target.value)} maxLength={800} placeholder="Carpintería, gasfitería, pintura" aria-describedby="equipo-editEspecialidades-help" className="w-full min-w-0 px-3.5 py-2 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-gray-800 rounded-xl text-xs focus:outline-none focus:border-obra-orange" />
                <p id="equipo-editEspecialidades-help" className="mt-1 text-[11px] text-gray-500">Separa con comas. Déjalo vacío para quitarlas.</p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase" htmlFor="equipo-editRut">
                    RUT Chileno (ej: 19.123.456-3)
                  </label>
                  {editRut.trim().length > 0 && (
                    <span className={`text-[10px] font-bold ${validarRutChileno(editRut) ? 'text-green-600' : 'text-red-500'}`}>
                      {validarRutChileno(editRut) ? '✓ Válido' : '✗ Inválido'}
                    </span>
                  )}
                </div>
                <input
                  id="equipo-editRut"
                  type="text"
                  maxLength={12}
                  value={editRut}
                  onChange={(e) => setEditRut(formatRUT(e.target.value))}
                  placeholder="19.123.456-3"
                  className={`w-full px-3.5 py-2 bg-kraft-50 border rounded-xl text-xs font-mono focus:outline-none ${editRut.trim() && !validarRutChileno(editRut) ? 'border-red-400 focus:border-red-500' : 'border-kraft-200 focus:border-obra-orange'}`}
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

                  <option value="admin">Administrador / Contratista General</option>
                  <option value="supervisor">Supervisor · WhatsApp</option>
                  <option value="terreno">Terreno · WhatsApp</option>
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


    </div>
  );
}
