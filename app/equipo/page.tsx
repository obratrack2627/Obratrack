'use client';

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
  UserCheck,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { Usuario, Proyecto, UserRole } from '@/types/database';

export default function EquipoPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [userToDelete, setUserToDelete] = useState<Usuario | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | UserRole>('todos');

  // Formulario nuevo trabajador
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('+569');
  const [rol, setRol] = useState<UserRole>('terreno');

  // Formulario editar trabajador
  const [editNombre, setEditNombre] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editRol, setEditRol] = useState<UserRole>('terreno');

  const loadData = () => {
    const users = dataService.getUsuarios();
    const projs = dataService.getProyectos();
    setUsuarios(users);
    setProyectos(projs);
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    const activeUser = dataService.getActiveUser();

    dataService.createUsuario({
      empresa_id: activeUser?.empresa_id || 'emp-1',
      nombre: nombre.trim(),
      email: email.trim() || `${nombre.toLowerCase().replace(/\s+/g, '.')}@gmail.com`,
      telefono_whatsapp: telefono.trim(),
      rol,
    });

    setIsCreateModalOpen(false);
    setNombre('');
    setEmail('');
    setTelefono('+569');
    setRol('terreno');
    loadData();
    showToast(`Trabajador "${nombre.trim()}" agregado a la cuadrilla.`);
  };

  const handleOpenEdit = (user: Usuario) => {
    setEditingUser(user);
    setEditNombre(user.nombre);
    setEditEmail(user.email || '');
    setEditTelefono(user.telefono_whatsapp || '+569');
    setEditRol(user.rol);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editNombre.trim()) return;

    dataService.updateUsuario(editingUser.id, {
      nombre: editNombre.trim(),
      email: editEmail.trim(),
      telefono_whatsapp: editTelefono.trim(),
      rol: editRol,
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
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2 font-heading transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Agregar Trabajador</span>
          </button>
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
                            {user.rol}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(user)}
                          className="p-1.5 text-gray-400 hover:text-[#FF6A00] hover:bg-[#FF6A00]/10 rounded-lg transition-colors"
                          title="Editar trabajador"
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
                            className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors"
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

                  <div className="pt-4 mt-4 border-t border-kraft-200/80 flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1 font-mono text-[11px]">
                      <HardHat className="w-3.5 h-3.5 text-obra-orange" />
                      <span>{user.rol === 'terreno' ? 'Habilitado WhatsApp' : 'Acceso al Panel'}</span>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-obra-orange" />
                <span>Agregar Trabajador a la Cuadrilla</span>
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pedro Morales"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Teléfono WhatsApp (formato E.164) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+56912345678"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                />
                <span className="text-[10px] text-gray-400 font-mono mt-1 block">
                  Este número se usará para vincular los mensajes y audios entrantes de WhatsApp con sus obras.
                </span>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Correo Electrónico (Opcional)
                </label>
                <input
                  type="email"
                  placeholder="pedro.morales@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Rol en la Constructora *
                </label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-mono"
                >
                  <option value="terreno">👷 Terreno (Maestro / Capataz - Reporta por WhatsApp)</option>
                  <option value="supervisor">📋 Supervisor (Control de Gantt y Aprobación)</option>
                  <option value="admin">🛡️ Administrador (Acceso Total y Finanzas)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-bold rounded-xl shadow-sm font-heading"
                >
                  Guardar Trabajador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Trabajador */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
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
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Teléfono WhatsApp (formato E.164) *
                </label>
                <input
                  type="tel"
                  required
                  value={editTelefono}
                  onChange={(e) => setEditTelefono(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Rol en la Constructora *
                </label>
                <select
                  value={editRol}
                  onChange={(e) => setEditRol(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-mono"
                >
                  <option value="terreno">👷 Terreno (Maestro / Capataz - Reporta por WhatsApp)</option>
                  <option value="supervisor">📋 Supervisor (Control de Gantt y Aprobación)</option>
                  <option value="admin">🛡️ Administrador (Acceso Total y Finanzas)</option>
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
        </div>
      )}

      {/* Modal: Confirmar Eliminar Trabajador */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 text-center space-y-4">
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
        </div>
      )}

    </div>
  );
}
