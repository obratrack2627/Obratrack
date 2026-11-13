'use client';
import MoneyAmount from "@/components/MoneyAmount";
import CompactSummary from '@/components/CompactSummary';
import ModalOverlay from '@/components/ModalOverlay';
import ClientProjectAssignments from '@/components/ClientProjectAssignments';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Building,
  Plus,
  Phone,
  Mail,
  MapPin,
  FileText,
  DollarSign,
  FolderOpen,
  X,
  Trash2,
  Users,
  Search,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ArrowUpDown,
  LayoutGrid,
  List,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { Cliente, Proyecto } from '@/types/database';
import { formatCLP, formatRUT, validarRutChileno } from '@/lib/utils';
import { canonicalPhone } from '@/lib/phone';
import {
  formatRegistrationConflictMessage,
  isValidEmail,
  normalizePhoneKeyDigits,
  normalizeRutKey,
  type RegistrationConflictField,
} from '@/lib/auth/registration-validation';

function normalizeOptionalPhone(raw: string): { value: string; valid: boolean } {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '+569' || trimmed === '+56 9' || trimmed === '569') {
    return { value: '', valid: true };
  }
  const canonical = canonicalPhone(trimmed);
  if (!canonical) return { value: '', valid: false };
  return { value: `+${canonical}`, valid: true };
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  
  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [clienteToDelete, setClienteToDelete] = useState<Cliente | null>(null);
  const [selectedClienteDetail, setSelectedClienteDetail] = useState<Cliente | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filtros y Vista
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'activos' | 'con_obras' | 'sin_obras'>('todos');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Formulario nuevo cliente
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('+569');
  const [email, setEmail] = useState('');
  const [rut, setRut] = useState('');
  const [direccion, setDireccion] = useState('');
  const [obrasSeleccionadas, setObrasSeleccionadas] = useState<string[]>([]);

  // Formulario editar cliente
  const [editNombre, setEditNombre] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRut, setEditRut] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editObras, setEditObras] = useState<string[]>([]);
  const [originalEditObras, setOriginalEditObras] = useState<string[]>([]);

  const assignProjects = (clientId: string, selected: string[], originallyAssigned: string[] = []) => {
    for (const obra of dataService.getProyectos()) {
      if (selected.includes(obra.id) && obra.cliente_id !== clientId) {
        dataService.updateProyecto(obra.id, { cliente_id: clientId });
      } else if (!selected.includes(obra.id) && originallyAssigned.includes(obra.id) && obra.cliente_id === clientId) {
        dataService.updateProyecto(obra.id, { cliente_id: '' });
      }
    }
  };

  const confirmClientChanges = async (message: string) => {
    try { await dataService.confirmarCambios(); showToast(message); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Cambios pendientes de sincronización.'); }
  };

  const loadData = () => {
    const cls = dataService.getClientes();
    const projs = dataService.getProyectos();
    setClientes(cls);
    setProyectos(projs);
  };

  useEffect(() => {
    const user = dataService.getActiveUser();
    if (user?.rol === 'terreno') {
      window.location.href = '/proyectos';
      return;
    }
    loadData();
  }, []);

  useEffect(() => {
    window.addEventListener('obratrack_cloud_synced', loadData);
    return () => window.removeEventListener('obratrack_cloud_synced', loadData);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const validateClienteForm = (args: {
    nombreVal: string;
    telefonoVal: string;
    emailVal: string;
    rutVal: string;
    excludeId?: string;
  }): { phoneValue: string; error: string | null } => {
    if (!args.nombreVal.trim()) {
      return { phoneValue: '', error: '⚠️ Ingresa el nombre o razón social del cliente.' };
    }
    const phoneResult = normalizeOptionalPhone(args.telefonoVal);
    if (!phoneResult.valid) {
      return {
        phoneValue: '',
        error: '⚠️ Ingresa un número de teléfono válido (ej: +56 9 1234 5678) o déjalo en blanco.',
      };
    }
    const cleanRut = args.rutVal.trim();
    if (cleanRut && !validarRutChileno(cleanRut)) {
      return {
        phoneValue: '',
        error: '⚠️ El RUT ingresado no es válido. Revisa el dígito verificador.',
      };
    }
    const cleanEmail = args.emailVal.trim();
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      return { phoneValue: '', error: '⚠️ El correo electrónico ingresado no es válido.' };
    }
    const others = clientes.filter((c) => c.id !== args.excludeId);
    const targetRut = normalizeRutKey(cleanRut);
    const targetPhone = normalizePhoneKeyDigits(phoneResult.value);
    const targetEmail = cleanEmail.toLowerCase();
    const conflicts: RegistrationConflictField[] = [];
    if (targetRut && others.some((c) => normalizeRutKey(c.rut) === targetRut)) {
      conflicts.push('rut');
    }
    if (targetPhone && others.some((c) => normalizePhoneKeyDigits(c.telefono) === targetPhone)) {
      conflicts.push('telefono');
    }
    if (targetEmail && others.some((c) => (c.email || '').trim().toLowerCase() === targetEmail)) {
      conflicts.push('email');
    }
    if (conflicts.length > 0) {
      return {
        phoneValue: '',
        error: `⚠️ ${formatRegistrationConflictMessage(conflicts)}`,
      };
    }
    return { phoneValue: phoneResult.value, error: null };
  };

  const handleCreateCliente = (e: React.FormEvent) => {
    e.preventDefault();
    const checked = validateClienteForm({
      nombreVal: nombre,
      telefonoVal: telefono,
      emailVal: email,
      rutVal: rut,
    });
    if (checked.error) {
      showToast(checked.error);
      return;
    }

    const activeUser = dataService.getActiveUser();

    const created = dataService.createCliente({
      empresa_id: activeUser?.empresa_id || 'e1111111-1111-4111-a111-111111111111',
      nombre: nombre.trim(),
      telefono: checked.phoneValue,
      email: email.trim(),
      rut: rut.trim(),
      direccion: direccion.trim(),
    });
    assignProjects(created.id, obrasSeleccionadas);

    setIsCreateModalOpen(false);
    setNombre('');
    setTelefono('+569');
    setEmail('');
    setRut('');
    setDireccion('');
    setObrasSeleccionadas([]);
    loadData();
    void confirmClientChanges(`Cliente "${nombre.trim()}" y obras asociadas guardados.`);
  };

  const handleOpenEdit = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setEditNombre(cliente.nombre);
    const validPhone = canonicalPhone(cliente.telefono || '');
    setEditTelefono(validPhone ? `+${validPhone}` : '+569');
    setEditEmail(cliente.email || '');
    setEditRut(cliente.rut || '');
    setEditDireccion(cliente.direccion || '');
    const assigned = dataService.getProyectos().filter(p => p.cliente_id === cliente.id).map(p => p.id);
    setEditObras(assigned);
    setOriginalEditObras(assigned);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCliente) return;
    const checked = validateClienteForm({
      nombreVal: editNombre,
      telefonoVal: editTelefono,
      emailVal: editEmail,
      rutVal: editRut,
      excludeId: editingCliente.id,
    });
    if (checked.error) {
      showToast(checked.error);
      return;
    }

    dataService.updateCliente(editingCliente.id, {
      nombre: editNombre.trim(),
      telefono: checked.phoneValue,
      email: editEmail.trim(),
      rut: editRut.trim(),
      direccion: editDireccion.trim(),
    });
    assignProjects(editingCliente.id, editObras, originalEditObras);

    setEditingCliente(null);
    loadData();
    void confirmClientChanges(`Cliente "${editNombre.trim()}" y obras asociadas guardados.`);
  };

  const handleConfirmDelete = async () => {
    if (!clienteToDelete) return;
    dataService.deleteCliente(clienteToDelete.id);
    try { await dataService.confirmarCambios(); showToast('Eliminación guardada.'); }
    catch(error) { showToast(error instanceof Error ? error.message : 'Eliminación pendiente de sincronización.'); }
    setClienteToDelete(null);
    if (selectedClienteDetail?.id === clienteToDelete.id) {
      setSelectedClienteDetail(null);
    }
    loadData();
  };

  // Sets auxiliares para filtros de clientes por obras
  const clientesIdsActivos = useMemo(
    () => new Set(proyectos.filter((p) => p.estado === 'activo').map((p) => p.cliente_id).filter(Boolean)),
    [proyectos]
  );
  const clientesIdsConObras = useMemo(
    () => new Set(proyectos.filter((p) => p.estado !== 'cancelada').map((p) => p.cliente_id).filter(Boolean)),
    [proyectos]
  );

  // Filtrado reactivo
  const filteredClientes = useMemo(() => {
    return clientes.filter((c) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        c.nombre.toLowerCase().includes(term) ||
        (c.rut && c.rut.toLowerCase().includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term)) ||
        (c.telefono && c.telefono.toLowerCase().includes(term)) ||
        (c.direccion && c.direccion.toLowerCase().includes(term));

      if (!matchesSearch) return false;
      if (statusFilter === 'activos') return clientesIdsActivos.has(c.id);
      if (statusFilter === 'con_obras') return clientesIdsConObras.has(c.id);
      if (statusFilter === 'sin_obras') return !clientesIdsConObras.has(c.id);
      return true;
    });
  }, [clientes, searchTerm, statusFilter, clientesIdsActivos, clientesIdsConObras]);

  // Métricas (excluyendo obras canceladas)
  const proyectosVigentes = proyectos.filter((p) => p.estado !== 'cancelada');
  const totalContratadoGeneral = proyectosVigentes.reduce(
    (sum, p) => sum + (Number(p.monto_cotizado) || 0),
    0
  );
  const clientesConObras = new Set(proyectos.filter(p => p.estado === 'activo').map((p) => p.cliente_id).filter(Boolean)).size;

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
        title="Clientes"
        subtitle="Contactos y obras asociadas."
        action={
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2 font-heading transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Cliente</span>
          </button>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* KPI Cards de Clientes */}
        <CompactSummary><div className="workspace-metrics grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                Clientes Registrados
              </p>
              <div className="w-8 h-8 rounded-lg bg-navy-800 text-obra-orange flex items-center justify-center shrink-0">
                <Building className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold font-heading text-navy-900 dark:text-white">
              {clientes.length}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              Mandantes y personas particulares
            </p>
          </div>

          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                Con obras en curso
              </p>
              <div className="w-8 h-8 rounded-lg bg-obra-green-light dark:bg-obra-green/15 text-obra-green flex items-center justify-center shrink-0">
                <FolderOpen className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold font-heading text-obra-green">
              {clientesConObras}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              Mandantes con proyectos en curso
            </p>
          </div>

          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                Total cotizado
              </p>
              <div className="w-8 h-8 rounded-lg bg-obra-orange-light dark:bg-obra-orange/15 text-obra-orange flex items-center justify-center shrink-0">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold font-mono text-navy-900 dark:text-white">
              <MoneyAmount value={totalContratadoGeneral} />
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              Presupuestos asociados a sus obras
            </p>
          </div>
        </div></CompactSummary>

        {/* Barra de Filtros, Búsqueda y Selector de Vista */}
        <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3 min-w-0">
          {/* Fila Superior: Buscador + Selector de Vista */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por nombre, RUT, teléfono, email o dirección..."
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

          {/* Fila Inferior: Pestañas de Estado */}
          <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-kraft-100 dark:border-[#1E2530] min-w-0">
            <div
              role="tablist"
              aria-label="Filtrar clientes por estado de obras"
              className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0 -mx-1 px-1"
            >
              {(
                [
                  {
                    value: 'todos',
                    label: 'Todos',
                    count: clientes.length,
                    dot: 'bg-gray-400',
                    activeClass:
                      'bg-navy-900 text-white border-navy-900 dark:bg-white dark:text-navy-900 dark:border-white shadow-sm',
                  },
                  {
                    value: 'activos',
                    label: 'Con obras en curso',
                    count: clientes.filter((c) => clientesIdsActivos.has(c.id)).length,
                    dot: 'bg-obra-green',
                    activeClass: 'bg-obra-green text-white border-obra-green shadow-sm',
                  },
                  {
                    value: 'con_obras',
                    label: 'Con obras asociadas',
                    count: clientes.filter((c) => clientesIdsConObras.has(c.id)).length,
                    dot: 'bg-blue-500',
                    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-sm',
                  },
                  {
                    value: 'sin_obras',
                    label: 'Sin obras',
                    count: clientes.filter((c) => !clientesIdsConObras.has(c.id)).length,
                    dot: 'bg-slate-400',
                    activeClass: 'bg-slate-700 text-white border-slate-700 shadow-sm',
                  },
                ] as const
              ).map((tab) => {
                const isActive = statusFilter === tab.value;
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    key={tab.value}
                    onClick={() => setStatusFilter(tab.value)}
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

            {(searchTerm || statusFilter !== 'todos') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                }}
                className="text-xs font-heading font-bold text-obra-orange hover:underline shrink-0 pl-2 whitespace-nowrap"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Listado de Clientes */}
        {filteredClientes.length === 0 ? (
          <div className="bg-white dark:bg-[#141A23] border-2 border-dashed border-[#E5DFC9] dark:border-[#263040] rounded-3xl p-10 text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] flex items-center justify-center mx-auto text-[#FF6A00]">
              <Building className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-heading font-black text-xl text-[#1E1E1E] dark:text-white">
                {searchTerm ? 'No se encontraron clientes' : 'No tienes clientes registrados aún'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-sans mt-1.5 max-w-md mx-auto leading-relaxed">
                {searchTerm
                  ? `No hay coincidencias para "${searchTerm}". Prueba con otro término.`
                  : 'Agrega mandantes o personas particulares para asociarlos a tus cotizaciones y obras.'}
              </p>
            </div>
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm('')}
                className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 dark:bg-[#1E2530] dark:hover:bg-[#263040] text-navy-900 dark:text-white text-xs font-bold rounded-xl transition-all font-heading"
              >
                Limpiar búsqueda
              </button>
            ) : (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-5 py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-md transition-all inline-flex items-center gap-2 font-heading"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Primer Cliente</span>
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          /* Vista Moderna en Lista Compacta */
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl overflow-hidden shadow-sm">
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-3 bg-[#FAF8F5] dark:bg-[#1A222D] border-b border-kraft-200 dark:border-[#263040] text-[11px] font-mono font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <div className="col-span-4">Cliente / Mandante</div>
              <div className="col-span-3">Contacto y Dirección</div>
              <div className="col-span-2">Obras Asociadas</div>
              <div className="col-span-2 text-right">Total Contratado</div>
              <div className="col-span-1 text-right">Acciones</div>
            </div>

            <div className="divide-y divide-kraft-100 dark:divide-[#1E2530]">
              {filteredClientes.map((c) => {
                const obrasCliente = proyectosVigentes.filter((p) => p.cliente_id === c.id);
                const totalCotizadoCliente = obrasCliente.reduce(
                  (sum, p) => sum + (Number(p.monto_cotizado) || 0),
                  0
                );
                const totalPagadoCliente = obrasCliente.reduce(
                  (sum, p) => sum + (Number(p.total_pagado) || 0),
                  0
                );
                const validPhone = canonicalPhone(c.telefono || '');
                const hasActiveWork = clientesIdsActivos.has(c.id);

                return (
                  <div
                    key={c.id}
                    className="px-4 py-3.5 sm:px-5 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-start lg:items-center hover:bg-kraft-50/70 dark:hover:bg-[#1A222D]/60 transition-colors"
                  >
                    {/* Identidad */}
                    <div className="lg:col-span-4 flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-obra-orange/10 dark:bg-obra-orange/15 border border-obra-orange/20 text-obra-orange flex items-center justify-center font-heading font-bold text-sm shrink-0">
                          {c.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="font-heading font-bold text-sm text-navy-900 dark:text-white truncate">
                              {c.nombre}
                            </h3>
                            {hasActiveWork && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-obra-green/15 text-obra-green text-[10px] font-mono font-bold shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-obra-green" />
                                En obra
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {c.rut ? `RUT ${formatRUT(c.rut)}` : 'Sin RUT registrado'}
                          </p>
                        </div>
                      </div>

                      {/* Monto visible en móvil junto al nombre */}
                      <div className="lg:hidden text-right shrink-0">
                        <span className="font-mono font-bold text-xs text-navy-900 dark:text-white block">
                          {formatCLP(totalCotizadoCliente)}
                        </span>
                        <span className="text-[10px] font-mono text-gray-400">
                          {obrasCliente.length} {obrasCliente.length === 1 ? 'obra' : 'obras'}
                        </span>
                      </div>
                    </div>

                    {/* Contacto y Dirección */}
                    <div className="lg:col-span-3 space-y-1 text-xs text-gray-600 dark:text-gray-300 min-w-0">
                      <div className="flex flex-wrap lg:flex-col gap-x-4 gap-y-1 min-w-0">
                        {validPhone ? (
                          <a
                            href={`tel:+${validPhone}`}
                            className="inline-flex items-center gap-1.5 font-mono text-obra-green hover:underline truncate max-w-full"
                          >
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">+{validPhone}</span>
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-mono text-gray-400">
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            <span>Sin teléfono</span>
                          </span>
                        )}

                        {c.email ? (
                          <span className="inline-flex items-center gap-1.5 font-mono text-gray-600 dark:text-gray-300 truncate max-w-full">
                            <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{c.email}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-mono text-gray-400">
                            <Mail className="w-3.5 h-3.5 shrink-0" />
                            <span>Sin email</span>
                          </span>
                        )}
                      </div>

                      {c.direccion && (
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
                          <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{c.direccion}</span>
                        </div>
                      )}
                    </div>

                    {/* Obras Asociadas */}
                    <div className="lg:col-span-2 flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="hidden lg:inline-flex items-center gap-1 text-[11px] font-mono font-bold text-navy-900 dark:text-gray-200 bg-kraft-100 dark:bg-[#0F141C] border border-kraft-200/80 dark:border-[#263040] px-2 py-0.5 rounded-md shrink-0">
                        <FolderOpen className="w-3 h-3 text-obra-orange" />
                        <span>{obrasCliente.length}</span>
                      </span>
                      {obrasCliente.length > 0 ? (
                        <>
                          {obrasCliente.slice(0, 2).map((p) => (
                            <Link
                              key={p.id}
                              href={`/proyectos/${p.id}/finanzas`}
                              className="text-[11px] font-mono bg-kraft-50 dark:bg-[#0F141C] hover:bg-kraft-100 dark:hover:bg-[#1E2530] border border-kraft-200 dark:border-[#263040] text-navy-900 dark:text-gray-200 hover:text-obra-orange px-2 py-0.5 rounded-md inline-flex items-center gap-1 max-w-[160px] truncate transition-colors"
                              title={p.nombre}
                            >
                              <span className="truncate">{p.nombre}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-gray-400 shrink-0" />
                            </Link>
                          ))}
                          {obrasCliente.length > 2 && (
                            <span className="text-[10px] font-mono text-gray-400">
                              +{obrasCliente.length - 2} más
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-gray-400 font-sans">Sin obras asociadas</span>
                      )}
                    </div>

                    {/* Total Contratado (desktop) */}
                    <div className="hidden lg:flex lg:col-span-2 flex-col items-end justify-center text-right">
                      <span className="font-mono font-bold text-sm text-navy-900 dark:text-white">
                        {formatCLP(totalCotizadoCliente)}
                      </span>
                      {totalPagadoCliente > 0 && (
                        <span className="text-[10px] font-mono text-obra-green">
                          Pagado: {formatCLP(totalPagadoCliente)}
                        </span>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="lg:col-span-1 flex items-center justify-end gap-1 pt-1 lg:pt-0 border-t border-kraft-100 dark:border-[#1E2530] lg:border-t-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(c)}
                        className="p-1.5 text-gray-400 hover:text-[#FF6A00] hover:bg-[#FF6A00]/10 rounded-lg transition-colors"
                        title="Editar cliente"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setClienteToDelete(c)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                        title="Eliminar cliente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Vista en Tarjetas */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredClientes.map((c) => {
              const obrasCliente = proyectosVigentes.filter((p) => p.cliente_id === c.id);
              const totalCotizadoCliente = obrasCliente.reduce(
                (sum, p) => sum + (Number(p.monto_cotizado) || 0),
                0
              );
              const validPhone = canonicalPhone(c.telefono || '');

              return (
                <div
                  key={c.id}
                  className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="overflow-hidden">
                        <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white truncate">
                          {c.nombre}
                        </h3>
                        {c.rut ? (
                          <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
                            RUT: {formatRUT(c.rut)}
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-gray-400">
                            Sin RUT registrado
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(c)}
                          className="p-1.5 text-gray-400 hover:text-[#FF6A00] hover:bg-[#FF6A00]/10 rounded-lg transition-colors"
                          title="Editar cliente"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setClienteToDelete(c)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                          title="Eliminar cliente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300 font-sans border-t border-kraft-200/80 dark:border-[#263040] pt-3">
                      {validPhone ? (
                        <div className="flex items-center gap-2 font-mono">
                          <Phone className="w-3.5 h-3.5 text-obra-green shrink-0" />
                          <a href={`tel:+${validPhone}`} className="hover:text-navy-900 dark:hover:text-white truncate">
                            +{validPhone}
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 font-mono text-gray-400">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>Sin teléfono</span>
                        </div>
                      )}
                      
                      {c.email ? (
                        <div className="flex items-center gap-2 font-mono">
                          <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">{c.email}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 font-mono text-gray-400">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span>Sin email</span>
                        </div>
                      )}

                      {c.direccion ? (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <span className="line-clamp-1">{c.direccion}</span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 text-gray-400">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Sin dirección</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-kraft-200/80 dark:border-[#263040] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400 font-mono flex items-center gap-1">
                        <FolderOpen className="w-3.5 h-3.5 text-obra-orange" />
                        <span>Obras asociadas:</span>
                      </span>
                      <span className="font-bold font-mono text-navy-900 dark:text-white bg-kraft-100 dark:bg-[#0F141C] px-2 py-0.5 rounded">
                        {obrasCliente.length}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400 font-mono">Total Contratado:</span>
                      <span className="font-bold font-mono text-navy-900 dark:text-white">
                        {formatCLP(totalCotizadoCliente)}
                      </span>
                    </div>

                    {obrasCliente.length > 0 && (
                      <div className="pt-2 border-t border-kraft-100 dark:border-[#263040] flex flex-wrap gap-1">
                        {obrasCliente.slice(0, 2).map((p) => (
                          <Link
                            key={p.id}
                            href={`/proyectos/${p.id}/finanzas`}
                            className="text-[10px] font-mono bg-kraft-50 dark:bg-[#0F141C] hover:bg-kraft-100 dark:hover:bg-[#1E2530] border border-kraft-200 dark:border-[#263040] text-navy-900 dark:text-gray-200 px-2 py-0.5 rounded-md flex items-center gap-1 truncate max-w-full"
                          >
                            <span>{p.nombre}</span>
                            <ExternalLink className="w-2.5 h-2.5 text-gray-400" />
                          </Link>
                        ))}
                        {obrasCliente.length > 2 && (
                          <span className="text-[10px] font-mono text-gray-400 self-center">
                            +{obrasCliente.length - 2} más
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Modal: + Nuevo Cliente */}
      {isCreateModalOpen && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-obra-orange" />
                <span>Registrar Nuevo Mandante / Cliente</span>
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCliente} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre o Razón Social *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Constructora San Cristóbal / Juan Pérez"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Teléfono WhatsApp
                  </label>
                  <input
                    type="tel"
                    placeholder="+56912345678"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-mono font-semibold text-gray-700 uppercase">
                      RUT (Opcional)
                    </label>
                    {rut.trim().length > 0 && (
                      <span className={`text-[10px] font-bold ${validarRutChileno(rut) ? 'text-green-600' : 'text-red-500'}`}>
                        {validarRutChileno(rut) ? '✓ Válido' : '✗ Inválido'}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    maxLength={12}
                    placeholder="76.123.456-K"
                    value={rut}
                    onChange={(e) => setRut(formatRUT(e.target.value))}
                    className={`w-full px-3 py-2 bg-kraft-50 border rounded-xl text-xs font-mono focus:outline-none ${rut.trim() && !validarRutChileno(rut) ? 'border-red-400 focus:border-red-500' : 'border-kraft-200 focus:border-obra-orange'}`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  placeholder="contacto@empresa.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Dirección
                </label>
                <input
                  type="text"
                  placeholder="Av. Providencia 1234, Santiago"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <ClientProjectAssignments proyectos={proyectos} clientes={clientes} selected={obrasSeleccionadas} onChange={setObrasSeleccionadas} />

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
                  Crear Cliente
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: Editar Cliente */}
      {editingCliente && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-obra-orange" />
                <span>Editar Mandante / Cliente</span>
              </h3>
              <button onClick={() => setEditingCliente(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre o Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Teléfono WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={editTelefono}
                    onChange={(e) => setEditTelefono(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-mono font-semibold text-gray-700 uppercase">
                      RUT
                    </label>
                    {editRut.trim().length > 0 && (
                      <span className={`text-[10px] font-bold ${validarRutChileno(editRut) ? 'text-green-600' : 'text-red-500'}`}>
                        {validarRutChileno(editRut) ? '✓ Válido' : '✗ Inválido'}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    maxLength={12}
                    value={editRut}
                    onChange={(e) => setEditRut(formatRUT(e.target.value))}
                    className={`w-full px-3 py-2 bg-kraft-50 border rounded-xl text-xs font-mono focus:outline-none ${editRut.trim() && !validarRutChileno(editRut) ? 'border-red-400 focus:border-red-500' : 'border-kraft-200 focus:border-obra-orange'}`}
                  />
                </div>
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
                  Dirección
                </label>
                <input
                  type="text"
                  value={editDireccion}
                  onChange={(e) => setEditDireccion(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs focus:outline-none focus:border-obra-orange font-sans"
                />
              </div>

              <ClientProjectAssignments proyectos={proyectos} clientes={clientes} selected={editObras} onChange={setEditObras} />

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setEditingCliente(null)}
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

      {/* Modal: Confirmación Eliminar Cliente */}
      {clienteToDelete && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <div>
              <h3 className="font-heading font-bold text-base text-navy-900">
                ¿Eliminar cliente &quot;{clienteToDelete.nombre}&quot;?
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-1">
                Esta acción removerá el cliente del directorio. Las obras asociadas mantendrán su registro histórico.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setClienteToDelete(null)}
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

    </div>
  );
}
