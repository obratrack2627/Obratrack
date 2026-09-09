const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://guouimnywtmnfzgocksr.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b3VpbW55d3RtbmZ6Z29ja3NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODkyNDkyNSwiZXhwIjoyMTA0NTAwOTI1fQ.XxLB5RRMrXHzvaMZB7noUWwrcwM0hgWLKjF_WP5VGMQ';

const supabase = createClient(supabaseUrl, serviceKey);

async function seedData() {
  console.log('Sembrando datos en Supabase PostgreSQL...');

  // 1. Empresa
  const empId = 'e1111111-1111-4111-a111-111111111111';
  await supabase.from('empresas').upsert({
    id: empId,
    rut: '76.123.456-7',
    nombre: 'Constructora ObraTrack SpA'
  });

  // 2. Usuarios
  const uAdminId = 'u-admin-001';
  const uMaestroId = 'u-maestro-001';

  await supabase.from('usuarios').upsert([
    {
      id: uAdminId,
      empresa_id: empId,
      rut: '18.731.075-K',
      nombre: 'Benjamín Achavar (Contratista)',
      email: 'benjamin@obratrack.cl',
      rol: 'admin',
      telefono_whatsapp: '+56912345678'
    },
    {
      id: uMaestroId,
      empresa_id: empId,
      rut: '14.238.991-4',
      nombre: 'Maestro Juan Pérez (Faena)',
      email: 'juan.perez@obratrack.cl',
      rol: 'terreno',
      telefono_whatsapp: '+56987654321'
    }
  ]);

  // 3. Clientes
  const cliId1 = 'c-001';
  const cliId2 = 'c-002';

  await supabase.from('clientes').upsert([
    {
      id: cliId1,
      empresa_id: empId,
      rut: '15.432.198-7',
      nombre: 'Carlos Muñoz',
      telefono: '+56987654321',
      email: 'carlos.munoz@gmail.com',
      direccion: 'Av. Las Condes 1234'
    },
    {
      id: cliId2,
      empresa_id: empId,
      rut: '12.890.345-2',
      nombre: 'Inmobiliaria Los Robles',
      telefono: '+56955554444',
      email: 'contacto@losrobles.cl',
      direccion: 'Providencia 890'
    }
  ]);

  // 4. Proyectos
  const p1 = 'p-001';
  const p2 = 'p-002';

  await supabase.from('proyectos').upsert([
    {
      id: p1,
      empresa_id: empId,
      cliente_id: cliId1,
      nombre: 'Ampliación Segundo Piso Las Condes',
      descripcion: 'Ampliación en estructura metálica y tabiquería de pino de 45 m2 con baño en suite.',
      direccion: 'Av. Las Condes 1234',
      comuna: 'Las Condes',
      region: 'Región Metropolitana',
      fecha_inicio: '2026-08-01',
      fecha_termino_estimada: '2026-10-30',
      estado: 'activo',
      monto_cotizado: 18500000
    },
    {
      id: p2,
      empresa_id: empId,
      cliente_id: cliId2,
      nombre: 'Remodelación Cocina & Radier Maipú',
      descripcion: 'Cambio de cerámicos a porcelanato, instalación de muebles a medida y nuevo radier.',
      direccion: 'Pajaritos 4560',
      comuna: 'Maipú',
      region: 'Región Metropolitana',
      fecha_inicio: '2026-08-15',
      fecha_termino_estimada: '2026-09-30',
      estado: 'activo',
      monto_cotizado: 7800000
    }
  ]);

  // 5. Actividades (Gantt)
  await supabase.from('actividades').upsert([
    {
      id: 'act-001',
      proyecto_id: p1,
      responsable_id: uMaestroId,
      nombre: 'Demolición y despeje de techumbre',
      fecha_inicio: '2026-08-01',
      fecha_termino: '2026-08-08',
      porcentaje_avance: 100,
      estado: 'terminada',
      orden: 1
    },
    {
      id: 'act-002',
      proyecto_id: p1,
      responsable_id: uMaestroId,
      nombre: 'Montaje de vigas y estructura de piso',
      fecha_inicio: '2026-08-09',
      fecha_termino: '2026-08-25',
      porcentaje_avance: 85,
      estado: 'en_curso',
      orden: 2
    },
    {
      id: 'act-003',
      proyecto_id: p1,
      responsable_id: uMaestroId,
      nombre: 'Tabiquería, aislación térmica e instalaciones sanitarias',
      fecha_inicio: '2026-08-26',
      fecha_termino: '2026-09-18',
      porcentaje_avance: 30,
      estado: 'en_curso',
      orden: 3
    }
  ]);

  // 6. Pagos
  await supabase.from('pagos').upsert([
    {
      id: 'pay-001',
      proyecto_id: p1,
      cliente_id: cliId1,
      monto: 5550000,
      metodo: 'transferencia',
      estado: 'completado',
      fecha: '2026-08-01',
      notas: 'Anticipo inicial 30% según contrato'
    },
    {
      id: 'pay-002',
      proyecto_id: p1,
      cliente_id: cliId1,
      monto: 5550000,
      metodo: 'transferencia',
      estado: 'completado',
      fecha: '2026-08-26',
      notas: 'Segundo estado de pago contra avance de obra gruesa'
    }
  ]);

  // 7. Materiales
  await supabase.from('materiales_proyecto').upsert([
    {
      id: 'mat-001',
      proyecto_id: p1,
      nombre: 'Placa OSB Estructural 9.5mm 1.22x2.44m',
      categoria: 'Tabiquería',
      cantidad: 35,
      unidad: 'Placa',
      precio_unitario: 9490,
      subtotal: 332150,
      proveedor: 'Construmart',
      comprado: true
    },
    {
      id: 'mat-002',
      proyecto_id: p1,
      nombre: 'Pino Dimensionado 2x4x3.2m',
      categoria: 'Maderas',
      cantidad: 80,
      unidad: 'Tira',
      precio_unitario: 3190,
      subtotal: 255200,
      proveedor: 'Imperial',
      comprado: true
    }
  ]);

  // 8. Bitácora
  await supabase.from('bitacora_entradas').upsert([
    {
      id: 'bit-001',
      proyecto_id: p1,
      usuario_id: uMaestroId,
      autor_nombre: 'Maestro Juan Pérez',
      titulo: 'Terminado montaje de vigas maestras',
      nota: 'Se reforzó la unión con escuadras metálicas y pernos pasantes según recomendación de cálculo.',
      fecha: '2026-08-25T17:30:00Z',
      tipo: 'avance'
    }
  ]);

  console.log('🎉 DATOS SEMBRADOS CON ÉXITO EN SUPABASE!');
}

seedData();