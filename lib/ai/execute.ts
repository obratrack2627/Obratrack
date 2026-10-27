'use client';
import { dataService } from '@/lib/data-service';
import { supabase } from '@/lib/supabase/client';
import type { AccionAsistenteIA } from '@/types/database';
import { prepareActionPlan } from './actions';

type Row = Record<string, any> & { id: string };
type Snapshot = Record<string, Row[]>;
type Pending = {
  id: string;
  empresa: string;
  changed: Snapshot;
  deleted: Snapshot;
  result: AccionAsistenteIA;
};
const memory = new Map<string, Pending>();
const pick = (row: any, fields: string) =>
  Object.fromEntries(
    fields
      .split(',')
      .filter((k) => row[k] !== undefined)
      .map((k) => [k, row[k]]),
  ) as Row;
const tenant = () => {
  const empresa = dataService.getActiveUser()?.empresa_id;
  if (!empresa) throw new Error('Inicia sesión para guardar las acciones.');
  return empresa;
};
const pendingKey = (empresa: string) => `obratrack_ia_pendientes_v1_${empresa}`;

function snapshot(): Snapshot {
  const empresa_id = tenant();
  return {
    clientes: dataService
      .getClientes()
      .map((x) => ({
        ...pick(x, 'id,nombre,telefono,email,direccion'),
        empresa_id,
        rut: x.rut || null,
      })),
    usuarios: dataService
      .getUsuarios()
      .map((x) => ({
        ...pick(x, 'id,nombre,rol,auth_user_id'),
        empresa_id,
        rut: x.rut || null,
        email: x.email || null,
        telefono_whatsapp: x.telefono_whatsapp || null,
      })),
    proyectos: dataService
      .getProyectos()
      .map((x) => ({
        ...pick(
          x,
          'id,cliente_id,nombre,descripcion,direccion,comuna,region,latitud,longitud,lugar_referencia,fecha_inicio,fecha_termino_estimada,estado,monto_cotizado',
        ),
        empresa_id,
        trabajadores_ids: x.trabajadores_ids || [],
      })),
    actividades: dataService
      .getActividades()
      .map((x) =>
        pick(
          x,
          'id,proyecto_id,nombre,responsable_id,fecha_inicio,fecha_termino,porcentaje_avance,estado,orden',
        ),
      ),
    materiales_proyecto: dataService
      .getMaterialesProyecto()
      .map((x) =>
        pick(
          x,
          'id,proyecto_id,nombre,categoria,cantidad,unidad,precio_unitario,subtotal,proveedor,comprado',
        ),
      ),
    pagos: dataService
      .getPagos()
      .map((x) => ({
        ...pick(
          x,
          'id,proyecto_id,cliente_id,monto,metodo,estado,fecha,comprobante_url',
        ),
        notas: x.nota || x.notas || null,
      })),
    bitacora_entradas: dataService
      .getBitacora()
      .map((x) =>
        pick(
          x,
          'id,proyecto_id,usuario_id,autor_nombre,titulo,nota,foto_url,fecha,tipo',
        ),
      ),
    imprevistos: dataService
      .getImprevistos()
      .map((x) => ({
        ...pick(x, 'id,proyecto_id,actividad_id,descripcion,estado,origen'),
        titulo: x.titulo || x.descripcion.slice(0, 80),
        monto_adicional: x.monto,
        fecha_reporte: x.fecha,
      })),
    agenda_eventos: dataService
      .getEventosAgenda()
      .map((x) => ({
        ...pick(x, 'id,proyecto_id,usuario_id,titulo,tipo'),
        empresa_id,
        fecha_inicio: `${x.fecha}T${x.hora || '09:00'}:00`,
        fecha_fin: `${x.fecha}T${x.hora || '09:00'}:00`,
      })),
    reclamos_cambios_obra: dataService
      .getReclamosCambios()
      .map((x) => ({
        ...pick(
          x,
          'id,proyecto_id,cliente_id,tipo,prioridad,estado,titulo,descripcion,solicitado_por,impacto_monto,impacto_dias,materiales_requeridos,materiales_inyectados,foto_url,origen,resolucion_notas,fecha',
        ),
        empresa_id,
      })),
    documentos_obra: dataService
      .getDocumentosObra()
      .map((x) => ({
        ...pick(
          x,
          'id,proyecto_id,subido_por_nombre,categoria,nombre,descripcion,archivo_url,archivo_nombre,archivo_tamano,mime_type,numero_documento,proveedor_entidad,monto_documento,correo_remitente,correo_destinatario,correo_asunto,correo_cuerpo,fecha_documento',
        ),
        empresa_id,
      })),
    asistencia_obreros: dataService
      .getAsistencias()
      .map((x) => ({
        ...pick(
          x,
          'id,proyecto_id,usuario_id,trabajador_nombre,trabajador_rol,fecha,estado,hora_entrada,hora_salida,horas_trabajadas,observacion,origen,registrado_por',
        ),
        empresa_id,
      })),
    reportes_whatsapp: dataService
      .getReportes()
      .map((x) => ({
        id: x.id,
        proyecto_id: x.proyecto_id,
        empresa_id,
        telefono: '',
        mensaje_recibido: x.mensaje_original || '',
        respuesta_enviada: x.transcripcion || '',
        fecha_envio: x.fecha,
        estado: x.estado,
        respuesta_ia: x.transcripcion || '',
        modulo_afectado: 'reportes',
      })),
  };
}
export function changesBetween(before: Snapshot, after: Snapshot) {
  const changed: Snapshot = {},
    deleted: Snapshot = {};
  for (const table of Object.keys(after)) {
    const previous = new Map(
      before[table].map((x) => [x.id, JSON.stringify(x)]),
    );
    changed[table] = after[table].filter(
      (x) => previous.get(x.id) !== JSON.stringify(x),
    );
    const ids = new Set(after[table].map((x) => x.id));
    deleted[table] = before[table].filter((x) => !ids.has(x.id));
  }
  return { changed, deleted };
}
function remember(job: Pending) {
  memory.set(job.id, job);
  try {
    const entries = JSON.parse(
      localStorage.getItem(pendingKey(job.empresa)) || '{}',
    );
    entries[job.id] = job;
    localStorage.setItem(pendingKey(job.empresa), JSON.stringify(entries));
  } catch {
    /* La copia en memoria permite reintentar si el dispositivo se quedó sin espacio. */
  }
}
function forget(job: Pending) {
  memory.delete(job.id);
  try {
    const entries = JSON.parse(
      localStorage.getItem(pendingKey(job.empresa)) || '{}',
    );
    delete entries[job.id];
    localStorage.setItem(pendingKey(job.empresa), JSON.stringify(entries));
    const key = `obratrack_ia_confirmadas_v1_${job.empresa}`;
    const ids = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([...ids.slice(-199), job.id]));
  } catch {
    /* Los upserts son idempotentes si queda un intento persistido. */
  }
}
export function isAIWriteConfirmed(id: string) {
  try {
    return JSON.parse(
      localStorage.getItem(`obratrack_ia_confirmadas_v1_${tenant()}`) || '[]',
    ).includes(id);
  } catch {
    return false;
  }
}
function databaseError(error: any): never {
  if (['PGRST205', 'PGRST204', '42P01', '42703'].includes(error?.code))
    throw new Error(
      'Falta habilitar el módulo correspondiente en Supabase (migrations_v2.sql).',
    );
  if (['42501', 'PGRST301'].includes(error?.code))
    throw new Error('Tu sesión no tiene permisos para guardar estos cambios.');
  throw new Error('No se pudo confirmar el guardado en Supabase.');
}
async function persist(job: Pending) {
  if (job.empresa !== tenant())
    throw new Error('Estos cambios pertenecen a otra sesión.');
  // Orden de claves externas. Reintentar guarda los mismos IDs; no vuelve a crear pagos o partidas.
  for (const [table, rows] of Object.entries(job.changed)) {
    for (const original of rows) {
      const { trabajadores_ids, ...row } = original;
      const { data, error } = await supabase
        .from(table)
        .upsert(row, { onConflict: 'id' })
        .select('id');
      if (error) databaseError(error);
      if (!data?.some((x) => x.id === row.id))
        throw new Error('El servidor no confirmó el registro guardado.');
      if (table === 'proyectos') {
        const { error: clearError } = await supabase
          .from('proyecto_trabajadores')
          .delete()
          .eq('proyecto_id', row.id);
        if (clearError) databaseError(clearError);
        if (trabajadores_ids?.length) {
          const { error: assignError } = await supabase
            .from('proyecto_trabajadores')
            .upsert(
              trabajadores_ids.map((usuario_id: string) => ({
                proyecto_id: row.id,
                usuario_id,
              })),
              { onConflict: 'proyecto_id,usuario_id' },
            );
          if (assignError) databaseError(assignError);
        }
      }
    }
  }
  for (const [table, rows] of Object.entries(job.deleted).reverse()) {
    for (const row of rows) {
      const { error } = await supabase.from(table).delete().eq('id', row.id);
      if (error) databaseError(error);
    }
  }
  forget(job);
  window.dispatchEvent(new CustomEvent('obratrack_cloud_synced'));
  return job.result;
}
export async function retryAIWrite(id: string) {
  const empresa = tenant();
  const job =
    memory.get(id) ||
    JSON.parse(localStorage.getItem(pendingKey(empresa)) || '{}')[id];
  if (!job)
    throw new Error(
      'No se encontró el guardado pendiente. Revisa los registros de la obra.',
    );
  return persist(job);
}

let queue: Promise<unknown> = Promise.resolve();
export function executeAI(input: any, currentId?: string) {
  const task = queue.then(async () => {
    const empresa = tenant();
    const actions = prepareActionPlan(
      input,
      {
        proyectos: dataService.getProyectos(),
        clientes: dataService.getClientes(),
        actividades: dataService.getActividades(),
        usuarios: dataService.getUsuarios(),
      },
      currentId,
    );
    if (!actions.length)
      return { result: undefined, pendingId: undefined, warning: '' };
    const before = snapshot();
    const backup = new Map(
      Object.keys(localStorage)
        .filter((k) => k.startsWith('obratrack_') && k.endsWith(`_${empresa}`))
        .map((k) => [k, localStorage.getItem(k)!]),
    );
    let result: AccionAsistenteIA | null;
    try {
      result = dataService.runLocalAI(() =>
        dataService.ejecutarAccionGlobalIA(
          actions.length === 1
            ? actions[0]
            : { tipo: 'lote_acciones', acciones: actions },
          currentId,
        ),
      );
      if (!result) throw new Error('No se pudo ejecutar la acción solicitada.');
    } catch (error) {
      for (const key of Object.keys(localStorage))
        if (
          key.startsWith('obratrack_') &&
          key.endsWith(`_${empresa}`) &&
          !backup.has(key)
        )
          localStorage.removeItem(key);
      backup.forEach((value, key) => localStorage.setItem(key, value));
      throw error;
    }
    const delta = snapshot();
    // Lecturas de caché pueden registrar al usuario activo; cancelar ese autosync completo.
    dataService.runLocalAI(() => undefined);
    const job = {
      id: crypto.randomUUID(),
      empresa,
      ...changesBetween(before, delta),
      result,
    };
    remember(job);
    try {
      await persist(job);
      return { result, pendingId: undefined, warning: '' };
    } catch (error) {
      return {
        result: undefined,
        pendingId: job.id,
        warning: `Los cambios quedaron en este dispositivo; su guardado en la nube está pendiente. ${(error as Error).message}`,
      };
    }
  });
  queue = task.catch(() => undefined);
  return task;
}
