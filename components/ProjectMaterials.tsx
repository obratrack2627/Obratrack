'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Edit2,
  Eye,
  EyeOff,
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
import MaskedMoneyAmount from '@/components/MaskedMoneyAmount';
import { MASKED_CLP_AMOUNT } from '@/lib/privacy/mask';

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
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!Object.keys(revealedIds).length) return;
    const timer = window.setTimeout(() => setRevealedIds({}), 30000);
    return () => window.clearTimeout(timer);
  }, [revealedIds]);
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
          <span className="inline-flex items-center gap-1">
            <span>Presupuestado:</span>
            <strong className="font-semibold text-gray-800 dark:text-gray-200">
              <MaskedMoneyAmount value={summary.totalSubtotal} label="Total presupuestado en materiales" compact />
            </strong>
          </span>
          <span className="inline-flex items-center gap-1">
            <span>Pagado:</span>
            <strong className="font-semibold text-emerald-700 dark:text-emerald-400">
              <MaskedMoneyAmount value={summary.paidSubtotal} label="Total pagado en materiales" compact />
            </strong>
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] px-4 py-3 sm:px-5 shadow-sm overflow-hidden">
        <div className="hidden lg:grid lg:grid-cols-12 gap-3 items-center pb-2 border-b border-kraft-200 dark:border-[#263040] text-[11px] font-mono uppercase text-gray-500 dark:text-gray-400">
          <div className="lg:col-span-4">Material</div>
          <div className="lg:col-span-2 lg:text-right">Cantidad y total</div>
          <div className="lg:col-span-2">Recepción</div>
          <div className="lg:col-span-2">Compra / Pago</div>
          <div className="lg:col-span-2 lg:text-right">Acciones</div>
        </div>

        <ul className="divide-y divide-kraft-200/70 dark:divide-[#263040]">
          {materials.map((material) => {
            const delivered = receivedByMaterial.get(material.id) || 0;
            const totalQty = Number(material.cantidad || 0);
            const pending = Math.max(0, totalQty - delivered);
            const complete = totalQty > 0 && pending <= 0.000001;
            const partial = !complete && delivered > 0;

            const receptionLabel = complete
              ? 'Recibido completo'
              : partial
                ? 'Entrega parcial'
                : 'Por recibir';

            const receptionTone = complete
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
              : partial
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                : 'bg-gray-100 text-gray-600 dark:bg-[#1E2530] dark:text-gray-300';

            const linkedActivity = material.actividad_id
              ? activityById.get(material.actividad_id)
              : undefined;
            const isUrgent = urgentNames.has(material.nombre) && !complete;
            const isSaving = Boolean(savingIds[material.id]);

            return (
              <li
                key={material.id}
                className="py-2.5 transition-colors hover:bg-kraft-50/50 dark:hover:bg-[#19212C]/50 text-xs"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3 items-start lg:items-center min-w-0">
                  {/* Material + metadata */}
                  <div className="lg:col-span-4 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                      <span className="font-semibold text-navy-900 dark:text-white break-words">
                        {material.nombre}
                      </span>
                      {isUrgent && (
                        <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-[10px] font-semibold">
                          Faena próxima
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {formatMaterialCategory(material.categoria)} ·{' '}
                      {material.proveedor?.trim() || 'Proveedor por definir'}
                      {linkedActivity ? ` · ${linkedActivity.nombre}` : ''}
                    </p>
                  </div>

                  {/* Cantidad y costo */}
                  {(() => {
                    const isMoneyRevealed = Boolean(revealedIds[material.id]);
                    return (
                      <div className="lg:col-span-2 lg:text-right min-w-0 flex items-baseline justify-between lg:block gap-2">
                        <span className="inline-flex items-center gap-1 font-mono font-semibold text-navy-900 dark:text-white tabular-nums">
                          <span>{isMoneyRevealed ? clp(material.subtotal) : MASKED_CLP_AMOUNT}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedIds((prev) => ({
                                ...prev,
                                [material.id]: !prev[material.id],
                              }))
                            }
                            aria-label={
                              isMoneyRevealed
                                ? `Ocultar montos de ${material.nombre}`
                                : `Mostrar montos de ${material.nombre}`
                            }
                            aria-pressed={isMoneyRevealed}
                            title={isMoneyRevealed ? 'Ocultar montos' : 'Mostrar montos'}
                            className="inline-flex items-center justify-center p-0.5 rounded text-gray-400 hover:text-obra-orange hover:bg-kraft-100 dark:hover:bg-[#1E2633] transition-colors shrink-0"
                          >
                            {isMoneyRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </span>
                        <span className="block text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                          {formatQty(material.cantidad)} {material.unidad} × {isMoneyRevealed ? clp(material.precio_unitario) : MASKED_CLP_AMOUNT}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Recepción en obra */}
                  <div className="lg:col-span-2 min-w-0 flex flex-wrap lg:flex-col items-center lg:items-start justify-between gap-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${receptionTone}`}
                    >
                      {complete ? (
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                      ) : partial ? (
                        <Clock className="w-3 h-3 shrink-0" />
                      ) : null}
                      {receptionLabel}
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                      Recibido: {formatQty(delivered)} / {formatQty(material.cantidad)} {material.unidad}
                    </span>
                  </div>

                  {/* Compra y pago inline */}
                  <div className="lg:col-span-2 min-w-0 flex flex-wrap lg:flex-col gap-x-3 gap-y-1">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(material.comprado)}
                        onChange={(e) =>
                          handleToggle(material.id, 'comprado', e.target.checked)
                        }
                        className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Compra registrada</span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={material.pagado === true}
                        onChange={(e) =>
                          handleToggle(material.id, 'pagado', e.target.checked)
                        }
                        className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>Pago confirmado</span>
                    </label>

                    {material.pagado === false && (
                      <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                        Por pagar
                      </span>
                    )}
                    {isSaving && (
                      <span className="text-[10px] text-gray-400">Guardando…</span>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="lg:col-span-2 flex flex-wrap items-center lg:justify-end gap-1.5 shrink-0">
                    {pending > 0 ? (
                      <button
                        type="button"
                        onClick={() => openReceptionModal(material)}
                        className="inline-flex items-center gap-1 rounded-lg border border-kraft-300 dark:border-[#324054] bg-white dark:bg-[#1B2330] hover:bg-[#FAF8F5] dark:hover:bg-[#232D3D] px-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-200 transition-colors whitespace-nowrap"
                      >
                        <PackageCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span>Registrar recepción</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        <Check className="w-3 h-3 shrink-0" />
                        Al día
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onEdit(material)}
                      aria-label={`Editar ${material.nombre}`}
                      title={`Editar ${material.nombre}`}
                      className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(material)}
                      aria-label={`Eliminar ${material.nombre}`}
                      title={`Eliminar ${material.nombre}`}
                      className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
