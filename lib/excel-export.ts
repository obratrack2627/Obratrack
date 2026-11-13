import { chileToday } from '@/lib/ai/project-deadlines';
import { projectStatusLabel } from '@/lib/project-status';
import type {
  Actividad,
  AsistenciaObrero,
  Cliente,
  Imprevisto,
  MaterialProyecto,
  Pago,
  Proyecto,
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
    ['Constructora', empresaNombre],
    ['Obra / Proyecto', proyecto.nombre],
    ['Mandante / Cliente', cliente?.nombre || 'No asignado'],
    ['Ubicación', [proyecto.direccion, proyecto.comuna, proyecto.region].filter(Boolean).join(', ')],
    ['Estado Operativo', projectStatusLabel(proyecto.estado)],
    ['Fecha Inicio', proyecto.fecha_inicio],
    ['Fecha Término Estimada', proyecto.fecha_termino_estimada],
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
      fecha: p.fecha,
      metodo: p.metodo,
      monto: Math.round(Number(p.monto) || 0),
      nota: p.nota || p.notas || '',
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
      nombre: m.nombre,
      categoria: m.categoria || 'General',
      proveedor: m.proveedor || 'Por definir',
      cantidad: m.cantidad,
      unidad: m.unidad,
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
      fecha: imp.fecha,
      origen: imp.origen === 'whatsapp_ia' ? 'WhatsApp IA' : 'Manual',
      monto: Math.round(Number(imp.monto) || 0),
      descripcion: imp.descripcion,
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
      nombre: a.nombre,
      fecha: `${a.fecha_inicio} -> ${a.fecha_termino}`,
      estado: a.estado,
      metrica: `${a.porcentaje_avance}%`,
    });
  });
  asistencias.forEach((asist) => {
    wsOperacion.addRow({
      tipo: 'Asistencia',
      nombre: asist.trabajador_nombre,
      fecha: asist.fecha,
      estado: asist.estado,
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
}
