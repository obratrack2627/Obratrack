import { projectDeadlines } from "./project-deadlines";
const pick = (row: any, fields: string[]) =>
  Object.fromEntries(
    fields
      .filter((field) => row[field] !== undefined)
      .map((field) => [
        field,
        typeof row[field] === "string" ? row[field].slice(0, 1800) : row[field],
      ]),
  );

export function summarizeBudgets(rows: any[] = [], projectId?: string, limit = 8) {
  return rows
    .filter((row) => !projectId || row.proyecto_id === projectId)
    .slice()
    .sort((a, b) =>
      String(b.updated_at || b.created_at || "").localeCompare(
        String(a.updated_at || a.created_at || ""),
      ),
    )
    .slice(0, limit)
    .map((b) => ({
      id: b.id,
      proyecto_id: b.proyecto_id ?? null,
      estado: b.estado,
      nombre_alternativa: b.nombre_alternativa || b.cotizacion?.nombre_alternativa || null,
      titulo: b.cotizacion?.titulo_proyecto || null,
      tipo_obra: b.cotizacion?.tipo_obra || null,
      metros_cuadrados: b.cotizacion?.metros_cuadrados ?? null,
      duracion_dias_estimada: b.cotizacion?.duracion_dias_estimada ?? null,
      precio_sugerido_neto: b.cotizacion?.estructura_financiera?.precio_sugerido_neto ?? null,
      precio_total_con_iva: b.cotizacion?.estructura_financiera?.precio_total_con_iva ?? null,
      materiales: Array.isArray(b.cotizacion?.materiales)
        ? b.cotizacion.materiales.slice(0, 10).map((m: any) => ({
            nombre: m.nombre,
            cantidad: m.cantidad,
            unidad: m.unidad,
            precio_unitario_estimado: m.precio_unitario_estimado,
          }))
        : [],
      fecha: b.updated_at || b.created_at || null,
    }));
}

// Registros filtrados previamente por empresa/asignación; nunca usa el inventario
// del navegador. Los límites son explícitos para no presentar un recorte como vacío.
export function operationsContext(
  tables: Record<string, any[]>,
  projectId?: string,
  role = "admin",
  query = "",
) {
  const terms = Array.from(
    new Set(
      query
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 4),
    ),
  );
  const relevance = (row: any) => {
    const text = [row.id, row.nombre, row.titulo, row.descripcion]
      .filter((value) => typeof value === "string")
      .join(" ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return terms.filter((word) => text.includes(word)).length;
  };
  const specs: [string, number, string[]][] = [
    [
      "actividades",
      40,
      [
        "id",
        "proyecto_id",
        "nombre",
        "estado",
        "porcentaje_avance",
        "fecha_inicio",
        "fecha_termino",
        "responsable_id",
        "orden",
        ...(role === "terreno" ? [] : ["monto_contratado"]),
      ],
    ],
    [
      "materiales_proyecto",
      30,
      [
        "id",
        "proyecto_id",
        "nombre",
        "cantidad",
        "unidad",
        "comprado",
        "proveedor",
        "actividad_id",
        ...(role === "terreno"
          ? []
          : ["precio_unitario", "subtotal", "pagado"]),
      ],
    ],
    [
      "bitacora_entradas",
      12,
      [
        "id",
        "proyecto_id",
        "titulo",
        "nota",
        "fecha",
        "autor_nombre",
        "tipo",
        "material_id",
        "cantidad_recibida",
      ],
    ],
    [
      "asistencia_obreros",
      20,
      [
        "id",
        "proyecto_id",
        "usuario_id",
        "trabajador_nombre",
        "fecha",
        "estado",
        "hora_entrada",
        "hora_salida",
        "horas_trabajadas",
      ],
    ],
    [
      "reclamos_cambios_obra",
      12,
      [
        "id",
        "proyecto_id",
        "titulo",
        "descripcion",
        "estado",
        "tipo",
        ...(role === "terreno" ? [] : ["impacto_monto", "impacto_dias"]),
      ],
    ],
    ...(role === "terreno"
      ? []
      : ([
          [
            "pagos",
            12,
            ["id", "proyecto_id", "monto", "estado", "fecha", "metodo", "nota"],
          ],
          [
            "imprevistos",
            12,
            [
              "id",
              "proyecto_id",
              "descripcion",
              "monto",
              "monto_adicional",
              "fecha",
              "fecha_reporte",
              "estado",
              "categoria_gasto",
              "usuario_id",
              "pagado",
              "asistencia_id",
              "jornal_resumen",
            ],
          ],
        ] as [string, number, string[]][])),
  ];
  return {
    fuente: "Registros actuales consultados en ObraTrack",
    recepciones:
      role === "terreno"
        ? []
        : (tables.proyectos || [])
            .filter((row) => !projectId || row.id === projectId)
            .map((row) =>
              pick(row, [
                "id",
                "nombre",
                "estado",
                "dias_laborales",
                "fechas_no_laborales",
              ]),
            ),
    plazos: projectDeadlines(tables.proyectos || [], projectId),
    proyecto_id: projectId || null,
    presupuestos_guardados:
      role === "terreno"
        ? []
        : summarizeBudgets(tables.presupuestos || [], projectId, 6),
    registros: Object.fromEntries(
      specs.map(([table, limit, fields]) => {
        const rows = (tables[table] || [])
          .filter((row) => !projectId || row.proyecto_id === projectId)
          .slice()
          .sort((a, b) => {
            const difference = relevance(b) - relevance(a);
            if (difference) return difference;
            if (table === "actividades")
              return Number(a.orden || 0) - Number(b.orden || 0);
            if (table === "materiales_proyecto" && a.comprado !== b.comprado)
              return Number(!!a.comprado) - Number(!!b.comprado);
            return String(b.fecha || b.created_at || "").localeCompare(
              String(a.fecha || a.created_at || ""),
            );
          });
        return [
          table,
          {
            total: rows.length,
            incluidos: rows.slice(0, limit).map((row) => pick(row, fields)),
            recortado: rows.length > limit,
          },
        ];
      }),
    ),
  };
}
