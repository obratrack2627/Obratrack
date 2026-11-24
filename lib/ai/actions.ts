import { AIError } from './errors';
import { flattenActions, type AIAction } from './protocol';
import { checkTeamContact } from './contacts';
import { registrationFields } from '@/lib/registrations';

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
    let found = exact.length
      ? exact
      : items.filter((p) => normalize(p.nombre).includes(value));
    if (!found.length) {
      const stripped = value
        .replace(/^(?:la\s+|el\s+)?(?:obra|proyecto)\s+(?:de\s+|del\s+|en\s+)?/, '')
        .trim();
      if (stripped.length >= 3) {
        found = items.filter((p) => {
          const normName = normalize(p.nombre);
          const baseName = normName.split(/\s*[—–-]\s*/)[0]?.trim() || '';
          return (
            normName.includes(stripped) ||
            (baseName.length >= 4 && stripped.includes(baseName))
          );
        });
      }
    }
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
  'actualizar_material',
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
    agenda?: any[];
  },
  currentId?: string,
): AIAction[] {
  const projects = context.proyectos.map(p => ({ ...p })),
    clients = context.clientes.map(c => ({ ...c })),
    users = context.usuarios.map(u => ({ ...u })),
    activities = context.actividades.map(a => ({ ...a })),
    events = (context.agenda || []).map(e => ({ ...e, nombre: e.titulo || e.nombre || '' }));
  const actions = flattenActions(input);
  // Se verifica el lote completo antes de modificar el primer registro.
  for (const [i, a] of Array.from(actions.entries())) {
    if (a.tipo === 'agregar_trabajador' || a.tipo === 'agregar_trabajadores') {
      for (const worker of a.tipo === 'agregar_trabajadores' ? a.trabajadores : [a]) {
        const assignment = actions.find(action => action.tipo === 'asignar_trabajador' && action.trabajador_nombre === worker.nombre);
        const checked = registrationFields({ ...worker, tipo: 'trabajador', proyecto_id: a.proyecto_id || assignment?.proyecto_id, proyecto_nombre: a.proyecto_nombre || assignment?.proyecto_nombre });
        if (checked.missing.length) throw new Error('Completa el registro antes de crearlo: ' + checked.missing.join(', '));
        for (const field of ['nombre','rut','email','telefono','rol'] as const) worker[field] = checked.draft[field];
      }
    }
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
      if (a.nuevo_nombre) c.nombre = a.nuevo_nombre;
    }
    if (a.tipo === 'actualizar_trabajador') {
      const worker = resolveEntity(users, a.usuario_id || a.trabajador_nombre || a.nombre);
      checkTeamContact(worker, a, users);
      a.usuario_id = worker.id;
      a.trabajador_nombre = worker.nombre;
      for (const key of ['email', 'rut']) if (a[key] !== undefined) worker[key] = a[key];
      if (a.nuevo_nombre !== undefined) worker.nombre = a.nuevo_nombre;
      if (a.telefono !== undefined) worker.telefono_whatsapp = a.telefono;
      if (a.especialidades !== undefined) worker.especialidades = a.especialidades;
    }
    if (['agendar_evento', 'agendar_visita'].includes(a.tipo)) {
      if (a.proyecto_id || a.proyecto_nombre) {
        const p = resolveEntity(projects, a.proyecto_id || a.proyecto_nombre, currentId);
        if (!p.id.startsWith('planned-')) a.proyecto_id = p.id;
      } else if (currentId) {
        const current = projects.find((p) => p.id === currentId);
        if (current) a.proyecto_id = current.id;
      }
      events.push({ id: `planned-evt-${i}`, nombre: a.titulo, titulo: a.titulo, proyecto_id: a.proyecto_id });
    }
    if (['actualizar_evento', 'eliminar_evento'].includes(a.tipo) && context.agenda !== undefined) {
      let scopedEvents = events;
      if (a.proyecto_id || a.proyecto_nombre) {
        const p = resolveEntity(projects, a.proyecto_id || a.proyecto_nombre, currentId);
        if (!p.id.startsWith('planned-')) a.proyecto_id = p.id;
        scopedEvents = events.filter((e) => !e.proyecto_id || e.proyecto_id === p.id);
      } else if (currentId) {
        const byProject = events.filter((e) => e.proyecto_id === currentId);
        if (byProject.length) scopedEvents = byProject;
      }
      const ev = resolveEntity(scopedEvents, a.evento_id || a.titulo);
      if (!ev.id.startsWith('planned-')) a.evento_id = ev.id;
      a.titulo = ev.nombre;
      if (a.tipo === 'actualizar_evento' && a.nuevo_titulo) ev.nombre = a.nuevo_titulo;
      if (a.tipo === 'eliminar_evento') {
        const idx = events.findIndex((x) => x.id === ev.id);
        if (idx >= 0) events.splice(idx, 1);
      }
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
      if(a.tipo==='actualizar_proyecto') {
        const start=a.fecha_inicio ?? p.fecha_inicio, end=a.fecha_termino_estimada ?? p.fecha_termino_estimada;
        if((a.fecha_inicio || a.fecha_termino_estimada) && start && end && start>end)
          throw new Error('La fecha de inicio no puede ser posterior al término. Indica el nuevo término de la obra; no inventes fechas ni cambies el presupuesto.');
        if(a.fecha_inicio)p.fecha_inicio=a.fecha_inicio;
        if(a.fecha_termino_estimada)p.fecha_termino_estimada=a.fecha_termino_estimada;
      }
      if (a.tipo === 'actualizar_proyecto' && typeof a.nuevo_nombre === 'string' && a.nuevo_nombre.trim()) {
        p.nombre = a.nuevo_nombre.trim();
      }
      a.proyecto_nombre = p.nombre;
      if (a.tipo === 'actualizar_avance') {
        const respRef =
          (typeof a.responsable_id === 'string' && a.responsable_id.trim()) ||
          (typeof a.responsable_nombre === 'string' && a.responsable_nombre.trim()) ||
          '';
        if (respRef) {
          const worker = resolveEntity(users, respRef);
          a.responsable_id = worker.id;
          a.responsable_nombre = worker.nombre;
        }
        const targetRef = String(a.actividad_id || a.nombre || '').trim();
        const isAllPartidas =
          (Boolean(respRef) && !targetRef) ||
          /^(?:todas?|todas las partidas|todas las tareas|todas las actividades|carta gantt|gantt)$/i.test(
            targetRef,
          );
        if (isAllPartidas) {
          a.todas_las_partidas = true;
        } else {
          const act = resolveEntity(
            activities.filter((x) => x.proyecto_id === p.id),
            targetRef,
          );
          a.nombre = act.nombre;
          if (!act.id.startsWith('planned-')) a.actividad_id = act.id;
        }
      }
      if (a.tipo === 'crear_actividad') {
        const respRef =
          (typeof a.responsable_id === 'string' && a.responsable_id.trim()) ||
          (typeof a.responsable_nombre === 'string' && a.responsable_nombre.trim()) ||
          '';
        if (respRef) {
          const worker = resolveEntity(users, respRef);
          a.responsable_id = worker.id;
          a.responsable_nombre = worker.nombre;
        }
        (a.partidas || a.actividades || [a]).forEach((act: any, j: number) =>
          activities.push({
            id: `planned-act-${i}-${j}`,
            nombre: act.nombre,
            proyecto_id: p.id,
          }),
        );
      }
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


/** Completar solo la obra inequívoca del contexto autorizado, nunca la primera de una lista. */
export function scopeProjectActions(input: unknown, reference: string | undefined | null, projects: {id:string}[], selectedId?: string) {
  const actions = flattenActions(input);
  if (selectedId && actions.some(a => ['crear_proyecto', 'crear_proyecto_completo'].includes(a.tipo)))
    throw new AIError('PROJECT_CONTEXT', 'Para crear una obra nueva abre el chat general del Cotizador.', 422);
  const validReference = reference && projects.some(project => project.id === reference) ? reference : undefined;
  for (const action of actions) {
    if (!PROJECT_ACTIONS.has(action.tipo)) continue;
    if (!action.proyecto_id && !action.proyecto_nombre && validReference) action.proyecto_id = validReference;
    if (selectedId && action.proyecto_id && action.proyecto_id !== selectedId) throw new AIError('PROJECT_CONTEXT', 'Esta acción corresponde a otra obra. Abre su asistente o usa el chat general.', 422);
  }
  return actions;
}
