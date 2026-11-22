import type { MaterialProyecto } from '@/types/database';

export interface ShoppingListGroup {
  proveedor: string;
  items: MaterialProyecto[];
}

export function groupPendingMaterialsBySupplier(
  materiales: MaterialProyecto[],
): ShoppingListGroup[] {
  const pending = materiales.filter((m) => !m.comprado);
  const groups = new Map<string, MaterialProyecto[]>();

  for (const item of pending) {
    const supplier = (item.proveedor || '').trim() || 'Ferretería / Por definir';
    const current = groups.get(supplier) || [];
    current.push(item);
    groups.set(supplier, current);
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([proveedor, items]) => ({ proveedor, items }));
}

export function formatShoppingListMessage(params: {
  proyectoNombre: string;
  direccion?: string;
  comuna?: string;
  materiales: MaterialProyecto[];
}): string {
  const groups = groupPendingMaterialsBySupplier(params.materiales);
  const totalItems = groups.reduce((acc, g) => acc + g.items.length, 0);
  if (totalItems === 0) {
    return `Todos los materiales de "${params.proyectoNombre}" ya están marcados como comprados.`;
  }

  const locationParts = [params.direccion, params.comuna]
    .map((v) => (v || '').trim())
    .filter(Boolean);

  const lines: string[] = [
    `*Lista de compras — ${params.proyectoNombre}*`,
    ...(locationParts.length ? [`Dirección: ${locationParts.join(', ')}`] : []),
    `Ítems pendientes: ${totalItems}`,
    '',
  ];

  for (const group of groups) {
    lines.push(`*${group.proveedor}*`);
    for (const item of group.items) {
      const qty = Number.isInteger(Number(item.cantidad))
        ? String(item.cantidad)
        : Number(item.cantidad || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });
      const unit = (item.unidad || 'unid').trim();
      lines.push(`- ${qty} ${unit} · ${item.nombre}`);
    }
    lines.push('');
  }

  lines.push('Enviado desde ObraTrack.');
  return lines.join('\n').trim();
}
