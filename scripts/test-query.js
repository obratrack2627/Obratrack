const https = require('https');
const token = 'sbp_oauth_145ae72a1dc956e561aaba1f463ec428139f732c';
const ref = 'guouimnywtmnfzgocksr';
const data = JSON.stringify({ query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" });

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
    console.log('Tablas confirmadas en Supabase PostgreSQL:');
    try {
      const rows = JSON.parse(body);
      console.table(rows);
    } catch(e) {
      console.log(body);
    }
  });
});
req.write(data);
req.end();