import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ReclamoCambioObra,
  DocumentoObra,
  AsistenciaObrero,
  ReporteWhatsApp,
} from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let cachedAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cachedAdmin) return cachedAdmin;
  const key = serviceRoleKey || anonKey;
  if (!supabaseUrl || !key) return null;

  cachedAdmin = createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cachedAdmin;
}

export interface CloudV2State {
  reclamos_cambios: ReclamoCambioObra[];
  documentos: DocumentoObra[];
  asistencias: AsistenciaObrero[];
  reportes_whatsapp: ReporteWhatsApp[];
  updated_at: string;
}

const CLOUD_BUCKET = 'obratrack-cloud-db';

function getLedgerPath(empresaId: string): string {
  const clean = (empresaId || 'e1111111-1111-4111-a111-111111111111').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ledgers/v2_${clean}.json`;
}

export async function readCloudV2Ledger(empresaId: string): Promise<CloudV2State> {
  const empty: CloudV2State = {
    reclamos_cambios: [],
    documentos: [],
    asistencias: [],
    reportes_whatsapp: [],
    updated_at: new Date().toISOString(),
  };

  const sb = getSupabaseAdmin();
  if (!sb) return empty;

  let ledgerState = { ...empty };

  try {
    const path = getLedgerPath(empresaId);
    const { data, error } = await sb.storage.from(CLOUD_BUCKET).download(path);
    if (!error && data) {
      const text = await data.text();
      const parsed = JSON.parse(text);
      ledgerState = {
        reclamos_cambios: Array.isArray(parsed.reclamos_cambios) ? parsed.reclamos_cambios : [],
        documentos: Array.isArray(parsed.documentos) ? parsed.documentos : [],
        asistencias: Array.isArray(parsed.asistencias) ? parsed.asistencias : [],
        reportes_whatsapp: Array.isArray(parsed.reportes_whatsapp) ? parsed.reportes_whatsapp : [],
        updated_at: parsed.updated_at || empty.updated_at,
      };
    }
  } catch {
    // Si aún no existe el archivo en el bucket, se retorna vacío y se creará al guardar
  }

  // Intentar enriquecer/fusionar desde las tablas SQL nativas si ya fueron creadas
  try {
    const { data: sqlCambios, error: errC } = await sb
      .from('reclamos_cambios_obra')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });
    if (!errC && Array.isArray(sqlCambios) && sqlCambios.length > 0) {
      const map = new Map<string, ReclamoCambioObra>();
      ledgerState.reclamos_cambios.forEach((item) => map.set(item.id, item));
      sqlCambios.forEach((row: any) => {
        map.set(row.id, {
          ...row,
          impacto_monto: Number(row.impacto_monto) || 0,
          impacto_dias: Number(row.impacto_dias) || 0,
          materiales_requeridos: Array.isArray(row.materiales_requeridos) ? row.materiales_requeridos : [],
          materiales_inyectados: Boolean(row.materiales_inyectados),
        });
      });
      ledgerState.reclamos_cambios = Array.from(map.values());
    }
  } catch {
    // Tabla aún no ejecutada en SQL Editor, respaldado por Cloud Ledger
  }

  try {
    const { data: sqlDocs, error: errD } = await sb
      .from('documentos_obra')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });
    if (!errD && Array.isArray(sqlDocs) && sqlDocs.length > 0) {
      const map = new Map<string, DocumentoObra>();
      ledgerState.documentos.forEach((item) => map.set(item.id, item));
      sqlDocs.forEach((row: any) => {
        map.set(row.id, {
          ...row,
          monto_documento: row.monto_documento != null ? Number(row.monto_documento) : undefined,
          archivo_tamano: row.archivo_tamano != null ? Number(row.archivo_tamano) : undefined,
        });
      });
      ledgerState.documentos = Array.from(map.values());
    }
  } catch {
    // Respaldado por Cloud Ledger
  }

  try {
    const { data: sqlAsist, error: errA } = await sb
      .from('asistencia_obreros')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });
    if (!errA && Array.isArray(sqlAsist) && sqlAsist.length > 0) {
      const map = new Map<string, AsistenciaObrero>();
      ledgerState.asistencias.forEach((item) => map.set(item.id, item));
      sqlAsist.forEach((row: any) => {
        map.set(row.id, {
          ...row,
          horas_trabajadas: row.horas_trabajadas != null ? Number(row.horas_trabajadas) : undefined,
        });
      });
      ledgerState.asistencias = Array.from(map.values());
    }
  } catch {
    // Respaldado por Cloud Ledger
  }

  return ledgerState;
}

export async function writeCloudV2Ledger(empresaId: string, state: CloudV2State): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  const payload = JSON.stringify(
    {
      ...state,
      updated_at: new Date().toISOString(),
    },
    null,
    2
  );

  const path = getLedgerPath(empresaId);
  await sb.storage.from(CLOUD_BUCKET).upload(path, Buffer.from(payload, 'utf-8'), {
    contentType: 'application/json',
    upsert: true,
  });
}

/**
 * Normaliza un número telefónico dejando solo los últimos 8-9 dígitos significativos
 * para emparejar números de Chile (+56 9 XXXX XXXX, 569XXXXXXXX, 9XXXXXXXX) sin fricción.
 */
export function normalizePhoneKey(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length >= 8) {
    return digits.slice(-8);
  }
  return digits;
}

/**
 * Sube un buffer binario a Supabase Storage y retorna su URL pública permanente.
 */
export async function uploadBufferToSupabaseStorage(params: {
  bucket: 'bitacora-fotos' | 'documentos-obra';
  filePath: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ publicUrl: string | null; error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { publicUrl: null, error: 'Cliente Supabase Admin no configurado.' };

  const { error } = await sb.storage.from(params.bucket).upload(params.filePath, params.buffer, {
    contentType: params.contentType,
    upsert: true,
  });

  if (error) {
    // Intentar crear bucket si no existía y reintentar
    await sb.storage.createBucket(params.bucket, { public: true }).catch(() => {});
    const retry = await sb.storage.from(params.bucket).upload(params.filePath, params.buffer, {
      contentType: params.contentType,
      upsert: true,
    });
    if (retry.error) {
      return { publicUrl: null, error: retry.error.message };
    }
  }

  const { data } = sb.storage.from(params.bucket).getPublicUrl(params.filePath);
  return { publicUrl: data.publicUrl };
}
