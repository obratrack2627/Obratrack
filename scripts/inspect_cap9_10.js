const unzipper = require('unzipper');

async function inspectChapters9and10() {
  const docPath = 'c:/Users/Benja/Desktop/Proyecto ObraTrack/Tesis ObraTrack.docx';
  const directory = await unzipper.Open.file(docPath);
  const file = directory.files.find(d => d.path === 'word/document.xml');
  const content = await file.buffer();
  const xml = content.toString('utf-8');
  
  const paragraphs = xml.match(/<w:p\b[^>]*>.*?<\/w:p>/g) || [];
  
  // Find where Cap IX starts
  let cap9Idx = -1;
  let cap11Idx = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i].replace(/<[^>]+>/g, '').trim();
    if (text.includes('Capítulo IX') || text.includes('Capitulo IX')) {
      if (i > 150) { // after TOC
        cap9Idx = i;
      }
    }
    if (text.includes('Capítulo XI') || text.includes('Capitulo XI')) {
      if (i > 150) {
        cap11Idx = i;
        break;
      }
    }
  }
  
  console.log(`Cap IX index: ${cap9Idx}, Cap XI index: ${cap11Idx}`);
  for (let i = cap9Idx; i < cap11Idx; i++) {
    const text = paragraphs[i].replace(/<[^>]+>/g, '').trim();
    if (text) {
      console.log(`[P:${i}] ${text.substring(0, 110)}`);
    }
  }
}

inspectChapters9and10().catch(console.error);
