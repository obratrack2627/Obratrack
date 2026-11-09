import type { ProjectStatus } from '@/types/database';
export const projectStatuses: { value: ProjectStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'activo', label: 'En curso' },
  { value: 'terminado', label: 'Terminada' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'pausado', label: 'Pausada' },
];
export const projectStatusLabel = (status: ProjectStatus) => projectStatuses.find(item => item.value === status)?.label || status;
