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

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Navbar
        title="Directorio de Clientes"
        subtitle="Historial de obras cotizadas y facturación acumulada por cliente"
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {clientes.map((cliente) => {
            const clientProjects = proyectos.filter((p) => p.cliente_id === cliente.id);
            const totalFacturado = clientProjects.reduce(
              (sum, p) => sum + (Number(p.monto_cotizado) || 0),
              0
            );

            return (
              <div
                key={cliente.id}
                className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-heading font-bold text-base text-navy-900 leading-snug">
                        {cliente.nombre}
                      </h3>
                      {cliente.rut && (
                        <span className="text-[11px] font-mono text-gray-500 block mt-0.5">
                          RUT: {formatRUT(cliente.rut)}
                        </span>
                      )}
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-kraft-100 text-navy-800 flex items-center justify-center">
                      <Building className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-gray-600 font-mono pt-2 border-t border-kraft-200/80 mb-4">
                    {cliente.telefono && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-obra-green" />
                        <a href={`tel:${cliente.telefono}`} className="hover:text-navy-900">
                          {cliente.telefono}
                        </a>
                      </div>
                    )}
                    {cliente.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        <span className="truncate">{cliente.email}</span>
                      </div>
                    )}
                    {cliente.direccion && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-obra-red" />
                        <span className="truncate font-sans">{cliente.direccion}</span>
                      </div>
                    )}
                  </div>

                  {/* Historial de Proyectos del Cliente */}
                  <div className="bg-kraft-50 border border-kraft-200/60 rounded-lg p-3 space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-gray-500 font-bold block flex items-center gap-1">
                      <FolderOpen className="w-3.5 h-3.5 text-obra-orange" />
                      <span>Obras Vinculadas ({clientProjects.length}):</span>
                    </span>
                    {clientProjects.length === 0 ? (
                      <p className="text-[11px] text-gray-400 font-sans">Sin obras activas</p>
                    ) : (
                      clientProjects.map((p) => (
                        <div key={p.id} className="flex justify-between text-xs font-sans">
                          <span className="truncate max-w-[170px] text-navy-900 font-medium">
                            {p.nombre}
                          </span>
                          <span className="font-mono text-gray-600">{formatCLP(p.monto_cotizado)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-kraft-200/80 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-mono">Facturación Total:</span>
                  <span className="font-mono font-bold text-sm text-navy-900">
                    {formatCLP(totalFacturado)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Modal: + Nuevo Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-obra-orange" />
                <span>Registrar Nuevo Cliente</span>
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
                  placeholder="Ej: Inmobiliaria San Cristóbal SpA"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Teléfono Contacto
                  </label>
                  <input
                    type="tel"
                    placeholder="+56988776655"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    RUT Cliente
                  </label>
                  <input
                    type="text"
                    placeholder="76.123.456-7"
                    value={rut}
                    onChange={(e) => setRut(e.target.value)}
                    className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="contacto@cliente.cl"
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

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-obra-orange text-white text-xs font-semibold rounded-lg font-heading shadow-sm"
                >
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
