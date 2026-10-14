const JSZip = require('jszip');
const fs = require('fs');

async function checkRels() {
  const filePath = 'c:/Users/Benja/Desktop/Proyecto ObraTrack/Tesis ObraTrack.docx';
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const relsXml = await zip.file('word/_rels/document.xml.rels').async('string');

  const rIds = [];
  const matches = relsXml.matchAll(/Id="rId(\d+)"/g);
  for (const m of matches) {
    rIds.push(parseInt(m[1]));
  }
  console.log('Max rId:', Math.max(...rIds));
  console.log('Total relationships:', rIds.length);
}

checkRels().catch(console.error);
