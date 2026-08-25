'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { Cliente, Proyecto } from '@/types/database';
import { formatCLP, formatRUT } from '@/lib/utils';

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Formulario nuevo cliente
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('+569');
  const [email, setEmail] = useState('');
  const [rut, setRut] = useState('');
  const [direccion, setDireccion] = useState('');

  const loadData = () => {
    const cls = dataService.getClientes();
    const projs = dataService.getProyectos();
    setClientes(cls);
    setProyectos(projs);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCliente = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    const activeUser = dataService.getActiveUser();

    dataService.createCliente({
      empresa_id: activeUser.empresa_id,
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      rut: rut.trim(),
      direccion: direccion.trim(),
    });

    setIsModalOpen(false);
    setNombre('');
    setTelefono('+569');
    setEmail('');
    setRut('');
    setDireccion('');
    loadData();
  };

  const handleDeleteCliente = (id: string) => {
    dataService.deleteCliente(id);
    loadData();
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Navbar
        title="Directorio de Clientes"
        subtitle="Registro de contactos, RUT y obras asociadas por mandante"
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-2 font-heading transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Cliente</span>
          </button>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Banner */}
        <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold font-heading text-navy-900">
              Gestión de Mandantes & Contactos
            </h3>
            <p className="text-xs text-gray-500 font-sans mt-0.5">
              Asocia clientes a tus obras para emitir cotizaciones automáticas y enviar cobros por WhatsApp.
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-kraft-100 text-navy-900 px-3 py-1.5 rounded-lg border border-kraft-200">
            {clientes.length} Clientes
          </span>
        </div>

        {clientes.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-[#E5DFC9] rounded-3xl p-10 text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[#FAF8F5] border border-[#E5DFC9] flex items-center justify-center mx-auto text-[#FF6A00]">
              <Building className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-heading font-black text-xl text-[#1E1E1E]">
                No tienes clientes registrados aún
              </h3>
              <p className="text-xs text-gray-500 font-sans mt-1.5 max-w-md mx-auto leading-relaxed">
                Agrega mandantes o personas para asociarlos a tus cotizaciones y obras.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-md transition-all inline-flex items-center gap-2 font-heading"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Primer Cliente</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {clientes.map((c) => {
              const obrasCliente = proyectos.filter((p) => p.cliente_id === c.id);
              const totalCotizadoCliente = obrasCliente.reduce(
                (sum, p) => sum + (Number(p.monto_cotizado) || 0),
                0
              );

              return (
                <div
                  key={c.id}
                  className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h3 className="font-heading font-bold text-base text-navy-900">
                          {c.nombre}
                        </h3>
                        {c.rut && (
                          <span className="text-[11px] font-mono text-gray-500">
                            RUT: {formatRUT(c.rut)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCliente(c.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar cliente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-2 text-xs text-gray-600 font-sans border-t border-kraft-200/80 pt-3">
                      {c.telefono && (
                        <div className="flex items-center gap-2 font-mono">
                          <Phone className="w-3.5 h-3.5 text-obra-green" />
                          <a href={`tel:${c.telefono}`} className="hover:text-navy-900">
                            {c.telefono}
                          </a>
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-2 font-mono">
                          <Mail className="w-3.5 h-3.5 text-gray-400" />
                          <span className="truncate">{c.email}</span>
                        </div>
                      )}
                      {c.direccion && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <span className="line-clamp-1">{c.direccion}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-kraft-200/80 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-mono flex items-center gap-1">
                        <FolderOpen className="w-3.5 h-3.5 text-obra-orange" />
                        <span>Obras asociadas:</span>
                      </span>
                      <span className="font-bold font-mono text-navy-900">{obrasCliente.length}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-mono">Total Contratado:</span>
                      <span className="font-bold font-mono text-obra-green">
                        {formatCLP(totalCotizadoCliente)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Modal: + Nuevo Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-obra-orange" />
                <span>Registrar Nuevo Mandante / Cliente</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700">
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
                  placeholder="Ej: Inmobiliaria Los Andes / Juan Pérez"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    placeholder="+56912345678"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-orange"
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
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-orange"
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
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
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
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-bold rounded-lg shadow-sm font-heading"
                >
                  Crear Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
