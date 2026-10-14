const unzipper = require('unzipper');

async function inspectFigures() {
  const directory = await unzipper.Open.file('c:/Users/Benja/Desktop/Proyecto ObraTrack/Tesis ObraTrack.docx');
  const docFile = directory.files.find(f => f.path === 'word/document.xml');
  const relsFile = directory.files.find(f => f.path === 'word/_rels/document.xml.rels');
  
  const docXml = (await docFile.buffer()).toString('utf-8');
  const relsXml = (await relsFile.buffer()).toString('utf-8');
  
  // Map rId to target
  const relMap = {};
  const relMatches = relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*image"\s+Target="([^"]+)"/g);
  for (const m of relMatches) {
    relMap[m[1]] = m[2];
  }
  
  // Find all figure captions like "Figura X: ..."
  const paragraphs = docXml.match(/<w:p\b[^>]*>.*?<\/w:p>/g) || [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i].replace(/<[^>]+>/g, '').trim();
    if (text.startsWith('Figura ')) {
      // Find nearby blip r:embed
      let embedId = '';
      for (let j = Math.max(0, i - 3); j <= Math.min(paragraphs.length - 1, i + 3); j++) {
        const blipMatch = paragraphs[j].match(/r:embed="([^"]+)"/);
        if (blipMatch) {
          embedId = blipMatch[1];
          break;
        }
      }
      console.log(`${text} -> ${embedId ? relMap[embedId] || embedId : 'no direct blip'}`);
    }
  }
}

inspectFigures().catch(console.error);
