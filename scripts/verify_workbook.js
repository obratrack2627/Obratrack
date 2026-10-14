const ExcelJS = require('exceljs');
const path = require('path');

async function verifyWorkbook() {
  const wb = new ExcelJS.Workbook();
  const filePath = path.join('c:\\Users\\Benja\\Desktop\\Proyecto ObraTrack', 'Evaluacion_Financiera_ObraTrack.xlsx');
  await wb.xlsx.readFile(filePath);

  console.log(`=== REVISIÓN DE HOJAS DEL LIBRO ===`);
  wb.eachSheet((ws, id) => {
    console.log(`Hoja ${id}: "${ws.name}" - ${ws.rowCount} filas, ${ws.columnCount} columnas`);
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      row.eachCell((cell, colNumber) => {
        if (cell.value && typeof cell.value === 'object' && cell.value.formula) {
          console.log(`  [${ws.name}] ${cell.address} = { formula: "${cell.value.formula}", result: ${cell.value.result} }`);
        }
      });
    }
  });
}

verifyWorkbook().catch(console.error);
