const ExcelJS = require('exceljs');
const path = require('path');

async function generateFinancialModel() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ObraTrack SpA - Evaluación Financiera Oficial INACAP';
  wb.lastModifiedBy = 'Benjamín Achávar & Socio (Fundadores)';
  wb.created = new Date();
  wb.modified = new Date();

  // Paleta corporativa premium (Slate 900, Slate 800, Sky 600, Emerald, Red, Slate 50)
  const colors = {
    headerBg: '0F172A',
    headerFont: 'FFFFFF',
    subHeaderBg: '1E293B',
    subHeaderFont: 'FFFFFF',
    accentBg: '0284C7',
    accentFont: 'FFFFFF',
    zebraLight: 'F8FAFC',
    totalBg: 'E2E8F0',
    highlightBg: 'DCFCE7',
    highlightFont: '166534',
    warnBg: 'FEE2E2',
    warnFont: '991B1B',
    infoBg: 'EFF6FF',
    infoFont: '1E40AF',
    borderGray: 'CBD5E1',
    borderDark: '475569'
  };

  const borderThin = {
    top: { style: 'thin', color: { argb: colors.borderGray } },
    left: { style: 'thin', color: { argb: colors.borderGray } },
    bottom: { style: 'thin', color: { argb: colors.borderGray } },
    right: { style: 'thin', color: { argb: colors.borderGray } }
  };

  const borderTotal = {
    top: { style: 'thin', color: { argb: colors.borderDark } },
    bottom: { style: 'double', color: { argb: colors.borderDark } },
    left: { style: 'thin', color: { argb: colors.borderGray } },
    right: { style: 'thin', color: { argb: colors.borderGray } }
  };

  function styleHeaderRow(row, bg = colors.headerBg, fg = colors.headerFont) {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { bold: true, color: { argb: fg }, size: 10, name: 'Segoe UI' };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = borderThin;
    });
    row.height = 28;
  }

  // =========================================================================
  // HOJA 1: SUPUESTOS & MACROECONOMÍA (CON RESPUESTAS PROFE PATRICIA)
  // =========================================================================
  const ws1 = wb.addWorksheet('1. Supuestos & Macro', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });
  // Sin 'header' para evitar que exceljs inserte automáticamente la fila 1
  ws1.columns = [
    { key: 'param', width: 46 },
    { key: 'symbol', width: 14 },
    { key: 'val', width: 18 },
    { key: 'unit', width: 18 },
    { key: 'source', width: 52 }
  ];
  
  // Fila 1: Encabezados explícitos
  const r1Head = ws1.addRow(['Parámetro / Variable Macroeconómica', 'Símbolo', 'Valor Asumido', 'Unidad / Formato', 'Fuente Oficial / Fundamento Técnico']);
  styleHeaderRow(r1Head);

  const macroData = [
    ['Horizonte Temporal de Evaluación', 'N', 4, 'Años', 'Estándar para evaluación de proyectos de software y plataformas SaaS'],
    ['Año 0: Constitución & Desarrollo Pre-operativo (2 Socios)', 'Año 0', 2026, 'Año', 'Fase de arquitectura, programación del MVP y pruebas de terreno'],
    ['Año 1: Lanzamiento Comercial & Operación Inicial', 'Año 1', 2027, 'Año', 'Comienzo de operaciones comerciales y primeros 95 clientes activos'],
    ['Año 2: Crecimiento y Consolidación Regional', 'Año 2', 2028, 'Año', 'Consolidación en Región Metropolitana (210 clientes activos)'],
    ['Año 3: Expansión Nacional', 'Año 3', 2029, 'Año', 'Expansión a principales zonas constructoras del país (380 clientes activos)'],
    ['Año 4: Madurez del Software & Cobertura Integral', 'Año 4', 2030, 'Año', 'Liderazgo en gestión digital de obras para PYMEs (580 clientes activos)'],
    ['Tasa de Inflación Anual Proyectada (IPC)', 'IPC', 0.038, '3.80%', 'Rango meta de largo plazo del Banco Central de Chile (3.0% - 4.0%)'],
    ['Impuesto a la Renta de 1ª Categoría (SII)', 'Tc', 0.27, '27.00%', 'Servicio de Impuestos Internos (SII) - Régimen General corporativo'],
    ['Tipo de Cambio Nominal Proyectado', 'USD/CLP', 940, 'CLP / USD', 'Promedio proyectado Banco Central de Chile'],
    ['Tasa Libre de Riesgo (Depósito a Plazo)', 'Rf', 0.040, '4.00%', 'Tasa de Interés Depósito a Plazo BancoEstado / Banco Central (Recomendación Prof. Patricia)'],
    ['Beta Sectorial Software & SaaS (Damodaran)', 'β', 1.25, '1.25', 'Aswath Damodaran (NYU Stern) - Software (System & Application)'],
    ['Prima por Riesgo de Mercado Accionario (Rm - Rf)', 'PRM', 0.060, '6.00%', 'Diferencial exigido por inversionistas sobre el activo libre de riesgo'],
    ['Riesgo País de Chile (Indicador EMBI JP Morgan)', 'Rp', 0.0135, '1.35%', 'Riesgo soberano de Chile (aprox. 135 puntos base)'],
    ['Tasa de Descuento Anual (CAPM: Ke = Rf + β*PRM + Rp)', 'Ke', { formula: 'C11+C12*C13+C14', result: 0.1285 }, '12.85%', 'Costo de Oportunidad del Capital (Rango 11% - 15% solicitado por Prof. Patricia)'],
    ['Vida Útil Tributaria Equipos Computacionales', 'VU_TI', 3, 'Años', 'Tabla Oficial de Vida Útil de Bienes Físicos del SII'],
    ['Vida Útil Smartphones para Test de Terreno', 'VU_MOB', 2, 'Años', 'Tabla Oficial de Vida Útil de Bienes Físicos del SII'],
    ['Comisión Pasarela Transbank Webpay Plus', 'C_PAY', 0.025, '2.50%', 'Arancel comercial Transbank Webpay Plus sobre ventas netas'],
    ['Comisión por Venta a Ejecutivos Comerciales', 'C_VTA', 0.05, '5.00%', 'Incentivo comercial variable sobre facturación neta']
  ];

  macroData.forEach((row, idx) => {
    const r = ws1.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    r.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
    r.getCell(5).alignment = { vertical: 'middle', horizontal: 'left' };

    // Fila 2 a 19 en Excel (idx 0 a 17)
    // C8: IPC (idx 5 -> row 7), C9: Tc (idx 6 -> row 8), C11: Rf (idx 8 -> row 10? wait!)
    // Let's check exact row numbers in ws1:
    // r1: Header (row 1)
    // idx 0 -> row 2: Horizonte (N)
    // idx 1 -> row 3: Año 0
    // idx 2 -> row 4: Año 1
    // idx 3 -> row 5: Año 2
    // idx 4 -> row 6: Año 3
    // idx 5 -> row 7: Año 4
    // idx 6 -> row 8: IPC (0.038)
    // idx 7 -> row 9: Tc (0.27)
    // idx 8 -> row 10: USD/CLP (940)
    // idx 9 -> row 11: Rf (0.040)
    // idx 10 -> row 12: Beta (1.25)
    // idx 11 -> row 13: PRM (0.060)
    // idx 12 -> row 14: Rp (0.0135)
    // idx 13 -> row 15: Ke (=C11+C12*C13+C14)
    // idx 14 -> row 16: VU_TI (3)
    // idx 15 -> row 17: VU_MOB (2)
    // idx 16 -> row 18: C_PAY (0.025)
    // idx 17 -> row 19: C_VTA (0.050)

    if ([6, 7, 9, 11, 12, 13, 16, 17].includes(idx)) {
      r.getCell(3).numFmt = '0.00%';
    } else if (idx === 8) {
      r.getCell(3).numFmt = '"$"#,##0';
    } else if (idx === 10) {
      r.getCell(3).numFmt = '0.00';
    } else {
      r.getCell(3).numFmt = '#,##0';
    }

    if (idx === 13) {
      r.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.highlightBg } };
        c.font = { bold: true, color: { argb: colors.highlightFont }, size: 10, name: 'Segoe UI' };
      });
    } else if (idx % 2 === 0) {
      r.eachCell((c) => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
    }
    r.eachCell((c) => c.border = borderThin);
  });

  // Cuadro Teórico para la Profesora Patricia
  ws1.addRow([]);
  const rQ1 = ws1.addRow(['MARCO TEÓRICO Y CONCEPTUAL DE EVALUACIÓN DE PROYECTOS (RESPUESTAS A PROFESORA PATRICIA)']);
  rQ1.height = 25;
  rQ1.getCell(1).font = { bold: true, size: 11, color: { argb: colors.headerFont }, name: 'Segoe UI' };
  rQ1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subHeaderBg } };
  ws1.mergeCells(rQ1.number, 1, rQ1.number, 5);

  const theoryNotes = [
    ['1. ¿Qué es el Capital de Trabajo (KT) y cómo se calcula?', 'Definición:', 'Es el volumen de recursos financieros líquidos que la empresa debe disponer anticipadamente para cubrir el desfase temporal entre el pago de egresos operacionales (sueldos, licencias, nube, arriendo) y la recaudación efectiva de ingresos por ventas de suscripciones.', '', ''],
    ['¿Por qué se invierte en Año 0 y se recupera en Año 4?', 'Justificación:', 'En el Año 0 se invierte para financiar los 6 meses de desarrollo de los 2 fundadores y los meses iniciales con desfase de caja. En el Año 4 se recupera íntegramente al 100% porque el Capital de Trabajo no es un costo ni un gasto consumido, sino un fondo de maniobra rotativo que queda liberado y disponible al liquidar el horizonte del proyecto.', '', ''],
    ['2. ¿Qué es la Tasa de Descuento (Ke) y cómo se calcula?', 'Definición:', 'Representa el costo de oportunidad del dinero: la rentabilidad mínima que los inversionistas le exigen a ObraTrack SpA frente a alternativas de riesgo similar. Se calculó rigurosamente mediante el modelo CAPM con la tasa de depósito a plazo (4.0%), beta sectorial de software (1.25), prima de riesgo de mercado (6.0%) y riesgo país (1.35%): Ke = 4.0% + 1.25*6.0% + 1.35% = 12.85%, cumpliendo estrictamente con el rango de 11% a 15% solicitado.', '', '']
  ];

  theoryNotes.forEach(t => {
    const r = ws1.addRow(t);
    r.height = 28;
    r.getCell(1).font = { bold: true, size: 9, color: { argb: colors.infoFont }, name: 'Segoe UI' };
    r.getCell(2).font = { bold: true, size: 9, name: 'Segoe UI' };
    r.getCell(3).font = { size: 9, name: 'Segoe UI' };
    ws1.mergeCells(r.number, 3, r.number, 5);
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.infoBg } };
    r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.infoBg } };
    r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.infoBg } };
    r.eachCell(c => c.border = borderThin);
  });

  // =========================================================================
  // HOJA 2: BALANCE MANO DE OBRA (AÑO 0 A AÑO 4)
  // =========================================================================
  const ws2 = wb.addWorksheet('2. Mano de Obra', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: true }]
  });
  ws2.columns = [
    { key: 'rol', width: 40 },
    { key: 'mod', width: 24 },
    { key: 'cant', width: 8 },
    { key: 'bruto', width: 22 },
    { key: 'leyes', width: 18 },
    { key: 'y0', width: 20 },
    { key: 'y1', width: 20 },
    { key: 'y2', width: 20 },
    { key: 'y3', width: 20 },
    { key: 'y4', width: 20 }
  ];

  // Fila 1: Título Sección Año 0
  const rMoTitle1 = ws2.addRow(['SECCIÓN A: MANO DE OBRA EN AÑO 0 (DESARROLLO PRE-OPERATIVO - 2 FUNDADORES, 6 MESES)', '', '', '', '', '', '', '', '', '']);
  styleHeaderRow(rMoTitle1, colors.subHeaderBg);
  ws2.mergeCells(rMoTitle1.number, 1, rMoTitle1.number, 10);

  // Fila 2: Encabezados de tabla
  const rMoHead = ws2.addRow(['Rol / Cargo del Equipo', 'Modalidad', 'Cant.', 'Sueldo Bruto Mes (CLP)', 'Leyes Soc. (4.5%)', 'Año 0 (2026)', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)']);
  styleHeaderRow(rMoHead, colors.headerBg);

  // Filas 3 y 4: Fundadores en Año 0
  // Fila 3: Fundador 1 (Benjamín Achávar)
  // Fila 4: Fundador 2 (Co-Fundador)
  const moRowsY0 = [
    ['Fundador 1: Benjamín Achávar (Lead Architect / Dev)', 'Pre-operativo (6 Meses)', 1, 700000, { formula: 'D3*0.045', result: 31500 }, { formula: 'C3*(D3+E3)*6', result: 4389000 }, 0, 0, 0, 0],
    ['Fundador 2: Co-Fundador (Full-Stack Dev & QA)', 'Pre-operativo (6 Meses)', 1, 700000, { formula: 'D4*0.045', result: 31500 }, { formula: 'C4*(D4+E4)*6', result: 4389000 }, 0, 0, 0, 0]
  ];

  moRowsY0.forEach((row) => {
    const r = ws2.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    [4, 5, 6, 7, 8, 9, 10].forEach(col => {
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
      r.getCell(col).numFmt = '"$"#,##0';
    });
    r.eachCell(c => c.border = borderThin);
  });

  // Fila 5: Subtotal Año 0
  const rMoTotY0 = ws2.addRow([
    'Subtotal Mano de Obra Año 0 (Inversión Capital de Trabajo)',
    '-',
    2,
    { formula: 'SUM(D3:D4)', result: 1400000 },
    { formula: 'SUM(E3:E4)', result: 63000 },
    { formula: 'SUM(F3:F4)', result: 8778000 },
    0,
    0,
    0,
    0
  ]);
  rMoTotY0.height = 24;
  rMoTotY0.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
    c.font = { bold: true, name: 'Segoe UI', size: 10 };
    c.border = borderTotal;
  });
  [4, 5, 6, 7, 8, 9, 10].forEach(col => rMoTotY0.getCell(col).numFmt = '"$"#,##0');

  // Fila 6: Espacio en blanco
  ws2.addRow([]);

  // Fila 7: Título Sección Operativa
  const rMoTitle2 = ws2.addRow(['SECCIÓN B: MANO DE OBRA OPERATIVA (AÑOS 1 AL 4: FUNDADORES + EQUIPO DE ESCALAMIENTO)', '', '', '', '', '', '', '', '', '']);
  styleHeaderRow(rMoTitle2, colors.subHeaderBg);
  ws2.mergeCells(rMoTitle2.number, 1, rMoTitle2.number, 10);

  // Fila 8: Encabezados de tabla operativa
  const rMoHeadOp = ws2.addRow(['Rol / Cargo del Equipo', 'Modalidad', 'Cant.', 'Sueldo Bruto Mes (CLP)', 'Leyes Soc. (4.5%)', 'Año 0 (2026)', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)']);
  styleHeaderRow(rMoHeadOp, colors.headerBg);

  // Filas 9, 10, 11, 12: Cargos operativos
  // Fila 9: Fundador 1 CTO (Año 1: 650k, Año 2: 800k, Año 3: 950k, Año 4: 1.150k)
  // Fila 10: Fundador 2 Dev Senior (Año 1: 650k, Año 2: 800k, Año 3: 950k, Año 4: 1.150k)
  // Fila 11: Soporte Técnico & Onboarding Terreno (Ingreso Año 2: 500k, Año 3: 550k, Año 4: 600k)
  // Fila 12: Ejecutivo Comercial B2B (Ingreso Año 3: 550k, Año 4: 600k)
  const moRowsOp = [
    ['Fundador 1: Jefe de Proyecto & CTO', 'Indefinido (Jornada Completa)', 1, 650000, { formula: 'D9*0.045', result: 29250 }, 0, { formula: 'C9*(D9+E9)*12', result: 8151000 }, { formula: 'C9*(800000*(1+0.045))*12', result: 10032000 }, { formula: 'C9*(950000*(1+0.045))*12', result: 11913000 }, { formula: 'C9*(1150000*(1+0.045))*12', result: 14421000 }],
    ['Fundador 2: Desarrollador Full-Stack Senior', 'Indefinido (Jornada Completa)', 1, 650000, { formula: 'D10*0.045', result: 29250 }, 0, { formula: 'C10*(D10+E10)*12', result: 8151000 }, { formula: 'C10*(800000*(1+0.045))*12', result: 10032000 }, { formula: 'C10*(950000*(1+0.045))*12', result: 11913000 }, { formula: 'C10*(1150000*(1+0.045))*12', result: 14421000 }],
    ['Soporte Técnico & Onboarding Terreno (Ingreso Año 2)', 'Indefinido (Onboarding y Faenas)', 1, 500000, { formula: 'D11*0.045', result: 22500 }, 0, 0, { formula: 'C11*(D11+E11)*12', result: 6270000 }, { formula: 'C11*(550000*(1+0.045))*12', result: 6897000 }, { formula: 'C11*(600000*(1+0.045))*12', result: 7524000 }],
    ['Ejecutivo Comercial B2B (Ingreso Año 3)', 'Indefinido (Sueldo Base)', 1, 550000, { formula: 'D12*0.045', result: 24750 }, 0, 0, 0, { formula: 'C12*(D12+E12)*12', result: 6897000 }, { formula: 'C12*(600000*(1+0.045))*12', result: 7524000 }]
  ];

  moRowsOp.forEach((row, idx) => {
    const r = ws2.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    [4, 5, 6, 7, 8, 9, 10].forEach(col => {
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
      r.getCell(col).numFmt = '"$"#,##0';
    });
    if (idx % 2 === 1) r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
    r.eachCell(c => c.border = borderThin);
  });

  // Fila 13: Total Sueldos Fijos Fase Operativa
  const rMoTotOp = ws2.addRow([
    'Total Sueldos Fijos Fase Operativa (CLP)',
    '-',
    { formula: 'SUM(C9:C12)', result: 4 },
    '-',
    '-',
    0,
    { formula: 'SUM(G9:G12)', result: 16302000 },
    { formula: 'SUM(H9:H12)', result: 26334000 },
    { formula: 'SUM(I9:I12)', result: 37620000 },
    { formula: 'SUM(J9:J12)', result: 43890000 }
  ]);
  rMoTotOp.height = 25;
  rMoTotOp.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
    c.font = { bold: true, name: 'Segoe UI', size: 10 };
    c.border = borderTotal;
  });
  [4, 5, 6, 7, 8, 9, 10].forEach(col => rMoTotOp.getCell(col).numFmt = '"$"#,##0');

  // =========================================================================
  // HOJA 3: BALANCE MAQUINARIA & EQUIPOS (AÑO 0 Y AÑO 1)
  // =========================================================================
  const ws3 = wb.addWorksheet('3. Maquinaria & Equipos', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: true }]
  });
  ws3.columns = [
    { key: 'item', width: 40 },
    { key: 'momento', width: 20 },
    { key: 'cant', width: 8 },
    { key: 'p_neto', width: 24 },
    { key: 'tot_neto', width: 24 },
    { key: 'vu', width: 14 },
    { key: 'dep_anual', width: 22 },
    { key: 'vr_tot', width: 22 },
    { key: 'rol', width: 34 }
  ];

  // Fila 1: Título
  const rMqTitle = ws3.addRow(['BALANCE DE MAQUINARIA Y EQUIPAMIENTO (INVERSIÓN EN AÑO 0 Y ADQUISICIÓN EN AÑO 1)', '', '', '', '', '', '', '', '']);
  styleHeaderRow(rMqTitle, colors.subHeaderBg);
  ws3.mergeCells(rMqTitle.number, 1, rMqTitle.number, 9);

  // Fila 2: Encabezado
  const rMqHead = ws3.addRow(['Detalle del Activo Fijo', 'Momento Compra', 'Cant.', 'Precio Unitario Sin IVA', 'Inversión Total Sin IVA', 'Vida Útil (SII)', 'Depreciación Anual', 'Valor Residual Total', 'Usuario Asignado / Rol']);
  styleHeaderRow(rMqHead, colors.headerBg);

  // Filas 3 a 8: Activos
  // Fila 3: PC Escritorio (Benjamín)
  // Fila 4: Notebook (Co-Fundador)
  // Fila 5: Smartphone Android (Movistar)
  // Fila 6: Monitores 27"
  // Fila 7: Notebook Soporte (Año 1)
  // Fila 8: Smartphone Adicional (Año 1)
  const mqData = [
    ['PC Escritorio Desarrollo Profesional (Core i7, 32GB)', 'Año 0 (Aporte Socio)', 1, 850000, { formula: 'C3*D3', result: 850000 }, 3, { formula: '(E3-H3)/F3', result: 255000 }, 85000, 'Benjamín Achávar (Estación de trabajo)'],
    ['Notebook Desarrollo Co-Fundador (ThinkPad/Dell 32GB)', 'Año 0 (Aporte Socio)', 1, 950000, { formula: 'C4*D4', result: 950000 }, 3, { formula: '(E4-H4)/F4', result: 285000 }, 95000, 'Co-Fundador (Desarrollo y DevOps)'],
    ['Smartphone Android Test Terreno (Samsung A35 Movistar)', 'Año 0 (Compra Inicial)', 1, 180000, { formula: 'C5*D5', result: 180000 }, 2, { formula: '(E5-H5)/F5', result: 80000 }, 20000, 'Pruebas de GPS, fotos faena y WhatsApp'],
    ['Monitores Profesionales 27" IPS (2 Estaciones)', 'Año 0 (Compra Inicial)', 2, 150000, { formula: 'C6*D6', result: 300000 }, 3, { formula: '(E6-H6)/F6', result: 90000 }, 30000, 'Productividad de programación dual'],
    ['Notebook Soporte Técnico & Onboarding en Obra', 'Año 1 (Adquisición)', 1, 750000, { formula: 'C7*D7', result: 750000 }, 3, { formula: '(E7-H7)/F7', result: 225000 }, 75000, 'Personal de Soporte Técnico Terreno'],
    ['Smartphone Terreno Adicional para Cuadrillas', 'Año 1 (Adquisición)', 1, 150000, { formula: 'C8*D8', result: 150000 }, 2, { formula: '(E8-H8)/F8', result: 67500 }, 15000, 'Soporte y visitas técnicas a faena']
  ];

  mqData.forEach((row, idx) => {
    const r = ws3.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    [4, 5].forEach(col => {
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
      r.getCell(col).numFmt = '"$"#,##0';
    });
    r.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
    [7, 8].forEach(col => {
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
      r.getCell(col).numFmt = '"$"#,##0';
    });
    r.getCell(9).alignment = { vertical: 'middle', horizontal: 'left' };

    if (idx >= 4) {
      r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.infoBg } });
    } else if (idx % 2 === 1) {
      r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
    }
    r.eachCell(c => c.border = borderThin);
  });

  // Fila 9: Subtotal Inversión Año 0
  const rMqTotY0 = ws3.addRow([
    'Subtotal Inversión Maquinaria en Año 0 (Activo Fijo Inicial)',
    '-',
    { formula: 'SUM(C3:C6)', result: 5 },
    '-',
    { formula: 'SUM(E3:E6)', result: 2280000 },
    '-',
    { formula: 'SUM(G3:G6)', result: 710000 },
    { formula: 'SUM(H3:H6)', result: 230000 },
    'Inversión Inicial en Hardware'
  ]);
  rMqTotY0.height = 24;
  rMqTotY0.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
    c.font = { bold: true, name: 'Segoe UI', size: 10 };
    c.border = borderThin;
  });
  [4, 5, 7, 8].forEach(col => rMqTotY0.getCell(col).numFmt = '"$"#,##0');

  // Fila 10: Subtotal Inversión Año 1
  const rMqTotY1 = ws3.addRow([
    'Subtotal Inversión Maquinaria en Año 1 (Reinversión / Nuevo Personal)',
    '-',
    { formula: 'SUM(C7:C8)', result: 2 },
    '-',
    { formula: 'SUM(E7:E8)', result: 900000 },
    '-',
    { formula: 'SUM(G7:G8)', result: 292500 },
    { formula: 'SUM(H7:H8)', result: 90000 },
    'Inversión de Expansión en Año 1'
  ]);
  rMqTotY1.height = 24;
  rMqTotY1.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
    c.font = { bold: true, name: 'Segoe UI', size: 10 };
    c.border = borderThin;
  });
  [4, 5, 7, 8].forEach(col => rMqTotY1.getCell(col).numFmt = '"$"#,##0');

  // Fila 11: Espacio en blanco
  ws3.addRow([]);

  // Fila 12: Encabezado Calendario de Depreciación
  const rDepHead = ws3.addRow(['CALENDARIO DE DEPRECIACIÓN TRIBUTARIA (SII)', '', 'Año 0 (2026)', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)', 'Valor Libro Final', 'Valor Desecho Estimado']);
  styleHeaderRow(rDepHead, colors.headerBg);

  // Filas 13 y 14: Lotes de depreciación
  // Fila 13: Lote Año 0
  // Fila 14: Lote Año 1
  const depRows = [
    ['Depreciación Lote Año 0 (3 años equipos, 2 años smart)', '', 0, 710000, 710000, 630000, 0, 230000, 230000],
    ['Depreciación Lote Año 1 (3 años notebook, 2 años smart)', '', 0, 292500, 292500, 225000, 225000, 90000, 90000]
  ];

  depRows.forEach((row) => {
    const r = ws3.addRow(row);
    r.height = 22;
    [3, 4, 5, 6, 7, 8, 9].forEach(col => {
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
      r.getCell(col).numFmt = '"$"#,##0';
    });
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.eachCell(c => c.border = borderThin);
  });

  // Fila 15: Depreciación Total por Período
  const rDepTotal = ws3.addRow([
    'Depreciación Total por Período (CLP)',
    '',
    0,
    { formula: 'SUM(D13:D14)', result: 1002500 },
    { formula: 'SUM(E13:E14)', result: 1002500 },
    { formula: 'SUM(F13:F14)', result: 855000 },
    { formula: 'SUM(G13:G14)', result: 225000 },
    { formula: 'SUM(H13:H14)', result: 320000 },
    { formula: 'SUM(I13:I14)', result: 320000 }
  ]);
  rDepTotal.height = 25;
  rDepTotal.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
    c.font = { bold: true, name: 'Segoe UI', size: 10 };
    c.border = borderTotal;
  });
  [3, 4, 5, 6, 7, 8, 9].forEach(col => rDepTotal.getCell(col).numFmt = '"$"#,##0');

  // =========================================================================
  // HOJA 4: BALANCE HERRAMIENTAS & SOFTWARE (AÑO 0 VS AÑO 1+)
  // =========================================================================
  const ws4 = wb.addWorksheet('4. Software & Licencias', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: true }]
  });
  ws4.columns = [
    { key: 'tool', width: 40 },
    { key: 'freq', width: 22 },
    { key: 'usd', width: 14 },
    { key: 'y0', width: 22 },
    { key: 'y1', width: 20 },
    { key: 'y2', width: 20 },
    { key: 'y3', width: 20 },
    { key: 'y4', width: 20 },
    { key: 'prov', width: 40 }
  ];

  // Fila 1: Título
  const rSoftTitle = ws4.addRow(['BALANCE DE SOFTWARE, LICENCIAS Y CONECTIVIDAD (AÑO 0 DESARROLLO VS AÑOS 1-4 PRODUCCIÓN)', '', '', '', '', '', '', '', '']);
  styleHeaderRow(rSoftTitle, colors.subHeaderBg);
  ws4.mergeCells(rSoftTitle.number, 1, rSoftTitle.number, 9);

  // Fila 2: Encabezado
  const rSoftHead = ws4.addRow(['Herramienta Tecnológica', 'Modalidad', 'Costo USD', 'Año 0 (Desarrollo)', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)', 'Proveedor / Justificación Técnica']);
  styleHeaderRow(rSoftHead, colors.headerBg);

  // Filas 3 a 10: Herramientas
  const softData = [
    ['Google AI Pro Estudiante (Plan $5.400/mes)', 'Mensual x 12 (Benjamín)', 0, 64800, 64800, 67262, 69818, 72471, 'Suscripción personal Google AI para desarrollo'],
    ['Plan Datos Móviles Smartphone Movistar', 'Mensual x 12 (Conexión)', 0, 179880, 179880, 186715, 193811, 201175, 'Conectividad 4G/5G para pruebas en faena'],
    ['Dominio Oficial .CL (NIC Chile)', 'Anual', 0, 9950, 9950, 10328, 10721, 11128, 'NIC Chile (Universidad de Chile)'],
    ['Cuenta Google Play Developer', 'Pago Único Inicial', 25, 23500, 0, 0, 0, 0, 'Google Play Console (Publicación Android)'],
    ['Apple Developer Program (iOS App)', 'Anual', 99, 93060, 93060, 96596, 100267, 104077, 'Apple Developer Enterprise'],
    ['GitHub Team & Copilot Workspace (2 Devs)', 'Mensual x 12', 38, 214320, 428640, 444928, 461836, 479385, 'Licencias GitHub para desarrollo colaborativo'],
    ['Vercel (Hosting & Edge Functions Next.js)', 'Free en Año 0 -> Pro en Año 1', 20, 0, 225600, 234173, 243071, 252308, 'Despliegue CI/CD, SSL y SSR global Next.js'],
    ['Supabase (PostgreSQL, Auth & Storage Faena)', 'Free en Año 0 -> Pro en Año 1', 25, 0, 282000, 507600, 902400, 1466400, 'Escala con gigabytes de fotos de faena y backups']
  ];

  softData.forEach((row, idx) => {
    const r = ws4.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    r.getCell(3).numFmt = '"US$"#,##0.00';
    [4, 5, 6, 7, 8].forEach(col => {
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
      r.getCell(col).numFmt = '"$"#,##0';
    });
    r.getCell(9).alignment = { vertical: 'middle', horizontal: 'left' };
    if (idx % 2 === 1) r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
    r.eachCell(c => c.border = borderThin);
  });

  // Fila 11: Total Software
  const rSoftTotal = ws4.addRow([
    'Total Software, Licencias & Conectividad (CLP)',
    '-',
    '-',
    { formula: 'SUM(D3:D10)', result: 585510 },
    { formula: 'SUM(E3:E10)', result: 1283930 },
    { formula: 'SUM(F3:F10)', result: 1547602 },
    { formula: 'SUM(G3:G10)', result: 1981924 },
    { formula: 'SUM(H3:H10)', result: 2586944 },
    'Herramientas Tecnológicas del Proyecto'
  ]);
  rSoftTotal.height = 25;
  rSoftTotal.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
    c.font = { bold: true, name: 'Segoe UI', size: 10 };
    c.border = borderTotal;
  });
  [4, 5, 6, 7, 8].forEach(col => rSoftTotal.getCell(col).numFmt = '"$"#,##0');

  // =========================================================================
  // HOJA 5: BALANCE INFRAESTRUCTURA CLOUD & APIS (PRODUCCIÓN AÑOS 1 AL 4)
  // =========================================================================
  const ws5 = wb.addWorksheet('5. Infraestructura Cloud', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });
  ws5.columns = [
    { key: 'service', width: 36 },
    { key: 'metric', width: 28 },
    { key: 'y1', width: 18 },
    { key: 'y2', width: 18 },
    { key: 'y3', width: 18 },
    { key: 'y4', width: 18 },
    { key: 'just', width: 44 }
  ];

  // Fila 1: Encabezados
  const r5Head = ws5.addRow(['Servicio Cloud / API Externa', 'Métrica de Consumo / Plan', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)', 'Justificación Técnica de Escalabilidad']);
  styleHeaderRow(r5Head);

  // Filas 2 a 5: Consumos Cloud
  const cloudData = [
    ['Google Gemini API (3.5/3.6/2.5 Flash)', 'Tokens de Cotizador, APU y Chat', 420000, 1050000, 2100000, 3480000, 'Inferencia de cubicaciones y radar de ferreterías'],
    ['WhatsApp Business Cloud API (Meta)', 'Notificaciones de Avance y Reportes', 480000, 1200000, 2400000, 3960000, 'Costo por conversación iniciada con mandantes'],
    ['Google Maps Platform (Geocoding)', 'GPS Faenas y Reverse Geocoding', 0, 80000, 160000, 260000, 'Primeros 28.500 llamados cubiertos por crédito $200 USD'],
    ['Servicios de Respaldo y Telemetría', 'Monitoreo Sentry & Backups diarios', 96000, 120000, 180000, 240000, 'Monitoreo de excepciones y respaldos off-site']
  ];

  cloudData.forEach((row, idx) => {
    const r = ws5.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    [3, 4, 5, 6].forEach(col => {
      r.getCell(col).numFmt = '"$"#,##0';
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
    });
    r.getCell(7).alignment = { vertical: 'middle', horizontal: 'left' };
    if (idx % 2 === 1) r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
    r.eachCell(c => c.border = borderThin);
  });

  // Fila 6: Total Cloud
  const r5Total = ws5.addRow([
    'Total Consumo Cloud & APIs en Producción (CLP)',
    'Costo Variable Directo',
    { formula: 'SUM(C2:C5)', result: 996000 },
    { formula: 'SUM(D2:D5)', result: 2450000 },
    { formula: 'SUM(E2:E5)', result: 4840000 },
    { formula: 'SUM(F2:F5)', result: 7940000 },
    'Costo Tecnológico Directo según Obras Activas'
  ]);
  r5Total.height = 25;
  r5Total.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
    c.font = { bold: true, name: 'Segoe UI', size: 10 };
    c.border = borderTotal;
  });
  [3, 4, 5, 6].forEach(col => r5Total.getCell(col).numFmt = '"$"#,##0');

  // =========================================================================
  // HOJA 6: BALANCE INSUMOS & GASTOS GENERALES (AÑO 0 A AÑO 4)
  // =========================================================================
  const ws6 = wb.addWorksheet('6. Insumos & Gastos Gen', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });
  ws6.columns = [
    { key: 'gasto', width: 36 },
    { key: 'modalidad', width: 24 },
    { key: 'y0', width: 18 },
    { key: 'y1', width: 18 },
    { key: 'y2', width: 18 },
    { key: 'y3', width: 18 },
    { key: 'y4', width: 18 },
    { key: 'detalle', width: 42 }
  ];

  // Fila 1: Encabezados
  const r6Head = ws6.addRow(['Concepto de Gasto Operacional', 'Modalidad de Contratación', 'Año 0 (2026)', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)', 'Detalle / Proveedor Seleccionado']);
  styleHeaderRow(r6Head);

  // Filas 2 a 7: Gastos
  const expensesData = [
    ['Constitución de Sociedad SpA (Firma/Notaría)', 'Gasto Pre-operativo Único', 180000, 0, 0, 0, 0, 'Formalización legal en Tu Empresa en un Día'],
    ['Registro de Marca ObraTrack en INAPI', 'Gasto Pre-operativo Único', 320000, 0, 0, 0, 0, 'Protección de propiedad intelectual (Clases 9 y 42)'],
    ['Oficina Virtual y Domicilio Tributario', 'Mensual (Virtual Pyme / Providencia)', 0, 288000, { formula: 'D4*(1+\'1. Supuestos & Macro\'!C8)', result: 298944 }, { formula: 'E4*(1+\'1. Supuestos & Macro\'!C8)', result: 310304 }, { formula: 'F4*(1+\'1. Supuestos & Macro\'!C8)', result: 322095 }, 'Dirección comercial, recepción SII y patentes'],
    ['Outsourcing Contable & Tributario (Contador)', 'Mensual (Estudio Contable PYME)', 0, 840000, { formula: 'D5*(1+\'1. Supuestos & Macro\'!C8)', result: 871920 }, { formula: 'E5*(1+\'1. Supuestos & Macro\'!C8)', result: 905053 }, { formula: 'F5*(1+\'1. Supuestos & Macro\'!C8)', result: 939445 }, 'Declaraciones mensuales F29, Balance y Renta SII'],
    ['Gastos de Visitas Técnicas & Terreno (Transporte)', 'Mensual (Combustible / Movilización)', 0, 720000, 1020000, 1320000, 1680000, 'Visitas de onboarding a faenas y capataces'],
    ['Insumos de Oficina, Red & Papelería Técnica', 'Mensual', 0, 300000, { formula: 'D7*(1+\'1. Supuestos & Macro\'!C8)', result: 311400 }, { formula: 'E7*(1+\'1. Supuestos & Macro\'!C8)', result: 323233 }, { formula: 'F7*(1+\'1. Supuestos & Macro\'!C8)', result: 335516 }, 'Material corporativo, folletería de faena']
  ];

  expensesData.forEach((row, idx) => {
    const r = ws6.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    [3, 4, 5, 6, 7].forEach(col => {
      r.getCell(col).numFmt = '"$"#,##0';
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
    });
    r.getCell(8).alignment = { vertical: 'middle', horizontal: 'left' };
    if (idx % 2 === 1) r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
    r.eachCell(c => c.border = borderThin);
  });

  // Fila 8: Total Gastos Generales
  const r6Total = ws6.addRow([
    'Total Insumos & Gastos Generales (CLP)',
    'Gastos Administrativos',
    { formula: 'SUM(C2:C3)', result: 500000 },
    { formula: 'SUM(D4:D7)', result: 2148000 },
    { formula: 'SUM(E4:E7)', result: 2502264 },
    { formula: 'SUM(F4:F7)', result: 2858590 },
    { formula: 'SUM(G4:G7)', result: 3277056 },
    'Gastos Operacionales y Pre-operativos'
  ]);
  r6Total.height = 25;
  r6Total.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
    c.font = { bold: true, name: 'Segoe UI', size: 10 };
    c.border = borderTotal;
  });
  [3, 4, 5, 6, 7].forEach(col => r6Total.getCell(col).numFmt = '"$"#,##0');

  // =========================================================================
  // HOJA 7: DEMANDA & INGRESOS SAAS (PRECIOS REALES DE LA APP)
  // =========================================================================
  const ws7 = wb.addWorksheet('7. Demanda & Ingresos', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });
  ws7.columns = [
    { key: 'plan', width: 42 },
    { key: 'mix', width: 14 },
    { key: 'p_neto', width: 24 },
    { key: 'y1', width: 18 },
    { key: 'y2', width: 18 },
    { key: 'y3', width: 18 },
    { key: 'y4', width: 18 }
  ];

  // Fila 1: Encabezados
  const r7Head = ws7.addRow(['Línea de Servicio / Plan Comercial', 'Mix Ventas (%)', 'Precio Mensual Neto (CLP)', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)']);
  styleHeaderRow(r7Head);

  // Filas 2, 3, 4: Planes de la App
  // Fila 2: Plan Gratis ($0)
  // Fila 3: Plan Pro ($9.990 - $14.990) -> Modelado a $12.490 CLP/mes
  // Fila 4: Plan Pro IA ($19.990 - $29.990) -> Modelado a $24.990 CLP/mes
  ws7.addRow(['Plan Gratis (1 Obra activa, Freemium permanente)', 0.00, 0, '-', '-', '-', '-']);
  ws7.addRow(['Plan Pro ($9.990 - $14.990 / Obras ilimitadas, APU Gemini)', 0.50, 12490, '-', '-', '-', '-']);
  ws7.addRow(['Plan Pro IA ($19.990 - $29.990 / WhatsApp Bot, Gemini Pro)', 0.50, 24990, '-', '-', '-', '-']);

  [2, 3, 4].forEach(rowIdx => {
    const r = ws7.getRow(rowIdx);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    [4, 5, 6, 7].forEach(col => r.getCell(col).alignment = { vertical: 'middle', horizontal: 'center' });
    r.getCell(2).numFmt = '0.0%';
    r.getCell(3).numFmt = '"$"#,##0';
    r.eachCell(c => c.border = borderThin);
  });

  // Fila 5: Precio Promedio Ponderado por Cliente (ARPU)
  const rTicket = ws7.addRow([
    'Precio Mensual Promedio Ponderado por Cliente (CLP)',
    1.00,
    { formula: 'B3*C3+B4*C4', result: 18740 },
    { formula: 'C5', result: 18740 },
    { formula: 'D5*(1+\'1. Supuestos & Macro\'!C8)', result: 19452 },
    { formula: 'E5*(1+\'1. Supuestos & Macro\'!C8)', result: 20191 },
    { formula: 'F5*(1+\'1. Supuestos & Macro\'!C8)', result: 20959 }
  ]);
  rTicket.height = 24;
  rTicket.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subHeaderBg } };
    c.font = { bold: true, color: { argb: colors.subHeaderFont }, name: 'Segoe UI', size: 10 };
    c.border = borderThin;
  });
  rTicket.getCell(2).numFmt = '0.0%';
  [3, 4, 5, 6, 7].forEach(col => rTicket.getCell(col).numFmt = '"$"#,##0');

  // Fila 6: Espacio en blanco
  ws7.addRow([]);

  // Fila 7: Encabezado Proyección de Clientes
  const rCliHeader = ws7.addRow(['Proyección de Clientes Activos (Suscripciones)', '', 'Unidad', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)']);
  styleHeaderRow(rCliHeader, colors.headerBg);

  // Filas 8, 9, 10, 11: Clientes por plan
  // Fila 8: Clientes Gratis (Funnel)
  // Fila 9: Clientes Plan Pro (50% de pago)
  // Fila 10: Clientes Plan Pro IA (50% de pago)
  // Fila 11: Total Clientes Activos de Pago
  const clientRows = [
    ['Usuarios Activos Plan Gratis (Funnel Freemium)', '', 'PYMEs', 300, 750, 1400, 2200],
    ['Clientes Plan Pro (50% de pago)', '', 'PYMEs', { formula: 'ROUND(D11*B3,0)', result: 48 }, { formula: 'ROUND(E11*B3,0)', result: 105 }, { formula: 'ROUND(F11*B3,0)', result: 190 }, { formula: 'ROUND(G11*B3,0)', result: 290 }],
    ['Clientes Plan Pro IA (50% de pago)', '', 'PYMEs', { formula: 'ROUND(D11*B4,0)', result: 47 }, { formula: 'ROUND(E11*B4,0)', result: 105 }, { formula: 'ROUND(F11*B4,0)', result: 190 }, { formula: 'ROUND(G11*B4,0)', result: 290 }],
    ['Total Clientes Activos de Pago (Cartera Anual)', '', 'PYMEs', 95, 210, 380, 580]
  ];

  clientRows.forEach((row, idx) => {
    const r = ws7.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    [4, 5, 6, 7].forEach(col => {
      r.getCell(col).numFmt = '#,##0';
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
    });
    if (idx === 3) {
      r.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
        c.font = { bold: true, name: 'Segoe UI', size: 10 };
        c.border = borderTotal;
      });
    } else {
      if (idx % 2 === 1) r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
      r.eachCell(c => c.border = borderThin);
    }
  });

  // Fila 12: Espacio en blanco
  ws7.addRow([]);

  // Fila 13: Encabezado Ingresos
  const rRevHeader = ws7.addRow(['Ingresos Operacionales Proyectados (CLP)', '', '', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)']);
  styleHeaderRow(rRevHeader, colors.headerBg);

  // Fila 14: Total Facturación Anual
  const rRevTotal = ws7.addRow([
    'Total Facturación Anual Neta SaaS (CLP)',
    '',
    '',
    { formula: 'D11*D5*12', result: 21363600 },
    { formula: 'E11*E5*12', result: 49019342 },
    { formula: 'F11*F5*12', result: 92072331 },
    { formula: 'G11*G5*12', result: 145871647 }
  ]);
  rRevTotal.height = 25;
  rRevTotal.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.highlightBg } };
    c.font = { bold: true, color: { argb: colors.highlightFont }, name: 'Segoe UI', size: 10 };
    c.border = borderTotal;
  });
  [4, 5, 6, 7].forEach(col => rRevTotal.getCell(col).numFmt = '"$"#,##0');

  // Fila 15: Espacio en blanco
  ws7.addRow([]);

  // Fila 16: Encabezado Break-even
  const rBeHeader = ws7.addRow(['ANÁLISIS DE PUNTO DE EQUILIBRIO OPERACIONAL (BREAK-EVEN)', '', '', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)']);
  styleHeaderRow(rBeHeader, colors.subHeaderBg);

  // Filas 17 a 20: Break-even
  const beRows = [
    ['Costos Fijos Operativos Anuales (CLP)', '', '', { formula: '\'10. Flujo Neto de Fondos\'!C6+\'10. Flujo Neto de Fondos\'!C7+\'10. Flujo Neto de Fondos\'!C8', result: 19733930 }, { formula: '\'10. Flujo Neto de Fondos\'!D6+\'10. Flujo Neto de Fondos\'!D7+\'10. Flujo Neto de Fondos\'!D8', result: 30383866 }, { formula: '\'10. Flujo Neto de Fondos\'!E6+\'10. Flujo Neto de Fondos\'!E7+\'10. Flujo Neto de Fondos\'!E8', result: 42460514 }, { formula: '\'10. Flujo Neto de Fondos\'!F6+\'10. Flujo Neto de Fondos\'!F7+\'10. Flujo Neto de Fondos\'!F8', result: 49754000 }],
    ['Margen de Contribución Unitario Anual por Cliente (CLP)', '', '', { formula: 'D5*12*(1-\'1. Supuestos & Macro\'!C18-\'1. Supuestos & Macro\'!C19)-(\'10. Flujo Neto de Fondos\'!C3/D11)', result: 197358 }, { formula: 'E5*12*(1-\'1. Supuestos & Macro\'!C18-\'1. Supuestos & Macro\'!C19)-(\'10. Flujo Neto de Fondos\'!D3/E11)', result: 204684 }, { formula: 'F5*12*(1-\'1. Supuestos & Macro\'!C18-\'1. Supuestos & Macro\'!C19)-(\'10. Flujo Neto de Fondos\'!E3/F11)', result: 212450 }, { formula: 'G5*12*(1-\'1. Supuestos & Macro\'!C18-\'1. Supuestos & Macro\'!C19)-(\'10. Flujo Neto de Fondos\'!F3/G11)', result: 220530 }],
    ['Punto de Equilibrio en Clientes Activos (Q* = CF / MCU)', '', 'Clientes', { formula: 'ROUNDUP(D17/D18, 0)', result: 100 }, { formula: 'ROUNDUP(E17/E18, 0)', result: 148 }, { formula: 'ROUNDUP(F17/F18, 0)', result: 200 }, { formula: 'ROUNDUP(G17/G18, 0)', result: 226 }],
    ['Estado Frente al Punto de Equilibrio', '', 'Condición', 'Fase de Adopción (95 Clientes)', 'Superado en Año 2 (210 Clientes)', 'Superado Ampliamente', 'Madurez y Alta Rentabilidad']
  ];

  beRows.forEach((row, idx) => {
    const r = ws7.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    [4, 5, 6, 7].forEach(col => {
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
      if (idx === 0 || idx === 1) r.getCell(col).numFmt = '"$"#,##0';
      if (idx === 2) r.getCell(col).numFmt = '#,##0';
    });
    if (idx === 2) {
      r.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
        c.font = { bold: true, name: 'Segoe UI', size: 10 };
      });
    }
    r.eachCell(c => c.border = borderThin);
  });

  // =========================================================================
  // HOJA 8: INVERSIÓN INICIAL & CAPITAL DE TRABAJO (AÑO 0)
  // =========================================================================
  const ws8 = wb.addWorksheet('8. Inversion & Cap Trabajo', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });
  ws8.columns = [
    { key: 'cat', width: 32 },
    { key: 'item', width: 42 },
    { key: 'monto', width: 24 },
    { key: 'ref', width: 28 },
    { key: 'dest', width: 40 }
  ];

  // Fila 1: Encabezados
  const r8Head = ws8.addRow(['Categoría de Inversión', 'Detalle del Ítem Invertido', 'Monto Inversión (CLP)', 'Fuente / Referencia de Hoja', 'Destino / Rol Estratégico']);
  styleHeaderRow(r8Head);

  // Filas 2 a 12: Inversión
  // Fila 2: PC Escritorio
  // Fila 3: Smartphone
  // Fila 4: Monitores
  // Fila 5: Subtotal Activos Fijos (=SUM(C2:C4))
  // Fila 6: Constitución SpA
  // Fila 7: Registro INAPI
  // Fila 8: Software Año 0 (='4. Software & Licencias'!D11)
  // Fila 9: Subtotal Intangibles (=SUM(C6:C8))
  // Fila 10: Mano de Obra 2 Fundadores Año 0 (='2. Mano de Obra'!F5)
  // Fila 11: Reserva Liquidez KT
  // Fila 12: Subtotal KT (=SUM(C10:C11))
  const invData = [
    ['Activos Fijos (Físicos)', 'Equipamiento Computacional Año 0 (PC + Notebook)', 1800000, 'Hoja 3. Maquinaria', 'Hardware de desarrollo y arquitectura'],
    ['Activos Fijos (Físicos)', 'Smartphone Android Test Terreno (Samsung A35)', 180000, 'Hoja 3. Maquinaria', 'Pruebas WhatsApp Cloud API y GPS'],
    ['Activos Fijos (Físicos)', 'Monitores 27" IPS para Estaciones (2 Monitores)', 300000, 'Hoja 3. Maquinaria', 'Productividad y programación paralela'],
    ['Subtotal Activos Fijos', 'Total Inversión Física Tangible en Año 0', { formula: 'SUM(C2:C4)', result: 2280000 }, '-', 'Depreciable tributariamente según SII'],
    ['Activos Intangibles', 'Constitución Legal de Sociedad SpA (Firma, Notaría)', 180000, 'Hoja 6. Gastos Gen', 'Formalización jurídica de ObraTrack SpA'],
    ['Activos Intangibles', 'Registro de Marca ObraTrack en INAPI (Clases 9 y 42)', 320000, 'Hoja 6. Gastos Gen', 'Protección intelectual de marca y software'],
    ['Activos Intangibles', 'Software & Licencias de Desarrollo Año 0', { formula: '\'4. Software & Licencias\'!D11', result: 585510 }, 'Hoja 4. Software', 'Google AI Pro, Movistar, Dominio, GitHub, etc.'],
    ['Subtotal Activos Intangibles', 'Total Inversión Intangible Pre-operativa', { formula: 'SUM(C6:C8)', result: 1085510 }, '-', 'Activo nominal amortizable'],
    ['Capital de Trabajo (KT)', 'Mano de Obra 2 Fundadores en Año 0 (6 Meses)', { formula: '\'2. Mano de Obra\'!F5', result: 8778000 }, 'Hoja 2. Mano de Obra', 'Sueldos pre-operativos de los 2 fundadores'],
    ['Capital de Trabajo (KT)', 'Fondo de Cobertura de Operación Inicial (Reserva Caja)', 3000000, 'Reserva de Liquidez', 'Cobertura de desfase de ingresos Año 1'],
    ['Subtotal Capital de Trabajo', 'Total Capital de Trabajo Requerido (KT)', { formula: 'SUM(C10:C11)', result: 11778000 }, '-', 'Recuperable al 100% en Año 4']
  ];

  invData.forEach((row, idx) => {
    const r = ws8.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    r.getCell(4).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(5).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(3).numFmt = '"$"#,##0';

    if (idx === 3 || idx === 7 || idx === 10) {
      r.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subHeaderBg } };
        c.font = { bold: true, color: { argb: colors.subHeaderFont }, name: 'Segoe UI', size: 10 };
      });
    } else if (idx % 2 === 1) {
      r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
    }
    r.eachCell(c => c.border = borderThin);
  });

  // Fila 13: Total Inversión Inicial
  const r8Total = ws8.addRow([
    'TOTAL INVERSIÓN INICIAL (AÑO 0)',
    'Inversión Total Previa a Puesta en Marcha',
    { formula: 'C5+C9+C12', result: 15143510 },
    '-',
    'Financiamiento Total Requerido para Iniciar'
  ]);
  r8Total.height = 26;
  r8Total.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.highlightBg } };
    c.font = { bold: true, color: { argb: colors.highlightFont }, name: 'Segoe UI', size: 11 };
    c.border = borderTotal;
  });
  r8Total.getCell(3).numFmt = '"$"#,##0';

  // =========================================================================
  // HOJA 9: PERSONAL OPERATIVO (RESUMEN CONSOLIDADO)
  // =========================================================================
  const ws9 = wb.addWorksheet('9. Personal Operativo', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });
  ws9.columns = [
    { key: 'cargo', width: 38 },
    { key: 'tipo', width: 24 },
    { key: 'y1', width: 20 },
    { key: 'y2', width: 20 },
    { key: 'y3', width: 20 },
    { key: 'y4', width: 20 },
    { key: 'func', width: 40 }
  ];

  // Fila 1: Encabezados
  const r9Head = ws9.addRow(['Cargo Operacional', 'Modalidad / Tipo Contrato', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)', 'Funciones Clave en Operación']);
  styleHeaderRow(r9Head);

  // Filas 2 a 6: Cargos
  // Fila 2: Fundador 1 CTO (='2. Mano de Obra'!G9)
  // Fila 3: Fundador 2 Dev Senior (='2. Mano de Obra'!G10)
  // Fila 4: Soporte Técnico (='2. Mano de Obra'!G11)
  // Fila 5: Ejecutivo Comercial (='2. Mano de Obra'!G12)
  // Fila 6: Comisiones Comerciales 5% (='7. Demanda & Ingresos'!D14*'1. Supuestos & Macro'!C18)
  const staffData = [
    ['Fundador 1: Jefe de Proyecto & CTO', 'Indefinido (Jornada Completa)', { formula: '\'2. Mano de Obra\'!G9', result: 8151000 }, { formula: '\'2. Mano de Obra\'!H9', result: 10032000 }, { formula: '\'2. Mano de Obra\'!I9', result: 11913000 }, { formula: '\'2. Mano de Obra\'!J9', result: 14421000 }, 'Dirección general, arquitectura Next.js y APIs'],
    ['Fundador 2: Desarrollador Full-Stack Senior', 'Indefinido (Jornada Completa)', { formula: '\'2. Mano de Obra\'!G10', result: 8151000 }, { formula: '\'2. Mano de Obra\'!H10', result: 10032000 }, { formula: '\'2. Mano de Obra\'!I10', result: 11913000 }, { formula: '\'2. Mano de Obra\'!J10', result: 14421000 }, 'Desarrollo web, base de datos Supabase y DevOps'],
    ['Soporte Técnico & Onboarding Terreno (Año 2)', 'Indefinido (Onboarding y WhatsApp)', { formula: '\'2. Mano de Obra\'!G11', result: 0 }, { formula: '\'2. Mano de Obra\'!H11', result: 6270000 }, { formula: '\'2. Mano de Obra\'!I11', result: 6897000 }, { formula: '\'2. Mano de Obra\'!J11', result: 7524000 }, 'Capacitación a capataces y soporte cuadrillas'],
    ['Ejecutivo Comercial B2B (Año 3)', 'Indefinido (Base + Leyes)', { formula: '\'2. Mano de Obra\'!G12', result: 0 }, { formula: '\'2. Mano de Obra\'!H12', result: 0 }, { formula: '\'2. Mano de Obra\'!I12', result: 6897000 }, { formula: '\'2. Mano de Obra\'!J12', result: 7524000 }, 'Prospección en constructoras y ferias de construcción'],
    ['Comisiones Comerciales por Ventas (5%)', 'Variable (% sobre Ventas Netas)', { formula: '\'7. Demanda & Ingresos\'!D14*\'1. Supuestos & Macro\'!C19', result: 1068180 }, { formula: '\'7. Demanda & Ingresos\'!E14*\'1. Supuestos & Macro\'!C19', result: 2450967 }, { formula: '\'7. Demanda & Ingresos\'!F14*\'1. Supuestos & Macro\'!C19', result: 4603617 }, { formula: '\'7. Demanda & Ingresos\'!G14*\'1. Supuestos & Macro\'!C19', result: 7293582 }, '5% de incentivo por ventas netas facturadas']
  ];

  staffData.forEach((row, idx) => {
    const r = ws9.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    [3, 4, 5, 6].forEach(col => {
      r.getCell(col).numFmt = '"$"#,##0';
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
    });
    r.getCell(7).alignment = { vertical: 'middle', horizontal: 'left' };
    if (idx % 2 === 1) r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
    r.eachCell(c => c.border = borderThin);
  });

  // Fila 7: Total Personal Operativo
  const r9Total = ws9.addRow([
    'Total Costo Personal Operativo & Ventas (CLP)',
    '-',
    { formula: 'SUM(C2:C6)', result: 17370180 },
    { formula: 'SUM(D2:D6)', result: 28784967 },
    { formula: 'SUM(E2:E6)', result: 42223617 },
    { formula: 'SUM(F2:F6)', result: 51183582 },
    'Mano de Obra Fase Operativa'
  ]);
  r9Total.height = 25;
  r9Total.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
    c.font = { bold: true, name: 'Segoe UI', size: 10 };
    c.border = borderTotal;
  });
  [3, 4, 5, 6].forEach(col => r9Total.getCell(col).numFmt = '"$"#,##0');

  // =========================================================================
  // HOJA 10: FLUJO NETO DE FONDOS (FNF) & INDICADORES FINANCIEROS
  // =========================================================================
  const ws10 = wb.addWorksheet('10. Flujo Neto de Fondos', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1, showGridLines: true }]
  });
  ws10.columns = [
    { key: 'item', width: 44 },
    { key: 'y0', width: 20 },
    { key: 'y1', width: 20 },
    { key: 'y2', width: 20 },
    { key: 'y3', width: 20 },
    { key: 'y4', width: 20 },
    { key: 'formula_ref', width: 36 }
  ];

  // Fila 1: Encabezados
  const r10Head = ws10.addRow(['Ítem del Flujo de Fondos (CLP)', 'Año 0 (2026)', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)', 'Referencia / Fórmula']);
  styleHeaderRow(r10Head);

  // Filas 2 a 18:
  // Fila 2: Ingresos Operacionales (='7. Demanda & Ingresos'!D14)
  // Fila 3: Costos Variables Cloud (='5. Infraestructura Cloud'!C6)
  // Fila 4: Comisiones Pasarela Webpay 2.5% (=C2*'1. Supuestos & Macro'!C17)
  // Fila 5: Comisiones Equipo Comercial 5% (='9. Personal Operativo'!C6)
  // Fila 6: Costos Fijos Sueldos Base (='2. Mano de Obra'!G13)
  // Fila 7: Insumos & Gastos Generales (='6. Insumos & Gastos Gen'!D8)
  // Fila 8: Software & Licencias Producción (='4. Software & Licencias'!E11)
  // Fila 9: Depreciación Maquinaria (='3. Maquinaria & Equipos'!D15)
  // Fila 10: UAI (=C2-SUM(C3:C9))
  // Fila 11: Impuesto 1ª Cat 27% (=IF(C10>0, C10*'1. Supuestos & Macro'!C9, 0))
  // Fila 12: UDI (=C10-C11)
  // Fila 13: Ajuste por Depreciación (=C9)
  // Fila 14: Inversión Activos Fijos e Intangibles (Año 0: =-'8. Inversion & Cap Trabajo'!C5-'8. Inversion & Cap Trabajo'!C9, Año 1: =-'3. Maquinaria & Equipos'!E10)
  // Fila 15: Inversión en Capital de Trabajo (Año 0: =-'8. Inversion & Cap Trabajo'!C12)
  // Fila 16: Recuperación de Capital de Trabajo (Año 4: ='8. Inversion & Cap Trabajo'!C12)
  // Fila 17: Valor de Salvamento / Desecho (Año 4: ='3. Maquinaria & Equipos'!I15)
  // Fila 18: FLUJO NETO DE FONDOS (FNF) (=B14+B15, =C12+C13+C14+C15+C16+C17, ...)
  const fnfRows = [
    ['(+) Ingresos Operacionales por Suscripciones SaaS', 0, { formula: '\'7. Demanda & Ingresos\'!D14', result: 21363600 }, { formula: '\'7. Demanda & Ingresos\'!E14', result: 49019342 }, { formula: '\'7. Demanda & Ingresos\'!F14', result: 92072331 }, { formula: '\'7. Demanda & Ingresos\'!G14', result: 145871647 }, 'Hoja 7. Demanda & Ingresos'],
    ['(-) Costos Variables Cloud & APIs', 0, { formula: '\'5. Infraestructura Cloud\'!C6', result: 996000 }, { formula: '\'5. Infraestructura Cloud\'!D6', result: 2450000 }, { formula: '\'5. Infraestructura Cloud\'!E6', result: 4840000 }, { formula: '\'5. Infraestructura Cloud\'!F6', result: 7940000 }, 'Hoja 5. Infraestructura Cloud'],
    ['(-) Comisiones Pasarela de Pago (2.5% Ventas)', 0, { formula: 'C2*\'1. Supuestos & Macro\'!C18', result: 534090 }, { formula: 'D2*\'1. Supuestos & Macro\'!C18', result: 1225484 }, { formula: 'E2*\'1. Supuestos & Macro\'!C18', result: 2301808 }, { formula: 'F2*\'1. Supuestos & Macro\'!C18', result: 3646791 }, '2.5% arancel Transbank Webpay Plus'],
    ['(-) Comisiones Equipo Comercial (5% Ventas)', 0, { formula: '\'9. Personal Operativo\'!C6', result: 1068180 }, { formula: '\'9. Personal Operativo\'!D6', result: 2450967 }, { formula: '\'9. Personal Operativo\'!E6', result: 4603617 }, { formula: '\'9. Personal Operativo\'!F6', result: 7293582 }, 'Hoja 9. Personal Operativo'],
    ['(-) Costos Fijos de Personal Operativo (Sueldos)', 0, { formula: '\'2. Mano de Obra\'!G13', result: 16302000 }, { formula: '\'2. Mano de Obra\'!H13', result: 26334000 }, { formula: '\'2. Mano de Obra\'!I13', result: 37620000 }, { formula: '\'2. Mano de Obra\'!J13', result: 43890000 }, 'Hoja 2. Mano de Obra Operativa'],
    ['(-) Insumos, Oficina Virtual & Contador', 0, { formula: '\'6. Insumos & Gastos Gen\'!D8', result: 2148000 }, { formula: '\'6. Insumos & Gastos Gen\'!E8', result: 2502264 }, { formula: '\'6. Insumos & Gastos Gen\'!F8', result: 2858590 }, { formula: '\'6. Insumos & Gastos Gen\'!G8', result: 3277056 }, 'Hoja 6. Gastos Generales'],
    ['(-) Software & Licencias de Producción', 0, { formula: '\'4. Software & Licencias\'!E11', result: 1283930 }, { formula: '\'4. Software & Licencias\'!F11', result: 1547602 }, { formula: '\'4. Software & Licencias\'!G11', result: 1981924 }, { formula: '\'4. Software & Licencias\'!H11', result: 2586944 }, 'Hoja 4. Licencias TI'],
    ['(-) Depreciación Maquinaria & Equipos', 0, { formula: '\'3. Maquinaria & Equipos\'!D15', result: 1002500 }, { formula: '\'3. Maquinaria & Equipos\'!E15', result: 1002500 }, { formula: '\'3. Maquinaria & Equipos\'!F15', result: 855000 }, { formula: '\'3. Maquinaria & Equipos\'!G15', result: 225000 }, 'Hoja 3. Depreciación SII'],
    ['(=) UTILIDAD ANTES DE IMPUESTOS (UAI)', 0, { formula: 'C2-SUM(C3:C9)', result: -1971100 }, { formula: 'D2-SUM(D3:D9)', result: 11506525 }, { formula: 'E2-SUM(E3:E9)', result: 37011392 }, { formula: 'F2-SUM(F3:F9)', result: 77012274 }, 'Ingresos - Costos y Gastos'],
    ['(-) Impuesto a la Renta de 1ª Categoría (27%)', 0, { formula: 'IF(C10>0, C10*\'1. Supuestos & Macro\'!C9, 0)', result: 0 }, { formula: 'IF(D10>0, D10*\'1. Supuestos & Macro\'!C9, 0)', result: 3106762 }, { formula: 'IF(E10>0, E10*\'1. Supuestos & Macro\'!C9, 0)', result: 9993076 }, { formula: 'IF(F10>0, F10*\'1. Supuestos & Macro\'!C9, 0)', result: 20793314 }, 'SII 27% (si UAI > 0)'],
    ['(=) UTILIDAD DESPUÉS DE IMPUESTOS (UDI)', 0, { formula: 'C10-C11', result: -1971100 }, { formula: 'D10-D11', result: 8399763 }, { formula: 'E10-E11', result: 27018316 }, { formula: 'F10-F11', result: 56218960 }, 'UAI - Impuestos'],
    ['(+) Ajuste por Depreciación (Gasto No Desembolsable)', 0, { formula: 'C9', result: 1002500 }, { formula: 'D9', result: 1002500 }, { formula: 'E9', result: 855000 }, { formula: 'F9', result: 225000 }, 'Reverso gasto contable'],
    ['(-) Inversión Activos Fijos e Intangibles', { formula: '-\'8. Inversion & Cap Trabajo\'!C5-\'8. Inversion & Cap Trabajo\'!C9', result: -3365510 }, { formula: '-\'3. Maquinaria & Equipos\'!E10', result: -900000 }, 0, 0, 0, 'Año 0 Físico/Intangible + Año 1 Equipos'],
    ['(-) Inversión en Capital de Trabajo', { formula: '-\'8. Inversion & Cap Trabajo\'!C12', result: -11778000 }, 0, 0, 0, 0, 'Año 0 2 Fundadores + Reserva'],
    ['(+) Recuperación de Capital de Trabajo', 0, 0, 0, 0, { formula: '\'8. Inversion & Cap Trabajo\'!C12', result: 11778000 }, 'Fin horizonte Año 4 (100% liberado)'],
    ['(+) Valor de Salvamento / Desecho de Activos', 0, 0, 0, 0, { formula: '\'3. Maquinaria & Equipos\'!I15', result: 320000 }, 'Valor residual en mercado Año 4'],
    ['(=) FLUJO NETO DE FONDOS (FNF / CASH FLOW)', { formula: 'B14+B15', result: -15143510 }, { formula: 'C12+C13+C14+C15+C16+C17', result: -1868600 }, { formula: 'D12+D13+D14+D15+D16+D17', result: 9402263 }, { formula: 'E12+E13+E14+E15+E16+E17', result: 27873316 }, { formula: 'F12+F13+F14+F15+F16+F17', result: 68541960 }, 'Flujo de Caja Libre Neto']
  ];

  fnfRows.forEach((row, idx) => {
    const r = ws10.addRow(row);
    const rowNum = idx + 2;
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    [2, 3, 4, 5, 6].forEach(col => {
      r.getCell(col).numFmt = '"$"#,##0;[Red]-"$"#,##0;"$0"';
      r.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
    });
    r.getCell(7).alignment = { vertical: 'middle', horizontal: 'left' };

    if (rowNum === 10 || rowNum === 12) {
      r.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
        c.font = { bold: true, name: 'Segoe UI', size: 10 };
      });
    } else if (rowNum === 18) {
      r.height = 26;
      r.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerBg } };
        c.font = { bold: true, color: { argb: colors.headerFont }, name: 'Segoe UI', size: 11 };
        c.border = borderTotal;
      });
    } else {
      if (idx % 2 === 1) r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
      r.eachCell(c => c.border = borderThin);
    }
  });

  // Fila 19: Espacio en blanco
  ws10.addRow([]);

  // Fila 20: Encabezado Indicadores Financieros
  const rIndHeader = ws10.addRow(['INDICADORES FINANCIEROS DE EVALUACIÓN ECONÓMICA', '', '', '', '', '', 'CRITERIO DE DECISIÓN']);
  styleHeaderRow(rIndHeader, colors.headerBg);

  // Filas 21 a 25: KPIs Financieros
  // Fila 21: Ke (='1. Supuestos & Macro'!C15)
  // Fila 22: VAN (=NPV(B21, C18:F18) + B18)
  // Fila 23: TIR (=IRR(B18:F18))
  // Fila 24: PRI Simple
  // Fila 25: ROI Acumulado (=(SUM(C18:F18)+B18)/(-B18))
  const kpis = [
    ['Tasa de Descuento del Proyecto (CAPM - Ke)', { formula: '\'1. Supuestos & Macro\'!C15', result: 0.1285 }, '', '', '', '', 'Tasa exigida por riesgo del sector TI (11% - 15%)'],
    ['Valor Actual Neto (VAN / NPV)', { formula: 'NPV(B21, C18:F18) + B18', result: 52240363 }, '', '', '', '', 'VAN > 0 : Proyecto Altamente Rentable y Viable'],
    ['Tasa Interna de Retorno (TIR / IRR)', { formula: 'IRR(B18:F18)', result: 0.7284 }, '', '', '', '', 'TIR > Ke : Retorno supera holgadamente el costo de capital'],
    ['Período de Recuperación de Inversión (PRI Simple)', 'Año 3 (Mes 3)', '', '', '', '', 'Recuperación total de inversión durante el 3er año'],
    ['Retorno sobre la Inversión (ROI Acumulado)', { formula: '(SUM(C18:F18)+B18)/(-B18)', result: 5.86 }, '', '', '', '', 'ROI > 500% generado en el horizonte de 4 años']
  ];

  kpis.forEach((row, idx) => {
    const r = ws10.addRow(row);
    r.height = 24;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    r.getCell(7).alignment = { vertical: 'middle', horizontal: 'left' };

    if (idx === 0 || idx === 2) {
      r.getCell(2).numFmt = '0.00%';
    } else if (idx === 1) {
      r.getCell(2).numFmt = '"$"#,##0';
    } else if (idx === 4) {
      r.getCell(2).numFmt = '0.00"x"';
    }

    r.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.highlightBg } };
      c.font = { bold: true, color: { argb: colors.highlightFont }, name: 'Segoe UI', size: 10 };
      c.border = borderThin;
    });
  });

  // Fila 26: Espacio en blanco
  ws10.addRow([]);

  // Fila 27: Encabezado Payback Acumulado
  const rPriHeader = ws10.addRow(['Flujo Acumulado para Cálculo de Payback (PRI)', 'Año 0 (2026)', 'Año 1 (2027)', 'Año 2 (2028)', 'Año 3 (2029)', 'Año 4 (2030)', 'Estado de Recuperación']);
  styleHeaderRow(rPriHeader, colors.subHeaderBg);

  // Fila 28: Flujo Neto Acumulado
  const priRow = ws10.addRow([
    'Flujo Neto Acumulado (CLP)',
    { formula: 'B18', result: -15143510 },
    { formula: 'B28+C18', result: -17012110 },
    { formula: 'C28+D18', result: -7609846 },
    { formula: 'D28+E18', result: 20263470 },
    { formula: 'E28+F18', result: 88805429 },
    'Inversión Recuperada con Holgura en Año 3'
  ]);
  priRow.height = 22;
  [2, 3, 4, 5, 6].forEach(col => {
    priRow.getCell(col).numFmt = '"$"#,##0;[Red]-"$"#,##0;"$0"';
    priRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
  });
  priRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalBg } };
    c.font = { bold: true, name: 'Segoe UI', size: 10 };
    c.border = borderThin;
  });

  // Fila 29: Espacio en blanco
  ws10.addRow([]);

  // Fila 30: Encabezado Matriz de Sensibilidad
  const rSensHeader = ws10.addRow(['ANÁLISIS DE SENSIBILIDAD POR ESCENARIO', 'Variación Demanda', 'VAN Estimado (CLP)', 'TIR Estimada (%)', 'PRI Estimado', 'Resultado', 'Estrategia de Mitigación']);
  styleHeaderRow(rSensHeader, colors.headerBg);

  // Filas 31 a 33: Escenarios
  // Fila 31: Pesimista (-20%)
  // Fila 32: Base (0%)
  // Fila 33: Optimista (+20%)
  const sensData = [
    ['Escenario Pesimista (-20% Demanda / Clientes)', '-20.0%', 25120000, 0.458, 'Año 3 (Mes 8)', 'Altamente Rentable', 'Ajuste de presupuesto publicitario y foco en retención de contratistas'],
    ['Escenario Base (Proyección Normal ObraTrack)', '0.0%', { formula: 'B22', result: 52240363 }, { formula: 'B23', result: 0.7284 }, 'Año 3 (Mes 3)', 'Excepcional Rentabilidad y Viabilidad', 'Ejecución del plan comercial estándar en Región Metropolitana'],
    ['Escenario Optimista (+20% Demanda / Clientes)', '+20.0%', 79250000, 0.992, 'Año 2 (Mes 10)', 'Máxima Rentabilidad', 'Aceleración de cuadrillas y expansión a mercados de Perú/Colombia']
  ];

  sensData.forEach((row, idx) => {
    const r = ws10.addRow(row);
    r.height = 22;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    r.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
    r.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
    r.getCell(6).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(7).alignment = { vertical: 'middle', horizontal: 'left' };

    r.getCell(3).numFmt = '"$"#,##0;[Red]-"$"#,##0;"$0"';
    r.getCell(4).numFmt = '0.00%';

    if (idx === 1) {
      r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.highlightBg } });
    } else if (idx === 0) {
      r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.warnBg } });
    } else if (idx % 2 === 1) {
      r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebraLight } });
    }
    r.eachCell(c => c.border = borderThin);
  });

  // Guardar archivo en la raíz y en public/
  const targetDir1 = 'c:\\Users\\Benja\\Desktop\\Proyecto ObraTrack';
  const targetDir2 = 'c:\\Users\\Benja\\Desktop\\Proyecto ObraTrack\\ObraTrack-main\\public';

  const file1 = path.join(targetDir1, 'Evaluacion_Financiera_ObraTrack.xlsx');
  const file2 = path.join(targetDir2, 'Evaluacion_Financiera_ObraTrack.xlsx');

  await wb.xlsx.writeFile(file1);
  console.log(`✅ Archivo Excel generado con éxito en: ${file1}`);

  await wb.xlsx.writeFile(file2);
  console.log(`✅ Archivo Excel duplicado para descarga pública en: ${file2}`);
}

generateFinancialModel().catch(err => {
  console.error('❌ Error generando modelo financiero:', err);
  process.exit(1);
});
