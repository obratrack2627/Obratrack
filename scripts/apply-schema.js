const fs = require('fs');
const https = require('https');

const token = process.env.SUPABASE_ACCESS_TOKEN || '';
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
      console.error('Error aplicando esquema SQL. Status:', Number(res.statusCode) || 0);
    }
  });
});

req.on('error', err => console.error('Error de red:', err));
req.write(data);
req.end();