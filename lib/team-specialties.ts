import { AIError } from '@/lib/ai/errors';

export function normalizeSpecialties(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 12)
    throw new AIError('SPECIALTIES_INVALID', 'Agrega hasta 12 especialidades, separadas por comas.', 422);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new AIError('SPECIALTIES_INVALID', 'Cada especialidad debe ser un texto.', 422);
    const name = item.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 60 || /[\u0000-\u001f<>]/.test(name))
      throw new AIError('SPECIALTIES_INVALID', 'Cada especialidad debe tener entre 1 y 60 caracteres.', 422);
    const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!seen.has(key)) { seen.add(key); result.push(name); }
  }
  return result;
}

export function parseSpecialties(value: string): string[] {
  return normalizeSpecialties(value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean));
}

export function literalSpecialties(message: string): string[] | undefined {
  const text = message.match(/\bespecialidad(?:es)?\s*(?:son|es|:|=)?\s+([^;\n]+)/i)?.[1];
  if (!text) return undefined;
  const names = text.split(/\s+(?:rut|correo|email|tel[eé]fono|rol|obra|as[ií]gnalo)\b/i)[0]
    .replace(/[.!?]+$/, '').split(/\s+y\s+/i).join(',');
  return parseSpecialties(names);
}
