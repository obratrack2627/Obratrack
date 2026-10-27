import { flattenActions, type AIAction } from './protocol';

export function resolveEntity<T extends { id: string; nombre: string }>(
  items: T[],
  ident?: string,
  currentId?: string,
): T {
  const normalize = (s: string) =>
    s
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  if (ident) {
    const value = normalize(ident);
    const exact = items.filter(
      (p) => p.id === ident || normalize(p.nombre) === value,
    );
    const found = exact.length
      ? exact
      : items.filter((p) => normalize(p.nombre).includes(value));
    if (found.length === 1) return found[0];
    throw new Error(
      found.length
        ? `Hay más de una coincidencia para "${ident}". Indica el nombre completo.`
        : `No se encontró "${ident}". Revisa el nombre o el ID.`,
    );
  }
  if (currentId) {
    const current = items.find((p) => p.id === currentId);
    if (current) return current;
    throw new Error('La obra actual ya no está disponible.');
  }
  if (items.length === 1) return items[0];
  throw new Error('Indica en qué obra quieres realizar la acción.');
}

const PROJECT_ACTIONS = new Set([
  'actualizar_proyecto',
  'eliminar_proyecto',
  'asignar_trabajador',
  'asignar_trabajadores',
  'desasignar_trabajador',
  'crear_actividad',
  'actualizar_avance',
  'agregar_material',
  'agregar_materiales',
  'registrar_imprevisto',
  'registrar_pago',
  'crear_bitacora',
  'generar_reporte',
  'crear_solicitud_cambio',
  'registrar_asistencia',
  'registrar_documento',
]);
export function prepareActionPlan(
  input: any,
  context: {
    proyectos: any[];
    clientes: any[];
    actividades: any[];
    usuarios: any[];
  },
  currentId?: string,
): AIAction[] {
  const projects = [...context.proyectos],
    clients = [...context.clientes],
    activities = [...context.actividades];
  const actions = flattenActions(input);
  // Se verifica el lote completo antes de modificar el primer registro.
  for (const [i, a] of Array.from(actions.entries())) {
    if (['crear_proyecto', 'crear_proyecto_completo'].includes(a.tipo))
      projects.push({ id: `planned-${i}`, nombre: a.nombre });
    if (['crear_proyecto', 'crear_proyecto_completo'].includes(a.tipo)) {
      if (a.cliente_id) a.cliente_id = resolveEntity(clients, a.cliente_id).id;
      else if (a.cliente_nombre && clients.some(c => c.nombre.toLowerCase().includes(a.cliente_nombre.toLowerCase()))) {
        const cliente = resolveEntity(clients, a.cliente_nombre);
        if (!cliente.id.startsWith('planned-')) a.cliente_id = cliente.id;
        a.cliente_nombre = cliente.nombre;
      }
    }
    if (a.tipo === 'crear_cliente')
      clients.push({ id: `planned-client-${i}`, nombre: a.nombre });
    if (a.tipo === 'actualizar_cliente') {
      const c = resolveEntity(clients, a.cliente_id || a.nombre);
      if (!c.id.startsWith('planned-')) a.cliente_id = c.id;
      a.nombre = c.nombre;
    }
    if (PROJECT_ACTIONS.has(a.tipo)) {
      const p = resolveEntity(
        projects,
        a.proyecto_id || a.proyecto_nombre,
        currentId,
      );
      if (currentId && p.id !== currentId && !p.id.startsWith('planned-'))
        throw new Error(
          'Esta acción corresponde a otra obra. Abre su asistente o usa el chat general.',
        );
      if (!p.id.startsWith('planned-')) a.proyecto_id = p.id;
      a.proyecto_nombre = p.nombre;
      if (a.tipo === 'actualizar_avance') {
        const act = resolveEntity(
          activities.filter((x) => x.proyecto_id === p.id),
          a.actividad_id || a.nombre,
        );
        a.nombre = act.nombre;
        if (!act.id.startsWith('planned-')) a.actividad_id = act.id;
      }
      if (a.tipo === 'crear_actividad')
        (a.partidas || a.actividades || [a]).forEach((act: any, j: number) =>
          activities.push({
            id: `planned-act-${i}-${j}`,
            nombre: act.nombre,
            proyecto_id: p.id,
          }),
        );
      if (a.tipo === 'desasignar_trabajador')
        a.trabajador_nombre = resolveEntity(
          context.usuarios,
          a.trabajador_nombre,
        ).id;
      if (a.tipo === 'eliminar_proyecto') {
        const index = projects.findIndex((x) => x.id === p.id);
        projects.splice(index, 1);
      }
    }
  }
  return actions;
}
