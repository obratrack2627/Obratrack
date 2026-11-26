import { AIError } from '@/lib/ai/errors';
import type { SemanticQuoteEdit } from '@/lib/ai/intent-router';
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

const editVerb = /\b(?:modif[ií]c\w+|modif[ií]qu\w+|c[aá]mbi\w+|aj[uú]st\w+|actual[ií]c\w+|actual[ií]z\w+|s[uú]b(?:e|as|a|ir|ele|elo|ela)\w*|b[aá]j(?:a|es|e|ar|ale|alo|ala)\w*|d[eé]j(?:a|es|e|ar|ale|alo|ala)\w*|p[oó]n(?:ga|gas|le|lo|la|er)?|arr[eé]gl(?:a|es|e|ar|ale|alo)?|agr[eé]g(?:a|ar|ale|alo|ala|u)\w*|incl[uú]y\w+|s[uú]m(?:a|e|ar|ale|alo)\w*|a[nñ][aá]d\w+|qu[ií]t(?:a|e|ar|ale|alo)\w*|elim[ií]n(?:a|e|ar|ale|alo)\w*|s[aá]c(?:a|ar|ale|alo|u)\w*|b[oó]rr(?:a|e|ar|ale|alo)\w*|hazle|apl[ií]c\w+|descu[eé]nt\w+|rebaj\w+|rec[aá]rg\w+|aument\w+)\b/i;

export function looksLikeNaturalQuoteEdit(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.length > 600) return false;
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 5) return false;
  if (lines.length > 1 && (clean.match(/\$/g) || []).length >= 2) return false;
  if (/^(?:aprueba|revisa|devuelve|corrige|nueva cotizaci[oó]n|crea(?:r)? (?:la |una )?obra|vincula)/i.test(fold(clean))) {
    return false;
  }
  return editVerb.test(fold(clean));
}

function matchLineIndex(
  lines: NonNullable<CotizacionEstimacion['partidas_venta']>,
  hint: string,
  preferArea = false,
  allowSingleFallback = true,
): number {
  const cleanHint = fold(hint)
    .replace(/\b(?:el|la|los|las|de|del|al|en|por|valor|precio|monto|total|proyecto|general|cotizacion|presupuesto|partida|item|material|cantidad|metros?|mts?|mt|cuadrados?|m2)\b/g, ' ')
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
  if (allowSingleFallback && lines.length === 1) return 0;
  return -1;
}

export type QuoteEditPatch = {
  titulo_proyecto: string;
  partidas_venta: NonNullable<CotizacionEstimacion['partidas_venta']>;
  tratamiento_iva: 'incluido' | 'neto';
  resumen_ejecutivo?: string;
  condiciones_pago?: string;
  hitos_pago?: Pick<NonNullable<CotizacionEstimacion['hitos_pago']>[number], 'nombre' | 'porcentaje'>[];
  materiales_considerados?: CotizacionEstimacion['materiales_considerados'];
  materiales?: CotizacionEstimacion['materiales'];
  mano_de_obra?: CotizacionEstimacion['mano_de_obra'];
  actividades_gantt?: CotizacionEstimacion['actividades_gantt'];
  mostrar_fecha?: boolean;
  fecha_validez?: string;
  cliente_id?: string;
  cliente_nombre?: string;
  cliente_email?: string;
  cliente_telefono?: string;
  comuna_region?: string;
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

  // 2b. Ajuste porcentual global (descuento o recargo %)
  const foldedText = fold(text);
  const pctDiscount =
    /\b(?:hazle|aplic(?:a|ale|ar)|dej(?:a|ale)|baj(?:a|ale)|descuent(?:a|ale)|rebaj(?:a|ale)|quit(?:a|ale))\s+(?:un\s+)?(\d{1,2}(?:[.,]\d{1,2})?)\s*%(?:\s+(?:de\s+)?descuento\b)?/i.exec(foldedText) ||
    /\b(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s+(?:de\s+)?descuento\b/i.exec(foldedText);
  const pctSurcharge = !pctDiscount
    ? /\b(?:sub(?:e|ele|ir)|recarg(?:a|ale|ar)|aument(?:a|ale|ar)|agreg(?:a|ale|ar))\s+(?:un\s+)?(\d{1,3}(?:[.,]\d{1,2})?)\s*%/i.exec(foldedText)
    : null;
  let pctApplied = false;
  if (pctDiscount || pctSurcharge) {
    const pct = parseNum((pctDiscount || pctSurcharge)![1]);
    const isDiscount = Boolean(pctDiscount);
    if ((isDiscount && pct > 0 && pct < 100) || (!isDiscount && pct > 0 && pct <= 200)) {
      const factor = isDiscount ? 1 - pct / 100 : 1 + pct / 100;
      for (let idx = 0; idx < baseLines.length; idx++) {
        const line = baseLines[idx];
        if (line.precio_partida != null) {
          const nextTotal = Math.max(1, Math.round(line.precio_partida * factor));
          baseLines[idx] = { ...line, precio_partida: nextTotal, precio_unitario: 0, subtotal: nextTotal };
        } else {
          const nextUnit = Math.max(1, Math.round(line.precio_unitario * factor));
          baseLines[idx] = { ...line, precio_unitario: nextUnit, subtotal: Math.round(line.cantidad * nextUnit) };
        }
      }
      pctApplied = true;
      mutated = true;
    }
  }

  // 3. Agregar partida nueva con monto en $
  const addMatch = !pctApplied
    ? new RegExp(
        String.raw`^(?:por\s+favor\s+)?(?:agr[eé]g(?:a|ar|ale|alo|ala|ue|ues)?|incl[uú]y(?:e|ele|elo)?|s[uú]m(?:a|ar|ale|alo)?|a[nñ][aá]d(?:e|ele|elo|ir)?)\s+(.+?)\s*\$\s*(${clp})\s*(c\/u|cada\s+uno|unitario|en\s+total)?\.?$`,
        'i',
      ).exec(text)
    : null;
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
  const removeMatch = !pctApplied
    ? /^(?:por\s+favor\s+)?(?:qu[ií]t(?:a|ar|ale|alo|e|es)?|elim[ií]n(?:a|ar|ale|alo|e|es)?|s[aá]c(?:a|ar|ale|alo)?|b[oó]rr(?:a|ar|ale|alo|e|es)?)\s+(?:la\s+partida\s+|el\s+[ií]tem\s+|el\s+|la\s+)?(.+?)\.?$/i.exec(text)
    : null;
  const removeTarget = removeMatch ? fold(removeMatch[1]) : '';
  const targetsDateOrMetadata = /^(?:la\s+)?fecha(?:\b|$)/.test(removeTarget);
  if (!pctApplied && !addMatch && removeMatch && !targetsDateOrMetadata) {
    const idx = matchLineIndex(baseLines, removeMatch[1], false, false);
    if (idx < 0) throw new AIError('OBRABOT_QUOTE_INPUT', `No encontré la partida «${removeMatch[1].trim()}» en esta cotización.`, 422);
    if (baseLines.length <= 1) throw new AIError('OBRABOT_QUOTE_INPUT', 'La cotización debe conservar al menos una partida.', 422);
    baseLines.splice(idx, 1);
    mutated = true;
  }

  // 5. Cambiar precio en $ (o con miles CLP sin $) de una partida o del valor por m²
  const changeVerb = String.raw`(?:modif[ií]c\w+|modif[ií]qu\w+|c[aá]mbi\w+|aj[uú]st\w+|actual[ií]c\w+|actual[ií]z\w+|s[uú]b(?:e|as|a|ir|ele|elo|ela)\w*|b[aá]j(?:a|es|e|ar|ale|alo|ala)\w*|d[eé]j(?:a|es|e|ar|ale|alo|ala)\w*|p[oó]n(?:ga|gas|le|lo|la|er)?|arr[eé]gl(?:a|es|e|ar|ale|alo)?)`;
  const explicitDollarPrice = !pctApplied && !addMatch && !removeMatch
    ? new RegExp(
        String.raw`${changeVerb}\s+(.+?)\s+(?:a|en)\s*\$\s*(${clp})(?:\s*(?:pesos|clp))?\b`,
        'i',
      ).exec(text)
    : null;
  const bareThousandsPrice = !pctApplied && !addMatch && !removeMatch && !explicitDollarPrice
    ? new RegExp(
        String.raw`${changeVerb}\s+(.+?)\s+(?:a|en)\s+(${thousandsClp})(?:\s*(?:pesos|clp))?(?!\s*(?:m[2²]|m[3³]|mts?|metros?|d[ií]as|%))\b`,
        'i',
      ).exec(text)
    : null;
  const explicitValueWordPrice = !pctApplied && !addMatch && !removeMatch && !explicitDollarPrice && !bareThousandsPrice
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
  const areaMatch = !pctApplied && !addMatch && !removeMatch && !priceChangeMatch
    ? new RegExp(String.raw`${changeVerb}(?:\s+(.+?))?\s+(?:a|en)\s+(\d+(?:[.,]\d+)?)\s*(m[2²]|(?:mt|mts|metros?)\.?\s+cuadrados?)\b`, 'i').exec(text)
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
  } else if (!pctApplied && !addMatch && !removeMatch && !priceChangeMatch) {
    const qtyMatch = new RegExp(String.raw`${changeVerb}\s+(.+?)\s+(?:a|en)\s+(\d+(?:[.,]\d+)?)\b(?!\s*(?:%|d[ií]as|\$))`, 'i').exec(text);
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

  return buildQuoteEditPatch(quote, baseLines, {
    tratamiento_iva,
    duracion_dias_estimada,
    plazo_texto,
  });
}

function buildQuoteEditPatch(
  quote: CotizacionEstimacion,
  baseLines: NonNullable<CotizacionEstimacion['partidas_venta']>,
  overrides: {
    tratamiento_iva: 'incluido' | 'neto';
    duracion_dias_estimada?: number;
    plazo_texto?: string;
    mostrar_fecha?: boolean;
  },
): QuoteEditPatch {
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
  const mostrarFecha = overrides.mostrar_fecha ?? (quote.mostrar_fecha === false ? false : undefined);
  return {
    titulo_proyecto: quote.titulo_proyecto,
    partidas_venta: validatedLines,
    tratamiento_iva: overrides.tratamiento_iva,
    resumen_ejecutivo: quote.resumen_ejecutivo,
    condiciones_pago: quote.condiciones_pago,
    hitos_pago: quote.hitos_pago?.map((h) => ({ nombre: h.nombre, porcentaje: h.porcentaje })),
    ...(quote.materiales_considerados?.length ? { materiales_considerados: quote.materiales_considerados } : {}),
    ...(quote.materiales?.length ? { materiales: quote.materiales } : {}),
    ...(quote.mano_de_obra?.length ? { mano_de_obra: quote.mano_de_obra } : {}),
    ...(quote.actividades_gantt?.length ? { actividades_gantt: quote.actividades_gantt } : {}),
    ...(mostrarFecha !== undefined ? { mostrar_fecha: mostrarFecha } : {}),
    ...(quote.fecha_validez ? { fecha_validez: quote.fecha_validez } : {}),
    ...(quote.cliente_id ? { cliente_id: quote.cliente_id } : {}),
    ...(quote.cliente_nombre ? { cliente_nombre: quote.cliente_nombre } : {}),
    ...(quote.cliente_email ? { cliente_email: quote.cliente_email } : {}),
    ...(quote.cliente_telefono ? { cliente_telefono: quote.cliente_telefono } : {}),
    ...(quote.comuna_region ? { comuna_region: quote.comuna_region } : {}),
    duracion_dias_estimada: overrides.duracion_dias_estimada,
    plazo_texto: overrides.plazo_texto,
  };
}

export function applyStructuredQuoteEdit(
  quote: CotizacionEstimacion,
  edit: SemanticQuoteEdit,
): QuoteEditPatch | null {
  const baseLines = (quote.partidas_venta || []).map((l) => ({ ...l }));
  if (!baseLines.length) return null;

  let tratamiento_iva: 'incluido' | 'neto' = quote.tratamiento_iva === 'neto' ? 'neto' : 'incluido';
  let duracion_dias_estimada = quote.duracion_dias_estimada;
  let plazo_texto = quote.plazo_texto;
  let mostrar_fecha: boolean | undefined;
  let mutated = false;

  if (edit.tratamiento_iva === 'neto' || edit.tratamiento_iva === 'incluido') {
    tratamiento_iva = edit.tratamiento_iva;
    mutated = true;
  }
  if (typeof edit.mostrar_fecha === 'boolean') {
    mostrar_fecha = edit.mostrar_fecha;
    mutated = true;
  }
  if (typeof edit.plazo_dias === 'number' && Number.isFinite(edit.plazo_dias) && edit.plazo_dias > 0) {
    duracion_dias_estimada = edit.plazo_dias;
    plazo_texto = edit.plazo_texto?.trim() || `${Math.round(edit.plazo_dias)} días`;
    mutated = true;
  } else if (edit.plazo_texto?.trim()) {
    plazo_texto = edit.plazo_texto.trim();
    mutated = true;
  }

  const rawMoney =
    typeof edit.nuevo_monto_clp === 'number' && Number.isFinite(edit.nuevo_monto_clp)
      ? Math.round(edit.nuevo_monto_clp)
      : undefined;
  const rawQty =
    typeof edit.nueva_cantidad === 'number' && Number.isFinite(edit.nueva_cantidad) && edit.nueva_cantidad > 0
      ? edit.nueva_cantidad
      : undefined;

  if (edit.operacion === 'cambiar_total' && rawMoney && rawMoney > 0 && Number.isSafeInteger(rawMoney)) {
    const idx = baseLines.length === 1 ? 0 : matchLineIndex(baseLines, edit.partida_objetivo || '', false);
    if (idx < 0) return null;
    baseLines[idx] = { ...baseLines[idx], precio_partida: rawMoney, precio_unitario: 0, subtotal: rawMoney };
    mutated = true;
  } else if (edit.operacion === 'cambiar_partida') {
    const idx = matchLineIndex(baseLines, edit.partida_objetivo || '', false);
    if (idx < 0) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica a qué partida corresponde el cambio.', 422);
    const target = baseLines[idx];
    const nextQty = rawQty ?? target.cantidad;
    if (rawMoney != null && rawMoney >= 0 && Number.isSafeInteger(rawMoney)) {
      const asUnit = edit.es_precio_unitario === true || (edit.es_precio_unitario !== false && target.precio_partida == null);
      if (asUnit) {
        baseLines[idx] = {
          ...target,
          cantidad: nextQty,
          precio_unitario: rawMoney,
          precio_partida: undefined,
          subtotal: Math.round(nextQty * rawMoney),
        };
      } else {
        baseLines[idx] = { ...target, cantidad: nextQty, precio_partida: rawMoney, precio_unitario: 0, subtotal: rawMoney };
      }
      mutated = true;
    } else if (rawQty != null && target.precio_partida == null && target.precio_unitario > 0) {
      baseLines[idx] = { ...target, cantidad: nextQty, subtotal: Math.round(nextQty * target.precio_unitario) };
      mutated = true;
    }
  } else if (edit.operacion === 'agregar_partida' && edit.partida_objetivo?.trim() && rawMoney != null && rawMoney >= 0 && Number.isSafeInteger(rawMoney)) {
    const nombre = edit.partida_objetivo.trim().slice(0, 500);
    const qty = rawQty ?? 1;
    const unidad = (edit.unidad?.trim() || (rawQty != null ? 'un' : 'gl')).slice(0, 30);
    const asUnit = edit.es_precio_unitario === true;
    baseLines.push({
      nombre,
      unidad,
      cantidad: qty,
      precio_unitario: asUnit ? rawMoney : 0,
      ...(asUnit ? {} : { precio_partida: rawMoney }),
      tipo: classifyQuoteLineKind(nombre, unidad),
      subtotal: asUnit ? Math.round(qty * rawMoney) : rawMoney,
    });
    mutated = true;
  } else if (edit.operacion === 'eliminar_partida' && edit.partida_objetivo?.trim()) {
    const idx = matchLineIndex(baseLines, edit.partida_objetivo, false);
    if (idx < 0) throw new AIError('OBRABOT_QUOTE_INPUT', `No encontré la partida «${edit.partida_objetivo.trim()}» en esta cotización.`, 422);
    if (baseLines.length <= 1) throw new AIError('OBRABOT_QUOTE_INPUT', 'La cotización debe conservar al menos una partida.', 422);
    baseLines.splice(idx, 1);
    mutated = true;
  }

  if (!mutated) return null;
  return buildQuoteEditPatch(quote, baseLines, {
    tratamiento_iva,
    duracion_dias_estimada,
    plazo_texto,
    mostrar_fecha,
  });
}

export function matchesQuoteTitleHint(title: string, text: string): number {
  const normTitle = fold(title);
  const normText = fold(text);
  const tokens = normTitle.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !['cotizacion', 'presupuesto', 'instalacion', 'realizacion', 'proyecto'].includes(w));
  if (!tokens.length) return 0;
  return tokens.filter((t) => normText.includes(t)).length;
}
