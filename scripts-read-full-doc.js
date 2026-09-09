const { google } = require('googleapis');
const credentials = require('./google-service-account.json');

async function getFullDoc() {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive'],
  });

  const docs = google.docs({ version: 'v1', auth });
  const documentId = '1A4PSC6cO_dEwkyrOMWiND19o3sS-hKVHsSz3qZUkY3Q';

  try {
    const res = await docs.documents.get({ documentId });
    console.log('=== DOCUMENT TITLE: ' + res.data.title + ' ===\n');

    let output = '';
    const bodyContent = res.data.body.content || [];

    for (const elem of bodyContent) {
      if (elem.paragraph) {
        const p = elem.paragraph;
        let pText = '';
        p.elements.forEach(el => {
          if (el.textRun && el.textRun.content) {
            let chunk = el.textRun.content;
            if (el.textRun.textStyle && el.textRun.textStyle.bold) {
              chunk = '**' + chunk.trim() + '**' + (chunk.endsWith(' ') ? ' ' : '');
            }
            pText += chunk;
          }
        });
        output += pText;
      } else if (elem.table) {
        output += '\n[TABLA]\n';
        elem.table.tableRows.forEach(row => {
          const rowCells = row.tableCells.map(cell => {
            let cellText = '';
            (cell.content || []).forEach(cElem => {
              if (cElem.paragraph) {
                cElem.paragraph.elements.forEach(el => {
                  if (el.textRun && el.textRun.content) cellText += el.textRun.content.trim();
                });
              }
            });
            return cellText;
          });
          output += '| ' + rowCells.join(' | ') + ' |\n';
        });
        output += '\n';
      }
    }

    console.log(output);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

getFullDoc();