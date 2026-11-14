import { generateOpenAI, getServerOpenAIKey } from './openai-provider';
import type { GenerationOptions } from './provider-types';
export { AIError, aiErrorResponse } from './errors';
export { getServerOpenAIKey } from './openai-provider';
export type { GenerationOptions } from './provider-types';

// Las variables antiguas no pueden reactivar otro proveedor ni un fallback.
export function getAIProvider(): 'openai' { return 'openai'; }
export function isAIConfigured(): boolean { return Boolean(getServerOpenAIKey()); }
export async function generateAI(prompt: string, options: GenerationOptions = {}): Promise<string> {
  return generateOpenAI(prompt, options);
}
