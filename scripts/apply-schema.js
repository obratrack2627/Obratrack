const fs = require('fs');
const https = require('https');

const token = 'sbp_oauth_145ae72a1dc956e561aaba1f463ec428139f732c';
const ref = 'guouimnywtmnfzgocksr';
const sql = fs.readFileSync('C:/Users/Benja/.gemini/antigravity-ide/scratch/ObraTrack/supabase/schema.sql', 'utf8');

const data = JSON.stringify({ query: sql });

const req = https.request({
  hostname: 'api.supabase.com',
  path: `/v1/projects/${ref}/database/query`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('🎉 ESQUEMA SQL DE OBRATRACK APLICADO EXITOSAMENTE EN SUPABASE!');
    } else {
      console.log('Detalle de respuesta:', body);
    }
  });
});

req.on('error', err => console.error('Error de red:', err));
req.write(data);
req.end();