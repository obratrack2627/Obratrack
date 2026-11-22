import { addCalendarDays, calendarDays, chileToday } from '@/lib/work-calendar';

export interface ProjectTemplateActivitySpec {
  nombre: string;
  dias: number;
}

export interface ProjectTemplate {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  duracionTotalDias: number;
  partidas: ProjectTemplateActivitySpec[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'remodelacion_bano',
    nombre: 'Remodelación Baño Completo',
    categoria: 'Terminaciones',
    descripcion: 'Desarme, gasfitería, impermeabilización, cerámicos y artefactos.',
    duracionTotalDias: 14,
    partidas: [
      { nombre: 'Demolición, retiro de escombros y trazado', dias: 2 },
      { nombre: 'Red de agua potable, alcantarillado y electricidad', dias: 3 },
      { nombre: 'Impermeabilización y nivelación de radier/muros', dias: 2 },
      { nombre: 'Instalación de porcelanato/cerámica y fragüe', dias: 4 },
      { nombre: 'Montaje de artefactos sanitarios, grifería y pintura', dias: 3 },
    ],
  },
  {
    id: 'remodelacion_cocina',
    nombre: 'Remodelación Cocina',
    categoria: 'Terminaciones',
    descripcion: 'Desmontaje, instalaciones sanitarias/eléctricas, revestimientos y muebles.',
    duracionTotalDias: 18,
    partidas: [
      { nombre: 'Desmontaje de muebles antiguos y desarme', dias: 2 },
      { nombre: 'Modificación gasfitería, gas y circuito eléctrico enchufes', dias: 4 },
      { nombre: 'Reparación de muros, enlucido y pintura', dias: 3 },
      { nombre: 'Instalación piso porcelanato y revestimiento muro', dias: 4 },
      { nombre: 'Armado de muebles, cubierta y conexión electrodomésticos', dias: 5 },
    ],
  },
  {
    id: 'ampliacion_vivienda',
    nombre: 'Ampliación Vivienda',
    categoria: 'Obra Gruesa',
    descripcion: 'Excavación, radier, estructura en tabiquería/albañilería, techumbre y terminaciones.',
    duracionTotalDias: 35,
    partidas: [
      { nombre: 'Replanteo, excavación y cimientos', dias: 5 },
      { nombre: 'Sobrecimiento y hormigonado de radier', dias: 5 },
      { nombre: 'Levantamiento estructura (tabiquería o albañilería)', dias: 8 },
      { nombre: 'Techumbre, cubierta zinc/teja y hojalatería', dias: 6 },
      { nombre: 'Instalaciones eléctrica y sanitaria + aislación térmica', dias: 5 },
      { nombre: 'Revestimientos, ventanas, pintura y entrega final', dias: 6 },
    ],
  },
  {
    id: 'pintura_integral',
    nombre: 'Pintura Interior y Exterior',
    categoria: 'Mantención',
    descripcion: 'Preparación de superficies, empaste, sellador y terminación a dos manos.',
    duracionTotalDias: 9,
    partidas: [
      { nombre: 'Protección de áreas, lavado y raspado de muros', dias: 2 },
      { nombre: 'Reparación de grietas, pasta muro y lijado', dias: 3 },
      { nombre: 'Aplicación de imprimante/sellador y pintura 2 manos', dias: 4 },
    ],
  },
  {
    id: 'quincho_terraza',
    nombre: 'Quincho y Terraza Techada',
    categoria: 'Estructuras',
    descripcion: 'Radier exterior, pérgola metálica/madera, cubierta, parrilla y cerámica.',
    duracionTotalDias: 21,
    partidas: [
      { nombre: 'Trazado, nivelación y hormigonado de radier', dias: 5 },
      { nombre: 'Albañilería mesón quincho, campana y chimenea', dias: 6 },
      { nombre: 'Estructura cobertizo y cubierta policarbonato/zinc', dias: 5 },
      { nombre: 'Instalación cerámica piso, iluminación y sellado', dias: 5 },
    ],
  },
  {
    id: 'instalacion_electrica_gasfiteria',
    nombre: 'Renovación Eléctrica y Gasfitería',
    categoria: 'Instalaciones',
    descripcion: 'Recableado TDA, circuitos diferenciados, red PPR y pruebas de presión.',
    duracionTotalDias: 10,
    partidas: [
      { nombre: 'Picado de muros y canalización conduit', dias: 3 },
      { nombre: 'Tendido de conductores, tablero TDA y protecciones', dias: 3 },
      { nombre: 'Tendido red agua PPR/cobre y pruebas de hermeticidad', dias: 2 },
      { nombre: 'Instalación artefactos, retape y certificación final', dias: 2 },
    ],
  },
];

export interface GeneratedTemplateSchedule {
  nombre: string;
  fecha_inicio: string;
  fecha_termino: string;
}

export function buildTemplateActivities(
  templateId: string,
  startDateIso?: string,
): GeneratedTemplateSchedule[] {
  const tpl = PROJECT_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return [];

  let cursor = startDateIso && /^\d{4}-\d{2}-\d{2}$/.test(startDateIso) ? startDateIso : chileToday();
  return tpl.partidas.map((part) => {
    const duration = Math.max(1, Math.round(part.dias));
    const start = cursor;
    const end = addCalendarDays(start, Math.max(0, duration - 1));
    cursor = addCalendarDays(end, 1);
    return {
      nombre: part.nombre,
      fecha_inicio: start,
      fecha_termino: end,
    };
  });
}

export function shiftActivityDates<
  T extends { fecha_inicio?: string | null; fecha_termino?: string | null },
>(activities: T[], oldStartIso: string, newStartIso: string): Array<T & { fecha_inicio: string; fecha_termino: string }> {
  let delta = 0;
  try {
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(oldStartIso) &&
      /^\d{4}-\d{2}-\d{2}$/.test(newStartIso)
    ) {
      delta = calendarDays(oldStartIso, newStartIso);
    }
  } catch {
    delta = 0;
  }

  return activities.map((act) => {
    const baseStart =
      act.fecha_inicio && /^\d{4}-\d{2}-\d{2}$/.test(act.fecha_inicio)
        ? act.fecha_inicio
        : newStartIso;
    const baseEnd =
      act.fecha_termino && /^\d{4}-\d{2}-\d{2}$/.test(act.fecha_termino)
        ? act.fecha_termino
        : baseStart;
    const shiftedStart = addCalendarDays(baseStart, delta);
    const shiftedEnd = addCalendarDays(baseEnd, delta);
    return {
      ...act,
      fecha_inicio: shiftedStart,
      fecha_termino: shiftedEnd < shiftedStart ? shiftedStart : shiftedEnd,
    };
  });
}
