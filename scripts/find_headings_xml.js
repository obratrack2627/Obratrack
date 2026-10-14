const JSZip = require('jszip');
const fs = require('fs');

async function findHeadingsXml() {
  const filePath = 'c:/Users/Benja/Desktop/Proyecto ObraTrack/Tesis ObraTrack.docx';
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');

  const targets = [
    'Detalle de las Tecnologías a implementar',
    'Análisis cualitativo/cuantitativo',
    'Herramientas, aplicaciones, lenguajes',
    'Implementación de los KPI y SLA',
    'Descripción de KPI',
    'Descripción de SLA',
    'Plan de Pruebas y Aseguramiento de Calidad',
    'Plan de Pruebas',
    'Normas y Estándares',
    'Plan de Implementación',
    'Gestión de Disponibilidad',
    'Gestión de Continuidad',
    'Plan de Mantención',
    'Factibilidad Económica',
    'Ajustes del Cronograma',
    'Revisión de Carta Gantt'
  ];

  targets.forEach(t => {
    let pos = 0;
    const matches = [];
    while ((pos = xml.indexOf(t, pos)) !== -1) {
      // Find start of paragraph <w:p and end of paragraph </w:p>
      const pStart = xml.lastIndexOf('<w:p', pos);
      const pEnd = xml.indexOf('</w:p>', pos);
      matches.push({ pos, pXml: xml.substring(pStart, pEnd + 6) });
      pos += t.length;
    }
    console.log(`\n=== TARGET: "${t}" (Found ${matches.length} times) ===`);
    matches.forEach((m, idx) => {
      console.log(`[#${idx + 1}] at pos ${m.pos}:`);
      console.log(m.pXml.substring(0, 300) + '...');
    });
  });
}

findHeadingsXml().catch(console.error);
