import { roundLine } from "@/lib/ai/protocol";
import {
  COUNTABLE_PURCHASE_UNITS,
  extractSearchTokens,
  normalize,
  tokenMatchesFullWords,
} from "./catalog";
import type { ConsultaMaterial, PrecioHistoricoMaterial } from "./types";

export interface HistoricalMaterialRecord {
  proyecto_id: string;
  nombre: string;
  cantidad?: number;
  unidad?: string;
  precio_unitario: number;
  proveedor?: string;
  comprado?: boolean;
  created_at?: string;
}

export interface HistoricalProjectRecord {
  id: string;
  nombre: string;
  comuna?: string;
  region?: string;
}

function compatibleUnitsForTotal(
  requestedUnit?: string,
  storedUnit?: string,
): boolean {
  const reqNorm = normalize(requestedUnit || "");
  if (!reqNorm || !COUNTABLE_PURCHASE_UNITS.has(reqNorm)) return false;
  const storedNorm = normalize(storedUnit || "un");
  if (storedNorm === reqNorm) return true;
  if (storedNorm === "un" && COUNTABLE_PURCHASE_UNITS.has(reqNorm)) return true;
  return storedNorm.slice(0, 4) === reqNorm.slice(0, 4);
}

export function findHistoricalMaterialPrices(
  query: ConsultaMaterial,
  materials: HistoricalMaterialRecord[],
  projects: HistoricalProjectRecord[],
  reference: { comuna?: string; region?: string; now?: Date } = {},
): PrecioHistoricoMaterial[] {
  const tokens = extractSearchTokens(query.producto);
  if (!tokens.length || !Array.isArray(materials) || !materials.length) {
    return [];
  }

  const extraTokens = [query.marca, query.presentacion]
    .filter(Boolean)
    .flatMap((v) => extractSearchTokens(String(v)));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const refComuna = normalize(reference.comuna || query.ubicacion || "");
  const refRegion = normalize(reference.region || "");
  const nowMs = (reference.now || new Date()).getTime();

  const candidates: Array<PrecioHistoricoMaterial & { score: number; dedupKey: string }> = [];

  for (const row of materials) {
    if (
      typeof row?.nombre !== "string" ||
      !row.nombre.trim() ||
      typeof row.precio_unitario !== "number" ||
      !Number.isFinite(row.precio_unitario) ||
      row.precio_unitario <= 0
    ) {
      continue;
    }

    const fullText = normalize(`${row.nombre} ${row.proveedor || ""}`);
    const fullWords = fullText.split(" ").filter(Boolean);
    if (!tokens.every((t) => tokenMatchesFullWords(t, fullWords, tokens))) {
      continue;
    }
    if (
      extraTokens.length > 0 &&
      !extraTokens.every((t) => tokenMatchesFullWords(t, fullWords, extraTokens))
    ) {
      continue;
    }

    const project = projectMap.get(row.proyecto_id);
    const projectComuna = project?.comuna?.trim();
    const projectRegion = project?.region?.trim();
    let score = row.comprado ? 40 : 15;
    if (refComuna && projectComuna && refComuna.includes(normalize(projectComuna))) {
      score += 30;
    } else if (refRegion && projectRegion && refRegion === normalize(projectRegion)) {
      score += 15;
    }

    let dias: number | undefined;
    if (row.created_at) {
      const ts = Date.parse(row.created_at);
      if (Number.isFinite(ts) && ts <= nowMs + 86400000) {
        dias = Math.max(0, Math.floor((nowMs - ts) / 86400000));
        if (dias <= 30) score += 20;
        else if (dias <= 90) score += 10;
      }
    }

    const roundedUnit = Math.round(row.precio_unitario);
    const totalEstimado =
      query.cantidad &&
      Number.isInteger(query.cantidad) &&
      query.cantidad > 0 &&
      compatibleUnitsForTotal(query.unidad_cantidad, row.unidad)
        ? roundLine(query.cantidad, roundedUnit)
        : undefined;

    const proveedor = String(row.proveedor || "Proveedor registrado").trim() || "Proveedor registrado";
    candidates.push({
      nombre: row.nombre.trim(),
      proveedor,
      precio_unitario: roundedUnit,
      unidad: String(row.unidad || "un").trim() || "un",
      ...(row.created_at ? { fecha: row.created_at } : {}),
      proyecto_nombre: project?.nombre || "Obra anterior",
      ...(projectComuna ? { comuna: projectComuna } : {}),
      comprado: Boolean(row.comprado),
      ...(dias != null ? { dias_desde_compra: dias } : {}),
      ...(totalEstimado != null ? { total_estimado: totalEstimado } : {}),
      score,
      dedupKey: `${normalize(proveedor)}:${normalize(row.nombre)}:${roundedUnit}`,
    });
  }

  candidates.sort(
    (a, b) => b.score - a.score || a.precio_unitario - b.precio_unitario,
  );

  const unique: PrecioHistoricoMaterial[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    if (seen.has(item.dedupKey)) continue;
    seen.add(item.dedupKey);
    const { score: _score, dedupKey: _key, ...clean } = item;
    unique.push(clean);
    if (unique.length >= 3) break;
  }
  return unique;
}
