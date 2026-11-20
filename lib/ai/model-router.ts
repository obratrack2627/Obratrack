import type { ReasoningEffort } from './provider-types';

const ALLOWED_EFFORTS = new Set<ReasoningEffort>([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

function normalizeEffort(value: string | undefined, fallback: ReasoningEffort): ReasoningEffort {
  const clean = value?.trim().toLowerCase() as ReasoningEffort | undefined;
  return clean && ALLOWED_EFFORTS.has(clean) ? clean : fallback;
}

export interface AIProfileSelectionInput {
  mode: 'search' | 'quote' | 'chat';
  message: string;
  hasImage?: boolean;
  hasActionRequest?: boolean;
  isRetry?: boolean;
}

export interface AIProfile {
  tier: 'standard' | 'complex';
  model: string;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
}

const COMPLEX_INTENT_RE =
  /\b(?:cotiz\w*|presupuest\w*|carta\s+gantt|gantt|partidas?|cubicacion\w*|alternativ\w*|crear?\s+(?:la\s+|una\s+)?obra|proyecto\s+completo|programa\s+de\s+obra|materiales\s+y\s+(?:mano|trabajador|cuadrilla|gantt))\b/i;

/**
 * Determina si la solicitud requiere el perfil complejo (modelo superior o mayor razonamiento)
 * o si debe atenderse con el modelo base rápido y económico (`gpt-6-luna` en `medium`).
 */
export function isComplexAITask(input: AIProfileSelectionInput): boolean {
  if (input.isRetry) return true;
  if (input.mode === 'quote') return true;
  if (input.hasImage) return true;

  const clean = (input.message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (input.mode === 'search' && !input.hasActionRequest) return false;
  if (COMPLEX_INTENT_RE.test(clean)) return true;
  if (input.hasActionRequest && clean.length >= 220) return true;

  return false;
}

/**
 * Arquitectura híbrida de modelos:
 * - Estándar: `OPENAI_MODEL` (default `gpt-6-luna`) con `OPENAI_REASONING_EFFORT` (default `medium`).
 * - Complejo: `OPENAI_MODEL_COMPLEX` (si está definido, p. ej. `gpt-6.1-sol`) o el mismo modelo base
 *   elevado a `OPENAI_REASONING_COMPLEX` (default `medium` para modelo complejo, `high` si reutiliza el base).
 */
export function selectAIProfile(input: AIProfileSelectionInput): AIProfile {
  const baseModel = process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna';
  const baseEffort = normalizeEffort(process.env.OPENAI_REASONING_EFFORT, 'medium');

  if (!isComplexAITask(input)) {
    return {
      tier: 'standard',
      model: baseModel,
      reasoningEffort: baseEffort,
      maxOutputTokens: 8192,
    };
  }

  const dedicatedComplexModel = process.env.OPENAI_MODEL_COMPLEX?.trim();
  const complexModel = dedicatedComplexModel || baseModel;
  const fallbackComplexEffort: ReasoningEffort = dedicatedComplexModel ? 'medium' : 'high';
  const complexEffort = normalizeEffort(process.env.OPENAI_REASONING_COMPLEX, fallbackComplexEffort);

  return {
    tier: 'complex',
    model: complexModel,
    reasoningEffort: complexEffort,
    maxOutputTokens: 12288,
  };
}
