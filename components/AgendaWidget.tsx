'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { toast } from '@/components/ToastProvider';
import { dataService } from '@/lib/data-service';
import { chileToday } from '@/lib/work-calendar';
import { formatDate } from '@/lib/utils';
import type { EventoAgenda, Proyecto, TipoEventoAgenda } from '@/types/database';

const EVENT_TYPE_LABELS: Record<TipoEventoAgenda, string> = {
  visita_terreno: 'Visita a terreno',
  reunion_cliente: 'Reunión con mandante',
  inspeccion_obra: 'Inspección técnica',
  vaciado_hormigon: 'Hormigonado',
  entrega_material: 'Recepción de material',
  hito_pago: 'Hito de pago',
  recordatorio: 'Recordatorio',
};

export default function AgendaWidget({
  proyectos,
  eventos,
  onChanged,
}: {
  proyectos: Proyecto[];
  eventos: EventoAgenda[];
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<'pendientes' | 'completados'>('pendientes');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventoAgenda | null>(null);

  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<TipoEventoAgenda>('visita_terreno');
  const [fecha, setFecha] = useState(chileToday());
  const [hora, setHora] = useState('09:30');
  const [proyectoId, setProyectoId] = useState('');
  const [comunaLugar, setComunaLugar] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const today = chileToday();
  const visibleEvents = [...eventos]
    .filter((e) => (filter === 'pendientes' ? !e.completado : e.completado))
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  const pendingCount = eventos.filter((e) => !e.completado).length;

  const notifyAgendaChanged = () => {
    onChanged();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('obratrack_agenda_updated'));
    }
  };

  const openCreateModal = () => {
    setEditingEvent(null);
    setTitulo('');
    setTipo('visita_terreno');
    setFecha(chileToday());
    setHora('09:30');
    setProyectoId('');
    setComunaLugar('');
    setDescripcion('');
    setModalOpen(true);
  };

  const openEditModal = (evt: EventoAgenda) => {
    setEditingEvent(evt);
    setTitulo(evt.titulo || '');
    setTipo((evt.tipo in EVENT_TYPE_LABELS ? evt.tipo : 'visita_terreno') as TipoEventoAgenda);
    setFecha(evt.fecha || chileToday());
    setHora(evt.hora || '');
    setProyectoId(evt.proyecto_id || '');
    setComunaLugar(evt.comuna_lugar || '');
    setDescripcion(evt.descripcion || '');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEvent(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !fecha) return;
    const proj = proyectos.find((p) => p.id === proyectoId);
    dataService.saveEventoAgenda({
      ...(editingEvent ? { id: editingEvent.id, created_at: editingEvent.created_at, empresa_id: editingEvent.empresa_id, usuario_id: editingEvent.usuario_id } : {}),
      titulo: titulo.trim(),
      tipo,
      fecha,
      hora: hora.trim() || undefined,
      proyecto_id: proj?.id || undefined,
      proyecto_nombre: proj?.nombre || undefined,
      comuna_lugar: comunaLugar.trim() || (proj ? proj.comuna : undefined),
      descripcion: descripcion.trim() || undefined,
      completado: editingEvent ? editingEvent.completado : false,
      origen: editingEvent ? editingEvent.origen : 'manual',
    });
    const wasEditing = Boolean(editingEvent);
    closeModal();
    notifyAgendaChanged();
    toast(wasEditing ? 'Hito actualizado correctamente.' : 'Hito agendado correctamente.');
  };

  const handleToggle = (id: string) => {
    dataService.toggleEventoAgenda(id);
    notifyAgendaChanged();
  };

  const handleDelete = (id: string) => {
    dataService.deleteEventoAgenda(id);
    notifyAgendaChanged();
    toast('Evento eliminado de la agenda.');
  };

  return (
    <section
      id="agenda-terreno"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] shadow-sm space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading font-bold text-base sm:text-lg text-navy-900 dark:text-white flex items-center gap-2">
              <span>Agenda de Terreno y Hitos</span>
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#FF6A00]/15 text-[#FF6A00]">
                  {pendingCount}
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Visitas técnicas, hormigonados, inspecciones e hitos de cobro sincronizados.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-[#FAF8F5] dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFilter('pendientes')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filter === 'pendientes'
                  ? 'bg-[#FF6A00] text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:text-navy-900 dark:hover:text-white'
              }`}
            >
              Pendientes
            </button>
            <button
              type="button"
              onClick={() => setFilter('completados')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filter === 'completados'
                  ? 'bg-[#6B8F72] text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:text-navy-900 dark:hover:text-white'
              }`}
            >
              Completados
            </button>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-heading font-bold shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agendar hito</span>
          </button>
        </div>
      </div>

      {visibleEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-kraft-300 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C] px-4 py-8 text-center space-y-2">
          <Calendar className="w-7 h-7 text-gray-400 mx-auto" />
          <p className="text-xs font-semibold text-navy-900 dark:text-gray-200">
            {filter === 'pendientes'
              ? 'No tienes hitos pendientes en la agenda'
              : 'Aún no hay hitos completados'}
          </p>
          {filter === 'pendientes' && (
            <button
              type="button"
              onClick={openCreateModal}
              className="text-xs font-bold text-[#FF6A00] hover:underline"
            >
              + Programar primera visita o hito
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleEvents.slice(0, 6).map((evt) => {
            const linkedProj = evt.proyecto_id
              ? proyectos.find((p) => p.id === evt.proyecto_id)
              : undefined;
            const projFinished =
              linkedProj?.estado === 'terminado' ||
              linkedProj?.estado === 'cancelada' ||
              Number(linkedProj?.porcentaje_avance_ponderado || 0) >= 100;
            const isOverdue = !evt.completado && !projFinished && evt.fecha < today;
            const isToday = !evt.completado && !projFinished && evt.fecha === today;
            return (
              <div
                key={evt.id}
                className={`p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-2.5 ${
                  isOverdue
                    ? 'border-red-300 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/15'
                    : isToday
                      ? 'border-[#FF6A00]/50 bg-[#FF6A00]/5 dark:bg-[#FF6A00]/10'
                      : 'border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C]'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggle(evt.id)}
                      aria-label={evt.completado ? `Reabrir ${evt.titulo}` : `Completar ${evt.titulo}`}
                      className="flex items-start gap-2 text-left min-w-0 group"
                    >
                      {evt.completado ? (
                        <CheckCircle2 className="w-4 h-4 text-[#6B8F72] shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-400 group-hover:text-[#FF6A00] shrink-0 mt-0.5" />
                      )}
                      <span
                        className={`text-xs font-bold leading-snug ${
                          evt.completado
                            ? 'line-through text-gray-400'
                            : 'text-navy-900 dark:text-white'
                        }`}
                      >
                        {evt.titulo}
                      </span>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(evt)}
                        aria-label={`Editar ${evt.titulo}`}
                        title="Editar hito"
                        className="text-gray-400 hover:text-[#FF6A00] p-0.5 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(evt.id)}
                        aria-label={`Eliminar ${evt.titulo}`}
                        title="Eliminar hito"
                        className="text-gray-400 hover:text-red-500 p-0.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {evt.descripcion && (
                    <p className="pl-6 text-[11px] text-gray-600 dark:text-gray-300 line-clamp-2">
                      {evt.descripcion}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pl-6 text-[10px] font-mono">
                    <span className="px-2 py-0.5 rounded-full bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] text-gray-600 dark:text-gray-300">
                      {EVENT_TYPE_LABELS[evt.tipo] || evt.tipo}
                    </span>
                    {projFinished && !evt.completado && (
                      <span className="px-2 py-0.5 rounded-full bg-[#6B8F72]/15 text-[#6B8F72] font-bold">
                        Obra terminada
                      </span>
                    )}
                    {isOverdue && (
                      <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-bold">
                        Vencido
                      </span>
                    )}
                    {isToday && (
                      <span className="px-2 py-0.5 rounded-full bg-[#FF6A00] text-white font-bold">
                        Hoy
                      </span>
                    )}
                  </div>
                </div>

                <div className="pl-6 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(evt.fecha)}
                    {evt.hora ? ` · ${evt.hora}` : ''}
                  </span>
                  {evt.proyecto_id && evt.proyecto_nombre ? (
                    <Link
                      href={`/proyectos/${evt.proyecto_id}/gantt`}
                      className="text-[#FF6A00] hover:underline truncate max-w-[140px]"
                    >
                      {evt.proyecto_nombre}
                    </Link>
                  ) : evt.comuna_lugar ? (
                    <span className="inline-flex items-center gap-1 truncate max-w-[130px]">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {evt.comuna_lugar}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <ModalOverlay
          onClose={closeModal}
          aria-label={editingEvent ? 'Editar hito o visita' : 'Agendar hito o visita'}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-kraft-200 dark:border-[#263040] pb-3">
              <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#FF6A00]" />
                <span>{editingEvent ? 'Editar visita o hito' : 'Agendar visita o hito'}</span>
              </h3>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Cerrar"
                className="text-gray-400 hover:text-gray-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Título *
                </label>
                <input
                  type="text"
                  required
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej: Visita rectificación medidas baño"
                  className="w-full rounded-xl border border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C] px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Tipo de evento
                  </label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoEventoAgenda)}
                    className="w-full rounded-xl border border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C] px-3 py-2 text-sm"
                  >
                    {(Object.entries(EVENT_TYPE_LABELS) as Array<[TipoEventoAgenda, string]>).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Obra asociada (opcional)
                  </label>
                  <select
                    value={proyectoId}
                    onChange={(e) => setProyectoId(e.target.value)}
                    className="w-full rounded-xl border border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C] px-3 py-2 text-sm"
                  >
                    <option value="">General / Sin obra</option>
                    {proyectos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full rounded-xl border border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Hora
                  </label>
                  <input
                    type="time"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    className="w-full rounded-xl border border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Lugar o Comuna
                </label>
                <input
                  type="text"
                  value={comunaLugar}
                  onChange={(e) => setComunaLugar(e.target.value)}
                  placeholder="Ej: Providencia / Av. Italia 1230"
                  className="w-full rounded-xl border border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Notas / Descripción (opcional)
                </label>
                <textarea
                  rows={2}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej: Llevar plano eléctrico y revisar nivelación de radier"
                  className="w-full rounded-xl border border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C] px-3 py-2 text-sm resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl border border-[#E5DFC9] dark:border-[#263040] font-semibold text-gray-600 dark:text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#E55F00] text-white font-heading font-bold shadow-sm"
                >
                  {editingEvent ? 'Guardar cambios' : 'Guardar hito'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}
    </section>
  );
}
