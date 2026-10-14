const JSZip = require('jszip');
const fs = require('fs');

async function testZip() {
  const filePath = 'c:/Users/Benja/Desktop/Proyecto ObraTrack/Tesis ObraTrack.docx';
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  
  console.log('Zip loaded successfully. Total entries:', Object.keys(zip.files).length);
  const docFile = zip.file('word/document.xml');
  const xml = await docFile.async('string');
  console.log('document.xml length:', xml.length, 'characters');
}

testZip().catch(console.error);
