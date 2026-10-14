const fs = require('fs');
const unzipper = require('unzipper');

async function readDocx() {
  const docPath = 'c:/Users/Benja/Desktop/Proyecto ObraTrack/Tesis ObraTrack.docx';
  const directory = await unzipper.Open.file(docPath);
  const file = directory.files.find(d => d.path === 'word/document.xml');
  const content = await file.buffer();
  const xml = content.toString('utf-8');
  
  const paragraphs = xml.match(/<w:p\b[^>]*>.*?<\/w:p>/g) || [];
  console.log('Total paragraphs in document:', paragraphs.length);
  
  const headings = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const text = p.replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    
    const styleMatch = p.match(/w:pStyle w:val="([^"]+)"/);
    const style = styleMatch ? styleMatch[1] : '';
    
    const isHeading = /heading|titulo|título|subtitulo/i.test(style) ||
                      /^(\d{1,2}(?:\.\d{1,2})*\.?\s+[A-ZÁÉÍÓÚÑ]|CAPÍTULO|Capítulo)/.test(text);
                      
    if (isHeading && text.length < 150) {
      headings.push({ index: i, style, text });
    }
  }
  
  console.log(`Found ${headings.length} headings:`);
  headings.forEach(h => console.log(`[P:${h.index}] [${h.style}] ${h.text}`));
}

readDocx().catch(console.error);
