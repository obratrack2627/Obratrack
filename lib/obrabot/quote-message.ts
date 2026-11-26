import { AIError } from '@/lib/ai/errors';
import { commercialLines } from '@/lib/quotes/commercial';
import { classifyQuoteLineKind, type QuoteLineKind } from '@/lib/quotes/classify';
import { formatCLP } from '@/lib/utils';
import type { MaterialConsiderado } from '@/types/database';

const clp = String.raw`(?:\d{1,3}(?:[.\u00a0 ]\d{3})+|\d+)`;
const thousandsClp = String.raw`\d{1,3}(?:[.\u00a0 ]\d{3})+`;
const ivaSuffix = String.raw`(?:\s*(?:\+?\s*m[aá]s\s+iva|\+\s*iva|sin\s+iva|iva\s+incluido|con\s+iva|netos?))?`;
const bareTotalLine = new RegExp(String.raw`^\$\s*(${clp})${ivaSuffix}\.?$`, 'i');
const moneyAtEnd = new RegExp(String.raw`^(.+?)\s*\$\s*(${clp})\s*(?:(c\/u|cada uno|unitario|en total))?${ivaSuffix}\.?$`, 'i');
const projectTotal = /^total(?:\s+(?:del? proyecto|general|con iva|neto))?\s*:?$/i;
const projectTotalNoDollar = new RegExp(
  String.raw`^(?:valor\s+)?total(?:\s+(?:del?\s+proyecto|general|con\s+iva|neto))?\s*:?\s*(${thousandsClp})${ivaSuffix}\.?$`,
  'i',
);
const laborLabel = /^(?:mano de obra|obra de mano)$/i;
const materialsTotal = /^(?:total(?: de)? )?materiales\s*:?$/i;
const priceByArea = new RegExp(String.raw`^\$\s*(${clp})\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:m[2²]|m(?:t|ts|etros?)?\.?\s+cuadrados?)${ivaSuffix}\.?$`, 'i');
const netIvaPattern = /(?:(?:\b(?:sin\s+iva|no\s+incluye\s+iva|m[aá]s\s+iva|(?:precios?|valores?)\s+netos?)\b)|\+\s*iva\b)/i;
const includedIvaPattern = /\b(?:iva\s+incluido|con\s+iva(?:\s+incluido)?|incluye\s+iva)\b/i;
const ivaDeclarationLine = /^(?:(?:todos\s+los\s+)?(?:precios?|valores?|montos?)\s+)?(?:son\s+)?(?:(?:netos?\s*)?(?:m[aá]s|\+)\s*iva|sin\s+iva|no\s+incluye(?:n)?\s+iva|(?:precios?|valores?)\s+netos?|iva\s+incluido|con\s+iva(?:\s+incluido)?|incluye(?:n)?\s+iva)\.?$/i;
const quantityPrefix = /^(\d+(?:[,.]\d+)?)\s+(\S.*)$/;
const leadingUnit = /^(m[³3]|m[²2]|(?:mt|mts|metros?)\.?\s+c[uú]bicos?|(?:mt|mts|metros?)\.?\s+cuadrados?|kg|kilos?|litros?|lts?|unidades?|sacos?|cajas?|planchas?|tiras?|rollos?|bolsas?|galon(?:es)?|tinetas?|tarros?)\s+(?:de\s+)?(\S.*)$/i;
const requestLine = /^(?:[¿¡]\s*)?(?:me\s+)?(?:puedes |podemos |podr[ií]as |necesito (?:que )?|quiero )?(?:me\s+)?(?:hacer|hace[rs]?|har[ií]as?|realiz[ae]r?|arm[ae]r?|prepar[ae]r?|gener[ae]r?|cotiza[rs]?|haz(?:me)?)\b.{0,35}\bcotizaci[oó]n\b/i;
const pdfConversionOpener = /^(?:[¿¡]\s*)?(?:me\s+)?(?:puedes\s+|podr[ií]as\s+|necesito\s+(?:que\s+)?|quiero\s+)?(?:pas[ae]s?|p[aá]same|llev[ae]s?|ll[eé]vame|conviert[ae]s?|convertir)\s+(?:esto|este|esta|el\s+siguiente|la\s+siguiente)?\s*(?:presupuesto|cotizaci[oó]n)?\s*(?:a|en)\s+(?:pdf|excel)\b/i;
const quoteTitle = /^(?:presupuesto|cotizaci[oó]n)\b/i;
const chargeLine = /^(?:para (?:dar )?inicio|para iniciar|al inicio|al comenzar|al empezar|al finalizar|al t[eé]rmino|al terminar|al entregar|contra entrega|a la entrega|anticipo|abono|condiciones de pago|forma de pago|(?:el )?saldo|se solicita(?:r[aá])?|solicitamos|\d{1,3}(?:[.,]\d+)?\s*%)/i;
const headingSuffix = /\s*(?:trabajos\s+a\s+realizar|detalle\s+de\s+trabajos|trabajos\s+incluidos|alcance)\s*:?$/i;
const sectionHeadingLine = /^(?:materiales(?:\s+considerados)?|insumos(?:\s+considerados)?|partidas|trabajos(?:\s+a\s+realizar)?|mano de obra|obra de mano|servicios)\s*:?$/i;
const duration = /\b(\d{1,4})\s+d[ií]as\s+(h[aá]biles|corridos)\b/i;
const invalid = (text: string): never => { throw new AIError('OBRABOT_QUOTE_INPUT', text, 422); };
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const amount = (value: string) => Number(value.replace(/[.\u00a0 ]/g, ''));
const number = (value: string) => Number(value.replace(',', '.'));

type Line = { nombre: string; unidad: string; cantidad: number; precio_unitario: number; precio_partida?: number; tipo?: QuoteLineKind };

function quoteLines(text: string) {
  return text.split(/\r?\n/).map(line => line.trim().replace(/^(?:[•·*▪▫‣⁃–—]\s*|-\s+)/, ''));
}

export function isNaturalQuoteRequest(text: string) {
  const clean = text.trim();
  return requestLine.test(clean) || /^(?:presupuesto|cotizaci[oó]n) (?:de |para |por )/i.test(clean);
}

export function isPastedQuote(text: string) {
  if (text.length > 16000) return false;
  const [first, ...body] = quoteLines(text.trim());
  const hasPriceSignal = body.some(
    line => moneyAtEnd.test(line) || priceByArea.test(line) || bareTotalLine.test(line) || projectTotalNoDollar.test(line),
  );
  if (isNaturalQuoteRequest(first) || (body.length >= 1 && pdfConversionOpener.test(first))) return hasPriceSignal;
  if (body.length >= 1 && !first.includes('?') && quoteTitle.test(first) && hasPriceSignal) return true;
  const labels = body.flatMap(line => line.match(moneyAtEnd)?.[1].trim() || []);
  return labels.some(label => projectTotal.test(label)) &&
    labels.some(label => materialsTotal.test(label)) && labels.some(label => laborLabel.test(label));
}

function pricedLine(label: string, value: number, unitPrice: boolean, sectionHint?: QuoteLineKind | null): Line {
  const detail = label.match(quantityPrefix);
  const unit = detail?.[2].match(leadingUnit);
  const rawNombre = (unit?.[2] ?? detail?.[2] ?? label).trim();
  const nombre = rawNombre ? rawNombre[0].toUpperCase() + rawNombre.slice(1) : rawNombre;
  const unidad = unit?.[1] ?? (detail ? 'un' : 'gl');
  const tipo: QuoteLineKind = laborLabel.test(label)
    ? 'partida'
    : (sectionHint ?? classifyQuoteLineKind(nombre, unidad));
  return {
    nombre,
    unidad,
    cantidad: detail ? number(detail[1]) : 1,
    precio_unitario: unitPrice ? value : 0,
    precio_partida: unitPrice ? undefined : value,
    tipo,
  };
}

function parseConsideredMaterial(rawLine: string): MaterialConsiderado {
  const clean = rawLine.trim();
  const detail = clean.match(quantityPrefix);
  if (!detail) {
    return { nombre: clean ? clean[0].toUpperCase() + clean.slice(1) : clean, cantidad: null };
  }
  const unitMatch = detail[2].match(leadingUnit);
  const rawName = (unitMatch?.[2] ?? detail[2]).trim();
  const nombre = rawName ? rawName[0].toUpperCase() + rawName.slice(1) : rawName;
  const unidad = unitMatch?.[1]?.trim();
  return {
    nombre,
    cantidad: number(detail[1]),
    ...(unidad ? { unidad } : {}),
  };
}

function isConsideredMaterialCandidate(line: string, sectionHint: QuoteLineKind | null): boolean {
  if (sectionHint === 'material') return true;
  if (quantityPrefix.test(line)) return true;
  return classifyQuoteLineKind(line) === 'material';
}

function checkTotal(name: string, declared: number | undefined, actual: number) {
  if (declared != null && declared !== actual) {
    invalid(`El ${name} informado es ${formatCLP(declared)} y el detalle suma ${formatCLP(actual)}. Confirma qué importe debo corregir.`);
  }
}

function milestoneLabel(segment: string, index: number) {
  if (/material/i.test(segment)) return 'Anticipo para materiales';
  if (/avance|progreso|intermedio/i.test(segment)) return 'Según avance de obra';
  if (/finalizar|t[eé]rmino|terminar|entrega|restante|saldo|final/i.test(segment)) return 'Al finalizar el proyecto';
  if (/inicio|iniciar|comenzar|empezar|anticipo|abono|inicial/i.test(segment)) return 'Inicio del proyecto';
  return `Hito ${index + 1}`;
}

function buildPaymentResult(paymentLines: string[], total: number): {
  hitos_pago?: { nombre: string; porcentaje: number }[];
  condiciones_pago?: string;
  aviso_validacion?: string;
} {
  const fullText = paymentLines.join('\n');
  if (!fullText.trim()) return {};

  const pctRegex = /(\d{1,3}(?:[.,]\d+)?)\s*%/g;
  const statedMoneyRegex = new RegExp(String.raw`\$\s*(${clp})`, 'g');
  const extractAmounts = (segment: string) =>
    Array.from(segment.matchAll(statedMoneyRegex), m => amount(m[1])).filter(v => Number.isFinite(v) && v > 0);

  const checkMilestoneAmounts = (
    items: { nombre: string; porcentaje: number; stated?: number }[],
  ): string | undefined => {
    const notes: string[] = [];
    for (const item of items) {
      if (item.stated == null) continue;
      const expected = Math.round((total * item.porcentaje) / 100);
      if (Math.abs(item.stated - expected) > 1) {
        notes.push(
          `El ${item.porcentaje}% de ${formatCLP(total)} corresponde a ${formatCLP(expected)} (indicaste ${formatCLP(item.stated)}); ajusté «${item.nombre}» al cálculo exacto.`,
        );
      }
    }
    return notes.length ? notes.join(' ') : undefined;
  };

  // Fast path: 2 hitos materiales + mano de obra (preserva etiquetas exactas).
  const percentages = Array.from(new Set(Array.from(fullText.matchAll(pctRegex), match => number(match[1]))));
  if (percentages.length === 2 && /material/i.test(fullText) && /(?:mano de obra|obra de mano)/i.test(fullText)) {
    const materials = /(?:(\d{1,3}(?:[.,]\d+)?)\s*%[^.\d%]{0,90}materiales?|materiales?\s*(?:[:=]\s*)?(\d{1,3}(?:[.,]\d+)?)\s*%)/i.exec(fullText);
    const percentage = materials?.[1] ?? materials?.[2];
    if (percentage) {
      const advance = number(percentage);
      const balance = percentages.find(value => value !== advance);
      if (balance != null && Math.abs(advance + balance - 100) < 0.05) {
        const hitos = [
          { nombre: 'Anticipo para materiales', porcentaje: advance },
          { nombre: 'Saldo de mano de obra', porcentaje: balance },
        ];
        return { hitos_pago: hitos, condiciones_pago: fullText };
      }
    }
  }

  // Fallback flexible: líneas o segmentos con porcentajes (e.g. 60% inicio / 40% al finalizar).
  const candidateSegments: string[] = [];
  const nonMilestoneLines: string[] = [];
  for (const line of paymentLines) {
    const linePcts = Array.from(line.matchAll(pctRegex));
    if (linePcts.length === 1) {
      candidateSegments.push(line);
    } else if (linePcts.length > 1) {
      const parts = line.split(/\s*(?:,|;|\by\b)\s*/i).filter(p => /(\d{1,3}(?:[.,]\d+)?)\s*%/.test(p));
      if (parts.length >= 2) candidateSegments.push(...parts);
      else nonMilestoneLines.push(line);
    } else if (!/^(?:condiciones de pago|forma de pago)\s*:?$/i.test(line.trim())) {
      nonMilestoneLines.push(line);
    }
  }

  const parsed: { nombre: string; porcentaje: number; stated?: number }[] = [];
  const usedNames = new Map<string, number>();
  for (const seg of candidateSegments) {
    const m = /(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(seg);
    if (!m) continue;
    const pct = number(m[1]);
    if (!(pct > 0 && pct < 100)) continue;
    const baseLabel = milestoneLabel(seg, parsed.length);
    const count = (usedNames.get(baseLabel) ?? 0) + 1;
    usedNames.set(baseLabel, count);
    const nombre = count === 1 ? baseLabel : `${baseLabel} (${count})`;
    const amts = extractAmounts(seg);
    parsed.push({ nombre, porcentaje: pct, ...(amts.length === 1 ? { stated: amts[0] } : {}) });
  }

  const pctSum = parsed.reduce((sum, item) => sum + item.porcentaje, 0);
  if (parsed.length >= 2 && parsed.length <= 4 && Math.abs(pctSum - 100) < 0.05) {
    return {
      hitos_pago: parsed.map(({ nombre, porcentaje }) => ({ nombre, porcentaje })),
      condiciones_pago: nonMilestoneLines.length ? nonMilestoneLines.join('\n') : undefined,
      aviso_validacion: checkMilestoneAmounts(parsed),
    };
  }

  return { condiciones_pago: fullText };
}

function extractSubjectFromRequest(line: string): string | undefined {
  const clean = line.replace(/\bsin\s+fecha\b/gi, '').replace(/\bcon\s+la\s+plantilla\s+(?:de\s+)?\S+/gi, '').trim();
  const match = /\bcotizaci[oó]n\s+(?:de|para|por)\s+(.+)$/i.exec(clean);
  const subject = match?.[1]?.replace(/[:.,;]+$/, '').trim();
  return subject && subject.length >= 3 ? subject[0].toUpperCase() + subject.slice(1) : undefined;
}

export function readPastedQuote(text: string, providedTitle?: string, defaultIva?: 'incluido' | 'neto') {
  const hasNetIva = netIvaPattern.test(text);
  const hasIncludedIva = includedIvaPattern.test(text);
  if (hasNetIva && hasIncludedIva) {
    invalid('Confirma si los valores de esta cotización son con IVA incluido o netos más IVA.');
  }
  const sinFecha = /\bsin\s+fecha\b/i.test(text);
  const tratamiento_iva: 'incluido' | 'neto' = hasNetIva ? 'neto' : hasIncludedIva ? 'incluido' : (defaultIva ?? 'incluido');
  if (text.length > 16000) invalid('Divide el presupuesto en un listado más breve para conservar el detalle en esta cotización.');
  const rawLines = quoteLines(text.trim());
  const firstRequestLine = !providedTitle && (requestLine.test(rawLines[0]) || (rawLines.length > 1 && pdfConversionOpener.test(rawLines[0])))
    ? rawLines.shift()
    : undefined;
  const isPairableLabel = (line: string) => {
    if (!line || line.includes('$') || bareTotalLine.test(line)) return false;
    if (ivaDeclarationLine.test(line) || chargeLine.test(line)) return false;
    if (sectionHeadingLine.test(line)) return false;
    if (/^(?:descripci[oó]n (?:del trabajo|de la obra)|alcance|datos del trabajo)\s*:?$/i.test(line)) return false;
    const k = fold(line);
    if (projectTotal.test(k) || materialsTotal.test(k)) return false;
    return true;
  };
  const mergedLines: string[] = [];
  let scopeStarted = false;
  for (let i = 0; i < rawLines.length; i++) {
    const row = rawLines[i];
    if (/^(?:descripci[oó]n (?:del trabajo|de la obra)|alcance|datos del trabajo)\s*:?$/i.test(row)) {
      scopeStarted = true;
    }
    if (!scopeStarted && (isPairableLabel(row) || chargeLine.test(row))) {
      let nextIdx = i + 1;
      while (nextIdx < rawLines.length && !rawLines[nextIdx]) nextIdx++;
      if (nextIdx < rawLines.length && bareTotalLine.test(rawLines[nextIdx])) {
        mergedLines.push(`${row} ${rawLines[nextIdx]}`);
        i = nextIdx;
        continue;
      }
    }
    mergedLines.push(row);
  }
  const lines: Line[] = [];
  const scope: string[] = [];
  const unpricedMaterialIndices: number[] = [];
  const payment: string[] = [];
  let title = providedTitle;
  let declaredTotal: number | undefined;
  let declaredMaterials: number | undefined;
  let declaredMaterialsInsertAt: number | undefined;
  const laborRows: number[] = [];
  let statedAreaPrice: number | undefined;
  let days: RegExpMatchArray | null = null;
  let inScope = false;
  let currentSection: QuoteLineKind | null = null;
  let explicitMaterialSectionUsed = false;
  for (const line of mergedLines) {
    if (!line) {
      if (scope.length && scope.at(-1) !== '') scope.push('');
      continue;
    }
    if (ivaDeclarationLine.test(line)) continue;
    const key = fold(line);
    const money = line.match(moneyAtEnd);
    const bareTotal = line.match(bareTotalLine);
    if (!inScope && !money && !bareTotal && sectionHeadingLine.test(line)) {
      currentSection = /^(?:materiales|insumos)/i.test(line) ? 'material' : 'partida';
      if (currentSection === 'material') explicitMaterialSectionUsed = true;
      continue;
    }
    if (chargeLine.test(line)) {
      payment.push(line);
    } else if (key.startsWith('valor por metro cuadrado') && money) {
      statedAreaPrice = amount(money[2]);
    } else if (priceByArea.test(line)) {
      const area = line.match(priceByArea)!;
      const unitPrice = amount(area[1]);
      checkTotal('precio por metro cuadrado', statedAreaPrice, unitPrice);
      lines.push({ nombre: title || 'Instalación por metro cuadrado', unidad: 'm²', cantidad: number(area[2]), precio_unitario: unitPrice, tipo: 'partida' });
      statedAreaPrice = undefined;
    } else if (!money && !/\d/.test(key) && (projectTotal.test(key.split('$')[0]) || materialsTotal.test(key.split('$')[0]))) {
      continue;
    } else if (money && projectTotal.test(money[1].trim())) {
      declaredTotal = amount(money[2]);
    } else if (money && materialsTotal.test(money[1].trim())) {
      declaredMaterials = amount(money[2]);
      declaredMaterialsInsertAt = lines.length;
    } else if (!money && !inScope && projectTotalNoDollar.test(line)) {
      const totalNoDollar = line.match(projectTotalNoDollar)!;
      declaredTotal = amount(totalNoDollar[1]);
    } else if (bareTotal) {
      if (payment.length > 0 && declaredTotal != null) {
        payment[payment.length - 1] = `${payment[payment.length - 1]} ${line}`.trim();
      } else if (declaredTotal == null) {
        declaredTotal = amount(bareTotal[1]);
      } else {
        invalid(`No pude ubicar el importe «${line}». Indica a qué partida corresponde.`);
      }
    } else if (/^(?:descripci[oó]n (?:del trabajo|de la obra)|alcance|datos del trabajo)\s*:?$/i.test(line)) {
      inScope = true;
      scope.push(line);
    } else if (money && !inScope) {
      const label = money[1].trim().replace(/:$/, '').trim();
      if (/^(?:descuento|recargo|iva|neto|subtotal)\b/i.test(label)) invalid('Confirma los importes finales de las partidas con los descuentos ya aplicados.');
      if (laborLabel.test(label)) laborRows.push(lines.length);
      lines.push(pricedLine(label, amount(money[2]), money[3] != null && money[3].toLowerCase() !== 'en total', currentSection));
    } else if (line.includes('$') && !inScope) {
      invalid(`No pude leer el importe de «${line.slice(0, 160)}». Escribe la partida y su valor final en CLP.`);
    } else if (!title && !lines.length && !inScope && !quantityPrefix.test(line) && !headingSuffix.test(line) && !line.endsWith(':')) {
      title = line;
    } else {
      days ??= line.match(duration);
      const scopeIdx = scope.length;
      scope.push(line);
      if (!inScope && isConsideredMaterialCandidate(line, currentSection)) {
        unpricedMaterialIndices.push(scopeIdx);
      }
    }
  }
  let materiales_considerados: MaterialConsiderado[] | undefined;
  if (declaredMaterials != null && lines.length === laborRows.length) {
    const matLine: Line = {
      nombre: 'Materiales',
      unidad: 'gl',
      cantidad: 1,
      precio_unitario: 0,
      precio_partida: declaredMaterials,
      tipo: 'material',
    };
    const insertAt = declaredMaterialsInsertAt ?? lines.length;
    lines.splice(insertAt, 0, matLine);
    for (let i = 0; i < laborRows.length; i++) {
      if (laborRows[i] >= insertAt) laborRows[i] += 1;
    }
    declaredMaterials = undefined;
    if (unpricedMaterialIndices.length) {
      const removeSet = new Set(unpricedMaterialIndices);
      materiales_considerados = unpricedMaterialIndices.map((idx) => parseConsideredMaterial(scope[idx]));
      const filteredScope = scope.filter((_, idx) => !removeSet.has(idx));
      scope.length = 0;
      scope.push(...filteredScope);
    }
  } else if (!lines.length && declaredTotal != null && declaredTotal > 0 && declaredMaterials == null) {
    // Presupuesto a suma alzada (nombre general + total único, con o sin lista de trabajos o materiales).
    const firstNonEmptyIdx = scope.findIndex(Boolean);
    let lumpSumName = '';
    if (firstNonEmptyIdx !== -1 && (headingSuffix.test(scope[firstNonEmptyIdx]) || scope[firstNonEmptyIdx].endsWith(':'))) {
      const cleanedHeading = scope[firstNonEmptyIdx].replace(headingSuffix, '').replace(/:+$/, '').trim();
      lumpSumName = cleanedHeading;
      scope.splice(firstNonEmptyIdx, 1);
      for (let k = unpricedMaterialIndices.length - 1; k >= 0; k--) {
        if (unpricedMaterialIndices[k] === firstNonEmptyIdx) unpricedMaterialIndices.splice(k, 1);
        else if (unpricedMaterialIndices[k] > firstNonEmptyIdx) unpricedMaterialIndices[k] -= 1;
      }
    }
    if (!title && firstRequestLine) {
      title = extractSubjectFromRequest(firstRequestLine);
    }
    const cleanTitle = title?.replace(headingSuffix, '').replace(/:+$/, '').trim();
    if (!lumpSumName) lumpSumName = cleanTitle || 'Presupuesto de obra';
    lines.push({
      nombre: lumpSumName,
      unidad: 'gl',
      cantidad: 1,
      precio_unitario: 0,
      precio_partida: declaredTotal,
      tipo: 'partida',
    });

    const nonEmptyScopeIndices = scope.map((s, idx) => (s.trim() ? idx : -1)).filter((idx) => idx >= 0);
    const unpricedSet = new Set(unpricedMaterialIndices);
    const allRemainingAreMaterials =
      nonEmptyScopeIndices.length >= 2 && nonEmptyScopeIndices.every((idx) => unpricedSet.has(idx));

    if ((explicitMaterialSectionUsed || allRemainingAreMaterials) && unpricedMaterialIndices.length) {
      materiales_considerados = unpricedMaterialIndices.map((idx) => parseConsideredMaterial(scope[idx]));
      const filteredScope = scope.filter((_, idx) => !unpricedSet.has(idx));
      scope.length = 0;
      scope.push(...filteredScope);
    } else if (nonEmptyScopeIndices.length >= 2) {
      const formattedTasks = nonEmptyScopeIndices.map((idx) => {
        const item = scope[idx].trim();
        return item.startsWith('•') || item.endsWith(':') ? item : `• ${item}`;
      });
      scope.length = 0;
      scope.push(...formattedTasks);
    }
  }
  if (!lines.length) invalid('Incluye al menos una partida con su valor final en CLP.');
  if (statedAreaPrice != null) invalid('Indica cuántos metros cuadrados debo cotizar.');
  const partidas = commercialLines(lines);
  const total = partidas.reduce((sum, line) => sum + line.subtotal, 0);
  const labor = laborRows.reduce((sum, i) => sum + partidas[i].subtotal, 0);
  checkTotal('total del proyecto', declaredTotal, total);
  checkTotal('total de materiales', declaredMaterials, total - labor);
  const paymentInfo = buildPaymentResult(payment, total);
  return {
    titulo_proyecto: title || partidas.slice(0, 3).map(line => line.nombre).join(', '),
    partidas_venta: partidas,
    ...(materiales_considerados?.length ? { materiales_considerados } : {}),
    ...(sinFecha ? { mostrar_fecha: false } : {}),
    tratamiento_iva,
    resumen_ejecutivo: scope.join('\n').trim(),
    condiciones_pago: paymentInfo.condiciones_pago,
    hitos_pago: paymentInfo.hitos_pago,
    ...(paymentInfo.aviso_validacion ? { aviso_validacion: paymentInfo.aviso_validacion } : {}),
    duracion_dias_estimada: days ? number(days[1]) : undefined,
    plazo_texto: days?.[0] ?? 'Por acordar',
  };
}
