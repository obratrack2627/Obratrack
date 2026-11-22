import { chileToday, csvCell } from '@/lib/work-calendar';
import { projectStatusLabel } from '@/lib/project-status';
import type { MonthlyAttendanceSummaryRow } from '@/lib/attendance-monthly';
import type {
  Actividad,
  AsistenciaObrero,
  Cliente,
  Imprevisto,
  MaterialProyecto,
  Pago,
  Proyecto,
  ReclamoCambioObra,
  Usuario,
} from '@/types/database';

export interface ProjectExcelExportPayload {
  proyecto: Proyecto;
  cliente?: Cliente | null;
  empresaNombre?: string;
  actividades: Actividad[];
  pagos: Pago[];
  materiales: MaterialProyecto[];
  imprevistos: Imprevisto[];
  asistencias: AsistenciaObrero[];
}

const CLP_FORMAT = '"$"#,##0';

export function sanitizeExcelCell(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  return /^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

function styleHeaderRow(row: any) {
  row.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF141A23' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  row.height = 24;
}

/**
 * Construye un libro Excel (.xlsx) completo de control financiero y operativo de la obra.
 */
export async function buildProjectExcelBuffer(
  payload: ProjectExcelExportPayload
): Promise<ArrayBuffer> {
  const ExcelJSImport: any = await import('exceljs');
  const ExcelJS = ExcelJSImport.default || ExcelJSImport;
  const workbook = new ExcelJS.Workbook();

  workbook.creator = payload.empresaNombre || 'ObraTrack SaaS';
  workbook.created = new Date();

  const {
    proyecto,
    cliente,
    empresaNombre = 'Constructora ObraTrack',
    actividades,
    pagos,
    materiales,
    imprevistos,
    asistencias,
  } = payload;

  const montoCotizado = Math.round(Number(proyecto.monto_cotizado) || 0);
  const totalPagado = pagos.filter((p) => !p.estado || p.estado === 'completado').reduce((s, p) => s + Math.round(Number(p.monto) || 0), 0);
  const totalMateriales = materiales.reduce(
    (s, m) => s + Math.round(Number(m.subtotal || m.cantidad * m.precio_unitario) || 0),
    0
  );
  const totalImprevistos = imprevistos.reduce((s, i) => s + Math.round(Number(i.monto) || 0), 0);
  const saldoPorCobrar = Math.max(0, montoCotizado - totalPagado);
  const costosDirectos = totalMateriales + totalImprevistos;
  const margenEstimado = montoCotizado - costosDirectos;

  // 1. Hoja Resumen Ejecutivo
  const wsResumen = workbook.addWorksheet('Resumen de Obra');
  wsResumen.columns = [
    { header: 'Indicador / Campo', key: 'campo', width: 34 },
    { header: 'Valor / Detalle', key: 'valor', width: 42 },
  ];
  styleHeaderRow(wsResumen.getRow(1));

  const resumenRows: Array<[string, string | number, boolean?]> = [
    ['Constructora', sanitizeExcelCell(empresaNombre)],
    ['Obra / Proyecto', sanitizeExcelCell(proyecto.nombre)],
    ['Mandante / Cliente', sanitizeExcelCell(cliente?.nombre || 'No asignado')],
    ['Ubicación', sanitizeExcelCell([proyecto.direccion, proyecto.comuna, proyecto.region].filter(Boolean).join(', '))],
    ['Estado Operativo', sanitizeExcelCell(projectStatusLabel(proyecto.estado))],
    ['Fecha Inicio', sanitizeExcelCell(proyecto.fecha_inicio)],
    ['Fecha Término Estimada', sanitizeExcelCell(proyecto.fecha_termino_estimada)],
    ['Avance Físico Ponderado (%)', `${proyecto.porcentaje_avance_ponderado || 0}%`],
    ['Presupuesto Contratado (IVA incl.)', montoCotizado, true],
    ['Total Recaudado (Pagos)', totalPagado, true],
    ['Saldo Pendiente por Cobrar', saldoPorCobrar, true],
    ['Costo Materiales Proyectados', totalMateriales, true],
    ['Costo Imprevistos Reportados', totalImprevistos, true],
    ['Total Costos Directos Registrados', costosDirectos, true],
    ['Saldo tras materiales e imprevistos', margenEstimado, true],
  ];

  resumenRows.forEach(([campo, valor, isCurrency]) => {
    const r = wsResumen.addRow({ campo, valor });
    r.getCell(1).font = { bold: true };
    if (isCurrency) {
      r.getCell(2).numFmt = CLP_FORMAT;
      r.getCell(2).font = { bold: true };
    }
  });

  // 2. Hoja Estados de Pago e Ingresos
  const wsPagos = workbook.addWorksheet('Pagos e Ingresos');
  wsPagos.columns = [
    { header: 'Fecha', key: 'fecha', width: 15 },
    { header: 'Método', key: 'metodo', width: 18 },
    { header: 'Monto (CLP)', key: 'monto', width: 18 },
    { header: 'Glosa / Nota', key: 'nota', width: 42 },
  ];
  styleHeaderRow(wsPagos.getRow(1));
  pagos.forEach((p) => {
    const r = wsPagos.addRow({
      fecha: sanitizeExcelCell(p.fecha),
      metodo: sanitizeExcelCell(p.metodo),
      monto: Math.round(Number(p.monto) || 0),
      nota: sanitizeExcelCell(p.nota || p.notas || ''),
    });
    r.getCell(3).numFmt = CLP_FORMAT;
  });

  // 3. Hoja Materiales y Proveedores
  const wsMat = workbook.addWorksheet('Materiales');
  wsMat.columns = [
    { header: 'Material / Insumo', key: 'nombre', width: 34 },
    { header: 'Categoría', key: 'categoria', width: 22 },
    { header: 'Proveedor', key: 'proveedor', width: 20 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Unidad', key: 'unidad', width: 12 },
    { header: 'Precio Unitario', key: 'pu', width: 18 },
    { header: 'Subtotal', key: 'subtotal', width: 18 },
    { header: 'Estado Compra', key: 'estado', width: 16 },
  ];
  styleHeaderRow(wsMat.getRow(1));
  materiales.forEach((m) => {
    const pu = Math.round(Number(m.precio_unitario) || 0);
    const sub = Math.round(Number(m.subtotal || m.cantidad * pu) || 0);
    const r = wsMat.addRow({
      nombre: sanitizeExcelCell(m.nombre),
      categoria: sanitizeExcelCell(m.categoria || 'General'),
      proveedor: sanitizeExcelCell(m.proveedor || 'Por definir'),
      cantidad: m.cantidad,
      unidad: sanitizeExcelCell(m.unidad),
      pu,
      subtotal: sub,
      estado: m.comprado ? 'Comprado' : 'Pendiente',
    });
    r.getCell(6).numFmt = CLP_FORMAT;
    r.getCell(7).numFmt = CLP_FORMAT;
  });

  // 4. Hoja Imprevistos
  const wsImp = workbook.addWorksheet('Imprevistos');
  wsImp.columns = [
    { header: 'Fecha', key: 'fecha', width: 15 },
    { header: 'Origen', key: 'origen', width: 16 },
    { header: 'Monto (CLP)', key: 'monto', width: 18 },
    { header: 'Descripción', key: 'descripcion', width: 48 },
  ];
  styleHeaderRow(wsImp.getRow(1));
  imprevistos.forEach((imp) => {
    const r = wsImp.addRow({
      fecha: sanitizeExcelCell(imp.fecha),
      origen: imp.origen === 'whatsapp_ia' ? 'WhatsApp IA' : 'Manual',
      monto: Math.round(Number(imp.monto) || 0),
      descripcion: sanitizeExcelCell(imp.descripcion),
    });
    r.getCell(3).numFmt = CLP_FORMAT;
  });

  // 5. Hoja Carta Gantt y Asistencia
  const wsOperacion = workbook.addWorksheet('Gantt y Asistencia');
  wsOperacion.columns = [
    { header: 'Tipo Registro', key: 'tipo', width: 18 },
    { header: 'Partida / Trabajador', key: 'nombre', width: 32 },
    { header: 'Fecha / Plazo', key: 'fecha', width: 25 },
    { header: 'Estado', key: 'estado', width: 16 },
    { header: 'Avance / Horas', key: 'metrica', width: 18 },
  ];
  styleHeaderRow(wsOperacion.getRow(1));
  actividades.forEach((a) => {
    wsOperacion.addRow({
      tipo: 'Partida Gantt',
      nombre: sanitizeExcelCell(a.nombre),
      fecha: sanitizeExcelCell(`${a.fecha_inicio} -> ${a.fecha_termino}`),
      estado: sanitizeExcelCell(a.estado),
      metrica: `${a.porcentaje_avance}%`,
    });
  });
  asistencias.forEach((asist) => {
    wsOperacion.addRow({
      tipo: 'Asistencia',
      nombre: sanitizeExcelCell(asist.trabajador_nombre),
      fecha: sanitizeExcelCell(asist.fecha),
      estado: sanitizeExcelCell(asist.estado),
      metrica: `${asist.horas_trabajadas || 0} hrs`,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/**
 * Genera y descarga en el navegador la Cartola Financiera y Operativa en formato .xlsx
 */
export async function downloadProjectExcel(payload: ProjectExcelExportPayload): Promise<void> {
  if (typeof window === 'undefined') return;
  const buffer = await buildProjectExcelBuffer(payload);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const safeName = payload.proyecto.nombre.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'Obra';
  const datePart = chileToday();
  const filename = `Cartola_ObraTrack_${safeName}_${datePart}.xlsx`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  if (typeof fetch === 'function') {
    fetch('/api/auditoria/evento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event_type: 'export.excel_report',
        resource_type: 'proyecto',
        resource_id: payload.proyecto.id,
      }),
    }).catch(() => {});
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadPortfolioExcel(payload: {
  empresaNombre?: string;
  proyectos: Proyecto[];
  clientes: Cliente[];
  materiales: MaterialProyecto[];
  imprevistos: Imprevisto[];
  pagos: Pago[];
  reclamos: ReclamoCambioObra[];
}): Promise<void> {
  if (typeof window === 'undefined') return;
  const ExcelJSImport: any = await import('exceljs');
  const ExcelJS = ExcelJSImport.default || ExcelJSImport;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = payload.empresaNombre || 'ObraTrack SaaS';
  workbook.created = new Date();

  const clientMap = new Map(payload.clientes.map((c) => [c.id, c.nombre]));
  const activeProjects = payload.proyectos.filter((p) => p.estado !== 'cancelada');

  const wsResumen = workbook.addWorksheet('Resumen Cartera');
  wsResumen.columns = [
    { header: 'Indicador', key: 'indicador', width: 34 },
    { header: 'Valor', key: 'valor', width: 36 },
  ];
  styleHeaderRow(wsResumen.getRow(1));

  const totalCotizado = activeProjects.reduce((s, p) => s + (Number(p.monto_cotizado) || 0), 0);
  const totalPagado = payload.pagos
    .filter((p) => !p.estado || p.estado === 'completado')
    .reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const totalMats = payload.materiales.reduce(
    (s, m) => s + (Number(m.subtotal || m.cantidad * m.precio_unitario) || 0),
    0,
  );
  const totalImps = payload.imprevistos.reduce(
    (s, i) => s + (Number(i.monto ?? i.monto_adicional) || 0),
    0,
  );

  [
    ['Constructora', sanitizeExcelCell(payload.empresaNombre || 'Constructora ObraTrack')],
    ['Fecha de emisión', chileToday()],
    ['Obras activas', activeProjects.filter((p) => p.estado === 'activo').length],
    ['Obras totales vigentes', activeProjects.length],
    ['Total Contratado', Math.round(totalCotizado), true],
    ['Total Cobrado', Math.round(totalPagado), true],
    ['Saldo por Cobrar', Math.max(0, Math.round(totalCotizado - totalPagado)), true],
    ['Costos Directos Acumulados', Math.round(totalMats + totalImps), true],
    ['Margen Bruto Cartera', Math.round(totalCotizado - (totalMats + totalImps)), true],
  ].forEach(([ind, val, isClp]) => {
    const row = wsResumen.addRow({ indicador: ind, valor: val });
    if (isClp) row.getCell(2).numFmt = CLP_FORMAT;
  });

  const wsObras = workbook.addWorksheet('Obras y Rentabilidad');
  wsObras.columns = [
    { header: 'Obra', key: 'nombre', width: 30 },
    { header: 'Mandante', key: 'cliente', width: 24 },
    { header: 'Comuna', key: 'comuna', width: 18 },
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Avance (%)', key: 'avance', width: 12 },
    { header: 'Contratado', key: 'cotizado', width: 16 },
    { header: 'Cobrado', key: 'cobrado', width: 16 },
    { header: 'Costos Directos', key: 'costos', width: 16 },
    { header: 'Margen Estimado', key: 'margen', width: 16 },
  ];
  styleHeaderRow(wsObras.getRow(1));

  activeProjects.forEach((p) => {
    const cotizado = Math.round(Number(p.monto_cotizado) || 0);
    const cobrado = payload.pagos
      .filter((pg) => pg.proyecto_id === p.id && (!pg.estado || pg.estado === 'completado'))
      .reduce((s, pg) => s + Math.round(Number(pg.monto) || 0), 0);
    const mats = payload.materiales
      .filter((m) => m.proyecto_id === p.id)
      .reduce((s, m) => s + Math.round(Number(m.subtotal || m.cantidad * m.precio_unitario) || 0), 0);
    const imps = payload.imprevistos
      .filter((i) => i.proyecto_id === p.id)
      .reduce((s, i) => s + Math.round(Number(i.monto ?? i.monto_adicional) || 0), 0);
    const costos = mats + imps;
    const row = wsObras.addRow({
      nombre: sanitizeExcelCell(p.nombre),
      cliente: sanitizeExcelCell((p.cliente_id && clientMap.get(p.cliente_id)) || 'Sin asignar'),
      comuna: sanitizeExcelCell(p.comuna || ''),
      estado: sanitizeExcelCell(projectStatusLabel(p.estado)),
      avance: `${Math.round(Number(p.porcentaje_avance_ponderado) || 0)}%`,
      cotizado,
      cobrado,
      costos,
      margen: cotizado - costos,
    });
    [6, 7, 8, 9].forEach((idx) => {
      row.getCell(idx).numFmt = CLP_FORMAT;
    });
  });

  const wsReclamos = workbook.addWorksheet('Reclamos y Cambios');
  wsReclamos.columns = [
    { header: 'Obra', key: 'obra', width: 26 },
    { header: 'Tipo', key: 'tipo', width: 18 },
    { header: 'Título', key: 'titulo', width: 32 },
    { header: 'Prioridad', key: 'prioridad', width: 12 },
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Impacto Monto', key: 'monto', width: 16 },
    { header: 'Impacto Días', key: 'dias', width: 14 },
  ];
  styleHeaderRow(wsReclamos.getRow(1));
  const projMap = new Map(payload.proyectos.map((p) => [p.id, p.nombre]));
  payload.reclamos.forEach((r) => {
    const row = wsReclamos.addRow({
      obra: sanitizeExcelCell(projMap.get(r.proyecto_id) || r.proyecto_id),
      tipo: sanitizeExcelCell(r.tipo),
      titulo: sanitizeExcelCell(r.titulo),
      prioridad: sanitizeExcelCell(r.prioridad),
      estado: sanitizeExcelCell(r.estado),
      monto: Math.round(Number(r.impacto_monto) || 0),
      dias: Number(r.impacto_dias) || 0,
    });
    row.getCell(6).numFmt = CLP_FORMAT;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  triggerBlobDownload(
    new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `Cartera_ObraTrack_${chileToday()}.xlsx`,
  );
}

export async function downloadMonthlyAttendanceExcel(
  rows: MonthlyAttendanceSummaryRow[],
  mesYYYYMM: string,
  empresaNombre?: string,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const ExcelJSImport: any = await import('exceljs');
  const ExcelJS = ExcelJSImport.default || ExcelJSImport;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = empresaNombre || 'ObraTrack SaaS';
  workbook.created = new Date();

  const ws = workbook.addWorksheet(`Asistencia ${mesYYYYMM}`);
  ws.columns = [
    { header: 'Trabajador', key: 'trabajador', width: 28 },
    { header: 'Cargo', key: 'cargo', width: 22 },
    { header: 'Presentes', key: 'presentes', width: 12 },
    { header: 'Atrasos', key: 'atrasos', width: 12 },
    { header: 'Ausencias', key: 'ausentes', width: 12 },
    { header: 'Licencias/Perm.', key: 'licenciasPermisos', width: 15 },
    { header: 'Días Reg.', key: 'totalDias', width: 12 },
    { header: 'Total Horas', key: 'totalHoras', width: 14 },
    { header: 'Obras', key: 'obras', width: 36 },
  ];
  styleHeaderRow(ws.getRow(1));

  rows.forEach((r) => {
    ws.addRow({
      trabajador: sanitizeExcelCell(r.trabajador),
      cargo: sanitizeExcelCell(r.cargo),
      presentes: r.presentes,
      atrasos: r.atrasos,
      ausentes: r.ausentes,
      licenciasPermisos: r.licenciasPermisos,
      totalDias: r.totalDias,
      totalHoras: r.totalHoras,
      obras: sanitizeExcelCell(r.obras.join(' · ')),
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  triggerBlobDownload(
    new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `Planilla_Mensual_Asistencia_${mesYYYYMM}.xlsx`,
  );
}

export function downloadClientesCsv(clientes: Cliente[], proyectos: Proyecto[]): void {
  const headers = ['Nombre', 'RUT', 'Teléfono', 'Correo', 'Dirección', 'Obras Vigentes', 'Monto Contratado'];
  const rows = clientes.map((c) => {
    const projs = proyectos.filter((p) => p.cliente_id === c.id && p.estado !== 'cancelada');
    const total = projs.reduce((sum, p) => sum + Math.round(Number(p.monto_cotizado) || 0), 0);
    return [
      c.nombre,
      c.rut || '',
      c.telefono || '',
      c.email || '',
      c.direccion || '',
      projs.length,
      total,
    ]
      .map(csvCell)
      .join(',');
  });
  const csv = '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\n');
  triggerBlobDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    `Clientes_ObraTrack_${chileToday()}.csv`,
  );
}

export function downloadEquipoCsv(usuarios: Usuario[], proyectos: Proyecto[]): void {
  const headers = ['Nombre', 'RUT', 'Rol', 'Teléfono WhatsApp', 'Correo', 'Especialidades', 'Obras Asignadas'];
  const rows = usuarios.map((u) => {
    const assigned = proyectos
      .filter((p) => p.trabajadores_ids?.includes(u.id) && p.estado !== 'cancelada')
      .map((p) => p.nombre);
    return [
      u.nombre,
      u.rut || '',
      u.rol,
      u.telefono_whatsapp || '',
      u.email || '',
      Array.isArray(u.especialidades) ? u.especialidades.join(', ') : '',
      assigned.join(' · '),
    ]
      .map(csvCell)
      .join(',');
  });
  const csv = '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\n');
  triggerBlobDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    `Equipo_ObraTrack_${chileToday()}.csv`,
  );
}
