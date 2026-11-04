import { DataService, DATA_STORAGE_KEYS as KEYS } from "@/lib/data-service";
import { snapshot, changesBetween } from "@/lib/ai/rows";
import { prepareActionPlan } from "@/lib/ai/actions";

export function isolatedState(
  user: any,
  tables: Record<string, any[]>,
  plan: string,
) {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const seed = (key: string, value: any, tenant = true) =>
    storage.setItem(
      tenant ? `${key}_${user.empresa_id}` : key,
      JSON.stringify(value),
    );
  seed(KEYS.ACTIVE_USER, user, false);
  seed(KEYS.PLAN, plan);
  seed(KEYS.USUARIOS, tables.usuarios || []);
  seed(KEYS.CLIENTES, tables.clientes || []);
  seed(
    KEYS.PROYECTOS,
    (tables.proyectos || []).map((p) => ({
      ...p,
      trabajadores_ids: (tables.proyecto_trabajadores || [])
        .filter((r) => r.proyecto_id === p.id)
        .map((r) => r.usuario_id),
    })),
  );
  seed(KEYS.ACTIVIDADES, tables.actividades || []);
  seed(KEYS.MATERIALES_PROYECTO, tables.materiales_proyecto || []);
  seed(
    KEYS.PAGOS,
    (tables.pagos || []).map((p) => ({ ...p, nota: p.notas })),
  );
  seed(
    KEYS.IMPREVISTOS,
    (tables.imprevistos || []).map((p) => ({
      ...p,
      monto: Number(p.monto_adicional),
      fecha: p.fecha_reporte,
    })),
  );
  seed(KEYS.BITACORA, tables.bitacora_entradas || []);
  seed(
    KEYS.AGENDA,
    (tables.agenda_eventos || []).map((p) => ({
      ...p,
      fecha: p.fecha_inicio?.slice(0, 10),
      hora: p.fecha_inicio?.slice(11, 16),
    })),
  );
  seed(KEYS.RECLAMOS_CAMBIOS, tables.reclamos_cambios_obra || []);
  seed(KEYS.DOCUMENTOS_OBRA, tables.documentos_obra || []);
  seed(KEYS.ASISTENCIAS_OBRA, tables.asistencia_obreros || []);
  seed(KEYS.REPORTES, []);
  return new DataService(storage);
}

export function planWhatsAppActions(service: DataService, input: any) {
  return service.runLocalAI(() => {
    const empresa = service.getActiveUser()!.empresa_id!;
    const actions = prepareActionPlan(input, {
      proyectos: service.getProyectos(),
      clientes: service.getClientes(),
      usuarios: service.getUsuarios(),
      actividades: service.getActividades(),
    });
    const before = snapshot(service, empresa);
    const result = actions.length
      ? service.ejecutarAccionGlobalIA({
          tipo: "lote_acciones",
          acciones: actions,
        })
      : null;
    if (actions.length && !result)
      throw new Error("No se pudo preparar la acción solicitada.");
    return { ...changesBetween(before, snapshot(service, empresa)), result };
  });
}

export function mergeWhatsAppPlans(first: ReturnType<typeof planWhatsAppActions>, second: ReturnType<typeof planWhatsAppActions>) {
  const changed = { ...first.changed };
  for (const [table, rows] of Object.entries(second.changed)) {
    const merged = new Map((changed[table] || []).map(row => [row.id,row]));
    rows.forEach(row => merged.set(row.id,row));
    changed[table] = Array.from(merged.values());
  }
  const actions = [first.result,second.result].flatMap(result => !result ? [] : result.tipo === 'lote_acciones' ? result.detalles.acciones : [result]);
  return { changed, deleted: first.deleted, result: {
    tipo: 'lote_acciones' as const, titulo: 'Obra y evidencia registradas', detalles: { acciones: actions },
    resultado_texto: [first.result?.resultado_texto,second.result?.resultado_texto].filter(Boolean).join('\n\n'),
  } };
}
