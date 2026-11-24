import { chileToday } from '@/lib/work-calendar';
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

export interface DailyAttendanceExcelRow {
  fecha: string;
  obra: string;
  trabajador: string;
  cargo: string;
  estado: string;
  hora_entrada: string;
  hora_salida: string;
  horas_trabajadas: number;
  origen: string;
}

export interface ProjectAttendanceExcelRow {
  fecha: string;
  trabajador: string;
  rol: string;
  estado: string;
  hora_entrada: string;
  hora_salida: string;
  horas_trabajadas: number;
  origen: string;
  registrado_por: string;
  observacion: string;
}

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CLP_FORMAT = '"$"#,##0';
const HOURS_FORMAT = '0.0" hrs"';
const FONT_FAMILY = 'Calibri';

const COLORS = {
  navyDark: 'FF141A23',
  navySlate: 'FF1E293B',
  orange: 'FFFF6A00',
  orangeSoft: 'FFFFF4EB',
  sand: 'FFFAF8F5',
  border: 'FFD9E1EC',
  borderDark: 'FF94A3B8',
  textMain: 'FF0F172A',
  textMuted: 'FF475569',
  white: 'FFFFFFFF',
  greenBg: 'FFDCFCE7',
  greenText: 'FF166534',
  amberBg: 'FFFEF3C7',
  amberText: 'FF92400E',
  redBg: 'FFFEE2E2',
  redText: 'FF991B1B',
  indigoBg: 'FFE0E7FF',
  indigoText: 'FF3730A3',
  slateBg: 'FFF1F5F9',
  slateText: 'FF334155',
};

const THIN_BORDER = {
  top: { style: 'thin' as const, color: { argb: COLORS.border } },
  left: { style: 'thin' as const, color: { argb: COLORS.border } },
  bottom: { style: 'thin' as const, color: { argb: COLORS.border } },
  right: { style: 'thin' as const, color: { argb: COLORS.border } },
};

export function sanitizeExcelCell(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  return /^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

async function createWorkbook(empresaNombre?: string) {
  const ExcelJSImport: any = await import('exceljs');
  const ExcelJS = ExcelJSImport.default || ExcelJSImport;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = empresaNombre || 'ObraTrack';
  workbook.created = new Date();
  workbook.modified = new Date();
  return workbook;
}

function columnLetter(colIndex: number): string {
  let n = colIndex;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

interface SheetColumnDef {
  header: string;
  key: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  numFmt?: string;
}

/**
 * Inicializa una hoja corporativa de ObraTrack:
 * - Fila 1: Banner de título oscuro con identidad ObraTrack
 * - Fila 2: Subtítulo y metadatos (empresa, obra/periodo, fecha) con acento naranja
 * - Fila 3: Separador limpio
 * - Fila 4: Encabezados de tabla estilizados + AutoFilter + Panel inmovilizado
 */
function setupBrandedSheet(
  workbook: any,
  options: {
    name: string;
    title: string;
    subtitle: string;
    columns: SheetColumnDef[];
    autoFilter?: boolean;
  },
) {
  const safeSheetName = options.name.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Hoja';
  const ws = workbook.addWorksheet(safeSheetName, {
    properties: { defaultRowHeight: 22 },
    pageSetup: {
      orientation: options.columns.length > 5 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 },
    },
  });

  const colCount = options.columns.length;
  const lastCol = columnLetter(colCount);

  ws.columns = options.columns.map((col) => ({ key: col.key, width: col.width }));

  // Fila 1: Banner principal
  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = sanitizeExcelCell(`OBRATRACK  ·  ${options.title}`);
  titleCell.font = { name: FONT_FAMILY, bold: true, size: 14, color: { argb: COLORS.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navyDark } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 32;

  // Fila 2: Metadatos + línea inferior naranja
  ws.mergeCells(`A2:${lastCol}2`);
  const subCell = ws.getCell('A2');
  subCell.value = sanitizeExcelCell(options.subtitle);
  subCell.font = { name: FONT_FAMILY, italic: true, size: 10, color: { argb: COLORS.textMuted } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sand } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 22;
  for (let c = 1; c <= colCount; c++) {
    ws.getRow(2).getCell(c).border = {
      bottom: { style: 'medium', color: { argb: COLORS.orange } },
    };
  }

  // Fila 3: Separador
  ws.getRow(3).height = 8;

  // Fila 4: Encabezados de tabla
  const headerRowIndex = 4;
  const headerRow = ws.getRow(headerRowIndex);
  headerRow.height = 26;
  options.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: FONT_FAMILY, bold: true, size: 10.5, color: { argb: COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navySlate } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col.align || 'left',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.navyDark } },
      bottom: { style: 'medium', color: { argb: COLORS.orange } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });

  ws.views = [{ state: 'frozen', ySplit: headerRowIndex, showGridLines: true }];
  if (options.autoFilter !== false) {
    ws.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex, column: colCount },
    };
  }

  return { ws, headerRowIndex, colCount };
}

function styleDataRow(
  row: any,
  columns: SheetColumnDef[],
  zebraIndex: number,
  options?: { bold?: boolean; highlightBg?: string },
) {
  row.height = 22;
  const bg = options?.highlightBg || (zebraIndex % 2 === 1 ? COLORS.sand : COLORS.white);
  columns.forEach((col, i) => {
    const cell = row.getCell(i + 1);
    cell.font = {
      name: FONT_FAMILY,
      size: 10,
      bold: options?.bold || false,
      color: { argb: COLORS.textMain },
    };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col.align || 'left',
      wrapText: true,
    };
    cell.border = THIN_BORDER;
    if (col.numFmt) cell.numFmt = col.numFmt;
  });
}

function styleStatusCell(cell: any, statusRaw: string) {
  const normalized = String(statusRaw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  let bg = COLORS.slateBg;
  let fg = COLORS.slateText;

  if (['presente', 'comprado', 'activo', 'en curso', 'terminado', 'completado', 'aprobada', 'aprobado'].includes(normalized)) {
    bg = COLORS.greenBg;
    fg = COLORS.greenText;
  } else if (['atraso', 'pendiente', 'en pausa', 'media', 'en_curso', 'en revision'].includes(normalized)) {
    bg = COLORS.amberBg;
    fg = COLORS.amberText;
  } else if (['ausente', 'cancelada', 'cancelado', 'rechazada', 'rechazado', 'alta', 'critica'].includes(normalized)) {
    bg = COLORS.redBg;
    fg = COLORS.redText;
  } else if (['licencia', 'permiso', 'whatsapp ia', 'whatsapp', 'admin', 'supervisor'].includes(normalized)) {
    bg = COLORS.indigoBg;
    fg = COLORS.indigoText;
  }

  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  cell.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: fg } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

function styleTotalsRow(row: any, columns: SheetColumnDef[]) {
  row.height = 26;
  columns.forEach((col, i) => {
    const cell = row.getCell(i + 1);
    cell.font = { name: FONT_FAMILY, size: 10.5, bold: true, color: { argb: COLORS.navyDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.orangeSoft } };
    cell.alignment = { vertical: 'middle', horizontal: col.align || 'left' };
    cell.border = {
      top: { style: 'medium', color: { argb: COLORS.orange } },
      bottom: { style: 'double', color: { argb: COLORS.navyDark } },
      left: { style: 'thin', color: { argb: COLORS.border } },
      right: { style: 'thin', color: { argb: COLORS.border } },
    };
    if (col.numFmt && cell.value != null && cell.value !== '') {
      cell.numFmt = col.numFmt;
    }
  });
}

function addEmptyNoticeRow(ws: any, colCount: number, message: string) {
  const row = ws.addRow([message]);
  ws.mergeCells(row.number, 1, row.number, colCount);
  row.height = 26;
  const cell = row.getCell(1);
  cell.font = { name: FONT_FAMILY, italic: true, size: 10, color: { argb: COLORS.textMuted } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sand } };
  cell.border = THIN_BORDER;
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

function downloadExcelBuffer(buffer: ArrayBuffer, filename: string) {
  triggerBlobDownload(new Blob([buffer], { type: EXCEL_MIME }), filename);
}

function roleLabel(rol: string): string {
  switch (rol) {
    case 'admin':
      return 'Administrador';
    case 'supervisor':
      return 'Supervisor';
    case 'terreno':
      return 'Terreno';
    default:
      return rol || 'Equipo';
  }
}

function attendanceStatusLabel(status: string): string {
  switch (status) {
    case 'presente':
      return 'Presente';
    case 'atraso':
      return 'Atraso';
    case 'ausente':
      return 'Ausente';
    case 'licencia':
      return 'Licencia';
    case 'permiso':
      return 'Permiso';
    default:
      return status;
  }
}

/**
 * Construye un libro Excel (.xlsx) completo y estilizado de control financiero y operativo de la obra.
 */
export async function buildProjectExcelBuffer(
  payload: ProjectExcelExportPayload,
): Promise<ArrayBuffer> {
  const workbook = await createWorkbook(payload.empresaNombre);
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

  const fechaEmision = chileToday();
  const subtitleBase = `${empresaNombre}  |  Obra: ${proyecto.nombre}  |  Emitido: ${fechaEmision}`;

  const montoCotizado = Math.round(Number(proyecto.monto_cotizado) || 0);
  const totalPagado = pagos
    .filter((p) => !p.estado || p.estado === 'completado')
    .reduce((s, p) => s + Math.round(Number(p.monto) || 0), 0);
  const totalMateriales = materiales.reduce(
    (s, m) => s + Math.round(Number(m.subtotal || m.cantidad * m.precio_unitario) || 0),
    0,
  );
  const totalImprevistos = imprevistos.reduce(
    (s, i) => s + Math.round(Number(i.monto ?? i.monto_adicional) || 0),
    0,
  );
  const saldoPorCobrar = Math.max(0, montoCotizado - totalPagado);
  const costosDirectos = totalMateriales + totalImprevistos;
  const margenEstimado = montoCotizado - costosDirectos;

  // 1. Hoja Resumen de Obra
  const resumenCols: SheetColumnDef[] = [
    { header: 'Indicador / Campo', key: 'campo', width: 38, align: 'left' },
    { header: 'Valor / Detalle', key: 'valor', width: 42, align: 'left' },
  ];
  const { ws: wsResumen } = setupBrandedSheet(workbook, {
    name: 'Resumen de Obra',
    title: `Cartola de Obra — ${proyecto.nombre}`,
    subtitle: `${empresaNombre}  |  Mandante: ${cliente?.nombre || 'No asignado'}  |  Emitido: ${fechaEmision}`,
    columns: resumenCols,
    autoFilter: false,
  });

  const resumenRows: Array<[string, string | number, boolean?, boolean?]> = [
    ['Constructora', sanitizeExcelCell(empresaNombre)],
    ['Obra / Proyecto', sanitizeExcelCell(proyecto.nombre)],
    ['Mandante / Cliente', sanitizeExcelCell(cliente?.nombre || 'No asignado')],
    ['Ubicación', sanitizeExcelCell([proyecto.direccion, proyecto.comuna, proyecto.region].filter(Boolean).join(', ') || 'Chile')],
    ['Estado Operativo', sanitizeExcelCell(projectStatusLabel(proyecto.estado))],
    ['Fecha Inicio', sanitizeExcelCell(proyecto.fecha_inicio)],
    ['Fecha Término Estimada', sanitizeExcelCell(proyecto.fecha_termino_estimada)],
    ['Avance Físico Ponderado (%)', `${Math.round(Number(proyecto.porcentaje_avance_ponderado) || 0)}%`],
    ['Presupuesto Contratado (IVA incl.)', montoCotizado, true],
    ['Total Recaudado (Pagos)', totalPagado, true],
    ['Saldo Pendiente por Cobrar', saldoPorCobrar, true],
    ['Costo Materiales Proyectados', totalMateriales, true],
    ['Costo Imprevistos Reportados', totalImprevistos, true],
    ['Total Costos Directos Registrados', costosDirectos, true],
    ['Saldo tras materiales e imprevistos', margenEstimado, true, true],
  ];

  resumenRows.forEach(([campo, valor, isCurrency, isHighlight], idx) => {
    const r = wsResumen.addRow({ campo, valor });
    styleDataRow(r, resumenCols, idx, {
      bold: Boolean(isHighlight),
      highlightBg: isHighlight ? COLORS.orangeSoft : undefined,
    });
    r.getCell(1).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.navyDark } };
    if (isCurrency) {
      r.getCell(2).numFmt = CLP_FORMAT;
      r.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      r.getCell(2).font = {
        name: FONT_FAMILY,
        size: isHighlight ? 11 : 10,
        bold: true,
        color: { argb: isHighlight && Number(valor) < 0 ? COLORS.redText : COLORS.navyDark },
      };
    }
    if (campo === 'Estado Operativo') {
      styleStatusCell(r.getCell(2), String(valor));
    }
    if (isHighlight) {
      styleTotalsRow(r, [resumenCols[0], { ...resumenCols[1], align: 'right', numFmt: CLP_FORMAT }]);
    }
  });

  // 2. Hoja Pagos e Ingresos
  const pagosCols: SheetColumnDef[] = [
    { header: 'Fecha', key: 'fecha', width: 16, align: 'center' },
    { header: 'Método', key: 'metodo', width: 20, align: 'left' },
    { header: 'Monto (CLP)', key: 'monto', width: 20, align: 'right', numFmt: CLP_FORMAT },
    { header: 'Glosa / Nota', key: 'nota', width: 46, align: 'left' },
  ];
  const { ws: wsPagos, headerRowIndex: pagosHeader } = setupBrandedSheet(workbook, {
    name: 'Pagos e Ingresos',
    title: 'Estados de Pago e Ingresos',
    subtitle: subtitleBase,
    columns: pagosCols,
  });
  if (!pagos.length) {
    addEmptyNoticeRow(wsPagos, pagosCols.length, 'Sin pagos registrados en esta obra.');
  } else {
    pagos.forEach((p, idx) => {
      const r = wsPagos.addRow({
        fecha: sanitizeExcelCell(p.fecha),
        metodo: sanitizeExcelCell(p.metodo),
        monto: Math.round(Number(p.monto) || 0),
        nota: sanitizeExcelCell(p.nota || p.notas || ''),
      });
      styleDataRow(r, pagosCols, idx);
    });
    const lastData = pagosHeader + pagos.length;
    const totalRow = wsPagos.addRow({
      fecha: '',
      metodo: 'TOTAL RECAUDADO',
      monto: { formula: `SUM(C${pagosHeader + 1}:C${lastData})`, result: totalPagado },
      nota: `${pagos.length} ${pagos.length === 1 ? 'pago registrado' : 'pagos registrados'}`,
    });
    styleTotalsRow(totalRow, pagosCols);
  }

  // 3. Hoja Materiales
  const matCols: SheetColumnDef[] = [
    { header: 'Material / Insumo', key: 'nombre', width: 34, align: 'left' },
    { header: 'Categoría', key: 'categoria', width: 22, align: 'left' },
    { header: 'Proveedor', key: 'proveedor', width: 22, align: 'left' },
    { header: 'Cantidad', key: 'cantidad', width: 12, align: 'right' },
    { header: 'Unidad', key: 'unidad', width: 12, align: 'center' },
    { header: 'Precio Unitario', key: 'pu', width: 18, align: 'right', numFmt: CLP_FORMAT },
    { header: 'Subtotal', key: 'subtotal', width: 18, align: 'right', numFmt: CLP_FORMAT },
    { header: 'Estado Compra', key: 'estado', width: 16, align: 'center' },
  ];
  const { ws: wsMat, headerRowIndex: matHeader } = setupBrandedSheet(workbook, {
    name: 'Materiales',
    title: 'Cubicación y Materiales de Obra',
    subtitle: subtitleBase,
    columns: matCols,
  });
  if (!materiales.length) {
    addEmptyNoticeRow(wsMat, matCols.length, 'Sin materiales registrados en esta obra.');
  } else {
    materiales.forEach((m, idx) => {
      const pu = Math.round(Number(m.precio_unitario) || 0);
      const sub = Math.round(Number(m.subtotal || m.cantidad * pu) || 0);
      const estado = m.comprado ? 'Comprado' : 'Pendiente';
      const r = wsMat.addRow({
        nombre: sanitizeExcelCell(m.nombre),
        categoria: sanitizeExcelCell(m.categoria || 'General'),
        proveedor: sanitizeExcelCell(m.proveedor || 'Por definir'),
        cantidad: m.cantidad,
        unidad: sanitizeExcelCell(m.unidad),
        pu,
        subtotal: sub,
        estado,
      });
      styleDataRow(r, matCols, idx);
      styleStatusCell(r.getCell(8), estado);
    });
    const lastData = matHeader + materiales.length;
    const totalRow = wsMat.addRow({
      nombre: 'TOTAL MATERIALES',
      categoria: '',
      proveedor: `${materiales.length} ítems`,
      cantidad: '',
      unidad: '',
      pu: '',
      subtotal: { formula: `SUM(G${matHeader + 1}:G${lastData})`, result: totalMateriales },
      estado: '',
    });
    styleTotalsRow(totalRow, matCols);
  }

  // 4. Hoja Imprevistos
  const impCols: SheetColumnDef[] = [
    { header: 'Fecha', key: 'fecha', width: 16, align: 'center' },
    { header: 'Origen', key: 'origen', width: 16, align: 'center' },
    { header: 'Monto (CLP)', key: 'monto', width: 20, align: 'right', numFmt: CLP_FORMAT },
    { header: 'Descripción', key: 'descripcion', width: 50, align: 'left' },
  ];
  const { ws: wsImp, headerRowIndex: impHeader } = setupBrandedSheet(workbook, {
    name: 'Imprevistos',
    title: 'Imprevistos y Adicionales',
    subtitle: subtitleBase,
    columns: impCols,
  });
  if (!imprevistos.length) {
    addEmptyNoticeRow(wsImp, impCols.length, 'Sin imprevistos registrados en esta obra.');
  } else {
    imprevistos.forEach((imp, idx) => {
      const origenLabel = imp.origen === 'whatsapp_ia' ? 'WhatsApp IA' : 'Manual';
      const r = wsImp.addRow({
        fecha: sanitizeExcelCell(imp.fecha),
        origen: origenLabel,
        monto: Math.round(Number(imp.monto ?? imp.monto_adicional) || 0),
        descripcion: sanitizeExcelCell(imp.descripcion),
      });
      styleDataRow(r, impCols, idx);
      styleStatusCell(r.getCell(2), origenLabel);
    });
    const lastData = impHeader + imprevistos.length;
    const totalRow = wsImp.addRow({
      fecha: '',
      origen: 'TOTAL IMPREVISTOS',
      monto: { formula: `SUM(C${impHeader + 1}:C${lastData})`, result: totalImprevistos },
      descripcion: `${imprevistos.length} registros`,
    });
    styleTotalsRow(totalRow, impCols);
  }

  // 5. Hoja Gantt y Asistencia
  const opCols: SheetColumnDef[] = [
    { header: 'Tipo Registro', key: 'tipo', width: 18, align: 'center' },
    { header: 'Partida / Trabajador', key: 'nombre', width: 34, align: 'left' },
    { header: 'Fecha / Plazo', key: 'fecha', width: 26, align: 'center' },
    { header: 'Estado', key: 'estado', width: 16, align: 'center' },
    { header: 'Avance / Horas', key: 'metrica', width: 18, align: 'right' },
  ];
  const { ws: wsOperacion } = setupBrandedSheet(workbook, {
    name: 'Gantt y Asistencia',
    title: 'Control Operativo — Carta Gantt y Asistencia',
    subtitle: subtitleBase,
    columns: opCols,
  });
  let opIdx = 0;
  actividades.forEach((a) => {
    const r = wsOperacion.addRow({
      tipo: 'Partida Gantt',
      nombre: sanitizeExcelCell(a.nombre),
      fecha: sanitizeExcelCell(`${a.fecha_inicio} -> ${a.fecha_termino}`),
      estado: sanitizeExcelCell(a.estado),
      metrica: `${a.porcentaje_avance}%`,
    });
    styleDataRow(r, opCols, opIdx++);
    styleStatusCell(r.getCell(4), a.estado);
  });
  asistencias.forEach((asist) => {
    const label = attendanceStatusLabel(asist.estado);
    const r = wsOperacion.addRow({
      tipo: 'Asistencia',
      nombre: sanitizeExcelCell(asist.trabajador_nombre),
      fecha: sanitizeExcelCell(asist.fecha),
      estado: label,
      metrica: `${asist.horas_trabajadas || 0} hrs`,
    });
    styleDataRow(r, opCols, opIdx++);
    styleStatusCell(r.getCell(4), label);
  });
  if (opIdx === 0) {
    addEmptyNoticeRow(wsOperacion, opCols.length, 'Sin actividades ni registros de asistencia.');
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/**
 * Genera y descarga en el navegador la Cartola Financiera y Operativa en formato .xlsx
 */
export async function downloadProjectExcel(payload: ProjectExcelExportPayload): Promise<void> {
  if (typeof window === 'undefined') return;
  const buffer = await buildProjectExcelBuffer(payload);
  const safeName = payload.proyecto.nombre.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'Obra';
  downloadExcelBuffer(buffer, `Cartola_ObraTrack_${safeName}_${chileToday()}.xlsx`);
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

export async function buildPortfolioExcelBuffer(payload: {
  empresaNombre?: string;
  proyectos: Proyecto[];
  clientes: Cliente[];
  materiales: MaterialProyecto[];
  imprevistos: Imprevisto[];
  pagos: Pago[];
  reclamos: ReclamoCambioObra[];
}): Promise<ArrayBuffer> {
  const empresaNombre = payload.empresaNombre || 'Constructora ObraTrack';
  const fechaEmision = chileToday();
  const workbook = await createWorkbook(empresaNombre);
  const clientMap = new Map(payload.clientes.map((c) => [c.id, c.nombre]));
  const activeProjects = payload.proyectos.filter((p) => p.estado !== 'cancelada');

  const totalCotizado = activeProjects.reduce((s, p) => s + Math.round(Number(p.monto_cotizado) || 0), 0);
  const totalPagado = payload.pagos
    .filter((p) => !p.estado || p.estado === 'completado')
    .reduce((s, p) => s + Math.round(Number(p.monto) || 0), 0);
  const totalMats = payload.materiales.reduce(
    (s, m) => s + Math.round(Number(m.subtotal || m.cantidad * m.precio_unitario) || 0),
    0,
  );
  const totalImps = payload.imprevistos.reduce(
    (s, i) => s + Math.round(Number(i.monto ?? i.monto_adicional) || 0),
    0,
  );

  // 1. Resumen Cartera
  const resCols: SheetColumnDef[] = [
    { header: 'Indicador Ejecutivo', key: 'indicador', width: 38, align: 'left' },
    { header: 'Valor', key: 'valor', width: 34, align: 'left' },
  ];
  const { ws: wsResumen } = setupBrandedSheet(workbook, {
    name: 'Resumen Cartera',
    title: 'Resumen Ejecutivo de Cartera de Obras',
    subtitle: `${empresaNombre}  |  Emitido: ${fechaEmision}`,
    columns: resCols,
    autoFilter: false,
  });

  const summaryRows: Array<[string, string | number, boolean?, boolean?]> = [
    ['Constructora', sanitizeExcelCell(empresaNombre)],
    ['Fecha de emisión', fechaEmision],
    ['Obras activas en curso', activeProjects.filter((p) => p.estado === 'activo').length],
    ['Obras totales vigentes', activeProjects.length],
    ['Total Contratado (IVA incl.)', Math.round(totalCotizado), true],
    ['Total Cobrado', Math.round(totalPagado), true],
    ['Saldo por Cobrar', Math.max(0, Math.round(totalCotizado - totalPagado)), true],
    ['Costos Directos Acumulados', Math.round(totalMats + totalImps), true],
    ['Margen Bruto Cartera', Math.round(totalCotizado - (totalMats + totalImps)), true, true],
  ];

  summaryRows.forEach(([ind, val, isClp, isHighlight], idx) => {
    const row = wsResumen.addRow({ indicador: ind, valor: val });
    styleDataRow(row, resCols, idx, { bold: Boolean(isHighlight) });
    row.getCell(1).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.navyDark } };
    if (isClp) {
      row.getCell(2).numFmt = CLP_FORMAT;
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(2).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.navyDark } };
    }
    if (isHighlight) {
      styleTotalsRow(row, [resCols[0], { ...resCols[1], align: 'right', numFmt: CLP_FORMAT }]);
    }
  });

  // 2. Obras y Rentabilidad
  const obrasCols: SheetColumnDef[] = [
    { header: 'Obra', key: 'nombre', width: 30, align: 'left' },
    { header: 'Mandante', key: 'cliente', width: 24, align: 'left' },
    { header: 'Comuna', key: 'comuna', width: 18, align: 'left' },
    { header: 'Estado', key: 'estado', width: 15, align: 'center' },
    { header: 'Avance', key: 'avance', width: 12, align: 'center' },
    { header: 'Contratado', key: 'cotizado', width: 18, align: 'right', numFmt: CLP_FORMAT },
    { header: 'Cobrado', key: 'cobrado', width: 18, align: 'right', numFmt: CLP_FORMAT },
    { header: 'Costos Directos', key: 'costos', width: 18, align: 'right', numFmt: CLP_FORMAT },
    { header: 'Margen Estimado', key: 'margen', width: 18, align: 'right', numFmt: CLP_FORMAT },
  ];
  const { ws: wsObras, headerRowIndex: obrasHeader } = setupBrandedSheet(workbook, {
    name: 'Obras y Rentabilidad',
    title: 'Cartera de Obras y Rentabilidad',
    subtitle: `${empresaNombre}  |  ${activeProjects.length} obras vigentes  |  Emitido: ${fechaEmision}`,
    columns: obrasCols,
  });

  if (!activeProjects.length) {
    addEmptyNoticeRow(wsObras, obrasCols.length, 'No hay obras vigentes registradas.');
  } else {
    let sumCot = 0;
    let sumCob = 0;
    let sumCos = 0;
    activeProjects.forEach((p, idx) => {
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
      sumCot += cotizado;
      sumCob += cobrado;
      sumCos += costos;
      const estadoLabel = projectStatusLabel(p.estado);
      const row = wsObras.addRow({
        nombre: sanitizeExcelCell(p.nombre),
        cliente: sanitizeExcelCell((p.cliente_id && clientMap.get(p.cliente_id)) || 'Sin asignar'),
        comuna: sanitizeExcelCell(p.comuna || ''),
        estado: estadoLabel,
        avance: `${Math.round(Number(p.porcentaje_avance_ponderado) || 0)}%`,
        cotizado,
        cobrado,
        costos,
        margen: cotizado - costos,
      });
      styleDataRow(row, obrasCols, idx);
      styleStatusCell(row.getCell(4), estadoLabel);
    });
    const lastData = obrasHeader + activeProjects.length;
    const totalRow = wsObras.addRow({
      nombre: 'TOTAL CARTERA',
      cliente: `${activeProjects.length} obras`,
      comuna: '',
      estado: '',
      avance: '',
      cotizado: { formula: `SUM(F${obrasHeader + 1}:F${lastData})`, result: sumCot },
      cobrado: { formula: `SUM(G${obrasHeader + 1}:G${lastData})`, result: sumCob },
      costos: { formula: `SUM(H${obrasHeader + 1}:H${lastData})`, result: sumCos },
      margen: { formula: `SUM(I${obrasHeader + 1}:I${lastData})`, result: sumCot - sumCos },
    });
    styleTotalsRow(totalRow, obrasCols);
  }

  // 3. Reclamos y Cambios
  const recCols: SheetColumnDef[] = [
    { header: 'Obra', key: 'obra', width: 28, align: 'left' },
    { header: 'Tipo', key: 'tipo', width: 18, align: 'left' },
    { header: 'Título', key: 'titulo', width: 34, align: 'left' },
    { header: 'Prioridad', key: 'prioridad', width: 14, align: 'center' },
    { header: 'Estado', key: 'estado', width: 16, align: 'center' },
    { header: 'Impacto Monto', key: 'monto', width: 18, align: 'right', numFmt: CLP_FORMAT },
    { header: 'Impacto Días', key: 'dias', width: 14, align: 'right' },
  ];
  const { ws: wsReclamos, headerRowIndex: recHeader } = setupBrandedSheet(workbook, {
    name: 'Reclamos y Cambios',
    title: 'Reclamos y Órdenes de Cambio',
    subtitle: `${empresaNombre}  |  Emitido: ${fechaEmision}`,
    columns: recCols,
  });
  const projMap = new Map(payload.proyectos.map((p) => [p.id, p.nombre]));
  if (!payload.reclamos.length) {
    addEmptyNoticeRow(wsReclamos, recCols.length, 'Sin reclamos ni órdenes de cambio registradas.');
  } else {
    let sumImpacto = 0;
    let sumDias = 0;
    payload.reclamos.forEach((r, idx) => {
      const monto = Math.round(Number(r.impacto_monto) || 0);
      const dias = Number(r.impacto_dias) || 0;
      sumImpacto += monto;
      sumDias += dias;
      const row = wsReclamos.addRow({
        obra: sanitizeExcelCell(projMap.get(r.proyecto_id) || r.proyecto_id),
        tipo: sanitizeExcelCell(r.tipo),
        titulo: sanitizeExcelCell(r.titulo),
        prioridad: sanitizeExcelCell(r.prioridad),
        estado: sanitizeExcelCell(r.estado),
        monto,
        dias,
      });
      styleDataRow(row, recCols, idx);
      styleStatusCell(row.getCell(4), r.prioridad);
      styleStatusCell(row.getCell(5), r.estado);
    });
    const lastData = recHeader + payload.reclamos.length;
    const totalRow = wsReclamos.addRow({
      obra: 'TOTAL IMPACTOS',
      tipo: '',
      titulo: `${payload.reclamos.length} registros`,
      prioridad: '',
      estado: '',
      monto: { formula: `SUM(F${recHeader + 1}:F${lastData})`, result: sumImpacto },
      dias: { formula: `SUM(G${recHeader + 1}:G${lastData})`, result: sumDias },
    });
    styleTotalsRow(totalRow, recCols);
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
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
  const buffer = await buildPortfolioExcelBuffer(payload);
  downloadExcelBuffer(buffer, `Cartera_ObraTrack_${chileToday()}.xlsx`);
}

export async function buildMonthlyAttendanceExcelBuffer(
  rows: MonthlyAttendanceSummaryRow[],
  mesYYYYMM: string,
  empresaNombre?: string,
): Promise<ArrayBuffer> {
  const company = empresaNombre || 'Constructora ObraTrack';
  const workbook = await createWorkbook(company);
  const cols: SheetColumnDef[] = [
    { header: 'Trabajador', key: 'trabajador', width: 28, align: 'left' },
    { header: 'Cargo / Rol', key: 'cargo', width: 22, align: 'left' },
    { header: 'Presentes', key: 'presentes', width: 13, align: 'center' },
    { header: 'Atrasos', key: 'atrasos', width: 12, align: 'center' },
    { header: 'Ausencias', key: 'ausentes', width: 13, align: 'center' },
    { header: 'Lic. / Perm.', key: 'licenciasPermisos', width: 14, align: 'center' },
    { header: 'Días Reg.', key: 'totalDias', width: 13, align: 'center' },
    { header: 'Total Horas', key: 'totalHoras', width: 15, align: 'right', numFmt: HOURS_FORMAT },
    { header: 'Obras', key: 'obras', width: 38, align: 'left' },
  ];

  const { ws, headerRowIndex } = setupBrandedSheet(workbook, {
    name: `Asistencia ${mesYYYYMM}`,
    title: `Consolidado Mensual de Asistencia (${mesYYYYMM})`,
    subtitle: `${company}  |  ${rows.length} ${rows.length === 1 ? 'trabajador' : 'trabajadores'}  |  Emitido: ${chileToday()}`,
    columns: cols,
  });

  if (!rows.length) {
    addEmptyNoticeRow(ws, cols.length, 'Sin registros de asistencia para el periodo seleccionado.');
  } else {
    rows.forEach((r, idx) => {
      const row = ws.addRow({
        trabajador: sanitizeExcelCell(r.trabajador),
        cargo: sanitizeExcelCell(r.cargo),
        presentes: r.presentes,
        atrasos: r.atrasos,
        ausentes: r.ausentes,
        licenciasPermisos: r.licenciasPermisos,
        totalDias: r.totalDias,
        totalHoras: Number(r.totalHoras) || 0,
        obras: sanitizeExcelCell(r.obras.join(' · ')),
      });
      styleDataRow(row, cols, idx);
      row.getCell(1).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.navyDark } };
      if (r.presentes > 0) row.getCell(3).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.greenText } };
      if (r.atrasos > 0) row.getCell(4).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.amberText } };
      if (r.ausentes > 0) row.getCell(5).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.redText } };
    });

    const lastData = headerRowIndex + rows.length;
    const totalRow = ws.addRow({
      trabajador: 'TOTALES DEL MES',
      cargo: `${rows.length} personas`,
      presentes: { formula: `SUM(C${headerRowIndex + 1}:C${lastData})`, result: rows.reduce((a, r) => a + r.presentes, 0) },
      atrasos: { formula: `SUM(D${headerRowIndex + 1}:D${lastData})`, result: rows.reduce((a, r) => a + r.atrasos, 0) },
      ausentes: { formula: `SUM(E${headerRowIndex + 1}:E${lastData})`, result: rows.reduce((a, r) => a + r.ausentes, 0) },
      licenciasPermisos: { formula: `SUM(F${headerRowIndex + 1}:F${lastData})`, result: rows.reduce((a, r) => a + r.licenciasPermisos, 0) },
      totalDias: { formula: `SUM(G${headerRowIndex + 1}:G${lastData})`, result: rows.reduce((a, r) => a + r.totalDias, 0) },
      totalHoras: { formula: `SUM(H${headerRowIndex + 1}:H${lastData})`, result: rows.reduce((a, r) => a + (Number(r.totalHoras) || 0), 0) },
      obras: '',
    });
    styleTotalsRow(totalRow, cols);
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function downloadMonthlyAttendanceExcel(
  rows: MonthlyAttendanceSummaryRow[],
  mesYYYYMM: string,
  empresaNombre?: string,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const buffer = await buildMonthlyAttendanceExcelBuffer(rows, mesYYYYMM, empresaNombre);
  downloadExcelBuffer(buffer, `Planilla_Mensual_Asistencia_${mesYYYYMM}.xlsx`);
}

export async function buildDailyAttendanceExcelBuffer(
  rows: DailyAttendanceExcelRow[],
  fechaLabel: string,
  empresaNombre?: string,
): Promise<ArrayBuffer> {
  const company = empresaNombre || 'Constructora ObraTrack';
  const workbook = await createWorkbook(company);
  const cols: SheetColumnDef[] = [
    { header: 'Fecha', key: 'fecha', width: 14, align: 'center' },
    { header: 'Obra', key: 'obra', width: 28, align: 'left' },
    { header: 'Trabajador', key: 'trabajador', width: 26, align: 'left' },
    { header: 'Cargo', key: 'cargo', width: 20, align: 'left' },
    { header: 'Estado', key: 'estado', width: 14, align: 'center' },
    { header: 'Entrada', key: 'hora_entrada', width: 12, align: 'center' },
    { header: 'Salida', key: 'hora_salida', width: 12, align: 'center' },
    { header: 'Horas', key: 'horas_trabajadas', width: 14, align: 'right', numFmt: HOURS_FORMAT },
    { header: 'Origen', key: 'origen', width: 14, align: 'center' },
  ];

  const { ws, headerRowIndex } = setupBrandedSheet(workbook, {
    name: `Asistencia ${fechaLabel}`,
    title: `Registro Diario de Asistencia (${fechaLabel})`,
    subtitle: `${company}  |  ${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}  |  Emitido: ${chileToday()}`,
    columns: cols,
  });

  if (!rows.length) {
    addEmptyNoticeRow(ws, cols.length, 'Sin marcajes de asistencia para la fecha seleccionada.');
  } else {
    rows.forEach((r, idx) => {
      const label = attendanceStatusLabel(r.estado);
      const row = ws.addRow({
        fecha: sanitizeExcelCell(r.fecha),
        obra: sanitizeExcelCell(r.obra),
        trabajador: sanitizeExcelCell(r.trabajador),
        cargo: sanitizeExcelCell(r.cargo),
        estado: label,
        hora_entrada: sanitizeExcelCell(r.hora_entrada || '—'),
        hora_salida: sanitizeExcelCell(r.hora_salida || '—'),
        horas_trabajadas: Number(r.horas_trabajadas) || 0,
        origen: sanitizeExcelCell(r.origen === 'whatsapp' ? 'WhatsApp' : 'Web'),
      });
      styleDataRow(row, cols, idx);
      row.getCell(3).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.navyDark } };
      styleStatusCell(row.getCell(5), label);
    });

    const lastData = headerRowIndex + rows.length;
    const totalRow = ws.addRow({
      fecha: 'TOTAL',
      obra: `${rows.length} marcajes`,
      trabajador: '',
      cargo: '',
      estado: '',
      hora_entrada: '',
      hora_salida: '',
      horas_trabajadas: {
        formula: `SUM(H${headerRowIndex + 1}:H${lastData})`,
        result: rows.reduce((acc, r) => acc + (Number(r.horas_trabajadas) || 0), 0),
      },
      origen: '',
    });
    styleTotalsRow(totalRow, cols);
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function downloadDailyAttendanceExcel(
  rows: DailyAttendanceExcelRow[],
  fechaLabel: string,
  empresaNombre?: string,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const buffer = await buildDailyAttendanceExcelBuffer(rows, fechaLabel, empresaNombre);
  downloadExcelBuffer(buffer, `Asistencia_ObraTrack_${fechaLabel}.xlsx`);
}

export async function buildProjectAttendanceExcelBuffer(
  rows: ProjectAttendanceExcelRow[],
  projectName: string,
  empresaNombre?: string,
): Promise<ArrayBuffer> {
  const company = empresaNombre || 'Constructora ObraTrack';
  const workbook = await createWorkbook(company);
  const cols: SheetColumnDef[] = [
    { header: 'Fecha', key: 'fecha', width: 14, align: 'center' },
    { header: 'Trabajador', key: 'trabajador', width: 26, align: 'left' },
    { header: 'Rol / Cargo', key: 'rol', width: 20, align: 'left' },
    { header: 'Estado', key: 'estado', width: 14, align: 'center' },
    { header: 'Entrada', key: 'hora_entrada', width: 12, align: 'center' },
    { header: 'Salida', key: 'hora_salida', width: 12, align: 'center' },
    { header: 'Horas', key: 'horas_trabajadas', width: 14, align: 'right', numFmt: HOURS_FORMAT },
    { header: 'Origen', key: 'origen', width: 13, align: 'center' },
    { header: 'Registrado por', key: 'registrado_por', width: 22, align: 'left' },
    { header: 'Observación', key: 'observacion', width: 34, align: 'left' },
  ];

  const { ws, headerRowIndex } = setupBrandedSheet(workbook, {
    name: 'Asistencia de Obra',
    title: `Historial de Asistencia — ${projectName}`,
    subtitle: `${company}  |  ${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}  |  Emitido: ${chileToday()}`,
    columns: cols,
  });

  if (!rows.length) {
    addEmptyNoticeRow(ws, cols.length, 'Sin registros de asistencia en esta obra.');
  } else {
    rows.forEach((r, idx) => {
      const label = attendanceStatusLabel(r.estado);
      const row = ws.addRow({
        fecha: sanitizeExcelCell(r.fecha),
        trabajador: sanitizeExcelCell(r.trabajador),
        rol: sanitizeExcelCell(r.rol),
        estado: label,
        hora_entrada: sanitizeExcelCell(r.hora_entrada || '—'),
        hora_salida: sanitizeExcelCell(r.hora_salida || '—'),
        horas_trabajadas: Number(r.horas_trabajadas) || 0,
        origen: sanitizeExcelCell(r.origen === 'whatsapp' ? 'WhatsApp' : 'Web'),
        registrado_por: sanitizeExcelCell(r.registrado_por),
        observacion: sanitizeExcelCell(r.observacion),
      });
      styleDataRow(row, cols, idx);
      row.getCell(2).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.navyDark } };
      styleStatusCell(row.getCell(4), label);
    });

    const lastData = headerRowIndex + rows.length;
    const totalRow = ws.addRow({
      fecha: 'TOTAL',
      trabajador: `${rows.length} registros`,
      rol: '',
      estado: '',
      hora_entrada: '',
      hora_salida: '',
      horas_trabajadas: {
        formula: `SUM(G${headerRowIndex + 1}:G${lastData})`,
        result: rows.reduce((acc, r) => acc + (Number(r.horas_trabajadas) || 0), 0),
      },
      origen: '',
      registrado_por: '',
      observacion: '',
    });
    styleTotalsRow(totalRow, cols);
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function downloadProjectAttendanceExcel(
  rows: ProjectAttendanceExcelRow[],
  projectName: string,
  empresaNombre?: string,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const buffer = await buildProjectAttendanceExcelBuffer(rows, projectName, empresaNombre);
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'Obra';
  downloadExcelBuffer(buffer, `Asistencia_${safeName}_${chileToday()}.xlsx`);
}

export async function buildClientesExcelBuffer(
  clientes: Cliente[],
  proyectos: Proyecto[],
  empresaNombre?: string,
): Promise<ArrayBuffer> {
  const company = empresaNombre || 'Constructora ObraTrack';
  const workbook = await createWorkbook(company);
  const cols: SheetColumnDef[] = [
    { header: 'Cliente / Mandante', key: 'nombre', width: 28, align: 'left' },
    { header: 'RUT', key: 'rut', width: 16, align: 'center' },
    { header: 'Teléfono', key: 'telefono', width: 18, align: 'center' },
    { header: 'Correo', key: 'correo', width: 28, align: 'left' },
    { header: 'Dirección', key: 'direccion', width: 32, align: 'left' },
    { header: 'Obras Vigentes', key: 'obras', width: 16, align: 'center' },
    { header: 'Monto Contratado', key: 'monto', width: 20, align: 'right', numFmt: CLP_FORMAT },
  ];

  const { ws, headerRowIndex } = setupBrandedSheet(workbook, {
    name: 'Clientes',
    title: 'Directorio de Clientes y Contratos',
    subtitle: `${company}  |  ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}  |  Emitido: ${chileToday()}`,
    columns: cols,
  });

  if (!clientes.length) {
    addEmptyNoticeRow(ws, cols.length, 'No hay clientes registrados.');
  } else {
    let sumObras = 0;
    let sumMonto = 0;
    clientes.forEach((c, idx) => {
      const projs = proyectos.filter((p) => p.cliente_id === c.id && p.estado !== 'cancelada');
      const total = projs.reduce((sum, p) => sum + Math.round(Number(p.monto_cotizado) || 0), 0);
      sumObras += projs.length;
      sumMonto += total;
      const row = ws.addRow({
        nombre: sanitizeExcelCell(c.nombre),
        rut: sanitizeExcelCell(c.rut || '—'),
        telefono: sanitizeExcelCell(c.telefono || '—'),
        correo: sanitizeExcelCell(c.email || '—'),
        direccion: sanitizeExcelCell(c.direccion || '—'),
        obras: projs.length,
        monto: total,
      });
      styleDataRow(row, cols, idx);
      row.getCell(1).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.navyDark } };
    });

    const lastData = headerRowIndex + clientes.length;
    const totalRow = ws.addRow({
      nombre: 'TOTAL CARTERA CLIENTES',
      rut: '',
      telefono: '',
      correo: `${clientes.length} clientes`,
      direccion: '',
      obras: { formula: `SUM(F${headerRowIndex + 1}:F${lastData})`, result: sumObras },
      monto: { formula: `SUM(G${headerRowIndex + 1}:G${lastData})`, result: sumMonto },
    });
    styleTotalsRow(totalRow, cols);
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function downloadClientesExcel(
  clientes: Cliente[],
  proyectos: Proyecto[],
  empresaNombre?: string,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const buffer = await buildClientesExcelBuffer(clientes, proyectos, empresaNombre);
  downloadExcelBuffer(buffer, `Clientes_ObraTrack_${chileToday()}.xlsx`);
}

export async function buildEquipoExcelBuffer(
  usuarios: Usuario[],
  proyectos: Proyecto[],
  empresaNombre?: string,
): Promise<ArrayBuffer> {
  const company = empresaNombre || 'Constructora ObraTrack';
  const workbook = await createWorkbook(company);
  const cols: SheetColumnDef[] = [
    { header: 'Nombre Completo', key: 'nombre', width: 28, align: 'left' },
    { header: 'RUT', key: 'rut', width: 16, align: 'center' },
    { header: 'Rol', key: 'rol', width: 16, align: 'center' },
    { header: 'Teléfono WhatsApp', key: 'telefono', width: 20, align: 'center' },
    { header: 'Correo', key: 'correo', width: 28, align: 'left' },
    { header: 'Especialidades', key: 'especialidades', width: 28, align: 'left' },
    { header: 'Obras Asignadas', key: 'obras', width: 34, align: 'left' },
  ];

  const { ws } = setupBrandedSheet(workbook, {
    name: 'Equipo de Faena',
    title: 'Nómina de Equipo y Asignación de Obras',
    subtitle: `${company}  |  ${usuarios.length} ${usuarios.length === 1 ? 'integrante' : 'integrantes'}  |  Emitido: ${chileToday()}`,
    columns: cols,
  });

  if (!usuarios.length) {
    addEmptyNoticeRow(ws, cols.length, 'No hay integrantes registrados en el equipo.');
  } else {
    usuarios.forEach((u, idx) => {
      const assigned = proyectos
        .filter((p) => p.trabajadores_ids?.includes(u.id) && p.estado !== 'cancelada')
        .map((p) => p.nombre);
      const labelRol = roleLabel(u.rol);
      const row = ws.addRow({
        nombre: sanitizeExcelCell(u.nombre),
        rut: sanitizeExcelCell(u.rut || '—'),
        rol: labelRol,
        telefono: sanitizeExcelCell(u.telefono_whatsapp || '—'),
        correo: sanitizeExcelCell(u.email || '—'),
        especialidades: sanitizeExcelCell(Array.isArray(u.especialidades) && u.especialidades.length ? u.especialidades.join(', ') : '—'),
        obras: sanitizeExcelCell(assigned.length ? assigned.join(' · ') : 'Sin asignar'),
      });
      styleDataRow(row, cols, idx);
      row.getCell(1).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.navyDark } };
      styleStatusCell(row.getCell(3), u.rol);
    });

    const totalRow = ws.addRow({
      nombre: 'TOTAL EQUIPO',
      rut: '',
      rol: `${usuarios.length} personas`,
      telefono: '',
      correo: '',
      especialidades: '',
      obras: '',
    });
    styleTotalsRow(totalRow, cols);
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function downloadEquipoExcel(
  usuarios: Usuario[],
  proyectos: Proyecto[],
  empresaNombre?: string,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const buffer = await buildEquipoExcelBuffer(usuarios, proyectos, empresaNombre);
  downloadExcelBuffer(buffer, `Equipo_ObraTrack_${chileToday()}.xlsx`);
}
