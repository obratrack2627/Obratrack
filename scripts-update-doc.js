const { google } = require('googleapis');
const credentials = require('./google-service-account.json');

const DOCUMENT_ID = '1A4PSC6cO_dEwkyrOMWiND19o3sS-hKVHsSz3qZUkY3Q';

async function getDocsClient() {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  await auth.authorize();
  return google.docs({ version: 'v1', auth });
}

async function appendTextToDoc(text) {
  try {
    const docs = await getDocsClient();
    
    // Obtener longitud actual del documento
    const doc = await docs.documents.get({ documentId: DOCUMENT_ID });
    const bodyContent = doc.data.body.content || [];
    let endIndex = 1;
    if (bodyContent.length > 0) {
      const lastElement = bodyContent[bodyContent.length - 1];
      endIndex = lastElement.endIndex - 1;
    }

    const requests = [
      {
        insertText: {
          location: {
            index: endIndex,
          },
          text: '\n\n' + text + '\n',
        },
      },
    ];

    await docs.documents.batchUpdate({
      documentId: DOCUMENT_ID,
      requestBody: { requests },
    });

    console.log('✅ Texto insertado exitosamente en Google Docs.');
  } catch (err) {
    console.error('Error insertando texto:', err.message);
  }
}

// Exportar funciones
module.exports = { appendTextToDoc, getDocsClient, DOCUMENT_ID };