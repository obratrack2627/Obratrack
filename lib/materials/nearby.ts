import {
  COORDENADAS_COMUNAS_CHILE,
  REGIONES_CHILE,
  findNearestComuna,
} from "@/lib/chile-locations";
import { serverFetch } from "@/lib/server-fetch";
import { normalize } from "./catalog";
import type {
  ComparacionMateriales,
  ConsultaMaterial,
  FerreteriaCercana,
} from "./types";

const CHAIN_MATCHERS: Array<{
  pattern: RegExp;
  nombre: string;
  integrada?: string;
  searchUrl?: (producto: string) => string;
}> = [
  { pattern: /\b(?:sodimac|homecenter)\b/i, nombre: "Sodimac", integrada: "Sodimac" },
  { pattern: /\beasy\b/i, nombre: "Easy", integrada: "Easy" },
  { pattern: /\bdimaco\b/i, nombre: "Dimaco", integrada: "Dimaco" },
  { pattern: /\bchilemat\b/i, nombre: "Chilemat", integrada: "Chilemat" },
  { pattern: /\b(?:ferreteria\s+)?prat\b/i, nombre: "Ferretería Prat", integrada: "Ferretería Prat" },
  { pattern: /\bweitzler\b/i, nombre: "Weitzler", integrada: "Weitzler" },
  {
    pattern: /\bconstrumart\b/i,
    nombre: "Construmart",
    searchUrl: (producto) =>
      `https://www.construmart.cl/catalogsearch/result/?q=${encodeURIComponent(producto)}`,
  },
  {
    pattern: /\bimperial\b/i,
    nombre: "Imperial",
    searchUrl: () => "https://www.imperial.cl/",
  },
  { pattern: /\bmts\b/i, nombre: "MTS" },
  { pattern: /\byolito\b/i, nombre: "Yolito" },
];

const EXCLUDED_PLACE_RE =
  /\b(?:bicicletas?|mascotas?|veterinari[ao]s?|peluquerias?|computacion|computadoras?|celulares?|librerias?|jugueterias?|farmacias?|panaderias?|restaurantes?|supermercados?|hoteles?|hostales?|bencineras?|estacionamientos?)\b/i;

const nearbyCache = new Map<
  string,
  { expiresAt: number; stores: FerreteriaCercana[] }
>();

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthKm * c * 10) / 10;
}

export function resolveMaterialCoordinates(input: {
  latitud?: number;
  longitud?: number;
  ubicacion?: string;
}): { lat: number; lng: number; comuna: string; region: string } | null {
  if (
    typeof input.latitud === "number" &&
    typeof input.longitud === "number" &&
    Number.isFinite(input.latitud) &&
    Number.isFinite(input.longitud) &&
    input.latitud >= -56 &&
    input.latitud <= -17 &&
    input.longitud >= -76 &&
    input.longitud <= -66
  ) {
    const nearest = findNearestComuna(input.latitud, input.longitud);
    return {
      lat: input.latitud,
      lng: input.longitud,
      comuna: nearest.comuna,
      region: nearest.region,
    };
  }
  const raw = input.ubicacion?.trim();
  if (!raw || normalize(raw) === "por definir") return null;

  const normalizedEntries = Object.entries(COORDENADAS_COMUNAS_CHILE)
    .map(([name, coords]) => ({
      name,
      folded: normalize(name),
      coords,
    }))
    .sort((a, b) => b.folded.length - a.folded.length);

  const segments = raw
    .split(/[,/-]/)
    .map((part) => normalize(part))
    .filter(Boolean);
  for (const segment of segments) {
    const exact = normalizedEntries.find((entry) => entry.folded === segment);
    if (exact) {
      const nearest = findNearestComuna(exact.coords.lat, exact.coords.lng);
      return {
        lat: exact.coords.lat,
        lng: exact.coords.lng,
        comuna: exact.name,
        region: nearest.region,
      };
    }
  }

  const fullFolded = normalize(raw);
  const partial = normalizedEntries.find(
    (entry) =>
      entry.folded.length >= 4 &&
      (fullFolded.includes(entry.folded) || entry.folded.includes(fullFolded)),
  );
  if (partial) {
    const nearest = findNearestComuna(partial.coords.lat, partial.coords.lng);
    return {
      lat: partial.coords.lat,
      lng: partial.coords.lng,
      comuna: partial.name,
      region: nearest.region,
    };
  }

  for (const reg of REGIONES_CHILE) {
    const regFolded = normalize(reg.nombre);
    if (fullFolded.includes(regFolded) || regFolded.includes(fullFolded)) {
      const capCoords = COORDENADAS_COMUNAS_CHILE[reg.capital];
      if (capCoords) {
        return {
          lat: capCoords.lat,
          lng: capCoords.lng,
          comuna: reg.capital,
          region: reg.nombre,
        };
      }
    }
  }
  return null;
}

export function detectKnownHardwareChain(name: string) {
  const folded = normalize(name);
  for (const chain of CHAIN_MATCHERS) {
    if (chain.pattern.test(folded)) return chain;
  }
  return null;
}

function normalizeChileanWhatsAppDigits(rawPhone?: string): string | undefined {
  if (!rawPhone) return undefined;
  const first = rawPhone.split(/[;/,]/)[0] || "";
  const digits = first.replace(/\D+/g, "");
  if (!digits) return undefined;
  if (/^56[2-9]\d{8}$/.test(digits)) return digits;
  if (/^9\d{8}$/.test(digits)) return `56${digits}`;
  if (/^0?9\d{8}$/.test(digits)) return `56${digits.slice(-9)}`;
  return undefined;
}

export function buildWhatsAppQuoteLink(
  phone: string | undefined,
  query: ConsultaMaterial,
  comuna: string,
): string | undefined {
  const digits = normalizeChileanWhatsAppDigits(phone);
  if (!digits) return undefined;
  const qtyPart =
    query.cantidad && query.cantidad > 0
      ? `${query.cantidad} ${query.unidad_cantidad?.trim() || "unidades"} de `
      : "";
  const message = `Hola, necesito cotizar ${qtyPart}${query.producto} para una obra en ${comuna}. ¿Tienen stock disponible y valor con retiro o despacho?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function googleMapsPlaceUrl(lat: number, lng: number, name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${lat.toFixed(5)},${lng.toFixed(5)}`)}`;
}

interface RawNearbyCandidate {
  nombre: string;
  lat: number;
  lng: number;
  direccion?: string;
  telefono?: string;
}

async function queryGooglePlaces(
  center: { lat: number; lng: number },
  radiusKm: number,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<RawNearbyCandidate[]> {
  const radiusM = Math.min(Math.round(radiusKm * 1000), 25000);
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${center.lat},${center.lng}&radius=${radiusM}&type=hardware_store&language=es&key=${encodeURIComponent(apiKey)}`;
  const res = await fetcher(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data?.results)) return [];
  const out: RawNearbyCandidate[] = [];
  for (const row of data.results.slice(0, 15)) {
    if (row.business_status === "CLOSED_PERMANENTLY") continue;
    const lat = Number(row.geometry?.location?.lat);
    const lng = Number(row.geometry?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !row.name) continue;
    out.push({
      nombre: String(row.name).trim().slice(0, 100),
      lat,
      lng,
      direccion:
        typeof row.vicinity === "string"
          ? row.vicinity.trim().slice(0, 140)
          : undefined,
    });
  }
  return out;
}

function buildViewbox(lat: number, lng: number, radiusKm: number): string {
  const latDelta = radiusKm / 111;
  const cosLat = Math.max(Math.abs(Math.cos((lat * Math.PI) / 180)), 0.2);
  const lngDelta = radiusKm / (111 * cosLat);
  return [
    (lng - lngDelta).toFixed(4),
    (lat + latDelta).toFixed(4),
    (lng + lngDelta).toFixed(4),
    (lat - latDelta).toFixed(4),
  ].join(",");
}

async function queryNominatimBounded(
  q: string,
  viewbox: string,
  limit: number,
  fetcher: typeof fetch,
): Promise<RawNearbyCandidate[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&viewbox=${encodeURIComponent(viewbox)}&bounded=1&addressdetails=1&extratags=1&countrycodes=cl&limit=${limit}`;
  const res = await fetcher(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "ObraTrack-Chile-Construction-Platform/1.0 (obratrack2627@gmail.com)",
      "Accept-Language": "es",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) return [];
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  const out: RawNearbyCandidate[] = [];
  for (const row of rows) {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const addr = row.address || {};
    const extra = row.extratags || {};
    const rawName =
      row.name ||
      addr.shop ||
      addr.building ||
      (typeof row.display_name === "string" ? row.display_name.split(",")[0] : "") ||
      "Ferretería";
    const road = [addr.road, addr.house_number].filter(Boolean).join(" ").trim();
    const comuna = addr.suburb || addr.city_district || addr.town || addr.city || "";
    const direccion = [road, comuna].filter(Boolean).join(", ").trim();
    const rawPhone =
      extra.phone ||
      extra["contact:phone"] ||
      extra["contact:whatsapp"] ||
      extra["contact:mobile"];
    out.push({
      nombre: String(rawName).trim().slice(0, 100),
      lat,
      lng,
      direccion: direccion ? direccion.slice(0, 140) : undefined,
      telefono: typeof rawPhone === "string" ? rawPhone.trim().slice(0, 60) : undefined,
    });
  }
  return out;
}

export async function findNearbyHardwareStores(
  query: ConsultaMaterial,
  fetcher: typeof fetch = serverFetch,
  options: { googleApiKey?: string; bypassCache?: boolean } = {},
): Promise<FerreteriaCercana[]> {
  const center = resolveMaterialCoordinates({
    latitud: query.latitud,
    longitud: query.longitud,
    ubicacion: query.ubicacion,
  });
  if (!center) return [];

  const radiusKm = Math.min(Math.max(query.radio_km || 8, 1), 25);
  const useCache = !options.bypassCache && fetcher === serverFetch;
  const cacheKey = `${center.lat.toFixed(2)}:${center.lng.toFixed(2)}:${radiusKm}`;
  if (useCache) {
    const cached = nearbyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.stores.map((s) => ({
        ...s,
        ...(s.telefono
          ? { url_whatsapp: buildWhatsAppQuoteLink(s.telefono, query, center.comuna) }
          : {}),
      }));
    }
  }

  let candidates: RawNearbyCandidate[] = [];
  const apiKey =
    options.googleApiKey ??
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    candidates = await queryGooglePlaces(center, radiusKm, apiKey, fetcher).catch(
      () => [],
    );
  }
  if (candidates.length === 0) {
    const viewbox = buildViewbox(center.lat, center.lng, radiusKm);
    candidates = await queryNominatimBounded(
      "ferreteria",
      viewbox,
      15,
      fetcher,
    ).catch(() => []);
    const hasChain = candidates.some((c) => detectKnownHardwareChain(c.nombre));
    if (!hasChain) {
      const chainHits = await queryNominatimBounded(
        "sodimac",
        viewbox,
        5,
        fetcher,
      ).catch(() => []);
      candidates = [...candidates, ...chainHits];
    }
  }

  const maxDistance = radiusKm * 1.25;
  const enriched: FerreteriaCercana[] = [];
  for (const cand of candidates) {
    const folded = normalize(cand.nombre);
    if (!folded || EXCLUDED_PLACE_RE.test(folded)) continue;
    const distance = haversineKm(center.lat, center.lng, cand.lat, cand.lng);
    if (distance > maxDistance) continue;
    const chain = detectKnownHardwareChain(cand.nombre);
    const key = normalize(chain?.nombre || cand.nombre);
    const duplicate = enriched.some(
      (existing) =>
        normalize(existing.nombre) === key &&
        Math.abs(existing.distancia_km - distance) < 0.25,
    );
    if (duplicate) continue;

    const urlWhatsapp = buildWhatsAppQuoteLink(
      cand.telefono,
      query,
      center.comuna,
    );
    enriched.push({
      nombre: cand.nombre,
      tipo: chain ? "cadena" : "local",
      distancia_km: distance,
      ...(cand.direccion ? { direccion: cand.direccion } : {}),
      ...(cand.telefono ? { telefono: cand.telefono } : {}),
      ...(chain?.integrada ? { cadena_integrada: chain.integrada } : {}),
      url_mapa: googleMapsPlaceUrl(cand.lat, cand.lng, cand.nombre),
      ...(urlWhatsapp ? { url_whatsapp: urlWhatsapp } : {}),
      ...(chain?.searchUrl
        ? { url_busqueda: chain.searchUrl(query.producto) }
        : {}),
    });
  }

  enriched.sort((a, b) => a.distancia_km - b.distancia_km);
  const chains = enriched.filter((s) => s.tipo === "cadena").slice(0, 4);
  const locals = enriched.filter((s) => s.tipo === "local").slice(0, 4);
  const picked = new Set([...chains, ...locals]);
  for (const store of enriched) {
    if (picked.size >= 8) break;
    picked.add(store);
  }
  const result = Array.from(picked).sort(
    (a, b) => a.distancia_km - b.distancia_km,
  );

  if (useCache && result.length > 0) {
    nearbyCache.set(cacheKey, {
      expiresAt: Date.now() + 30 * 60 * 1000,
      stores: result,
    });
  }
  return result;
}

export function attachNearbyToComparison(
  comparison: ComparacionMateriales,
  nearby: FerreteriaCercana[],
): ComparacionMateriales {
  if (!nearby.length) return comparison;
  const closestByChain = new Map<string, FerreteriaCercana>();
  for (const store of nearby) {
    if (!store.cadena_integrada) continue;
    const prev = closestByChain.get(store.cadena_integrada);
    if (!prev || store.distancia_km < prev.distancia_km) {
      closestByChain.set(store.cadena_integrada, store);
    }
  }
  const ofertas = comparison.ofertas.map((offer) => {
    const match = closestByChain.get(offer.tienda);
    if (!match) return offer;
    return {
      ...offer,
      sucursal_cercana_km: match.distancia_km,
      sucursal_cercana_nombre: match.nombre,
    };
  });
  return {
    ...comparison,
    ofertas,
    ferreterias_cercanas: nearby.slice(0, 8),
  };
}
