import { AIError } from '@/lib/ai/errors';
import { syncWriteFailure } from './failure';

type Filter = { column: string; values: unknown[] };
type Mutation = { record?: string; table: string; kind: 'upsert' | 'update' | 'delete'; row?: Record<string, unknown>; filters: Filter[] };

/** Prepare every write first; the RPC validates and commits the whole batch atomically. */
export function syncTransaction(client: any) {
  const operations: Mutation[] = [];
  const writer = { from(table: string) {
    const mutation: Mutation = { table, kind: 'upsert', filters: [] };
    const query: any = {
      upsert(row: any) { mutation.kind = 'upsert'; mutation.row = row; return query; },
      update(row: any) { mutation.kind = 'update'; mutation.row = row; return query; },
      delete() { mutation.kind = 'delete'; return query; },
      eq(column: string, value: unknown) { mutation.filters.push({ column, values: [value] }); return query; },
      in(column: string, values: unknown[]) { mutation.filters.push({ column, values }); return query; },
      select() { return query; },
      record(value: string) {
        mutation.record=value;
        operations.push(mutation);
        const id = mutation.row?.id || mutation.filters.find(f => f.column === 'id')?.values[0];
        return Promise.resolve({ data: id ? [{ id }] : [], error: null });
      },
    };
    return query;
  }};
  return { writer, async commit(requestId: string, versions: unknown) {
    const { data, error } = await client.rpc('sincronizar_lote_web', { p_id: requestId, p_operaciones: operations, p_versiones: versions || {} });
    if (error) {
      if (/SYNC_CONFLICT/.test(error.message || '')) throw new AIError('SYNC_CONFLICT', 'Hay cambios más recientes en la nube. Revisa el conflicto antes de guardar; tus cambios siguen en este dispositivo.', 409);
      if (/PLAN_LIMIT/.test(error.message || '')) throw new AIError('PLAN_LIMIT', 'Tu plan permite una obra en curso. Pausa otra obra o cambia de plan antes de continuar.', 403);
      let record = 'los cambios de esta operación';
      try { const details=JSON.parse(error.details || '{}');if(typeof details.record==='string')record=details.record;else {const op=operations.find(item=>item.table===details.table && (item.row?.id===details.id || !details.id));if(op?.record)record=op.record;} } catch { /* Database details never reach the user. */ }
      throw syncWriteFailure(error, record);
    }
    if (!data?.success) throw new AIError('SYNC_SAVE', 'No se pudo confirmar el guardado. Tus cambios siguen pendientes.', 503);
    return data;
  }};
}
