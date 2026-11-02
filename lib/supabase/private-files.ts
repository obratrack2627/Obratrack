import { supabaseUrl } from './client';
import { AIError } from '@/lib/ai/errors';

export function storedFile(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.origin !== new URL(supabaseUrl).origin) return null;
    const match = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/(documentos-obra|bitacora-fotos)\/(.+)$/.exec(url.pathname);
    if (!match) return null;
    const path = decodeURIComponent(match[2]);
    if (path.split('/').some((part) => !part || part === '..' || part === '.')) return null;
    return { bucket: match[1], path };
  } catch { return null; }
}
const cache = new Map<string, { url: string; until: number }>();
export async function signStoredFile(value: unknown, company: string, projects: Set<string>, client: any) {
  const file = storedFile(value);
  if (!file) return value;
  const parts = file.path.split('/');
  if (parts[0] !== company || !projects.has(parts[1])) return null;
  const key = file.bucket + '/' + file.path;
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return cached.url;
  const { data, error } = await client.storage.from(file.bucket).createSignedUrl(file.path, 3600);
  if (error || !data?.signedUrl) throw new AIError('FILES_READ', 'No se pudo actualizar el acceso a los archivos de la obra. Reintenta la sincronización.', 503);
  if (cache.size > 2000) cache.clear();
  cache.set(key, { url: data.signedUrl, until: Date.now() + 45 * 60 * 1000 });
  return data.signedUrl;
}
export async function signRows(rows: any[], fields: string[], company: string, projects: Set<string>, client: any) {
  return Promise.all(rows.map(async (row) => {
    const result = { ...row };
    for (const field of fields) if (row[field]) result[field] = await signStoredFile(row[field], company, projects, client);
    return result;
  }));
}
