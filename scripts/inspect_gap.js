const unzipper = require('unzipper');

async function inspectGap() {
  const docPath = 'c:/Users/Benja/Desktop/Proyecto ObraTrack/Tesis ObraTrack.docx';
  const directory = await unzipper.Open.file(docPath);
  const file = directory.files.find(d => d.path === 'word/document.xml');
  const content = await file.buffer();
  const xml = content.toString('utf-8');
  
  const paragraphs = xml.match(/<w:p\b[^>]*>.*?<\/w:p>/g) || [];
  
  for (let i = 1195; i <= 1360; i++) {
    const p = paragraphs[i];
    const text = p.replace(/<[^>]+>/g, '').trim();
    if (text) {
      console.log(`[P:${i}] ${text}`);
    }
  }
}

inspectGap().catch(console.error);
