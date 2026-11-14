'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Edit2,
  Package,
  PackageCheck,
  Trash2,
  X,
} from 'lucide-react';
import { Actividad, MaterialProyecto } from '@/types/database';
import { dataService } from '@/lib/data-service';
import { materialNeeds } from '@/lib/construction-workflow';
import { formatMaterialCategory } from '@/lib/materials/format';
import { chileToday } from '@/lib/work-calendar';

type ProjectMaterialsProps = {
  projectId?: string;
  materials: MaterialProyecto[];
  activities?: Actividad[];
  onEdit: (material: MaterialProyecto) => void;
  onDelete: (material: MaterialProyecto) => void;
  onChanged?: () => void;
  onNotify?: (message: string) => void;
};

const clp = (value: number) => `$${Math.round(Number(value || 0)).toLocaleString('es-CL')}`;

const formatQty = (value: number) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(4)));
};

export default function ProjectMaterials({
  projectId,
  materials,
  activities,
  onEdit,
  onDelete,
  onChanged,
  onNotify,
}: ProjectMaterialsProps) {
  const activeProjectId = projectId || materials[0]?.proyecto_id || '';

  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<MaterialProyecto | null>(null);
  const [receivedQty, setReceivedQty] = useState('');
  const [receivedNote, setReceivedNote] = useState('');
  const [receptionError, setReceptionError] = useState<string | null>(null);
  const [submittingReception, setSubmittingReception] = useState(false);

  const bitacora = useMemo(
    () => (activeProjectId ? dataService.getBitacora(activeProjectId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProjectId, materials, receiving],
  );

  const projectActivities = useMemo(() => {
    if (activities && activities.length > 0) return activities;
    return activeProjectId ? dataService.getActividades(activeProjectId) : [];
  }, [activities, activeProjectId]);

  const activityById = useMemo(() => {
    const map = new Map<string, Actividad>();
    for (const act of projectActivities) {
      map.set(act.id, act);
    }
    return map;
  }, [projectActivities]);

  const receivedByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of bitacora) {
      if (!entry.material_id || entry.tipo !== 'entrega_material') continue;
      const prev = map.get(entry.material_id) || 0;
      map.set(entry.material_id, prev + Number(entry.cantidad_recibida || 0));
    }
    return map;
  }, [bitacora]);

  const needs = useMemo(
    () => materialNeeds(materials, projectActivities, bitacora, chileToday()),
    [materials, projectActivities, bitacora],
  );

  const urgentNames = useMemo(() => new Set(needs.map((n) => n.material)), [needs]);

  const summary = useMemo(() => {
    let totalSubtotal = 0;
    let paidSubtotal = 0;
    let boughtCount = 0;
    let paidCount = 0;
    let receivedCount = 0;

    for (const mat of materials) {
      const sub = Number(mat.subtotal || 0);
      totalSubtotal += sub;
      if (mat.comprado) boughtCount += 1;
      if (mat.pagado === true) {
        paidCount += 1;
        paidSubtotal += sub;
      }
      const delivered = receivedByMaterial.get(mat.id) || 0;
      if (Number(mat.cantidad || 0) > 0 && delivered >= Number(mat.cantidad || 0) - 0.000001) {
        receivedCount += 1;
      }
    }

    return {
      totalSubtotal,
      paidSubtotal,
      boughtCount,
      paidCount,
      receivedCount,
    };
  }, [materials, receivedByMaterial]);

  const reportMessage = (message: string) => {
    if (onNotify) {
      onNotify(message);
    } else {
      setNotice(message);
    }
  };

  const handleToggle = async (
    materialId: string,
    key: 'comprado' | 'pagado',
    value: boolean,
  ) => {
    const updated = dataService.toggleMaterialStatus(materialId, key, value);
    if (!updated) return;

    setNotice(null);
    onChanged?.();

    setSavingIds((prev) => ({ ...prev, [materialId]: true }));
    try {
      await dataService.confirmarCambios();
    } catch (error) {
      reportMessage(
        error instanceof Error
          ? error.message
          : 'Cambio guardado localmente; pendiente de sincronización.',
      );
    } finally {
      setSavingIds((prev) => {
        const next = { ...prev };
        delete next[materialId];
        return next;
      });
      onChanged?.();
    }
  };

  const openReceptionModal = (material: MaterialProyecto) => {
    const delivered = receivedByMaterial.get(material.id) || 0;
    const pending = Math.max(0, Number(material.cantidad || 0) - delivered);
    setReceiving(material);
    setReceivedQty(pending > 0 ? formatQty(pending) : '');
    setReceivedNote('');
    setReceptionError(null);
  };

  const closeReceptionModal = () => {
    if (submittingReception) return;
    setReceiving(null);
    setReceivedQty('');
    setReceivedNote('');
    setReceptionError(null);
  };

  const handleSubmitReception = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiving) return;

    const delivered = receivedByMaterial.get(receiving.id) || 0;
    const pending = Math.max(0, Number(receiving.cantidad || 0) - delivered);
    const qty = Number(receivedQty);

    if (!Number.isFinite(qty) || qty <= 0) {
      setReceptionError('Ingresa una cantidad recibida mayor a 0.');
      return;
    }
    if (qty > pending + 0.000001) {
      setReceptionError(
        `La cantidad no puede superar lo pendiente (${formatQty(pending)} ${receiving.unidad}).`,
      );
      return;
    }

    setSubmittingReception(true);
    setReceptionError(null);
    try {
      const activeUser = dataService.getActiveUser();
      dataService.createBitacoraEntrada({
        proyecto_id: receiving.proyecto_id,
        usuario_id: activeUser?.id,
        autor_nombre: activeUser?.nombre || 'Constructor',
        titulo: `Recepción: ${receiving.nombre}`,
        nota:
          receivedNote.trim() ||
          `Recepción de ${formatQty(qty)} ${receiving.unidad} en obra`,
        fecha: chileToday(),
        tipo: 'entrega_material',
        material_id: receiving.id,
        cantidad_recibida: qty,
      });

      setReceiving(null);
      setReceivedQty('');
      setReceivedNote('');
      onChanged?.();

      try {
        await dataService.confirmarCambios();
        reportMessage(`Recepción registrada para "${receiving.nombre}".`);
      } catch (syncError) {
        reportMessage(
          syncError instanceof Error
            ? syncError.message
            : 'Recepción guardada localmente; pendiente de sincronización.',
        );
      } finally {
        onChanged?.();
      }
    } catch (error) {
      setReceptionError(
        error instanceof Error
          ? error.message
          : 'No se pudo registrar la recepción del material.',
      );
    } finally {
      setSubmittingReception(false);
    }
  };

  if (materials.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-kraft-300 dark:border-[#2A3544] bg-[#FAF8F5] dark:bg-[#141A23] px-4 py-10 text-center">
        <Package className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2.5" />
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          No hay materiales registrados todavía
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Agrega los materiales del proyecto para llevar control de compras, pagos y recepciones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0">
      {needs.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/90 dark:bg-amber-950/30 px-3.5 py-2.5 flex items-start gap-2.5 min-w-0">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Materiales requeridos para faenas próximas (7 días)
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {needs.map((item) => (
                <span
                  key={`${item.material}-${item.actividad}`}
                  className="inline-flex items-center gap-1 rounded-md bg-white/80 dark:bg-[#1D2430] border border-amber-200/80 dark:border-amber-800/50 px-2 py-0.5 text-[11px] text-amber-900 dark:text-amber-200 break-words"
                >
                  <span className="font-medium">{item.material}</span>
                  <span className="text-amber-700 dark:text-amber-300">
                    ({formatQty(item.pendiente)} {item.unidad} · {item.actividad})
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {notice && !onNotify && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
          <span className="min-w-0 break-words">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-amber-700 dark:text-amber-300 hover:opacity-80 shrink-0"
            aria-label="Cerrar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {materials.length} {materials.length === 1 ? 'material' : 'materiales'}
          </span>
          <span>·</span>
          <span>{summary.boughtCount} comprados</span>
          <span>·</span>
          <span>{summary.paidCount} pagados</span>
          <span>·</span>
          <span>{summary.receivedCount} recibidos</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
          <span>
            Presupuestado:{' '}
            <strong className="font-semibold text-gray-800 dark:text-gray-200">
              {clp(summary.totalSubtotal)}
            </strong>
          </span>
          <span>
            Pagado:{' '}
            <strong className="font-semibold text-emerald-700 dark:text-emerald-400">
              {clp(summary.paidSubtotal)}
            </strong>
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] overflow-hidden shadow-sm">
        <div className="hidden md:grid md:grid-cols-12 gap-3 items-center px-4 py-2.5 bg-[#FAF8F5] dark:bg-[#1A222D] border-b border-kraft-200 dark:border-[#263040] text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <div className="md:col-span-5">Material</div>
          <div className="md:col-span-2 md:text-right">Cantidad y total</div>
          <div className="md:col-span-3">Recepción en obra</div>
          <div className="md:col-span-2 md:text-right">Acciones</div>
        </div>

        <ul className="divide-y divide-kraft-100 dark:divide-[#1E2530]">
          {materials.map((material) => {
            const delivered = receivedByMaterial.get(material.id) || 0;
            const totalQty = Number(material.cantidad || 0);
            const pending = Math.max(0, totalQty - delivered);
            const complete = totalQty > 0 && pending <= 0.000001;
            const partial = !complete && delivered > 0;
            const pct =
              totalQty > 0
                ? Math.min(100, Math.round((delivered / totalQty) * 100))
                : 0;

            const receptionLabel = complete
              ? 'Recibido completo'
              : partial
                ? 'Entrega parcial'
                : 'Por recibir';

            const receptionTone = complete
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
              : partial
                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#1D2532] dark:text-gray-300 dark:border-[#2C3748]';

            const linkedActivity = material.actividad_id
              ? activityById.get(material.actividad_id)
              : undefined;
            const isUrgent = urgentNames.has(material.nombre) && !complete;
            const isSaving = Boolean(savingIds[material.id]);

            return (
              <li
                key={material.id}
                className="px-3.5 sm:px-4 py-3 transition-colors hover:bg-[#FCFBF9] dark:hover:bg-[#19212C]"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 md:gap-3 items-start">
                  {/* Material + metadata */}
                  <div className="md:col-span-5 min-w-0">
                    <div className="flex items-start justify-between gap-2 md:block">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white break-words">
                          {material.nombre}
                        </span>
                        {isUrgent && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-[10px] font-semibold">
                            Faena próxima
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 md:hidden shrink-0">
                        <button
                          type="button"
                          onClick={() => onEdit(material)}
                          aria-label={`Editar ${material.nombre}`}
                          title={`Editar ${material.nombre}`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#232D3B] transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(material)}
                          aria-label={`Eliminar ${material.nombre}`}
                          title={`Eliminar ${material.nombre}`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-xs text-gray-500 dark:text-gray-400 min-w-0">
                      <span className="inline-flex items-center rounded bg-kraft-100/80 dark:bg-[#1E2633] px-1.5 py-0.5 text-[11px] font-medium text-gray-700 dark:text-gray-300">
                        {formatMaterialCategory(material.categoria)}
                      </span>
                      <span className="break-words">
                        · {material.proveedor?.trim() || 'Proveedor por definir'}
                      </span>
                      {linkedActivity && (
                        <span className="break-words text-gray-600 dark:text-gray-300">
                          · Partida: {linkedActivity.nombre}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cantidad y costo */}
                  <div className="md:col-span-2 md:text-right min-w-0 flex items-baseline justify-between md:block gap-2">
                    <div className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                      {clp(material.subtotal)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {formatQty(material.cantidad)} {material.unidad} ×{' '}
                      {clp(material.precio_unitario)}
                    </div>
                  </div>

                  {/* Recepción en obra */}
                  <div className="md:col-span-3 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${receptionTone}`}
                      >
                        {complete ? (
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                        ) : partial ? (
                          <Clock className="w-3 h-3 shrink-0" />
                        ) : null}
                        {receptionLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 tabular-nums">
                      Recibido: {formatQty(delivered)} / {formatQty(material.cantidad)}{' '}
                      {material.unidad}
                    </p>
                    <div className="h-1 w-full max-w-[180px] rounded-full bg-gray-100 dark:bg-[#232D3B] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          complete
                            ? 'bg-emerald-500'
                            : partial
                              ? 'bg-amber-500'
                              : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Acciones desktop */}
                  <div className="hidden md:flex md:col-span-2 items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(material)}
                      aria-label={`Editar ${material.nombre}`}
                      title={`Editar ${material.nombre}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#232D3B] transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(material)}
                      aria-label={`Eliminar ${material.nombre}`}
                      title={`Eliminar ${material.nombre}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Barra compacta de compra, pago y recepción */}
                <div className="mt-2.5 pt-2 border-t border-kraft-100/80 dark:border-[#1E2734] flex flex-wrap items-center justify-between gap-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(material.comprado)}
                        onChange={(e) =>
                          handleToggle(material.id, 'comprado', e.target.checked)
                        }
                        className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="font-medium">Compra registrada</span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={material.pagado === true}
                        onChange={(e) =>
                          handleToggle(material.id, 'pagado', e.target.checked)
                        }
                        className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="font-medium">Pago confirmado</span>
                    </label>

                    {material.pagado === false && (
                      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 rounded-full px-2 py-0.5">
                        Por pagar
                      </span>
                    )}
                    {material.comprado && material.pagado == null && (
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        Pago por confirmar
                      </span>
                    )}
                    {isSaving && (
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">
                        Guardando…
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {pending > 0 ? (
                      <button
                        type="button"
                        onClick={() => openReceptionModal(material)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-kraft-300 dark:border-[#324054] bg-white dark:bg-[#1B2330] hover:bg-[#FAF8F5] dark:hover:bg-[#232D3D] px-2.5 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors"
                      >
                        <PackageCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span>Registrar recepción</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        Recepción al día
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Modal Registrar Recepción */}
      {receiving && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reception-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-kraft-200 dark:border-[#2A3544] bg-white dark:bg-[#141A23] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-kraft-200 dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#1A222D]">
              <div className="min-w-0">
                <h3
                  id="reception-modal-title"
                  className="text-sm font-bold text-gray-900 dark:text-white truncate"
                >
                  Registrar recepción
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {receiving.nombre}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReceptionModal}
                aria-label="Cerrar modal"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#232D3B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReception} className="p-4 space-y-3.5">
              <div className="rounded-xl bg-[#FAF8F5] dark:bg-[#1A222D] border border-kraft-200/80 dark:border-[#263040] px-3 py-2 text-xs text-gray-600 dark:text-gray-300 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Ya recibido:{' '}
                  <strong className="text-gray-900 dark:text-white tabular-nums">
                    {formatQty(receivedByMaterial.get(receiving.id) || 0)} /{' '}
                    {formatQty(receiving.cantidad)} {receiving.unidad}
                  </strong>
                </span>
                <span>
                  Pendiente:{' '}
                  <strong className="text-indigo-700 dark:text-indigo-300 tabular-nums">
                    {formatQty(
                      Math.max(
                        0,
                        Number(receiving.cantidad || 0) -
                          (receivedByMaterial.get(receiving.id) || 0),
                      ),
                    )}{' '}
                    {receiving.unidad}
                  </strong>
                </span>
              </div>

              <div>
                <label
                  htmlFor="material-received-qty"
                  className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1"
                >
                  Cantidad recibida ({receiving.unidad})
                </label>
                <input
                  id="material-received-qty"
                  type="number"
                  step="any"
                  min="0.01"
                  max={Math.max(
                    0,
                    Number(receiving.cantidad || 0) -
                      (receivedByMaterial.get(receiving.id) || 0),
                  )}
                  value={receivedQty}
                  onChange={(e) => setReceivedQty(e.target.value)}
                  required
                  className="w-full rounded-xl border border-kraft-200 dark:border-[#2C3748] bg-white dark:bg-[#0F141C] px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="material-received-note"
                  className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1"
                >
                  Nota o guía de despacho (opcional)
                </label>
                <input
                  id="material-received-note"
                  type="text"
                  value={receivedNote}
                  onChange={(e) => setReceivedNote(e.target.value)}
                  placeholder="Ej: Guía #4512, bodega norte"
                  className="w-full rounded-xl border border-kraft-200 dark:border-[#2C3748] bg-white dark:bg-[#0F141C] px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {receptionError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {receptionError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeReceptionModal}
                  className="rounded-xl border border-kraft-200 dark:border-[#2C3748] px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1E2633]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingReception}
                  className="rounded-xl bg-[#0F172A] dark:bg-indigo-600 hover:bg-[#1E293B] dark:hover:bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-60"
                >
                  {submittingReception ? 'Guardando...' : 'Confirmar recepción'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
