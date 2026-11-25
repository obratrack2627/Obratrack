import { AIError } from '@/lib/ai/errors';
import { commercialLines } from '@/lib/quotes/commercial';
import { classifyQuoteLineKind } from '@/lib/quotes/classify';
import type { CotizacionEstimacion } from '@/types/database';

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

const clp = String.raw`(?:\d{1,3}(?:[.\u00a0 ]\d{3})+|\d+)`;
const thousandsClp = String.raw`\d{1,3}(?:[.\u00a0 ]\d{3})+`;
const parseClp = (raw: string) => Number(raw.replace(/[.\u00a0 ]/g, ''));
const parseNum = (raw: string) => Number(raw.replace(',', '.'));

const editVerb = /\b(?:modifica(?:r|lo|la)?|cambia(?:r|lo|la|le)?|ajusta(?:r|lo|la)?|actualiza(?:r|lo|la)?|sube(?:le)?|baja(?:le)?|deja(?:r|lo|la)?|pon(?:le|lo|la)?|agrega(?:r|le)?|incluye|suma(?:r|le)?|a[nñ]ade|quita(?:r|le)?|elimina(?:r)?|saca(?:r)?|borra(?:r)?)\b/i;

export function looksLikeNaturalQuoteEdit(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.length > 600) return false;
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 5) return false;
  if (lines.length > 1 && (clean.match(/\$/g) || []).length >= 2) return false;
  if (/^(?:aprueba|revisa|devuelve|corrige|nueva cotizaci[oó]n|crea(?:r)? (?:la |una )?obra|vincula)/i.test(clean)) {
    return false;
  }
  return editVerb.test(clean);
}

function matchLineIndex(
  lines: NonNullable<CotizacionEstimacion['partidas_venta']>,
  hint: string,
  preferArea = false,
): number {
  const cleanHint = fold(hint)
    .replace(/\b(?:el|la|los|las|de|del|al|en|por|valor|precio|partida|item|material|cantidad|metros?|mts?|mt|cuadrados?|m2)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleanHint.length >= 3) {
    const tokens = cleanHint.split(' ').filter((t) => t.length >= 3);
    let bestIdx = -1;
    let bestScore = 0;
    lines.forEach((line, idx) => {
      const name = fold(line.nombre);
      if (name === cleanHint || name.includes(cleanHint) || cleanHint.includes(name)) {
        const score = 100 + name.length;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
        return;
      }
      const hits = tokens.filter((t) => name.includes(t)).length;
      if (hits > bestScore) {
        bestScore = hits;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0) return bestIdx;
  }
  if (preferArea) {
    const areaIndexes = lines
      .map((line, idx) => (/^(?:m[2²]|(?:mt|mts|metros?)\.?\s*cuadrados?)$/i.test(line.unidad.trim()) ? idx : -1))
      .filter((idx) => idx >= 0);
    if (areaIndexes.length === 1) return areaIndexes[0];
  }
  if (lines.length === 1) return 0;
  return -1;
}

export type QuoteEditPatch = {
  titulo_proyecto: string;
  partidas_venta: NonNullable<CotizacionEstimacion['partidas_venta']>;
  tratamiento_iva: 'incluido' | 'neto';
  resumen_ejecutivo?: string;
  condiciones_pago?: string;
  hitos_pago?: Pick<NonNullable<CotizacionEstimacion['hitos_pago']>[number], 'nombre' | 'porcentaje'>[];
  duracion_dias_estimada?: number;
  plazo_texto?: string;
};

function extractLatestTargetClause(rawHint: string): string {
  const matches = Array.from(
    rawHint.matchAll(/\b(?:al?\s+|el\s+)?(?:valor|precio|monto)\s+(?:de(?:l| la| los| las)?\s+)?/gi),
  );
  if (!matches.length) return rawHint;
  const last = matches[matches.length - 1];
  const after = rawHint.slice((last.index ?? 0) + last[0].length).trim();
  return after || rawHint;
}

export function applyNaturalQuoteEdit(quote: CotizacionEstimacion, rawText: string): QuoteEditPatch | null {
  if (!looksLikeNaturalQuoteEdit(rawText)) return null;
  const text = rawText.replace(/\s+/g, ' ').trim();
  const baseLines = (quote.partidas_venta || []).map((l) => ({ ...l }));
  if (!baseLines.length) return null;

  let tratamiento_iva: 'incluido' | 'neto' = quote.tratamiento_iva === 'neto' ? 'neto' : 'incluido';
  let duracion_dias_estimada = quote.duracion_dias_estimada;
  let plazo_texto = quote.plazo_texto;
  let mutated = false;

  // 1. Cambio explícito de tratamiento de IVA
  if (/\b(?:a\s+|como\s+|en\s+)?(?:m[aá]s\s+iva|neto(?:\s+m[aá]s\s+iva)?|sin\s+iva|valores?\s+netos?)\b/i.test(text) && !/\biva\s+incluido\b/i.test(text)) {
    tratamiento_iva = 'neto';
    mutated = true;
  } else if (/\b(?:con\s+iva(?:\s+incluido)?|iva\s+incluido)\b/i.test(text) && !/\bm[aá]s\s+iva\b/i.test(text)) {
    tratamiento_iva = 'incluido';
    mutated = true;
  }

  // 2. Cambio de plazo en días hábiles o corridos
  const daysMatch = /\b(\d{1,4})\s+d[ií]as\s+(h[aá]biles|corridos)\b/i.exec(text);
  if (daysMatch) {
    duracion_dias_estimada = parseNum(daysMatch[1]);
    plazo_texto = `${daysMatch[1]} días ${daysMatch[2].toLowerCase()}`;
    mutated = true;
  }

  // 3. Agregar partida nueva con monto en $
  const addMatch = new RegExp(
    String.raw`^(?:por\s+favor\s+)?(?:agrega(?:r|le)?|incluye|suma(?:r|le)?|a[nñ]ade)\s+(.+?)\s*\$\s*(${clp})\s*(c\/u|cada\s+uno|unitario|en\s+total)?\.?$`,
    'i',
  ).exec(text);
  if (addMatch) {
    const rawLabel = addMatch[1].trim().replace(/\s+(?:por|a|en)\s*$/i, '').trim();
    const val = parseClp(addMatch[2]);
    const isUnit = Boolean(addMatch[3] && !/en\s+total/i.test(addMatch[3]));
    const qtyPrefix = /^(\d+(?:[.,]\d+)?)\s+(?:(m[²2]|m[³3]|ml|kg|un|unidades?|sacos?|cajas?)\s+(?:de\s+)?)?(\S.*)$/i.exec(rawLabel);
    const cantidad = qtyPrefix ? parseNum(qtyPrefix[1]) : 1;
    const unidad = qtyPrefix?.[2] || (qtyPrefix ? 'un' : 'gl');
    const nombre = (qtyPrefix?.[3] || rawLabel).trim();
    baseLines.push({
      nombre,
      unidad,
      cantidad,
      precio_unitario: isUnit ? val : 0,
      ...(isUnit ? {} : { precio_partida: val }),
      tipo: classifyQuoteLineKind(nombre, unidad),
      subtotal: isUnit ? Math.round(cantidad * val) : val,
    });
    mutated = true;
  }

  // 4. Eliminar partida por nombre
  const removeMatch = /^(?:por\s+favor\s+)?(?:quita(?:r|le)?|elimina(?:r)?|saca(?:r)?|borra(?:r)?)\s+(?:la\s+partida\s+|el\s+[ií]tem\s+|el\s+|la\s+)?(.+?)\.?$/i.exec(text);
  if (!addMatch && removeMatch) {
    const idx = matchLineIndex(baseLines, removeMatch[1]);
    if (idx < 0) throw new AIError('OBRABOT_QUOTE_INPUT', `No encontré la partida «${removeMatch[1].trim()}» en esta cotización.`, 422);
    if (baseLines.length <= 1) throw new AIError('OBRABOT_QUOTE_INPUT', 'La cotización debe conservar al menos una partida.', 422);
    baseLines.splice(idx, 1);
    mutated = true;
  }

  // 5. Cambiar precio en $ (o con miles CLP sin $) de una partida o del valor por m²
  const explicitDollarPrice = !addMatch && !removeMatch
    ? new RegExp(
        String.raw`(?:modifica\w*|cambia\w*|ajusta\w*|actualiza\w*|sube\w*|baja\w*|deja\w*|pon\w*)\s+(.+?)\s+(?:a|en)\s*\$\s*(${clp})(?:\s*(?:pesos|clp))?\b`,
        'i',
      ).exec(text)
    : null;
  const bareThousandsPrice = !addMatch && !removeMatch && !explicitDollarPrice
    ? new RegExp(
        String.raw`(?:modifica\w*|cambia\w*|ajusta\w*|actualiza\w*|sube\w*|baja\w*|deja\w*|pon\w*)\s+(.+?)\s+(?:a|en)\s+(${thousandsClp})(?:\s*(?:pesos|clp))?(?!\s*(?:m[2²]|m[3³]|mts?|metros?|d[ií]as|%))\b`,
        'i',
      ).exec(text)
    : null;
  const explicitValueWordPrice = !addMatch && !removeMatch && !explicitDollarPrice && !bareThousandsPrice
    ? new RegExp(
        String.raw`(?:valor|precio|monto)\s+(?:de(?:l| la| los| las)?\s+)?(.+?)\s+(?:a|en)\s+(\d{3,10})(?:\s*(?:pesos|clp))?(?!\s*(?:m[2²]|m[3³]|mts?|metros?|d[ií]as|%|un|unidades?|sacos?|cajas?))\b`,
        'i',
      ).exec(text)
    : null;
  const priceChangeMatch = explicitDollarPrice || bareThousandsPrice || explicitValueWordPrice;
  if (priceChangeMatch) {
    const rawTargetHint = priceChangeMatch[1];
    const targetHint = explicitValueWordPrice ? rawTargetHint : extractLatestTargetClause(rawTargetHint);
    const newPrice = parseClp(priceChangeMatch[2]);
    const isAreaPrice = /\b(?:m[2²]|metro\s+cuadrado|mts?\s+cuadrados?)\b/i.test(targetHint);
    const idx = matchLineIndex(baseLines, targetHint, isAreaPrice);
    if (idx < 0) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica a qué partida corresponde el nuevo precio.', 422);
    const target = baseLines[idx];
    if (target.precio_partida != null && !isAreaPrice) {
      baseLines[idx] = { ...target, precio_partida: newPrice, precio_unitario: 0, subtotal: newPrice };
    } else {
      baseLines[idx] = { ...target, precio_unitario: newPrice, precio_partida: undefined, subtotal: Math.round(target.cantidad * newPrice) };
    }
    mutated = true;
  }

  // 6. Cambiar superficie en m² o cantidad de una partida (ej: "modificar el de hormigón estampado a 84 mts cuadrados", "cámbiala a 84 m²")
  const areaMatch = !addMatch && !removeMatch && !priceChangeMatch
    ? /(?:modifica\w*|cambia\w*|ajusta\w*|actualiza\w*|sube\w*|baja\w*|deja\w*|pon\w*)(?:\s+(.+?))?\s+(?:a|en)\s+(\d+(?:[.,]\d+)?)\s*(m[2²]|(?:mt|mts|metros?)\.?\s+cuadrados?)\b/i.exec(text)
    : null;
  if (areaMatch) {
    const newArea = parseNum(areaMatch[2]);
    const idx = matchLineIndex(baseLines, areaMatch[1] || '', true);
    if (idx < 0) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica qué partida en m² quieres ajustar.', 422);
    const target = baseLines[idx];
    if (target.precio_partida != null && target.precio_unitario === 0) {
      throw new AIError('OBRABOT_QUOTE_INPUT', `La partida «${target.nombre}» tiene monto global fijo; indica también el precio por m² o el nuevo monto total.`, 422);
    }
    baseLines[idx] = {
      ...target,
      cantidad: newArea,
      precio_partida: undefined,
      subtotal: Math.round(newArea * target.precio_unitario),
    };
    mutated = true;
  } else if (!addMatch && !removeMatch && !priceChangeMatch) {
    const qtyMatch = /(?:modifica\w*|cambia\w*|ajusta\w*|actualiza\w*|sube\w*|baja\w*|deja\w*|pon\w*)\s+(.+?)\s+(?:a|en)\s+(\d+(?:[.,]\d+)?)\b(?!\s*(?:%|d[ií]as|\$))/i.exec(text);
    if (qtyMatch && !/\biva\b/i.test(qtyMatch[1])) {
      const newQty = parseNum(qtyMatch[2]);
      const idx = matchLineIndex(baseLines, qtyMatch[1], false);
      if (idx >= 0 && baseLines[idx].precio_partida == null && baseLines[idx].precio_unitario > 0) {
        baseLines[idx] = {
          ...baseLines[idx],
          cantidad: newQty,
          subtotal: Math.round(newQty * baseLines[idx].precio_unitario),
        };
        mutated = true;
      }
    }
  }

  if (!mutated) return null;

  const validatedLines = commercialLines(
    baseLines.map((l) => ({
      nombre: l.nombre,
      unidad: l.unidad,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
      ...(l.precio_partida != null ? { precio_partida: l.precio_partida } : {}),
      ...(l.tipo ? { tipo: l.tipo } : {}),
    })),
  );

  return {
    titulo_proyecto: quote.titulo_proyecto,
    partidas_venta: validatedLines,
    tratamiento_iva,
    resumen_ejecutivo: quote.resumen_ejecutivo,
    condiciones_pago: quote.condiciones_pago,
    hitos_pago: quote.hitos_pago?.map((h) => ({ nombre: h.nombre, porcentaje: h.porcentaje })),
    duracion_dias_estimada,
    plazo_texto,
  };
}

export function matchesQuoteTitleHint(title: string, text: string): number {
  const normTitle = fold(title);
  const normText = fold(text);
  const tokens = normTitle.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !['cotizacion', 'presupuesto', 'instalacion', 'realizacion', 'proyecto'].includes(w));
  if (!tokens.length) return 0;
  return tokens.filter((t) => normText.includes(t)).length;
}
