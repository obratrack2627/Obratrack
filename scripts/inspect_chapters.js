const unzipper = require('unzipper');

async function inspectChapters() {
  const docPath = 'c:/Users/Benja/Desktop/Proyecto ObraTrack/Tesis ObraTrack.docx';
  const directory = await unzipper.Open.file(docPath);
  const file = directory.files.find(d => d.path === 'word/document.xml');
  const content = await file.buffer();
  const xml = content.toString('utf-8');
  
  const paragraphs = xml.match(/<w:p\b[^>]*>.*?<\/w:p>/g) || [];
  
  for (let i = 1000; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const text = p.replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    
    if (/Cap[ií]tulo|CAP[IÍ]TULO|^\d{1,2}\./i.test(text)) {
      console.log(`\n--- [P:${i}] ${text} ---`);
      // print next 2 non-empty paragraphs
      let count = 0;
      for (let j = i + 1; j < Math.min(i + 15, paragraphs.length); j++) {
        const nextText = paragraphs[j].replace(/<[^>]+>/g, '').trim();
        if (nextText) {
          console.log(`   > ${nextText.substring(0, 100)}...`);
          count++;
          if (count >= 2) break;
        }
      }
    }
  }
}

inspectChapters().catch(console.error);
