const JSZip = require('jszip');
const fs = require('fs');

async function inspectStyles() {
  const filePath = 'c:/Users/Benja/Desktop/Proyecto ObraTrack/Tesis ObraTrack.docx';
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');

  // Find a sample table
  const tblMatch = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
  if (tblMatch) {
    console.log('=== SAMPLE TABLE XML (First 600 chars) ===');
    console.log(tblMatch[0].substring(0, 600));
  }

  // Find a sample normal paragraph with text
  const pMatches = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g);
  for (const p of pMatches) {
    if (p.includes('Revisión del estado del arte') || p.includes('La propuesta de ObraTrack')) {
      console.log('=== SAMPLE BODY PARAGRAPH XML ===');
      console.log(p);
      break;
    }
  }
}

inspectStyles().catch(console.error);
