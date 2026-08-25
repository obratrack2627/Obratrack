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

// Listas iniciales limpias para que el usuario ingrese sus datos simulados
export const INITIAL_CLIENTES: Cliente[] = [];

export const INITIAL_PROYECTOS: Proyecto[] = [];

export const INITIAL_ACTIVIDADES: Actividad[] = [];

export const INITIAL_PAGOS: Pago[] = [];

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
