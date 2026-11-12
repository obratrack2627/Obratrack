import { normalizeSpecialties } from '@/lib/team-specialties';
import { isConversationalName, isPersonName } from '@/lib/ai/person-name';
import { validateContactAction } from '@/lib/ai/contacts';
export type PersonDraft = { tipo: 'trabajador' | 'cliente'; nombre?: string; rut?: string; telefono?: string; email?: string; rol?: string; proyecto_id?: string; proyecto_nombre?: string; direccion?: string; comuna?: string; especialidades?: string[] };
export function registrationFields(input: PersonDraft) {
  const draft = { ...input };
  if (draft.tipo === 'trabajador' && draft.especialidades !== undefined) draft.especialidades = normalizeSpecialties(draft.especialidades);
  const missing: string[] = [];
  const fields: Record<string, string> = { nombre: draft.tipo === 'cliente' ? 'Nombre o razón social' : 'Nombre completo', rut: 'RUT válido', telefono: 'Teléfono', email: 'Correo electrónico' };
  for (const [field, label] of Object.entries(fields)) {
    const value = draft[field as keyof PersonDraft];
    if (typeof value !== 'string' || !value.trim()) { missing.push(label); continue; }
    if (field === 'nombre') {
      draft.nombre = value.trim();
      if (value.length > 150 || isConversationalName(value) || (draft.tipo === 'trabajador' && !isPersonName(value))) { missing.push(label); delete draft.nombre; }
    } else {
      try {
        const action = validateContactAction({ tipo: 'actualizar_cliente', [field]: value });
        Object.assign(draft, { [field]: action[field] });
      } catch { missing.push(label); delete draft[field as keyof PersonDraft]; }
    }
  }
  if (draft.tipo === 'trabajador') {
    if (!['terreno', 'supervisor'].includes(draft.rol || '')) missing.push('Rol: terreno o supervisor');
    if (draft.rol !== 'supervisor' && !draft.proyecto_id && !draft.proyecto_nombre) missing.push('Obra asignada (para terreno)');
  }
  return { draft, missing };
}
