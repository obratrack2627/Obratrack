import { serverFetch } from "@/lib/server-fetch";
import { compareMaterialPrices, validateMaterialQuery } from "./catalog";
import {
  findHistoricalMaterialPrices,
  type HistoricalMaterialRecord,
  type HistoricalProjectRecord,
} from "./history";
import {
  attachNearbyToComparison,
  findNearbyHardwareStores,
} from "./nearby";
import type { ComparacionMateriales, ConsultaMaterial } from "./types";

export async function compareMaterialPricesEnriched(
  input: ConsultaMaterial,
  context: {
    materials?: HistoricalMaterialRecord[];
    projects?: HistoricalProjectRecord[];
    comuna?: string;
    region?: string;
    fetcher?: typeof fetch;
    googleApiKey?: string;
  } = {},
): Promise<ComparacionMateriales> {
  const fetcher = context.fetcher || serverFetch;
  const query = validateMaterialQuery(input);
  const [comparison, nearby] = await Promise.all([
    compareMaterialPrices(query, fetcher),
    findNearbyHardwareStores(query, fetcher, {
      googleApiKey: context.googleApiKey,
    }).catch(() => []),
  ]);

  let result = attachNearbyToComparison(comparison, nearby);
  if (context.materials?.length) {
    const historial = findHistoricalMaterialPrices(
      query,
      context.materials,
      context.projects || [],
      { comuna: context.comuna || query.ubicacion, region: context.region },
    );
    if (historial.length > 0) {
      result = { ...result, historial_empresa: historial };
    }
  }
  return result;
}
