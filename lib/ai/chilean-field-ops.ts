import { chileanRequestContext } from './chilean-context';
import { projectMentions } from './project-reference';

const fold = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const clpPattern = /\$\s*(\d{1,3}(?:[.\u00a0 ]\d{3})+|\d+)/;

function extractExplicitClp(text: string): number | null {
  const dollar = clpPattern.exec(text);
  if (dollar) {
    const val = Number(dollar[1].replace(/[.\u00a0 ]/g, ''));
    return Number.isSafeInteger(val) && val > 0 ? val : null;
  }
  const chilean = chileanRequestContext(text);
  if (chilean.montos_explicitos.length === 1 && chilean.expresiones_por_aclarar.length === 0) {
    return chilean.montos_explicitos[0].monto_clp;
  }
  return null;
}

function resolveSingleTargetProject(
  projects: any[],
  text: string,
  activeProjectId?: string | null,
) {
  const mentioned = projectMentions(projects, text);
  if (mentioned.length > 1) return null;
  if (mentioned.length === 1) return mentioned[0];
  if (activeProjectId) {
    return projects.find((p) => p?.id === activeProjectId) || null;
  }
  return null;
}

function detectPaymentMethod(text: string): 'transferencia' | 'efectivo' | 'debito' {
  const plain = fold(text);
  if (/\befectivo\b/.test(plain)) return 'efectivo';
  if (/\b(?:debito|tarjeta)\b/.test(plain)) return 'debito';
  return 'transferencia';
}

export function parseMilestonePaymentCommand(input: {
  text: string;
  userRole: string;
  projects: any[];
  activeProjectId?: string | null;
}) {
  if (!['admin', 'supervisor'].includes(input.userRole)) return null;
  const text = (input.text || '').trim();
  const plain = fold(text);
  if (!text || /\$\s*\d/.test(text)) return null;

  const hasPaymentVerb =
    /\b(?:pago|abono|transfirio|deposito|recibi|entro|cobre|liquido)\b/.test(plain);
  const pctMatch = /\b(\d{1,3})\s*%/.exec(text);
  if (!hasPaymentVerb || !pctMatch) return null;

  const pct = Number(pctMatch[1]);
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) return null;

  const project = resolveSingleTargetProject(input.projects, text, input.activeProjectId);
  if (!project || typeof project.monto_cotizado !== 'number' || project.monto_cotizado <= 0) {
    return null;
  }

  const monto = Math.round((project.monto_cotizado * pct) / 100);
  if (!Number.isSafeInteger(monto) || monto <= 0) return null;

  const metodo = detectPaymentMethod(text);
  const hitoLabel = /\b(?:inicio|inicial|anticipo|comienzo|arranque)\b/.test(plain)
    ? 'anticipo inicial'
    : /\b(?:final|termino|entrega|cierre|saldo|restante)\b/.test(plain)
      ? 'cierre / término'
      : /\b(?:edp|estado\s+de\s+pago|avance)\b/.test(plain)
        ? 'estado de pago'
        : 'hito de contrato';

  return {
    respuesta: `Voy a registrar el pago del ${pct}% ($${monto.toLocaleString('es-CL')}) en ${project.nombre} por ${metodo}.`,
    accion: {
      tipo: 'registrar_pago',
      proyecto_id: project.id,
      monto,
      metodo,
      nota: `Pago hito ${pct}% (${hitoLabel})`,
    },
    cotizacion: null,
    sugerencias: [],
  };
}

export function parseExtraWorkCommand(input: {
  text: string;
  userRole: string;
  projects: any[];
  activeProjectId?: string | null;
}) {
  if (!['admin', 'supervisor', 'terreno'].includes(input.userRole)) return null;
  const text = (input.text || '').trim();
  const plain = fold(text);
  if (!text) return null;
  if (/\b(?:cotizacion|presupuesto)\b/.test(plain)) return null;

  const extraTrigger = /\b(?:adicional(?:es)?|obra\s+extra|trabajo\s+extra|orden\s+de\s+cambio)\b/.test(
    plain,
  );
  if (!extraTrigger) return null;

  const monto = extractExplicitClp(text);
  if (!monto) return null;

  const project = resolveSingleTargetProject(input.projects, text, input.activeProjectId);
  if (!project) return null;

  const daysMatch = /\b(\d{1,3})\s+dias\b/.exec(plain);
  const dias = daysMatch ? Number(daysMatch[1]) : 0;

  const cleanedTitle = text
    .replace(/^(?:el\s+cliente\s+pidi[oó]\s+|quiero\s+agregar\s+|registra\s+|agrega\s+)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const titulo =
    (cleanedTitle.length > 70 ? `${cleanedTitle.slice(0, 67).trimEnd()}...` : cleanedTitle) ||
    'Obra adicional';

  return {
    respuesta: `Voy a registrar el adicional «${titulo}» por $${monto.toLocaleString('es-CL')} en ${project.nombre}.`,
    accion: {
      tipo: 'crear_solicitud_cambio',
      proyecto_id: project.id,
      subtipo: 'solicitud_cambio',
      titulo,
      descripcion: text,
      monto,
      dias,
      prioridad: 'media',
    },
    cotizacion: null,
    sugerencias: [],
  };
}

function matchSingleWorkerByName(users: any[], text: string) {
  if (!Array.isArray(users) || !users.length) return null;
  const normText = ` ${fold(text)} `;
  const candidates = users.filter((u) => u && typeof u.nombre === 'string' && u.nombre.trim());

  const exactFull = candidates.filter((u) => normText.includes(` ${fold(u.nombre)} `));
  if (exactFull.length === 1) return exactFull[0];

  const byFirstToken = candidates.filter((u) => {
    const first = fold(u.nombre).split(/\s+/)[0];
    return first.length >= 3 && normText.includes(` ${first} `);
  });
  if (byFirstToken.length === 1) return byFirstToken[0];

  return null;
}

export function parseWorkerTratoCommand(input: {
  text: string;
  userRole: string;
  projects: any[];
  activeProjectId?: string | null;
  users?: any[];
}) {
  if (!['admin', 'supervisor'].includes(input.userRole)) return null;
  const text = (input.text || '').trim();
  if (!text || !/\btrato\b/i.test(text)) return null;

  const monto = extractExplicitClp(text);
  if (!monto) return null;

  const project = resolveSingleTargetProject(input.projects, text, input.activeProjectId);
  if (!project) return null;

  const worker = matchSingleWorkerByName(input.users || [], text);
  const plain = fold(text);
  const pagado =
    /\b(?:le\s+pague|pague|ya\s+pagado|ya\s+se\s+pago|transferi|le\s+transferi|abone|cancele)\b/.test(
      plain,
    );

  return {
    respuesta: `Voy a registrar el trato${worker ? ` de ${worker.nombre}` : ''} por $${monto.toLocaleString('es-CL')} en ${project.nombre}${pagado ? ' (pagado)' : ' (por pagar)'}.`,
    accion: {
      tipo: 'registrar_imprevisto',
      proyecto_id: project.id,
      categoria_gasto: 'mano_obra',
      monto,
      descripcion: text,
      ...(worker ? { usuario_id: worker.id } : {}),
      ...(pagado ? { pagado: true } : {}),
    },
    cotizacion: null,
    sugerencias: [],
  };
}

export function resolveChileanFieldOpsTurn(input: {
  text: string;
  userRole: string;
  projects: any[];
  activeProjectId?: string | null;
  users?: any[];
}) {
  return (
    parseMilestonePaymentCommand(input) ||
    parseExtraWorkCommand(input) ||
    parseWorkerTratoCommand(input) ||
    null
  );
}
