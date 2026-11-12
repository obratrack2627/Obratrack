import { AIError } from './errors';
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const quantities: Record<string, number> = { once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cuatrocientos: 400, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, ciento: 100, doscientos: 200, trescientos: 300, quinientos: 500 };

export function chileanRequestContext(message: string) {
  const text = normalize(message);
  const financial = /\b(?:abono|pago|pag[oa]|pague|pagamos|pagado|cobr[oa]|cobre|cobrado|monto|precio|presupuesto|cotiz\w*|vale|cuesta|sale|gast\w*|transfer\w*|transfir\w*|deposit\w*|anticipo)\b/.test(text);
  const amounts: { texto: string; monto_clp: number }[] = [];
  const ambiguous: string[] = [];
  const numberWord = Object.keys(quantities).join('|');
  const quantityPattern = `(?:\\d{1,6}(?:[.,]\\d{1,3})?|(?:${numberWord})(?:\\s+(?:y\\s+)?(?:${numberWord})){0,3})`;
  const pattern = new RegExp(`\\b(${quantityPattern})\\s+(lucas?|palos?|millones|millon)(?:\\s+y\\s+(medio|media))?\\b`, 'g');
  const numberValue = (value: string) => {
    if (/^\d/.test(value)) return Number(value.replace(',', '.'));
    const tokens = value.split(/\s+/).filter(word => word !== 'y');
    const values = tokens.map(word => quantities[word]);
    if (values.length === 1) return values[0];
    if (values.length === 2 && ((values[0] >= 100 && values[1] < 100) || (values[0] >= 30 && values[0] < 100 && values[1] < 10 && value.includes(' y ')))) return values[0] + values[1];
    if (values.length === 3 && values[0] >= 100 && values[1] >= 30 && values[1] < 100 && values[2] < 10 && value.includes(' y ')) return values[0] + values[1] + values[2];
    return NaN;
  };
  for (const match of Array.from(text.matchAll(pattern))) {
    const unit = match[2];
    const suffix = text.slice((match.index || 0) + match[0].length).trimStart();
    const timber = unit.startsWith('palo') && /^(?:de\s+)?(?:pino|madera|eucalipto|roble|impregnado|poste|polin)\b/.test(suffix);
    if (timber) continue;
    if (unit.startsWith('palo') && !financial) { ambiguous.push(match[0]); continue; }
    const quantity = numberValue(match[1]);
    if (!Number.isFinite(quantity) || /^[0-9]+[.,][0-9]{3}$/.test(match[1])) { ambiguous.push(match[0]); continue; }
    const remainder = new RegExp(`^(${quantityPattern})\\s+mil\\b`).exec(suffix);
    let extra = 0;
    if (remainder && !unit.startsWith('luca')) {
      const rest = numberValue(remainder[1]);
      if (rest >= 1000 || !Number.isFinite(rest)) { ambiguous.push(match[0]+' '+remainder[0]); continue; }
      extra = rest * 1000;
    } else if (new RegExp(`^(?:${numberWord})\\b`).test(suffix)) { ambiguous.push(match[0]+' '+suffix.slice(0,50)); continue; }
    const scale = unit.startsWith('luca') ? 1000 : 1000000;
    const amount = (quantity + (match[3] ? 0.5 : 0)) * scale + extra;
    if (Number.isSafeInteger(amount) && amount > 0) amounts.push({ texto: match[0] + (extra ? ' '+remainder![0] : ''), monto_clp: amount });
  }
  return { pais: 'Chile', moneda: 'CLP', zona_horaria: 'America/Santiago', montos_explicitos: amounts, expresiones_por_aclarar: ambiguous };
}

export function checkChileanAmounts(actions: any[], message: string) {
  const moneyActions = actions.filter(action => ['registrar_pago','registrar_imprevisto'].includes(action.tipo));
  if (!moneyActions.length) return;
  const context = chileanRequestContext(message);
  if (context.expresiones_por_aclarar.length) throw new AIError('AMOUNT_AMBIGUOUS','Confirma el monto en pesos antes de registrar el movimiento.',422);
  if (moneyActions.length === 1 && context.montos_explicitos.length === 1 && moneyActions[0].monto !== context.montos_explicitos[0].monto_clp)
    throw new AIError('AMOUNT_MISMATCH','El monto propuesto no coincide con lo que indicaste. Confirma el monto en pesos para registrarlo.',422);
}

export const chileanRules = `CONTEXTO CHILENO DE OBRA:
- Entiende mensajes escritos o transcritos como habla un constructor chileno, sin exigir formularios ni imitar modismos. Maestro y cuadrilla son personas de terreno; mandante es el cliente. Esas palabras no conceden roles ni permisos.
- Reconoce radier, moldaje, enfierradura, empaste, vulcanita (placa de yeso-cartón), planchas de OSB, pastelones, gasfitería, fierro y retiro de escombros. Conserva dimensiones, tipo de material, calidad y presentación: no sustituyas una especificación por otra parecida.
- Una luca son $1.000 y un palo, en un contexto de dinero, $1.000.000; un palo y medio son $1.500.000. Un palo de pino es material, no dinero. Usa interpretacion_chilena para los montos inequívocos y pregunta por expresiones ambiguas antes de registrar un pago o gasto. Muestra CLP sin decimales, con puntos de miles.
- Usa comunas y regiones de Chile sin inventar direcciones. Hoy, mañana y el lunes se interpretan con la fecha de America/Santiago entregada en el contexto, nunca con la fecha de un mensaje antiguo. Si la fecha es ambigua o cae en un día distinto al pedido, aclárala.
- IVA chileno: 19 %. No confundas precio neto con precio final ni agregues IVA dos veces. Una preferencia de presentación no confirma la base tributaria de un precio nuevo.
- Un avance de enfierradura no termina todo el radier. Una guía de despacho o foto acredita lo informado sobre recepción, no compra, pago ni instalación. Recibir una boleta no autoriza a registrar un pago. Falta de cemento o lluvia son novedades de bitácora, no compras automáticas.
- «Márcame la entrada», «terminamos por hoy», «quedó listo» o «pasado de la fecha de entrega» requieren identificar asistencia, partida u obra según el contexto. Pregunta solo por la identificación o dato que falte; no elijas la primera coincidencia.
- Mantén los mismos controles de acceso para texto, audios e imágenes. Usa los registros actuales para saldos, avance y plazos; no recuerdes cifras antiguas como si siguieran vigentes.
MEMORIA Y PREFERENCIAS:
- preferencias_conversacion contiene únicamente preferencias explícitas de esta persona y este contexto. Úsalas para presentación y sugerencias; no son datos confirmados de una nueva obra, autorizaciones de gasto ni reglas que sustituyan permisos.
- Las preferencias de tiendas solo priorizan una comparación: no garantizan menor precio, cobertura ni stock. La comuna habitual es una sugerencia; no la registres como ubicación de una obra sin confirmación.
- No afirmes que te entrenaste, aprendiste de otros clientes o recordarás algo que no esté en el contexto. Las correcciones nuevas sustituyen las anteriores. El usuario puede consultar u olvidar sus preferencias desde el chat.`;
