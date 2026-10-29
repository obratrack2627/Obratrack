const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://guouimnywtmnfzgocksr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b3VpbW55d3RtbmZ6Z29ja3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MjQ5MjUsImV4cCI6MjEwNDUwMDkyNX0.PZTxOfJs0MBCC3ZtPMIwaKSZUwBoQ4Q_XvtyMV6ae2I';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  console.log('Conectando a Supabase...');
  
  // 1. Insertar empresa
  const empId = 'e1111111-1111-4111-a111-111111111111';
  const { error: errEmp } = await supabase.from('empresas').upsert({
    id: empId,
    rut: '76.123.456-7',
    nombre: 'Constructora ObraTrack SpA'
  });
  if (errEmp) console.error('Error empresa:', errEmp);
  else console.log('✅ Empresa creada o actualizada en Supabase.');

  // 2. Insertar cliente
  const cliId = 'c1111111-1111-4111-a111-111111111111';
  const { error: errCli } = await supabase.from('clientes').upsert({
    id: cliId,
    empresa_id: empId,
    rut: '15.432.198-7',
    nombre: 'Carlos Muñoz',
    telefono: '+56987654321',
    email: 'carlos.munoz@gmail.com',
    direccion: 'Av. Las Condes 1234'
  });
  if (errCli) console.error('Error cliente:', errCli);
  else console.log('✅ Cliente creado en Supabase.');

  // 3. Insertar proyecto
  const projId = 'p1111111-1111-4111-a111-111111111111';
  const { error: errProj } = await supabase.from('proyectos').upsert({
    id: projId,
    empresa_id: empId,
    cliente_id: cliId,
    nombre: 'Ampliación Segundo Piso Las Condes',
    comuna: 'Las Condes',
    region: 'Región Metropolitana',
    fecha_inicio: '2026-09-01',
    fecha_termino_estimada: '2026-11-15',
    estado: 'activo',
    monto_cotizado: 18500000
  });
  if (errProj) console.error('Error proyecto:', errProj);
  else console.log('✅ Proyecto creado en Supabase.');

  // 4. Leer proyectos
  const { data: projs, error: errRead } = await supabase.from('proyectos').select('*');
  if (errRead) console.error('Error lectura:', errRead);
  else console.log('📋 Proyectos en Supabase:', projs);
}

testInsert().catch(console.error);