/**
 * Catálogo de Regiones, Comunas y Coordenadas GPS de referencia en Chile
 * para georreferenciación de proyectos de construcción en ObraTrack
 */

export interface ComunaChile {
  nombre: string;
  region: string;
  lat: number;
  lng: number;
}

export interface RegionChile {
  nombre: string;
  numero: string;
  capital: string;
  comunas: string[];
}

export const REGIONES_CHILE: RegionChile[] = [
  {
    nombre: 'Región Metropolitana de Santiago',
    numero: 'RM',
    capital: 'Santiago',
    comunas: [
      'Santiago',
      'Las Condes',
      'Providencia',
      'Vitacura',
      'Lo Barnechea',
      'Ñuñoa',
      'La Reina',
      'Peñalolén',
      'Macul',
      'La Florida',
      'Maipú',
      'Pudahuel',
      'Quilicura',
      'Huechuraba',
      'Recoleta',
      'Independencia',
      'Conchalí',
      'Renca',
      'Cerro Navia',
      'Quinta Normal',
      'Estación Central',
      'Cerrillos',
      'Pedro Aguirre Cerda',
      'San Miguel',
      'San Joaquín',
      'La Cisterna',
      'San Ramón',
      'La Granja',
      'El Bosque',
      'La Pintana',
      'San Bernardo',
      'Puente Alto',
      'Pirque',
      'San José de Maipo',
      'Colina',
      'Lampa',
      'Tiltil',
      'Melipilla',
      'Buin',
      'Paine',
      'Talagante',
      'Peñaflor',
      'Isla de Maipo',
      'Padre Hurtado',
    ],
  },
  {
    nombre: 'Región de Valparaíso',
    numero: 'V',
    capital: 'Valparaíso',
    comunas: [
      'Valparaíso',
      'Viña del Mar',
      'Concón',
      'Quilpué',
      'Villa Alemana',
      'Quillota',
      'La Calera',
      'Limache',
      'San Antonio',
      'Santo Domingo',
      'Cartagena',
      'El Quisco',
      'El Tabo',
      'Algarrobo',
      'Casablanca',
      'Los Andes',
      'San Felipe',
      'Zapallar',
      'Papudo',
      'Maitencillo / Puchuncaví',
    ],
  },
  {
    nombre: 'Región del Biobío',
    numero: 'VIII',
    capital: 'Concepción',
    comunas: [
      'Concepción',
      'San Pedro de la Paz',
      'Chiguayante',
      'Talcahuano',
      'Hualpén',
      'Coronel',
      'Lota',
      'Penco',
      'Tomé',
      'Los Ángeles',
    ],
  },
  {
    nombre: 'Región de La Araucanía',
    numero: 'IX',
    capital: 'Temuco',
    comunas: [
      'Temuco',
      'Padre Las Casas',
      'Villarrica',
      'Pucón',
      'Angol',
      'Lautaro',
      'Victoria',
    ],
  },
  {
    nombre: 'Región de Coquimbo',
    numero: 'IV',
    capital: 'La Serena',
    comunas: [
      'La Serena',
      'Coquimbo',
      'Ovalle',
      'Illapel',
      'Salamanca',
      'Vicuña',
      'Los Vilos',
    ],
  },
  {
    nombre: 'Región de Los Lagos',
    numero: 'X',
    capital: 'Puerto Montt',
    comunas: [
      'Puerto Montt',
      'Puerto Varas',
      'Osorno',
      'Castro',
      'Ancud',
      'Frutillar',
      'Llanquihue',
    ],
  },
  {
    nombre: 'Región de Antofagasta',
    numero: 'II',
    capital: 'Antofagasta',
    comunas: ['Antofagasta', 'Calama', 'Mejillones', 'Tocopilla', 'San Pedro de Atacama'],
  },
  {
    nombre: 'Región del Maule',
    numero: 'VII',
    capital: 'Talca',
    comunas: ['Talca', 'Curicó', 'Linares', 'Constitución', 'San Javier', 'Molina'],
  },
  {
    nombre: "Región del Libertador Bernardo O'Higgins",
    numero: 'VI',
    capital: 'Rancagua',
    comunas: ['Rancagua', 'Machalí', 'San Fernando', 'Rengo', 'Pichilemu', 'Graneros'],
  },
  {
    nombre: 'Región de Los Ríos',
    numero: 'XIV',
    capital: 'Valdivia',
    comunas: ['Valdivia', 'La Unión', 'Panguipulli', 'Río Bueno'],
  },
  {
    nombre: 'Región de Tarapacá',
    numero: 'I',
    capital: 'Iquique',
    comunas: ['Iquique', 'Alto Hospicio', 'Pozo Almonte'],
  },
  {
    nombre: 'Región de Arica y Parinacota',
    numero: 'XV',
    capital: 'Arica',
    comunas: ['Arica', 'Camarones', 'Putre'],
  },
  {
    nombre: 'Región de Atacama',
    numero: 'III',
    capital: 'Copiapó',
    comunas: ['Copiapó', 'Vallenar', 'Caldera'],
  },
  {
    nombre: 'Región de Ñuble',
    numero: 'XVI',
    capital: 'Chillán',
    comunas: ['Chillán', 'Chillán Viejo', 'San Carlos', 'Bulnes'],
  },
  {
    nombre: 'Región de Aysén',
    numero: 'XI',
    capital: 'Coyhaique',
    comunas: ['Coyhaique', 'Puerto Aysén'],
  },
  {
    nombre: 'Región de Magallanes y de la Antártica Chilena',
    numero: 'XII',
    capital: 'Punta Arenas',
    comunas: ['Punta Arenas', 'Puerto Natales'],
  },
];

// Coordenadas GPS exactas de comunas principales de Chile
export const COORDENADAS_COMUNAS_CHILE: Record<string, { lat: number; lng: number }> = {
  // Santiago / RM
  'Santiago': { lat: -33.4489, lng: -70.6693 },
  'Las Condes': { lat: -33.4116, lng: -70.5794 },
  'Providencia': { lat: -33.4312, lng: -70.6124 },
  'Vitacura': { lat: -33.3855, lng: -70.5739 },
  'Lo Barnechea': { lat: -33.3542, lng: -70.5186 },
  'Ñuñoa': { lat: -33.4569, lng: -70.5978 },
  'La Reina': { lat: -33.4475, lng: -70.5367 },
  'Peñalolén': { lat: -33.4842, lng: -70.5478 },
  'La Florida': { lat: -33.5227, lng: -70.5984 },
  'Maipú': { lat: -33.5111, lng: -70.7578 },
  'Huechuraba': { lat: -33.3742, lng: -70.6389 },
  'Colina': { lat: -33.2031, lng: -70.6756 },
  'Chicureo': { lat: -33.2842, lng: -70.6722 },
  'Lampa': { lat: -33.2833, lng: -70.8667 },
  'Puente Alto': { lat: -33.6117, lng: -70.5756 },
  'San Bernardo': { lat: -33.5922, lng: -70.7042 },
  'Buin': { lat: -33.7328, lng: -70.7428 },
  'Talagante': { lat: -33.6639, lng: -70.9278 },

  // Valparaíso / V Región
  'Valparaíso': { lat: -33.0472, lng: -71.6127 },
  'Viña del Mar': { lat: -33.0245, lng: -71.5518 },
  'Concón': { lat: -32.9242, lng: -71.5178 },
  'Quilpué': { lat: -33.0489, lng: -71.4428 },
  'Villa Alemana': { lat: -33.0428, lng: -71.3739 },
  'Quillota': { lat: -32.8833, lng: -71.2500 },
  'Zapallar': { lat: -32.5539, lng: -71.4589 },
  'Papudo': { lat: -32.5083, lng: -71.4500 },
  'Maitencillo / Puchuncaví': { lat: -32.6500, lng: -71.4333 },
  'San Antonio': { lat: -33.5939, lng: -71.6078 },
  'Santo Domingo': { lat: -33.6428, lng: -71.6278 },
  'Algarrobo': { lat: -33.3667, lng: -71.6667 },

  // Biobío / Concepción
  'Concepción': { lat: -36.8201, lng: -73.0444 },
  'San Pedro de la Paz': { lat: -36.8406, lng: -73.1042 },
  'Talcahuano': { lat: -36.7249, lng: -73.1168 },
  'Chiguayante': { lat: -36.9167, lng: -73.0167 },
  'Los Ángeles': { lat: -37.4697, lng: -72.3537 },

  // La Araucanía
  'Temuco': { lat: -38.7359, lng: -72.5904 },
  'Pucón': { lat: -39.2783, lng: -71.9744 },
  'Villarrica': { lat: -39.2833, lng: -72.2333 },

  // Coquimbo
  'La Serena': { lat: -29.9027, lng: -71.2519 },
  'Coquimbo': { lat: -29.9533, lng: -71.3395 },
  'Ovalle': { lat: -30.6011, lng: -71.2003 },

  // Los Lagos
  'Puerto Montt': { lat: -41.4693, lng: -72.9424 },
  'Puerto Varas': { lat: -41.3195, lng: -72.9854 },
  'Osorno': { lat: -40.5739, lng: -73.1335 },
  'Castro': { lat: -42.4721, lng: -73.7732 },
  'Frutillar': { lat: -41.1278, lng: -73.0456 },

  // Antofagasta
  'Antofagasta': { lat: -23.6509, lng: -70.3975 },
  'Calama': { lat: -22.4544, lng: -68.9294 },
  'San Pedro de Atacama': { lat: -22.9087, lng: -68.1997 },

  // Maule
  'Talca': { lat: -35.4264, lng: -71.6554 },
  'Curicó': { lat: -34.9854, lng: -71.2394 },

  // O'Higgins
  'Rancagua': { lat: -34.1708, lng: -70.7444 },
  'Machalí': { lat: -34.1808, lng: -70.6508 },
  'Pichilemu': { lat: -34.3853, lng: -72.0047 },

  // Los Ríos
  'Valdivia': { lat: -39.8196, lng: -73.2459 },

  // Tarapacá & Arica
  'Iquique': { lat: -20.2133, lng: -70.1503 },
  'Arica': { lat: -18.4783, lng: -70.3126 },

  // Magallanes
  'Punta Arenas': { lat: -53.1638, lng: -70.9171 },
  'Puerto Natales': { lat: -51.7269, lng: -72.5064 },
};

/**
 * Obtener coordenadas aproximadas para una comuna
 */
export function getCoordenadasComuna(comuna?: string): { lat: number; lng: number } {
  if (!comuna) return { lat: -33.4489, lng: -70.6693 }; // Santiago centro por defecto
  const match = COORDENADAS_COMUNAS_CHILE[comuna];
  return match || { lat: -33.4489, lng: -70.6693 };
}
