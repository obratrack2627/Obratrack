import { reserveAIUsage } from './usage';
import { serverFetch } from '@/lib/server-fetch';
import { getServerOpenAIKey } from './openai-provider';
import {
  isQuoteRequest,
  isQuoteRevision,
  isAlternativeRequest,
  requestsPlatformAction,
  isMaterialPriceRequest,
} from './prompt';

export const EMBEDDING_DIMENSIONS = 1536;
const REFERENCE_USE =
  'Referencia histórica aprobada de tu empresa; no es precio de mercado ni autorización de ejecución.';

export async function embedReference(text: string, fetcher: typeof fetch = serverFetch): Promise<number[]> {
  const key = getServerOpenAIKey();
  if (!key) throw new Error('EMBEDDING_NOT_CONFIGURED');
  const settle=fetcher===serverFetch?await reserveAIUsage(Buffer.byteLength(text.slice(0,20000),'utf8'),'embedding'):async()=>{};
  try {
  const response = await fetcher('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text.slice(0, 20000),
      dimensions: EMBEDDING_DIMENSIONS,
    }),
    signal: AbortSignal.timeout(3500),
  });
  if (!response.ok) throw new Error('EMBEDDING_UNAVAILABLE');
  const vector = (await response.json())?.data?.[0]?.embedding;
  if (
    !Array.isArray(vector) ||
    vector.length !== EMBEDDING_DIMENSIONS ||
    vector.some((v) => typeof v !== 'number' || !Number.isFinite(v))
  ) {
    throw new Error('EMBEDDING_INVALID');
  }
  return vector;
  } finally { await settle(); }
}

export function ragEligible(
  query: string,
  role: string,
  enabled = process.env.OBRABOT_RAG_ENABLED === 'true',
) {
  if (!enabled || role === 'terreno' || requestsPlatformAction(query) || isMaterialPriceRequest(query)) {
    return false;
  }
  if (isQuoteRequest(query) || isQuoteRevision(query) || isAlternativeRequest(query)) {
    return true;
  }
  const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\b(?:rendimientos?|apu|cuantos?\s+(?:dias|materiales|sacos|horas|personas)|estimacion|referencia\s+de\s+obra)\b/.test(
    normalized,
  );
}

function parseVector(raw: unknown): number[] | null {
  if (Array.isArray(raw)) {
    return raw.length === EMBEDDING_DIMENSIONS && raw.every((v) => typeof v === 'number' && Number.isFinite(v))
      ? raw
      : null;
  }
  if (typeof raw === 'string' && raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) &&
        parsed.length === EMBEDDING_DIMENSIONS &&
        parsed.every((v) => typeof v === 'number' && Number.isFinite(v))
        ? parsed
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function formatReferences(rows: any[]) {
  return (rows || [])
    .filter((r: any) => ['apu', 'budget'].includes(r.source_type) && Number.isFinite(r.similarity) && r.similarity >= 0.25)
    .slice(0, 4)
    .map((r: any) => ({
      source_type: r.source_type,
      source_id: r.source_id,
      referencia: r.payload,
      uso: REFERENCE_USE,
    }));
}

export async function retrieveReferences(
  client: any,
  query: string,
  role: string,
  {
    enabled = process.env.OBRABOT_RAG_ENABLED === 'true',
    embed = embedReference,
    companyId,
  }: {
    enabled?: boolean;
    embed?: typeof embedReference;
    companyId?: string;
  } = {},
) {
  if (!ragEligible(query, role, enabled)) return [];
  try {
    const vector = await embed(query);
    if (companyId) {
      try {
        let tenantCall = client.rpc('match_obrabot_knowledge_tenant', {
          p_empresa_id: companyId,
          query_embedding: JSON.stringify(vector),
          match_count: 4,
        });
        if (typeof tenantCall?.abortSignal === 'function') {
          tenantCall = tenantCall.abortSignal(AbortSignal.timeout(1500));
        }
        const tenantRes = await tenantCall;
        if (!tenantRes?.error && Array.isArray(tenantRes?.data)) {
          return formatReferences(tenantRes.data);
        }
      } catch {
        // Fallback abajo si la RPC por empresa aún no está desplegada en la BD.
      }
      if (typeof client?.from === 'function') {
        let tableCall = client
          .from('obrabot_knowledge')
          .select('source_type,source_id,payload,embedding')
          .eq('empresa_id', companyId)
          .limit(200);
        if (typeof tableCall?.abortSignal === 'function') {
          tableCall = tableCall.abortSignal(AbortSignal.timeout(1500));
        }
        const { data, error } = await tableCall;
        if (error || !Array.isArray(data)) return [];
        const scored = data
          .map((row: any) => {
            const vec = parseVector(row.embedding);
            if (!vec) return null;
            return { ...row, similarity: cosineSimilarity(vector, vec) };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.similarity - a.similarity);
        return formatReferences(scored);
      }
      return [];
    }

    let call = client.rpc('match_obrabot_knowledge', {
      query_embedding: JSON.stringify(vector),
      match_count: 4,
    });
    if (typeof call?.abortSignal === 'function') {
      call = call.abortSignal(AbortSignal.timeout(1500));
    }
    const { data, error } = await call;
    if (error) return [];
    return formatReferences(data);
  } catch {
    return [];
  }
}
