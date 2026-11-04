import { registrationFields, type PersonDraft } from '@/lib/registrations';
import { canonicalPhone } from '@/lib/phone';
import { resolveEntity } from '@/lib/ai/actions';
import { validarRutChileno } from '@/lib/utils';
const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export type PersonIntakeDraft = { items: PersonDraft[] };
const personActions = new Set(['crear_cliente', 'agregar_trabajador', 'agregar_trabajadores']);
export function personIntake(actions: any[], proposal: any, previous: PersonIntakeDraft | null, message: string, projects: any[]) {
  const creations = actions.filter(action => personActions.has(action.tipo)).flatMap(action => action.tipo === 'agregar_trabajadores'
    ? action.trabajadores.map((worker: any) => ({ ...worker, tipo: 'trabajador' }))
    : [{ ...action, tipo: action.tipo === 'crear_cliente' ? 'cliente' : 'trabajador' }]);
  if (previous && /^cancel(?:a|ar)(?: el registro| al trabajador| el cliente| eso)?[.!]?$/i.test(message.trim()))
    return { actions: [], draft: null, question: 'Registro cancelado. No se creó ninguna ficha.', result: null };
  if (!proposal && !creations.length) {
    const current = previous?.items.find(item => registrationFields(item).missing.length);
    const value = message.trim();
    if (current) {
      if (validarRutChileno(value) && /^[\d.kK-]+$/.test(value)) proposal = { tipo: current.tipo, rut: value };
      else if (/^[^\s@]+@[^\s@]+$/.test(value)) proposal = { tipo: current.tipo, email: value };
      else if (canonicalPhone(value) && /^[+\d ().-]+$/.test(value)) proposal = { tipo: current.tipo, telefono: value };
      else if (['supervisor','terreno','maestro'].includes(norm(value))) proposal = { tipo: current.tipo, rol: norm(value) === 'maestro' ? 'terreno' : norm(value) };
    } else {
      const words = norm(message).split(/\s+/);
      let index = words.findIndex(word => ['agrega','anade','registra','crea'].includes(word));
      if (index >= 0) {
        index++;
        while (['a','al','el','la','un','una','nuevo','nueva','los','las'].includes(words[index])) index++;
        if (['cliente','trabajador','maestro','supervisor'].includes(words[index])) proposal = { tipo: words[index] === 'cliente' ? 'cliente' : 'trabajador' };
      }
    }
  }
  if (!creations.length && !proposal) return { actions, draft: previous, question: null, result: null };
  const items: PersonDraft[] = previous?.items.map(item => ({ ...item })) || [];
  const supplied = proposal ? [proposal] : creations;
  for (const input of supplied) {
    if (!['trabajador', 'cliente'].includes(input.tipo)) continue;
    let index = items.findIndex(item => item.tipo === input.tipo && (!input.rut || !item.rut || input.rut.replace(/[.-]/g,'') === item.rut.replace(/[.-]/g,'')) && (input.nombre ? norm(item.nombre || '') === norm(input.nombre) : registrationFields(item).missing.length > 0));
    if (index < 0) { items.push({ tipo: input.tipo }); index = items.length - 1; }
    const current = items[index];
    const literal = norm(message.split(/\s+/).join(' ').replaceAll(' arroba ', '@').replaceAll(' punto ', '.'));
    for (const field of ['nombre','rut','telefono','email','rol','direccion','comuna'] as const) {
      if (typeof input[field] !== 'string' || !input[field].trim()) continue;
      const value = input[field].trim();
      const known = norm(value) === norm(current[field] || '');
      const phone = field === 'telefono' && (message.match(/\+?\d[\d ().-]{6,20}\d/g) || []).some(v => canonicalPhone(v) && canonicalPhone(v) === canonicalPhone(value));
      const role = field === 'rol' && value === 'terreno' && /\b(maestro|trabajador|terreno)\b/.test(literal);
      const rut = field === 'rut' && literal.replace(/[.-]/g, '').includes(norm(value).replace(/[.-]/g, ''));
      if (known || phone || role || rut || literal.includes(norm(value))) current[field] = value;
    }
    if (input.proyecto_id || input.proyecto_nombre) {
      try {
        const project = resolveEntity(projects, input.proyecto_id || input.proyecto_nombre);
        if (current.proyecto_id === project.id || literal.includes(norm(project.nombre))) {
          current.proyecto_id = project.id; current.proyecto_nombre = project.nombre;
        }
      } catch { /* Preguntar por la obra; nunca elegir una ajena o ambigua. */ }
    }
  }
  const validated = items.map(item => registrationFields(item));
  const incomplete = validated.find(item => item.missing.length);
  if (incomplete) {
    const question = `Para registrar ${incomplete.draft.nombre || (incomplete.draft.tipo === 'cliente' ? 'al cliente' : 'al trabajador')} falta:\n${incomplete.missing.map(field => '• ' + field).join('\n')}\nPuedes responder estos datos juntos o uno por uno.`;
    const draft = { items: validated.map(item => item.draft) };
    return { actions: [], draft, question, result: { tipo: 'solicitar_datos_persona' as const, titulo: 'Datos para el registro', resultado_texto: question, detalles: { borrador_registro: draft } } };
  }
  const ready = validated.flatMap(({ draft }) => {
    const { tipo, proyecto_id, proyecto_nombre, ...data } = draft;
    return tipo === 'cliente' ? [{ tipo: 'crear_cliente', ...data }]
      : [{ tipo: 'agregar_trabajador', ...data }, ...(proyecto_id ? [{ tipo: 'asignar_trabajador', proyecto_id, trabajador_nombre: draft.nombre, rut: draft.rut }] : [])];
  });
  return { actions: [...actions.filter(a => !personActions.has(a.tipo)), ...ready], draft: null, prepared: { items: validated.map(item => item.draft) }, question: null, result: null };
}
