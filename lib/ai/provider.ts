import { AIError } from './errors';
import { generateGemini, getServerGeminiKey } from './gemini-provider';
import { generateOpenAI, getServerOpenAIKey } from './openai-provider';
import type { GenerationOptions } from './provider-types';
export { generateGemini, getServerGeminiKey } from './gemini-provider';
export { AIError, aiErrorResponse } from './errors';
export type { GenerationOptions } from './provider-types';

export function getAIProvider(): 'gemini' | 'openai' {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || 'gemini';
  if (provider !== 'gemini' && provider !== 'openai') throw new AIError('AI_PROVIDER_INVALID', 'Revisa la configuración del asistente.', 503);
  return provider;
}
export function isAIConfigured(): boolean {
  try { return Boolean(getAIProvider() === 'openai' ? getServerOpenAIKey() : getServerGeminiKey()); }
  catch { return false; }
}

// Solo genera una respuesta: los permisos, cálculos y escrituras se validan después.
// Un respaldo nunca vuelve a ejecutar acciones ya guardadas.
export async function generateAI(prompt: string, options: GenerationOptions = {}): Promise<string> {
  const provider = getAIProvider();
  const fallback = process.env.AI_FALLBACK_PROVIDER?.trim().toLowerCase();
  if (fallback && !['gemini', 'openai', 'none'].includes(fallback)) throw new AIError('AI_PROVIDER_INVALID', 'Revisa la configuración del asistente.', 503);
  const secondary = fallback && fallback !== 'none' && fallback !== provider ? fallback : null;
  const deadline = Date.now() + Math.min(options.budgetMs || 45000, 45000);
  const invoke = (name: string, budget: number) => (name === 'openai' ? generateOpenAI : generateGemini)(prompt, { ...options, budgetMs: budget, timeoutMs: Math.min(options.timeoutMs || 30000, budget) });
  try {
    const remaining = deadline - Date.now();
    return await invoke(provider, secondary ? Math.max(1, Math.floor(remaining * 0.7)) : remaining);
  } catch (error) {
    if (!secondary || !(error instanceof AIError) || !['AI_TIMEOUT', 'AI_NETWORK', 'AI_RATE_LIMIT', 'AI_UNAVAILABLE'].includes(error.code)) throw error;
    const remaining = deadline - Date.now();
    if (remaining < 1000) throw error;
    return invoke(secondary, remaining);
  }
}
