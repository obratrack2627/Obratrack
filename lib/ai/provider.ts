import { AIError } from './errors';
import { serverFetch } from '@/lib/server-fetch';
export { AIError, aiErrorResponse } from './errors';

export function getServerGeminiKey(): string | null {
  const value =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;
  if (!value || /tu_clave|YourGeminiApiKeyHere/i.test(value)) return null;
  return value.trim();
}

export async function generateGemini(
  prompt: string,
  options: {
    json?: boolean;
    schema?: Record<string, unknown>;
    image?: { mimeType: string; data: string };
    fetcher?: typeof fetch;
    timeoutMs?: number;
    budgetMs?: number;
  } = {},
): Promise<string> {
  const key = getServerGeminiKey();
  if (!key)
    throw new AIError(
      'AI_NOT_CONFIGURED',
      'El asistente necesita configurar GEMINI_API_KEY en el servidor.',
      503,
    );
  const configured = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  if (!/^gemini-[a-zA-Z0-9._-]+$/.test(configured))
    throw new AIError(
      'AI_MODEL_INVALID',
      'Revisa el modelo configurado para el asistente.',
      503,
    );
  const models = Array.from(new Set([configured, 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']));
  const fetcher = options.fetcher || serverFetch;
  const deadline = Date.now() + Math.min(options.budgetMs || 45000, 45000);
  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new AIError('AI_TIMEOUT', 'La IA tardó demasiado. Intenta nuevamente.', 503);
    const parts: object[] = [{ text: prompt }];
    if (options.image) parts.push({ inlineData: options.image });
    let response: Response;
    try {
      response = await fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          signal: AbortSignal.timeout(Math.min(options.timeoutMs || 30000, remaining)),
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
              ...(options.json ? { responseMimeType: 'application/json' } : {}),
              ...(options.schema ? { responseJsonSchema: options.schema } : {}),
              ...(model.startsWith('gemini-3.') && model.includes('flash')
                ? { thinkingConfig: { thinkingLevel: 'minimal' } }
                : {}),
              ...(model.startsWith('gemini-2.5-flash')
                ? { thinkingConfig: { thinkingBudget: 0 } }
                : {}),
            },
          }),
        },
      );
    } catch (error) {
      const timeout =
        error instanceof Error &&
        ['AbortError', 'TimeoutError'].includes(error.name);
      if (timeout && index < models.length - 1) continue;
      throw new AIError(
        timeout ? 'AI_TIMEOUT' : 'AI_NETWORK',
        timeout
          ? 'La IA tardó demasiado. Intenta nuevamente.'
          : 'No se pudo conectar con la IA. Intenta nuevamente.',
        503,
      );
    }
    if (!response.ok) {
      // El cuerpo del proveedor puede incluir datos de la solicitud. No se registra ni devuelve.
      if ([404, 503].includes(response.status) && index < models.length - 1)
        continue;
      if ([400, 401, 403].includes(response.status))
        throw new AIError(
          'AI_CREDENTIALS',
          'La clave o configuración de Gemini no es válida. Revisa la configuración del servidor.',
          503,
        );
      if (response.status === 429)
        throw new AIError(
          'AI_RATE_LIMIT',
          'La IA alcanzó su cuota o límite de uso. Revisa la cuota de Gemini e intenta más tarde.',
          429,
        );
      throw new AIError(
        'AI_UNAVAILABLE',
        'El proveedor de IA no está disponible en este momento.',
        503,
      );
    }
    let payload: any;
    try {
      payload = await response.json();
    } catch {
      throw new AIError(
        'AI_INVALID_RESPONSE',
        'La IA devolvió una respuesta no válida. Intenta nuevamente.',
      );
    }
    const candidate = payload.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP')
      throw new AIError(
        'AI_INCOMPLETE',
        'La IA no completó la respuesta. Divide la solicitud en pasos más pequeños.',
      );
    const text = (candidate?.content?.parts || [])
      .filter((part: any) => !part.thought && typeof part.text === 'string')
      .map((part: any) => part.text)
      .join('')
      .trim();
    if (!text)
      throw new AIError(
        'AI_EMPTY',
        'La IA no pudo responder a esta solicitud. Reformula el mensaje.',
      );
    return text;
  }
  throw new AIError(
    'AI_UNAVAILABLE',
    'El modelo de IA no está disponible.',
    503,
  );
}
