const unzipper = require('unzipper');

async function inspectAround1000() {
  const docPath = 'c:/Users/Benja/Desktop/Proyecto ObraTrack/Tesis ObraTrack.docx';
  const directory = await unzipper.Open.file(docPath);
  const file = directory.files.find(d => d.path === 'word/document.xml');
  const content = await file.buffer();
  const xml = content.toString('utf-8');
  
  const paragraphs = xml.match(/<w:p\b[^>]*>.*?<\/w:p>/g) || [];
  
  for (let i = 1020; i <= 1090; i++) {
    const text = paragraphs[i].replace(/<[^>]+>/g, '').trim();
    if (text) {
      console.log(`[P:${i}] ${text.substring(0, 120)}`);
    }
  }
}

inspectAround1000().catch(console.error);
