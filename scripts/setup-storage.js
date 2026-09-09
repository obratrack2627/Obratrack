const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://guouimnywtmnfzgocksr.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b3VpbW55d3RtbmZ6Z29ja3NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODkyNDkyNSwiZXhwIjoyMTA0NTAwOTI1fQ.XxLB5RRMrXHzvaMZB7noUWwrcwM0hgWLKjF_WP5VGMQ';

const supabase = createClient(supabaseUrl, serviceKey);

async function setupBucket() {
  const { data: buckets, error: errList } = await supabase.storage.listBuckets();
  console.log('Buckets existentes:', buckets ? buckets.map(b => b.name) : errList);

  const exists = buckets && buckets.some(b => b.name === 'bitacora-fotos');
  if (!exists) {
    const { data, error } = await supabase.storage.createBucket('bitacora-fotos', {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp']
    });
    if (error) console.error('Error creando bucket:', error);
    else console.log('✅ Bucket bitacora-fotos creado exitosamente en Supabase Storage.');
  } else {
    console.log('✅ Bucket bitacora-fotos ya existe.');
  }
}

setupBucket();