import { projectDeadlines } from './project-deadlines';
const pick = (row: any, fields: string[]) => Object.fromEntries(fields.filter((field) => row[field] !== undefined).map((field) => [field, typeof row[field] === 'string' ? row[field].slice(0, 1800) : row[field]]));

// Registros filtrados previamente por empresa/asignación; nunca usa el inventario
// del navegador. Los límites son explícitos para no presentar un recorte como vacío.
export function operationsContext(tables: Record<string, any[]>, projectId?: string, role = 'admin', query = '') {
  const terms = Array.from(new Set(query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4)));
  const relevance = (row: any) => {
    const text = [row.id, row.nombre, row.titulo, row.descripcion].filter((value) => typeof value === 'string').join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return terms.filter((word) => text.includes(word)).length;
  };
  const specs: [string, number, string[]][] = [
    ['actividades', 40, ['id','proyecto_id','nombre','estado','porcentaje_avance','fecha_inicio','fecha_termino','responsable_id','orden']],
    ['materiales_proyecto', 30, ['id','proyecto_id','nombre','cantidad','unidad','comprado','proveedor', ...(role === 'terreno' ? [] : ['precio_unitario','subtotal'])]],
    ['bitacora_entradas', 12, ['id','proyecto_id','titulo','nota','fecha','autor_nombre','tipo']],
    ['asistencia_obreros', 20, ['id','proyecto_id','usuario_id','trabajador_nombre','fecha','estado','hora_entrada','hora_salida']],
    ['reclamos_cambios_obra', 12, ['id','proyecto_id','titulo','descripcion','estado','tipo', ...(role === 'terreno' ? [] : ['impacto_monto','impacto_dias'])]],
    ...(role === 'terreno' ? [] : [
      ['pagos', 12, ['id','proyecto_id','monto','estado','fecha','metodo','nota']],
      ['imprevistos', 12, ['id','proyecto_id','descripcion','monto','fecha','estado']],
    ] as [string, number, string[]][]),
  ];
  return {
    fuente: 'Registros actuales consultados en ObraTrack',
    plazos: projectDeadlines(tables.proyectos || [], projectId),
    proyecto_id: projectId || null,
    registros: Object.fromEntries(specs.map(([table, limit, fields]) => {
      const rows = (tables[table] || []).filter((row) => !projectId || row.proyecto_id === projectId).slice().sort((a, b) => {
        const difference = relevance(b) - relevance(a);
        if (difference) return difference;
        if (table === 'actividades') return Number(a.orden || 0) - Number(b.orden || 0);
        if (table === 'materiales_proyecto' && a.comprado !== b.comprado) return Number(!!a.comprado) - Number(!!b.comprado);
        return String(b.fecha || b.created_at || '').localeCompare(String(a.fecha || a.created_at || ''));
      });
      return [table, { total: rows.length, incluidos: rows.slice(0, limit).map((row) => pick(row, fields)), recortado: rows.length > limit }];
    })),
  };
}
