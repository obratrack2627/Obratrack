'use client';
import MoneyAmount from "@/components/MoneyAmount";
import CompactSummary from '@/components/CompactSummary';
import ModalOverlay from '@/components/ModalOverlay';

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
import { formatCLP, formatRUT } from '@/lib/utils';
import { canonicalPhone } from '@/lib/phone';

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
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Formulario nuevo cliente
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('+569');
  const [email, setEmail] = useState('');
  const [rut, setRut] = useState('');
  const [direccion, setDireccion] = useState('');

  // Formulario editar cliente
  const [editNombre, setEditNombre] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRut, setEditRut] = useState('');
  const [editDireccion, setEditDireccion] = useState('');

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

  const handleCreateCliente = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    const phoneResult = normalizeOptionalPhone(telefono);
    if (!phoneResult.valid) {
      showToast('Ingresa un teléfono chileno válido (+569XXXXXXXX) o déjalo en blanco.');
      return;
    }

    const activeUser = dataService.getActiveUser();

    dataService.createCliente({
      empresa_id: activeUser?.empresa_id || 'e1111111-1111-4111-a111-111111111111',
      nombre: nombre.trim(),
      telefono: phoneResult.value,
      email: email.trim(),
      rut: rut.trim(),
      direccion: direccion.trim(),
    });

    setIsCreateModalOpen(false);
    setNombre('');
    setTelefono('+569');
    setEmail('');
    setRut('');
    setDireccion('');
    loadData();
    showToast(`Cliente "${nombre.trim()}" registrado con éxito.`);
  };

  const handleOpenEdit = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setEditNombre(cliente.nombre);
    const validPhone = canonicalPhone(cliente.telefono || '');
    setEditTelefono(validPhone ? `+${validPhone}` : '+569');
    setEditEmail(cliente.email || '');
    setEditRut(cliente.rut || '');
    setEditDireccion(cliente.direccion || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCliente || !editNombre.trim()) return;

    const phoneResult = normalizeOptionalPhone(editTelefono);
    if (!phoneResult.valid) {
      showToast('Ingresa un teléfono chileno válido (+569XXXXXXXX) o déjalo en blanco.');
      return;
    }

    dataService.updateCliente(editingCliente.id, {
      nombre: editNombre.trim(),
      telefono: phoneResult.value,
      email: editEmail.trim(),
      rut: editRut.trim(),
      direccion: editDireccion.trim(),
    });

    setEditingCliente(null);
    loadData();
    showToast(`Datos del cliente "${editNombre.trim()}" actualizados.`);
  };

  const handleConfirmDelete = () => {
    if (!clienteToDelete) return;
    dataService.deleteCliente(clienteToDelete.id);
    showToast(`Cliente "${clienteToDelete.nombre}" eliminado.`);
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
          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 tracking-wider">
                Clientes Registrados
              </p>
              <h3 className="text-2xl font-bold font-heading text-navy-900 mt-1">
                {clientes.length}
              </h3>
              <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                Mandantes y personas particulares
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-navy-800 text-obra-orange flex items-center justify-center">
              <Building className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 tracking-wider">
                Con obras en curso
              </p>
              <h3 className="text-2xl font-bold font-heading text-obra-green mt-1">
                {clientesConObras}
              </h3>
              <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                Mandantes con proyectos en curso
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-obra-green-light text-obra-green flex items-center justify-center">
              <FolderOpen className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 tracking-wider">
                Total cotizado
              </p>
              <h3 className="text-xl font-bold font-mono text-navy-900 mt-1">
                <MoneyAmount value={totalContratadoGeneral} />
              </h3>
              <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                Presupuestos asociados a sus obras
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-obra-orange-light text-obra-orange flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
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
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-2.5 h-full rounded-lg text-xs font-heading font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    viewMode === 'table'
                      ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900 shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-kraft-100 dark:hover:bg-[#1E2530]'
                  }`}
                  title="Vista en Tabla"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Tabla</span>
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
          <div className="bg-white border-2 border-dashed border-[#E5DFC9] rounded-3xl p-10 text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[#FAF8F5] border border-[#E5DFC9] flex items-center justify-center mx-auto text-[#FF6A00]">
              <Building className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-heading font-black text-xl text-[#1E1E1E]">
                {searchTerm ? 'No se encontraron clientes' : 'No tienes clientes registrados aún'}
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-1.5 max-w-md mx-auto leading-relaxed">
                {searchTerm
                  ? `No hay coincidencias para "${searchTerm}". Prueba con otro término.`
                  : 'Agrega mandantes o personas particulares para asociarlos a tus cotizaciones y obras.'}
              </p>
            </div>
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm('')}
                className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-bold rounded-xl transition-all font-heading"
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
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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

              return (
                <div
                  key={c.id}
                  className="bg-white border border-kraft-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="overflow-hidden">
                        <h3 className="font-heading font-bold text-base text-navy-900 truncate">
                          {c.nombre}
                        </h3>
                        {c.rut ? (
                          <span className="text-[11px] font-mono text-gray-500">
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
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar cliente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-gray-600 font-sans border-t border-kraft-200/80 pt-3">
                      {validPhone ? (
                        <div className="flex items-center gap-2 font-mono">
                          <Phone className="w-3.5 h-3.5 text-obra-green shrink-0" />
                          <a href={`tel:+${validPhone}`} className="hover:text-navy-900 truncate">
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

                  <div className="pt-4 mt-4 border-t border-kraft-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-mono flex items-center gap-1">
                        <FolderOpen className="w-3.5 h-3.5 text-obra-orange" />
                        <span>Obras asociadas:</span>
                      </span>
                      <span className="font-bold font-mono text-navy-900 bg-kraft-100 px-2 py-0.5 rounded">
                        {obrasCliente.length}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-mono">Total Contratado:</span>
                      <span className="font-bold font-mono text-navy-900">
                        {formatCLP(totalCotizadoCliente)}
                      </span>
                    </div>

                    {obrasCliente.length > 0 && (
                      <div className="pt-2 border-t border-kraft-100 flex flex-wrap gap-1">
                        {obrasCliente.slice(0, 2).map((p) => (
                          <Link
                            key={p.id}
                            href={`/proyectos/${p.id}/finanzas`}
                            className="text-[10px] font-mono bg-kraft-50 hover:bg-kraft-100 border border-kraft-200 text-navy-900 px-2 py-0.5 rounded-md flex items-center gap-1 truncate max-w-full"
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
        ) : (
          /* Vista en Tabla */
          <div className="bg-white border border-kraft-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-kraft-100 text-navy-900 font-heading font-bold border-b border-kraft-200 text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4">Cliente / Mandante</th>
                    <th className="py-3 px-4">RUT</th>
                    <th className="py-3 px-4">Teléfono</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Dirección</th>
                    <th className="py-3 px-4 text-center">Obras</th>
                    <th className="py-3 px-4 text-right">Total Contratado</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-kraft-200/80 font-sans">
                  {filteredClientes.map((c) => {
                    const obrasCliente = proyectosVigentes.filter((p) => p.cliente_id === c.id);
                    const totalCotizadoCliente = obrasCliente.reduce(
                      (sum, p) => sum + (Number(p.monto_cotizado) || 0),
                      0
                    );
                    const validPhone = canonicalPhone(c.telefono || '');

                    return (
                      <tr key={c.id} className="hover:bg-kraft-50/60 transition-colors">
                        <td className="py-3 px-4 font-bold text-navy-900">{c.nombre}</td>
                        <td className="py-3 px-4 font-mono text-gray-600">
                          {c.rut ? formatRUT(c.rut) : '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-600">
                          {validPhone ? (
                            <a href={`tel:+${validPhone}`} className="text-obra-green hover:underline">
                              +{validPhone}
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-600">{c.email || '-'}</td>
                        <td className="py-3 px-4 text-gray-600 max-w-xs truncate">{c.direccion || '-'}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold">
                          <span className="bg-kraft-100 text-navy-900 px-2 py-0.5 rounded">
                            {obrasCliente.length}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-navy-900">
                          {formatCLP(totalCotizadoCliente)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(c)}
                              className="p-1 text-gray-400 hover:text-[#FF6A00] rounded"
                              title="Editar"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setClienteToDelete(c)}
                              className="p-1 text-gray-400 hover:text-red-600 rounded"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    RUT (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="76.123.456-K"
                    value={rut}
                    onChange={(e) => setRut(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
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
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    RUT
                  </label>
                  <input
                    type="text"
                    value={editRut}
                    onChange={(e) => setEditRut(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-obra-orange"
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
