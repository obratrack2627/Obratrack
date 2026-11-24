import { AIError } from '@/lib/ai/errors';
import { commercialLines } from '@/lib/quotes/commercial';
import { formatCLP } from '@/lib/utils';

const clp = String.raw`(?:\d{1,3}(?:[.\u00a0 ]\d{3})+|\d+)`;
const ivaSuffix = String.raw`(?:\s*(?:\+?\s*m[aá]s\s+iva|\+\s*iva|sin\s+iva|iva\s+incluido|con\s+iva|netos?))?`;
const moneyAtEnd = new RegExp(String.raw`^(.+?)\s*\$\s*(${clp})\s*(?:(c\/u|cada uno|unitario|en total))?${ivaSuffix}\.?$`, 'i');
const projectTotal = /^total(?:\s+(?:del? proyecto|general|con iva|neto))?\s*:?$/i;
const laborLabel = /^(?:mano de obra|obra de mano)$/i;
const materialsTotal = /^(?:total(?: de)? )?materiales\s*:?$/i;
const priceByArea = new RegExp(String.raw`^\$\s*(${clp})\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:m[2²]|m(?:t|ts|etros?)?\.?\s+cuadrados?)${ivaSuffix}\.?$`, 'i');
const netIvaPattern = /(?:(?:\b(?:sin\s+iva|no\s+incluye\s+iva|m[aá]s\s+iva|(?:precios?|valores?)\s+netos?)\b)|\+\s*iva\b)/i;
const includedIvaPattern = /\b(?:iva\s+incluido|con\s+iva(?:\s+incluido)?|incluye\s+iva)\b/i;
const ivaDeclarationLine = /^(?:(?:todos\s+los\s+)?(?:precios?|valores?|montos?)\s+)?(?:son\s+)?(?:(?:netos?\s*)?(?:m[aá]s|\+)\s*iva|sin\s+iva|no\s+incluye(?:n)?\s+iva|(?:precios?|valores?)\s+netos?|iva\s+incluido|con\s+iva(?:\s+incluido)?|incluye(?:n)?\s+iva)\.?$/i;
const quantityPrefix = /^(\d+(?:[,.]\d+)?)\s+(\S.*)$/;
const leadingUnit = /^(m[³3]|m[²2]|(?:mt|mts|metros?)\.?\s+c[uú]bicos?|(?:mt|mts|metros?)\.?\s+cuadrados?|kg|litros?|unidades?|sacos?|cajas?)\s+(?:de\s+)?(\S.*)$/i;
const requestLine = /^(?:[¿¡]\s*)?(?:puedes |podemos |podr[ií]as |necesito (?:que )?|quiero )?(?:hacer|hace[rs]?|realiz[ae]r?|arm[ae]r?|prepar[ae]r?|gener[ae]r?|cotiza[rs]?|haz(?:me)?)\b.{0,35}\bcotizaci[oó]n\b/i;
const quoteTitle = /^(?:presupuesto|cotizaci[oó]n) (?:de |para |por )/i;
const chargeLine = /^(?:(?:para (?:dar )?inicio|para iniciar|anticipo|condiciones de pago|forma de pago|(?:el )?saldo)\b|(?:se solicita|solicitamos)\b.*%)/i;
const duration = /\b(\d{1,4})\s+d[ií]as\s+(h[aá]biles|corridos)\b/i;
const invalid = (text: string): never => { throw new AIError('OBRABOT_QUOTE_INPUT', text, 422); };
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const amount = (value: string) => Number(value.replace(/[.\u00a0 ]/g, ''));
const number = (value: string) => Number(value.replace(',', '.'));

type Line = { nombre: string; unidad: string; cantidad: number; precio_unitario: number; precio_partida?: number };

function quoteLines(text: string) {
  return text.split(/\r?\n/).map(line => line.trim().replace(/^(?:[•*▪–]\s*|-\s+)/, ''));
}

export function isNaturalQuoteRequest(text: string) {
  return requestLine.test(text.trim()) || quoteTitle.test(text.trim());
}

export function isPastedQuote(text: string) {
  if (text.length > 16000) return false;
  const [first, ...body] = quoteLines(text.trim());
  if (isNaturalQuoteRequest(first)) return body.some(line => moneyAtEnd.test(line) || priceByArea.test(line));
  const labels = body.flatMap(line => line.match(moneyAtEnd)?.[1].trim() || []);
  return labels.some(label => projectTotal.test(label)) &&
    labels.some(label => materialsTotal.test(label)) && labels.some(label => laborLabel.test(label));
}

function pricedLine(label: string, value: number, unitPrice: boolean): Line {
  const detail = label.match(quantityPrefix);
  const unit = detail?.[2].match(leadingUnit);
  return {
    nombre: (unit?.[2] ?? detail?.[2] ?? label).trim(),
    unidad: unit?.[1] ?? (detail ? 'un' : 'gl'),
    cantidad: detail ? number(detail[1]) : 1,
    precio_unitario: unitPrice ? value : 0,
    precio_partida: unitPrice ? undefined : value,
  };
}

function checkTotal(name: string, declared: number | undefined, actual: number) {
  if (declared != null && declared !== actual) {
    invalid(`El ${name} informado es ${formatCLP(declared)} y el detalle suma ${formatCLP(actual)}. Confirma qué importe debo corregir.`);
  }
}

function paymentPlan(text: string) {
  const percentages = Array.from(new Set(Array.from(text.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g), match => number(match[1]))));
  if (percentages.length !== 2 || !/material/i.test(text) || !/(?:mano de obra|obra de mano)/i.test(text)) return undefined;
  // Vincular cada porcentaje al concepto más cercano, independientemente del orden.
  const materials = /(?:(\d{1,3}(?:[.,]\d+)?)\s*%[^.\d%]{0,90}materiales?|materiales?\s*(?:[:=]\s*)?(\d{1,3}(?:[.,]\d+)?)\s*%)/i.exec(text);
  const percentage = materials?.[1] ?? materials?.[2];
  if (!percentage) return undefined;
  const advance = number(percentage);
  const balance = percentages.find(value => value !== advance);
  if (balance == null) return undefined;
  return [{ nombre: 'Anticipo para materiales', porcentaje: advance }, { nombre: 'Saldo de mano de obra', porcentaje: balance }];
}

export function readPastedQuote(text: string, providedTitle?: string, defaultIva?: 'incluido' | 'neto') {
  const hasNetIva = netIvaPattern.test(text);
  const hasIncludedIva = includedIvaPattern.test(text);
  if (hasNetIva && hasIncludedIva) {
    invalid('Confirma si los valores de esta cotización son con IVA incluido o netos más IVA.');
  }
  const tratamiento_iva: 'incluido' | 'neto' = hasNetIva ? 'neto' : hasIncludedIva ? 'incluido' : (defaultIva ?? 'incluido');
  if (text.length > 16000) invalid('Divide el presupuesto en un listado más breve para conservar el detalle en esta cotización.');
  const rawLines = quoteLines(text.trim());
  if (!providedTitle && requestLine.test(rawLines[0])) rawLines.shift();
  const lines: Line[] = [];
  const scope: string[] = [];
  const payment: string[] = [];
  let title = providedTitle;
  let declaredTotal: number | undefined;
  let declaredMaterials: number | undefined;
  const laborRows: number[] = [];
  let statedAreaPrice: number | undefined;
  let days: RegExpMatchArray | null = null;
  let inScope = false;
  const bareTotalLine = new RegExp(String.raw`^\$\s*(${clp})${ivaSuffix}\.?$`, 'i');
  for (const line of rawLines) {
    if (!line) {
      if (scope.length && scope.at(-1) !== '') scope.push('');
      continue;
    }
    if (ivaDeclarationLine.test(line)) continue;
    const key = fold(line);
    const money = line.match(moneyAtEnd);
    const bareTotal = line.match(bareTotalLine);
    if (chargeLine.test(line)) {
      payment.push(line);
    } else if (key.startsWith('valor por metro cuadrado') && money) {
      statedAreaPrice = amount(money[2]);
    } else if (priceByArea.test(line)) {
      const area = line.match(priceByArea)!;
      const unitPrice = amount(area[1]);
      checkTotal('precio por metro cuadrado', statedAreaPrice, unitPrice);
      lines.push({ nombre: title || 'Instalación por metro cuadrado', unidad: 'm²', cantidad: number(area[2]), precio_unitario: unitPrice });
      statedAreaPrice = undefined;
    } else if (!money && !/\d/.test(key) && (projectTotal.test(key.split('$')[0]) || materialsTotal.test(key.split('$')[0]))) {
      continue;
    } else if (money && projectTotal.test(money[1].trim())) {
      declaredTotal = amount(money[2]);
    } else if (money && materialsTotal.test(money[1].trim())) {
      declaredMaterials = amount(money[2]);
    } else if (bareTotal) {
      declaredTotal = amount(bareTotal[1]);
    } else if (/^(?:descripci[oó]n (?:del trabajo|de la obra)|alcance|datos del trabajo)\s*:?$/i.test(line)) {
      inScope = true;
      scope.push(line);
    } else if (money && !inScope) {
      const label = money[1].trim().replace(/:$/, '').trim();
      if (/^(?:descuento|recargo|iva|neto|subtotal)\b/i.test(label)) invalid('Confirma los importes finales de las partidas con los descuentos ya aplicados.');
      if (laborLabel.test(label)) laborRows.push(lines.length);
      lines.push(pricedLine(label, amount(money[2]), money[3] != null && money[3].toLowerCase() !== 'en total'));
    } else if (line.includes('$') && !inScope) {
      invalid(`No pude leer el importe de «${line.slice(0, 160)}». Escribe la partida y su valor final en CLP.`);
    } else if (!title && !lines.length && !inScope) {
      title = line;
    } else {
      days ??= line.match(duration);
      scope.push(line);
    }
  }
  if (!lines.length) invalid('Incluye al menos una partida con su valor final en CLP.');
  if (statedAreaPrice != null) invalid('Indica cuántos metros cuadrados debo cotizar.');
  const partidas = commercialLines(lines);
  const total = partidas.reduce((sum, line) => sum + line.subtotal, 0);
  const labor = laborRows.reduce((sum, i) => sum + partidas[i].subtotal, 0);
  checkTotal('total del proyecto', declaredTotal, total);
  checkTotal('total de materiales', declaredMaterials, total - labor);
  const conditions = payment.join('\n');
  return {
    titulo_proyecto: title || partidas.slice(0, 3).map(line => line.nombre).join(', '),
    partidas_venta: partidas,
    tratamiento_iva,
    resumen_ejecutivo: scope.join('\n').trim(),
    condiciones_pago: conditions || undefined,
    hitos_pago: paymentPlan(conditions),
    duracion_dias_estimada: days ? number(days[1]) : undefined,
    plazo_texto: days?.[0] ?? 'Por acordar',
  };
}
