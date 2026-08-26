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
  'Pudahuel': { lat: -33.4333, lng: -70.7667 },
  'Quilicura': { lat: -33.3667, lng: -70.7333 },
  'Huechuraba': { lat: -33.3742, lng: -70.6389 },
  'Recoleta': { lat: -33.4167, lng: -70.6333 },
  'Independencia': { lat: -33.4167, lng: -70.6667 },
  'Conchalí': { lat: -33.3833, lng: -70.6833 },
  'Renca': { lat: -33.4000, lng: -70.7333 },
  'San Miguel': { lat: -33.4833, lng: -70.6500 },
  'San Joaquín': { lat: -33.5000, lng: -70.6333 },
  'La Cisterna': { lat: -33.5333, lng: -70.6667 },
  'La Granja': { lat: -33.5333, lng: -70.6167 },
  'San Bernardo': { lat: -33.5922, lng: -70.7042 },
  'Puente Alto': { lat: -33.6117, lng: -70.5756 },
  'Pirque': { lat: -33.6333, lng: -70.5667 },
  'San José de Maipo': { lat: -33.6333, lng: -70.3500 },
  'Colina': { lat: -33.2031, lng: -70.6756 },
  'Lampa': { lat: -33.2833, lng: -70.8667 },
  'Tiltil': { lat: -33.0833, lng: -70.9333 },
  'Melipilla': { lat: -33.6833, lng: -71.2167 },
  'Buin': { lat: -33.7328, lng: -70.7428 },
  'Paine': { lat: -33.8167, lng: -70.7500 },
  'Talagante': { lat: -33.6639, lng: -70.9278 },
  'Peñaflor': { lat: -33.6000, lng: -70.8833 },
  'Padre Hurtado': { lat: -33.5667, lng: -70.8167 },

  // Valparaíso / V Región
  'Valparaíso': { lat: -33.0472, lng: -71.6127 },
  'Viña del Mar': { lat: -33.0245, lng: -71.5518 },
  'Concón': { lat: -32.9242, lng: -71.5178 },
  'Quilpué': { lat: -33.0489, lng: -71.4428 },
  'Villa Alemana': { lat: -33.0428, lng: -71.3739 },
  'Quillota': { lat: -32.8833, lng: -71.2500 },
  'La Calera': { lat: -32.7833, lng: -71.2000 },
  'Limache': { lat: -33.0000, lng: -71.2667 },
  'Zapallar': { lat: -32.5539, lng: -71.4589 },
  'Papudo': { lat: -32.5083, lng: -71.4500 },
  'Maitencillo / Puchuncaví': { lat: -32.6500, lng: -71.4333 },
  'San Antonio': { lat: -33.5939, lng: -71.6078 },
  'Santo Domingo': { lat: -33.6428, lng: -71.6278 },
  'Algarrobo': { lat: -33.3667, lng: -71.6667 },
  'El Quisco': { lat: -33.4000, lng: -71.7000 },
  'El Tabo': { lat: -33.4667, lng: -71.6667 },
  'Casablanca': { lat: -33.3167, lng: -71.4000 },
  'Los Andes': { lat: -32.8333, lng: -70.6000 },
  'San Felipe': { lat: -32.7500, lng: -70.7333 },

  // Biobío / Concepción
  'Concepción': { lat: -36.8201, lng: -73.0444 },
  'San Pedro de la Paz': { lat: -36.8406, lng: -73.1042 },
  'Talcahuano': { lat: -36.7249, lng: -73.1168 },
  'Chiguayante': { lat: -36.9167, lng: -73.0167 },
  'Hualpén': { lat: -36.7833, lng: -73.1000 },
  'Coronel': { lat: -37.0167, lng: -73.1333 },
  'Lota': { lat: -37.0833, lng: -73.1500 },
  'Penco': { lat: -36.7333, lng: -72.9833 },
  'Tomé': { lat: -36.6167, lng: -72.9500 },
  'Los Ángeles': { lat: -37.4697, lng: -72.3537 },

  // La Araucanía
  'Temuco': { lat: -38.7359, lng: -72.5904 },
  'Padre Las Casas': { lat: -38.7667, lng: -72.6000 },
  'Pucón': { lat: -39.2783, lng: -71.9744 },
  'Villarrica': { lat: -39.2833, lng: -72.2333 },
  'Angol': { lat: -37.8000, lng: -72.7167 },
  'Lautaro': { lat: -38.5333, lng: -72.4500 },
  'Victoria': { lat: -38.2333, lng: -72.3333 },

  // Coquimbo
  'La Serena': { lat: -29.9027, lng: -71.2519 },
  'Coquimbo': { lat: -29.9533, lng: -71.3395 },
  'Ovalle': { lat: -30.6011, lng: -71.2003 },
  'Illapel': { lat: -31.6333, lng: -71.1667 },
  'Salamanca': { lat: -31.7833, lng: -70.9667 },
  'Vicuña': { lat: -30.0333, lng: -70.7167 },
  'Los Vilos': { lat: -31.9167, lng: -71.5167 },

  // Los Lagos
  'Puerto Montt': { lat: -41.4693, lng: -72.9424 },
  'Puerto Varas': { lat: -41.3195, lng: -72.9854 },
  'Osorno': { lat: -40.5739, lng: -73.1335 },
  'Castro': { lat: -42.4721, lng: -73.7732 },
  'Ancud': { lat: -41.8667, lng: -73.8333 },
  'Frutillar': { lat: -41.1278, lng: -73.0456 },
  'Llanquihue': { lat: -41.2500, lng: -73.0167 },

  // Antofagasta
  'Antofagasta': { lat: -23.6509, lng: -70.3975 },
  'Calama': { lat: -22.4544, lng: -68.9294 },
  'Mejillones': { lat: -23.1000, lng: -70.4500 },
  'Tocopilla': { lat: -22.0833, lng: -70.2000 },
  'San Pedro de Atacama': { lat: -22.9087, lng: -68.1997 },

  // Maule
  'Talca': { lat: -35.4264, lng: -71.6554 },
  'Curicó': { lat: -34.9854, lng: -71.2394 },
  'Linares': { lat: -35.8500, lng: -71.6000 },
  'Constitución': { lat: -35.3333, lng: -72.4167 },
  'San Javier': { lat: -35.6000, lng: -71.7333 },
  'Molina': { lat: -35.1167, lng: -71.2833 },

  // O'Higgins
  'Rancagua': { lat: -34.1708, lng: -70.7444 },
  'Machalí': { lat: -34.1808, lng: -70.6508 },
  'San Fernando': { lat: -34.5833, lng: -70.9833 },
  'Rengo': { lat: -34.4000, lng: -70.8667 },
  'Pichilemu': { lat: -34.3853, lng: -72.0047 },
  'Graneros': { lat: -34.0667, lng: -70.7167 },

  // Los Ríos
  'Valdivia': { lat: -39.8196, lng: -73.2459 },
  'La Unión': { lat: -40.2833, lng: -73.0833 },
  'Panguipulli': { lat: -39.6333, lng: -72.3333 },
  'Río Bueno': { lat: -40.3333, lng: -72.9667 },

  // Tarapacá & Arica
  'Iquique': { lat: -20.2133, lng: -70.1503 },
  'Alto Hospicio': { lat: -20.2833, lng: -70.1000 },
  'Arica': { lat: -18.4783, lng: -70.3126 },

  // Atacama
  'Copiapó': { lat: -27.3667, lng: -70.3333 },
  'Vallenar': { lat: -28.5667, lng: -70.7500 },
  'Caldera': { lat: -27.0667, lng: -70.8167 },

  // Ñuble
  'Chillán': { lat: -36.6000, lng: -72.1000 },
  'Chillán Viejo': { lat: -36.6333, lng: -72.1333 },
  'San Carlos': { lat: -36.4333, lng: -71.9667 },

  // Aysén
  'Coyhaique': { lat: -45.5667, lng: -72.0667 },
  'Puerto Aysén': { lat: -45.4000, lng: -72.7000 },

  // Magallanes
  'Punta Arenas': { lat: -53.1638, lng: -70.9171 },
  'Puerto Natales': { lat: -51.7269, lng: -72.5064 },
};

/**
 * Encontrar la región correspondiente a una comuna
 */
export function findRegionForComuna(comunaName?: string): string {
  if (!comunaName) return 'Región Metropolitana de Santiago';
  const cleanName = comunaName.toLowerCase().trim();
  for (const reg of REGIONES_CHILE) {
    const match = reg.comunas.find(
      (c) => c.toLowerCase() === cleanName || cleanName.includes(c.toLowerCase())
    );
    if (match) return reg.nombre;
  }
  return 'Región Metropolitana de Santiago';
}

/**
 * Obtener coordenadas aproximadas para una comuna
 */
export function getCoordenadasComuna(comuna?: string): { lat: number; lng: number } {
  if (!comuna) return { lat: -33.4489, lng: -70.6693 }; // Santiago centro por defecto
  const match = COORDENADAS_COMUNAS_CHILE[comuna];
  if (match) return match;

  // Búsqueda aproximada si el nombre tiene variaciones
  const lower = comuna.toLowerCase();
  for (const [key, coords] of Object.entries(COORDENADAS_COMUNAS_CHILE)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return coords;
    }
  }

  return { lat: -33.4489, lng: -70.6693 };
}

/**
 * Encontrar la comuna chilena más cercana dadas unas coordenadas GPS (Fórmula de Haversine)
 */
export function findNearestComuna(
  lat: number,
  lng: number
): { comuna: string; region: string; distanceKm: number } {
  let nearestComuna = 'Santiago';
  let minDistance = Infinity;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Radio de la Tierra en km

  for (const [comunaName, coords] of Object.entries(COORDENADAS_COMUNAS_CHILE)) {
    const dLat = toRad(coords.lat - lat);
    const dLon = toRad(coords.lng - lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat)) *
        Math.cos(toRad(coords.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;

    if (d < minDistance) {
      minDistance = d;
      nearestComuna = comunaName;
    }
  }

  const region = findRegionForComuna(nearestComuna);
  return {
    comuna: nearestComuna,
    region,
    distanceKm: Math.round(minDistance * 10) / 10,
  };
}
