const { google } = require('googleapis');
const credentials = require('./google-service-account.json');

async function readDoc() {
  try {
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive',
      ],
    });

    await auth.authorize();
    console.log('✅ Autorizacion JWT con Service Account exitosa');

    const docs = google.docs({ version: 'v1', auth });
    const documentId = '1A4PSC6cO_dEwkyrOMWiND19o3sS-hKVHsSz3qZUkY3Q';

    const res = await docs.documents.get({ documentId });
    console.log('Titulo del Documento:', res.data.title);
    
    // Extraer texto plano
    let fullText = '';
    (res.data.body.content || []).forEach(element => {
      if (element.paragraph) {
        element.paragraph.elements.forEach(el => {
          if (el.textRun && el.textRun.content) {
            fullText += el.textRun.content;
          }
        });
      }
    });

    console.log('--- CONTENIDO ACTUAL DEL DOCUMENTO ---');
    console.log(fullText.trim() || '[El documento esta vacio]');
    console.log('--------------------------------------');
  } catch (err) {
    console.error('Error leyendo Google Doc:', err.message);
  }
}

readDoc();