'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { dataService } from '@/lib/data-service';
import { Usuario, Proyecto, UserRole } from '@/types/database';

export default function EquipoPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Formulario nuevo trabajador
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('+569');
  const [rol, setRol] = useState<UserRole>('terreno');

  const loadData = () => {
    const users = dataService.getUsuarios();
    const projs = dataService.getProyectos();
    setUsuarios(users);
    setProyectos(projs);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    const activeUser = dataService.getActiveUser();

    dataService.createUsuario({
      empresa_id: activeUser.empresa_id,
      nombre: nombre.trim(),
      email: email.trim() || `${nombre.toLowerCase().replace(/\s+/g, '.')}@gmail.com`,
      telefono_whatsapp: telefono.trim(),
      rol,
    });

    setIsModalOpen(false);
    setNombre('');
    setEmail('');
    setTelefono('+569');
    loadData();
  };

  const handleDeleteUser = (id: string) => {
    dataService.deleteUsuario(id);
    loadData();
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Navbar
        title="Equipo de Obra & Cuadrilla"
        subtitle="Gestión de trabajadores, roles y vinculación con WhatsApp para reportes"
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-2 font-heading transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar Trabajador</span>
          </button>
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Banner Explicativo */}
        <div className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold font-heading text-navy-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-obra-green" />
              <span>Roles y Permisos en Terreno</span>
            </h3>
            <p className="text-xs text-gray-500 font-sans">
              Los usuarios con rol <strong>Terreno</strong> pueden enviar notas de voz al WhatsApp de la constructora. El agente de IA identificará al remitente por su número y vinculará los avances a sus obras.
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-kraft-100 text-navy-900 px-3 py-1.5 rounded-lg border border-kraft-200">
            {usuarios.length} Miembros
          </span>
        </div>

        {/* Grid de Trabajadores */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {usuarios.map((user) => {
            const roleBadge =
              user.rol === 'admin'
                ? 'bg-navy-800 text-white'
                : user.rol === 'supervisor'
                ? 'bg-obra-orange-light text-obra-orange border border-obra-orange/20'
                : 'bg-obra-green-light text-obra-green border border-obra-green/20';

            return (
              <div
                key={user.id}
                className="bg-white border border-kraft-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-kraft-100 border border-kraft-200 flex items-center justify-center font-bold text-navy-900 font-heading text-base">
                        {user.nombre.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-heading font-bold text-sm text-navy-900">
                          {user.nombre}
                        </h3>
                        <span className={`inline-block text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded mt-0.5 ${roleBadge}`}>
                          {user.rol}
                        </span>
                      </div>
                    </div>

                    {user.rol !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar trabajador"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 text-xs text-gray-600 font-mono pt-2 border-t border-kraft-200/80">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-obra-green" />
                      <a href={`tel:${user.telefono_whatsapp}`} className="hover:text-navy-900">
                        {user.telefono_whatsapp}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <span className="truncate">{user.email}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-kraft-200/80 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1 font-mono text-[11px]">
                    <HardHat className="w-3.5 h-3.5 text-obra-orange" />
                    <span>{user.rol === 'terreno' ? 'Habilitado WhatsApp' : 'Acceso al Panel'}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Modal: + Agregar Trabajador */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-kraft-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-base text-navy-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-obra-orange" />
                <span>Agregar Trabajador al Equipo</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700">
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
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
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
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-orange"
                />
                <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">
                  Este número se usará para vincular los mensajes entrantes de WhatsApp con su obra.
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
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Rol en la Empresa
                </label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as UserRole)}
                  className="w-full px-3 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs focus:outline-none focus:border-obra-orange font-mono"
                >
                  <option value="terreno">Terreno (Maestro / Capataz - Reporta por WhatsApp)</option>
                  <option value="supervisor">Supervisor (Control de Gantt y Aprobaciones)</option>
                  <option value="admin">Administrador (Acceso Total y Finanzas)</option>
                </select>
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
                  Guardar Trabajador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
