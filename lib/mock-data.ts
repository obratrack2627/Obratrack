import {
  Empresa,
  Usuario,
  Cliente,
  Proyecto,
  Actividad,
  Pago,
  Imprevisto,
  ReporteWhatsApp,
  CotizacionEstimacion,
  MaterialChile,
} from '@/types/database';

export const INITIAL_EMPRESA: Empresa = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Mi Constructora SpA',
  rut: '76.123.456-7',
};

export const INITIAL_USUARIOS: Usuario[] = [
  {
    id: '22222222-2222-2222-2222-222222222222',
    empresa_id: INITIAL_EMPRESA.id,
    nombre: 'Benjamín Achávar',
    email: 'benja105.achavar@gmail.com',
    rol: 'admin',
    telefono_whatsapp: '+56987654321',
  },
];

// Listas iniciales con datos de ejemplo en Chile para seguimiento de obras
export const INITIAL_CLIENTES: Cliente[] = [
  {
    id: 'cli-carlos',
    empresa_id: INITIAL_EMPRESA.id,
    nombre: 'Carlos Henríquez',
    rut: '15.432.890-1',
    telefono: '+56 9 8765 4321',
    email: 'carlos.henriquez@gmail.com',
    direccion: 'Av. Las Perdices 1420, Peñalolén, Santiago',
  },
  {
    id: 'cli-mariajose',
    empresa_id: INITIAL_EMPRESA.id,
    nombre: 'María José Ovalle',
    rut: '18.765.432-K',
    telefono: '+56 9 9123 4567',
    email: 'mariajose.ovalle@gmail.com',
    direccion: 'Camino El Alba 890, Las Condes, Santiago',
  },
];

export const INITIAL_PROYECTOS: Proyecto[] = [
  {
    id: 'proj-penalolen',
    empresa_id: INITIAL_EMPRESA.id,
    cliente_id: 'cli-carlos',
    nombre: 'Construcción Radier y Quincho Peñalolén',
    descripcion: 'Construcción de radier de 35m2 en hormigón H-20 y estructura de quincho en pino oregón con parrilla empotrada.',
    direccion: 'Av. Las Perdices 1420',
    comuna: 'Peñalolén',
    region: 'Región Metropolitana',
    latitud: -33.4862,
    longitud: -70.5312,
    fecha_inicio: '2026-08-10',
    fecha_termino_estimada: '2026-09-15',
    estado: 'activo',
    monto_cotizado: 3850000,
  },
  {
    id: 'proj-lascondes',
    empresa_id: INITIAL_EMPRESA.id,
    cliente_id: 'cli-mariajose',
    nombre: 'Remodelación Baño Principal & Terraza Las Condes',
    descripcion: 'Instalación de porcelanato rectificado 60x120, vanitorio flotante en roble y cierre perimetral de cristal templado.',
    direccion: 'Camino El Alba 890',
    comuna: 'Las Condes',
    region: 'Región Metropolitana',
    latitud: -33.4021,
    longitud: -70.5489,
    fecha_inicio: '2026-08-18',
    fecha_termino_estimada: '2026-09-25',
    estado: 'activo',
    monto_cotizado: 4900000,
  },
];

export const INITIAL_ACTIVIDADES: Actividad[] = [
  {
    id: 'act-1',
    proyecto_id: 'proj-penalolen',
    nombre: 'Trazado, excavación y nivelación de terreno',
    fecha_inicio: '2026-08-10',
    fecha_termino: '2026-08-14',
    porcentaje_avance: 100,
    estado: 'terminada',
    orden: 1,
  },
  {
    id: 'act-2',
    proyecto_id: 'proj-penalolen',
    nombre: 'Enfierradura Malla Acma y encofrado perimetral',
    fecha_inicio: '2026-08-15',
    fecha_termino: '2026-08-19',
    porcentaje_avance: 100,
    estado: 'terminada',
    orden: 2,
  },
  {
    id: 'act-3',
    proyecto_id: 'proj-penalolen',
    nombre: 'Vaciado y pulido de hormigón H-20 (Radier)',
    fecha_inicio: '2026-08-20',
    fecha_termino: '2026-08-24',
    porcentaje_avance: 100,
    estado: 'terminada',
    orden: 3,
  },
  {
    id: 'act-4',
    proyecto_id: 'proj-penalolen',
    nombre: 'Estructura de techumbre en pino oregón',
    fecha_inicio: '2026-08-25',
    fecha_termino: '2026-09-02',
    porcentaje_avance: 45,
    estado: 'en_curso',
    orden: 4,
  },
  {
    id: 'act-5',
    proyecto_id: 'proj-penalolen',
    nombre: 'Cubierta de tejas asfálticas y terminaciones de quincho',
    fecha_inicio: '2026-09-03',
    fecha_termino: '2026-09-15',
    porcentaje_avance: 0,
    estado: 'pendiente',
    orden: 5,
  },
];

export const INITIAL_PAGOS: Pago[] = [
  {
    id: 'pago-1',
    proyecto_id: 'proj-penalolen',
    monto: 1540000,
    metodo: 'transferencia',
    fecha: '2026-08-10',
    nota: 'Anticipo 40% inicial para compra de materiales (Melón, Imperial y fierro)',
  },
  {
    id: 'pago-2',
    proyecto_id: 'proj-penalolen',
    monto: 1155000,
    metodo: 'transferencia',
    fecha: '2026-08-22',
    nota: 'Segundo pago 30% contra término de vaciado de radier y fundaciones',
  },
];

export const INITIAL_IMPREVISTOS: Imprevisto[] = [];

export const INITIAL_REPORTES: ReporteWhatsApp[] = [];

export const INITIAL_COTIZACIONES: CotizacionEstimacion[] = [];

// Catálogo base de referencia de materiales en Chile (precios de ferreterías para cotizador y radar)
export const CATALOGO_MATERIALES_CHILE: MaterialChile[] = [
  {
    sku: 'MAT-001',
    nombre: 'Cemento Polpaico Especial 25kg',
    categoria: 'Obra Gruesa & Cemento',
    unidad: 'Saco 25kg',
    precios: {
      construmart: 4650,
      imperial: 4490,
      sodimac: 4890,
      mts: 4790,
    },
    mejor_tienda: 'Imperial',
    precio_minimo: 4490,
  },
  {
    sku: 'MAT-002',
    nombre: 'Placa OSB Estructural 9.5mm 1.22x2.44m APA',
    categoria: 'Tabiquería & Maderas',
    unidad: 'Placa',
    precios: {
      construmart: 9490,
      imperial: 9790,
      sodimac: 10490,
      mts: 9990,
    },
    mejor_tienda: 'Construmart',
    precio_minimo: 9490,
  },
  {
    sku: 'MAT-003',
    nombre: 'Pino Dimensionado 2x4x3.2m Verde',
    categoria: 'Maderas Estructurales',
    unidad: 'Tira',
    precios: {
      construmart: 3490,
      imperial: 3190,
      sodimac: 3890,
      mts: 3390,
      barraca: 2990,
    },
    mejor_tienda: 'Barraca Local',
    precio_minimo: 2990,
  },
  {
    sku: 'MAT-004',
    nombre: 'Fierro Estriado A63-42H 10mm x 6m',
    categoria: 'Fierradura & Enfierradura',
    unidad: 'Barra',
    precios: {
      construmart: 5190,
      imperial: 5390,
      sodimac: 5890,
      mts: 5490,
    },
    mejor_tienda: 'Construmart',
    precio_minimo: 5190,
  },
  {
    sku: 'MAT-005',
    nombre: 'Placa Volcanita Standard 10mm 1.2x2.4m',
    categoria: 'Tabiquería & Yeso Cartón',
    unidad: 'Placa',
    precios: {
      construmart: 6190,
      imperial: 5890,
      sodimac: 5690,
      mts: 5990,
    },
    mejor_tienda: 'Sodimac',
    precio_minimo: 5690,
  },
];
