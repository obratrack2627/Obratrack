import {
  sodimacProducts,
  construmartProducts,
  pratShopifyProducts,
  weitzlerWooProducts,
} from "./retail";
import { safeOfferURL } from "./types";
import { serverFetch } from "@/lib/server-fetch";
import { AIError } from "@/lib/ai/errors";
import { roundLine } from "@/lib/ai/protocol";
import { findNearestComuna, findRegionForComuna } from "@/lib/chile-locations";
import type {
  ComparacionMateriales,
  ConsultaMaterial,
  OfertaMaterial,
} from "./types";

// Cuentas públicas de catálogo identificadas en las propias tiendas. Sin claves ni sesiones de clientes.
export const catalogProviders: Array<{
  nombre: string;
  cuenta: string;
  url: string;
  tipo?: "sodimac" | "magento" | "imperial" | "shopify" | "woocommerce";
  habilitado?: boolean;
  regiones?: string[];
}> = [
  { nombre: "Easy", cuenta: "easycl", url: "https://www.easy.cl" },
  { nombre: "Dimaco", cuenta: "dimacocl", url: "https://www.dimaco.cl" },
  { nombre: "Sodimac", cuenta: "sodimac", url: "https://www.sodimac.cl", tipo: "sodimac" },
  { nombre: "Chilemat", cuenta: "chilemat", url: "https://www.chilemat.cl" },
  {
    nombre: "Ferretería Prat",
    cuenta: "ferreteriaprat",
    url: "https://www.ferreteriaprat.cl",
    tipo: "shopify",
    regiones: [
      "arica", "parinacota", "tarapaca", "iquique", "alto hospicio",
      "antofagasta", "calama", "mejillones", "atacama", "copiapo",
      "vallenar", "caldera", "coquimbo", "la serena",
    ],
  },
  {
    nombre: "Weitzler",
    cuenta: "weitzler",
    url: "https://www.weitzler.cl",
    tipo: "woocommerce",
    regiones: [
      "araucania", "temuco", "villarrica", "pucon",
      "los rios", "valdivia", "la union",
      "los lagos", "puerto montt", "puerto varas", "osorno", "castro", "ancud",
      "aysen", "coyhaique",
    ],
  },
  { nombre: "Construmart", cuenta: "construmart", url: "https://www.construmart.cl", tipo: "magento", habilitado: false },
  { nombre: "Imperial", cuenta: "imperial", url: "https://www.imperial.cl", tipo: "imperial", habilitado: false },
];
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d),([\d])/g, "$1.$2")
    .replace(/([a-z])(\d)|(\d)([a-z])/g, (_, a, b, c, d) =>
      a ? `${a} ${b}` : `${c} ${d}`,
    )
    .replace(/kilogramos?|kilos?/g, "kg")
    .replace(/milimetros?/g, "mm")
    .replace(/centimetros?/g, "cm")
    .replace(/litros?/g, "l")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\.(?=\s|$)/g, "")
    .trim();

export function validateMaterialQuery(value: any): ConsultaMaterial {
  if (
    !value ||
    typeof value.producto !== "string" ||
    !value.producto.trim() ||
    value.producto.length > 160
  )
    throw new AIError(
      "MATERIAL_QUERY",
      "Indica el material, herramienta o producto que quieres buscar.",
      422,
    );
  const query: ConsultaMaterial = { producto: value.producto.trim() };
  for (const key of [
    "marca",
    "modelo",
    "presentacion",
    "ubicacion",
    "unidad_cantidad",
  ] as const)
    if (typeof value[key] === "string" && value[key].trim())
      query[key] = value[key].trim().slice(0, 100);
  if (value.cantidad != null) {
    if (
      typeof value.cantidad !== "number" ||
      !Number.isFinite(value.cantidad) ||
      value.cantidad <= 0 ||
      value.cantidad > 1000000
    )
      throw new AIError(
        "MATERIAL_QUANTITY",
        "Indica una cantidad de compra válida.",
        422,
      );
    query.cantidad = value.cantidad;
  }
  if (Array.isArray(value.tiendas))
    query.tiendas = value.tiendas
      .filter((v: any) => typeof v === "string" && v.trim())
      .slice(0, 8)
      .map((v: string) => v.trim().slice(0, 60));
  if (
    typeof value.latitud === "number" &&
    Number.isFinite(value.latitud) &&
    value.latitud >= -90 &&
    value.latitud <= 90 &&
    typeof value.longitud === "number" &&
    Number.isFinite(value.longitud) &&
    value.longitud >= -180 &&
    value.longitud <= 180
  ) {
    query.latitud = value.latitud;
    query.longitud = value.longitud;
  }
  if (
    typeof value.radio_km === "number" &&
    Number.isFinite(value.radio_km) &&
    value.radio_km >= 1 &&
    value.radio_km <= 50
  ) {
    query.radio_km = Math.round(value.radio_km);
  }
  if (
    [query.producto, query.marca, query.modelo, query.presentacion].some(
      (v) => v && (/@|https?:\/\//i.test(v) || /\+\d[\d\s().-]{8,}/.test(v)),
    )
  )
    throw new AIError(
      "MATERIAL_QUERY",
      "Indica solo el producto y sus especificaciones, sin teléfonos, correos ni enlaces.",
      422,
    );
  return query;
}

export function completePurchaseQuantity(query: any, message: string) {
  if (typeof query?.cantidad !== "number" || query.unidad_cantidad)
    return query;
  const matches = Array.from(
    message.matchAll(
      /(?<![\d/])(\d+(?:[.,]\d+)*)\s*(unidades?|sacos?|cajas?|bolsas?|piezas?|paquetes?|baldes?|tarros?|latas?|bidones?|rollos?|sets?|planchas?|galones?|tinetas?|tiras?|barras?|tubos?|palos?)\b/gi,
    ),
  );
  for (const match of matches) {
    const cantidad = /^\d{1,3}(?:\.\d{3})+$/.test(match[1])
      ? Number(match[1].replace(/\./g, ""))
      : Number(match[1].replace(",", "."));
    const before = message.slice(
      Math.max(0, (match.index || 0) - 35),
      match.index,
    );
    if (
      cantidad === query.cantidad &&
      !/\b(?:caja|paquete|bolsa|kit|juego|set)\s+(?:de\s+)?$/i.test(before)
    )
      return { ...query, unidad_cantidad: match[2] };
  }
  return query;
}

function barcode(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{8}$|^\d{12,14}$/.test(value) ||
    /^0+$/.test(value)
  )
    return undefined;
  const digits = value.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check ? value.padStart(14, "0") : undefined;
}

const SPEC_STOP_WORDS = new Set([
  "saco", "sacos", "bolsa", "bolsas", "caja", "cajas",
  "tarro", "tarros", "lata", "latas", "botella", "botellas",
  "paquete", "paquetes", "pack", "unidad", "unidades", "un", "und",
  "de", "del", "la", "el", "los", "las", "para", "con", "en", "por",
]);

function splitJoinedUnits(text: string) {
  return text.replace(/(\d)(kg|g|mm|cm|m|ml|l|lt|lts|w|kw|v|ah)\b/g, "$1 $2");
}

function significantSpecTokens(value: string) {
  return splitJoinedUnits(normalize(value))
    .split(" ")
    .filter((word) => word && !SPEC_STOP_WORDS.has(word));
}

function matchesSpecification(value: string, full: string) {
  const expandedFull = splitJoinedUnits(full);
  const wantedWords = significantSpecTokens(value);
  if (!wantedWords.length) return true;
  const words = new Set(expandedFull.split(" "));
  if (!wantedWords.every((word) => words.has(word))) return false;
  // Una medida debe pertenecer a su unidad, aunque modelo y tamaño lleguen
  // juntos y la tienda los publique en otro orden (HP1630K 13mm / 13mm HP1630K).
  const wanted = wantedWords.join(" ");
  const measures = wanted.matchAll(
    /\b\d+(?:\.\d+)?\s+(?:kg|g|mm|cm|m|ml|l|w|kw|v|ah)\b/g,
  );
  return Array.from(measures).every(([measure]) =>
    ` ${expandedFull} `.includes(` ${measure} `),
  );
}

const QUERY_STOP_WORDS = new Set([
  "de", "del", "para", "el", "la", "los", "las", "un", "una",
]);

const GENERIC_CONTAINER_TOKENS = new Set([
  "plancha", "planchas", "palo", "palos", "barra", "barras",
  "saco", "sacos", "bolsa", "bolsas", "caja", "cajas",
  "tarro", "tarros", "balde", "baldes", "galon", "galones",
  "tineta", "tinetas", "rollo", "rollos", "tira", "tiras",
  "tubo", "tubos",
]);

export const COUNTABLE_PURCHASE_UNITS = new Set([
  "un", "unidad", "unidades",
  "saco", "sacos", "bolsa", "bolsas", "caja", "cajas",
  "pieza", "piezas", "paquete", "paquetes", "set", "sets",
  "balde", "baldes", "tarro", "tarros", "lata", "latas",
  "bidon", "bidones", "rollo", "rollos",
  "plancha", "planchas", "galon", "galones", "tineta", "tinetas",
  "tira", "tiras", "barra", "barras", "tubo", "tubos",
  "palo", "palos",
]);

const BOX_M2_RE = /\b(\d+(?:[.,]\d+)?)[ \t]*m[2²](?![a-z0-9_])/i;

export function isAreaQuantityUnit(raw?: string): boolean {
  if (!raw) return false;
  const folded = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/²/g, "2")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return ["m2", "metro cuadrado", "metros cuadrados", "mt2", "mts2"].includes(
    folded,
  );
}

function extractBoxCoverageM2(
  name: string,
  productName: string,
  unit: string,
  multiplier: number,
): number | undefined {
  for (const source of [name, productName]) {
    const match = BOX_M2_RE.exec(source);
    if (match) {
      const value = Number(match[1].replace(",", "."));
      if (Number.isFinite(value) && value > 0.1 && value <= 50) {
        return Math.round(value * 1000) / 1000;
      }
    }
  }
  if (
    ["m2", "m²"].includes(unit.trim().toLowerCase()) &&
    Number.isFinite(multiplier) &&
    multiplier > 0.1 &&
    multiplier <= 50
  ) {
    return Math.round(multiplier * 1000) / 1000;
  }
  return undefined;
}

export function extractSearchTokens(rawProduct: string): string[] {
  const rawTokens = normalize(rawProduct)
    .split(" ")
    .filter((t) => t && !QUERY_STOP_WORDS.has(t));
  const withoutGeneric = rawTokens.filter(
    (t) => !GENERIC_CONTAINER_TOKENS.has(t),
  );
  return withoutGeneric.length > 0 ? withoutGeneric : rawTokens;
}

function wordMatchesSingleToken(word: string, token: string): boolean {
  if (word === token) return true;
  return (
    token.length >= 4 &&
    (word === `${token}s` ||
      word === `${token}es` ||
      token === `${word}s` ||
      token === `${word}es`)
  );
}

export function tokenMatchesFullWords(
  token: string,
  fullWords: string[],
  allTokens: string[],
): boolean {
  if (fullWords.some((w) => wordMatchesSingleToken(w, token))) return true;
  if (token === "volcanita" || token === "vulcanita") {
    return (
      fullWords.some((w) => wordMatchesSingleToken(w, "volcanita")) ||
      (fullWords.includes("yeso") && fullWords.includes("carton"))
    );
  }
  if (
    (token === "yeso" || token === "carton") &&
    allTokens.includes("yeso") &&
    allTokens.includes("carton") &&
    fullWords.some((w) => wordMatchesSingleToken(w, "volcanita"))
  ) {
    return true;
  }
  if (token === "pegamento") {
    return fullWords.some((w) => wordMatchesSingleToken(w, "adhesivo"));
  }
  if (token === "adhesivo") {
    return fullWords.some((w) => wordMatchesSingleToken(w, "pegamento"));
  }
  if (token === "fierro") {
    return fullWords.some((w) => wordMatchesSingleToken(w, "acero"));
  }
  return false;
}

function cleanSearchProductTerm(rawProduct: string): string {
  const foldedWords = rawProduct
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const needsCleaning = foldedWords.some(
    (w) => GENERIC_CONTAINER_TOKENS.has(w) || w === "vulcanita",
  );
  if (!needsCleaning) return rawProduct.trim();
  const kept = rawProduct
    .trim()
    .split(/\s+/)
    .map((word) => {
      const folded = word
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (folded === "vulcanita") return "volcanita";
      return GENERIC_CONTAINER_TOKENS.has(folded) ? "" : word;
    })
    .filter(Boolean);
  return kept.length > 0 ? kept.join(" ") : rawProduct.trim();
}

function synonymSearchTerms(searchProduct: string): string[] {
  const folded = searchProduct
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const alternatives: string[] = [];
  if (/\bvolcanita\b/.test(folded)) {
    alternatives.push(folded.replace(/\bvolcanita\b/g, "yeso carton"));
  } else if (/\byeso\s+carton\b/.test(folded)) {
    alternatives.push(folded.replace(/\byeso\s+carton\b/g, "volcanita"));
  }
  if (/\bpegamento\b/.test(folded)) {
    alternatives.push(folded.replace(/\bpegamento\b/g, "adhesivo"));
  } else if (/\badhesivo\b/.test(folded)) {
    alternatives.push(folded.replace(/\badhesivo\b/g, "pegamento"));
  }
  if (/\bfierro\b/.test(folded)) {
    alternatives.push(folded.replace(/\bfierro\b/g, "barra acero"));
  }
  return alternatives;
}

export function parseCatalogProducts(
  products: any,
  provider: (typeof catalogProviders)[number],
  query: ConsultaMaterial,
): OfertaMaterial[] {
  if (!Array.isArray(products)) throw Error("Catálogo no disponible");
  const tokens = extractSearchTokens(query.producto);
  const result: OfertaMaterial[] = [];
  for (const product of products.slice(0, 30))
    for (const item of (Array.isArray(product.items)
      ? product.items
      : []
    ).slice(0, 15)) {
      if (
        typeof product.productName !== "string" ||
        typeof item.itemId !== "string"
      )
        continue;
      const name = String(item.nameComplete || product.productName).slice(
        0,
        240,
      );
      const full = normalize(
        `${product.productName} ${name} ${product.brand || ""}`,
      );
      const fullWords = full.split(" ").filter(Boolean);
      const wantedLatex =
        tokens.includes("latex") &&
        !tokens.some((t) =>
          ["globo", "globos", "guante", "guantes", "cotillon", "fiesta"].includes(t),
        );
      if (
        wantedLatex &&
        /\b(?:globos?|guantes?|cotillon|cumpleanos|fiesta|preservativos?|disfraz|mascota)\b/.test(
          full,
        )
      )
        continue;
      const wantedDrywallBoard =
        (tokens.includes("volcanita") ||
          tokens.includes("vulcanita") ||
          (tokens.includes("yeso") && tokens.includes("carton"))) &&
        !tokens.some((t) =>
          [
            "tarugo", "tarugos", "tornillo", "tornillos", "clavo", "clavos",
            "huincha", "cinta", "broca", "brocas", "perfil", "montante",
            "canal", "esquinero", "fijacion", "fijaciones",
          ].includes(t),
        );
      if (
        wantedDrywallBoard &&
        fullWords.some((w) =>
          [
            "tarugo", "tarugos", "tornillo", "tornillos", "huincha",
            "broca", "brocas", "esquinero", "fijacion", "fijaciones",
          ].includes(w),
        )
      )
        continue;
      if (tokens.length === 1 && ['cemento','yeso','arena','grava','taladro','martillo','clavo','tornillo','pintura','mortero','ladrillo','bloque','sierra'].includes(tokens[0])) {
        const prefixes = new Set(['de','del','el','la','saco','sacos','bolsa','bolsas','caja','cajas','pack','paquete', ...normalize(product.brand || '').split(' ')]);
        const validLead = (rawTitle: string) => {
          const words = normalize(rawTitle).split(' ');
          const idx = words.findIndex((word) => word === tokens[0] || word === tokens[0] + 's' || word === tokens[0] + 'es');
          return idx >= 0 && words.slice(0, idx).every((word) => prefixes.has(word));
        };
        if (!validLead(name) && !validLead(product.productName)) continue;
      }
      if (!tokens.every((t) => tokenMatchesFullWords(t, fullWords, tokens)))
        continue;
      if (
        [query.marca, query.modelo, query.presentacion].some(
          (v, i) => v && !(i === 0 && normalize(product.brand || "").replace(/\s/g, "") === normalize(v).replace(/\s/g, "")) && !matchesSpecification(v, full),
        )
      )
        continue;
      const sellers = Array.isArray(item.sellers) ? item.sellers : [];
      const seller =
        sellers.find((s: any) => s.sellerDefault === true) || sellers[0];
      const offer = seller?.commertialOffer;
      if (
        typeof offer?.Price !== "number" ||
        !Number.isFinite(offer.Price) ||
        offer.Price <= 0 ||
        !Number.isSafeInteger(Math.round(offer.Price)) ||
        (provider.tipo === "sodimac" ? offer.AvailableQuantity === 0 : !(offer.AvailableQuantity > 0))
      )
        continue;
      const multiplier =
        typeof item.unitMultiplier === "number" && item.unitMultiplier > 0
          ? item.unitMultiplier
          : 1;
      let source: URL;
      try {
        source = new URL(product.link);
        if (
          source.protocol !== "https:" ||
          source.username ||
          source.password ||
          ![
            `${provider.cuenta}.vtexcommercestable.com.br`,
            new URL(provider.url).hostname,
            new URL(provider.url).hostname.replace(/^www\./, ""),
          ].includes(source.hostname) ||
          !safeOfferURL(provider.url + source.pathname)
        )
          continue;
      } catch {
        continue;
      }
      const url = provider.url + source.pathname;
      const price = Math.round(offer.Price);
      const unit = String(item.measurementUnit || "un").slice(0, 20);
      const unitNorm = normalize(query.unidad_cantidad || "");
      const countablePurchase =
        typeof query.cantidad === "number" &&
        Number.isInteger(query.cantidad) &&
        COUNTABLE_PURCHASE_UNITS.has(unitNorm) &&
        unit === "un" &&
        multiplier === 1;
      const areaPurchase =
        typeof query.cantidad === "number" &&
        query.cantidad > 0 &&
        isAreaQuantityUnit(query.unidad_cantidad);
      const coverageM2 = areaPurchase
        ? extractBoxCoverageM2(name, product.productName, unit, multiplier)
        : undefined;
      const boxesNeeded =
        areaPurchase && coverageM2 && query.cantidad
          ? Math.ceil(query.cantidad / coverageM2)
          : undefined;
      const quantityFields =
        coverageM2 && boxesNeeded
          ? {
              rendimiento_m2: coverageM2,
              precio_m2: Math.round(price / coverageM2),
              cajas_necesarias: boxesNeeded,
              total_solicitado: roundLine(boxesNeeded, price),
            }
          : countablePurchase && query.cantidad
            ? { total_solicitado: roundLine(query.cantidad, price) }
            : {};
      result.push({
        id: `${provider.cuenta}:${item.itemId}`,
        tienda: provider.nombre,
        nombre: name,
        marca: String(product.brand || "").slice(0, 100),
        vendedor:
          typeof seller.sellerName === "string"
            ? seller.sellerName.slice(0, 120)
            : undefined,
        precio: price,
        unidad: unit,
        multiplicador: multiplier,
        ean: barcode(item.ean),
        url,
        ...quantityFields,
      });
    }
  return result;
}

async function fetchCatalogTerm(
  provider: (typeof catalogProviders)[number],
  query: ConsultaMaterial,
  term: string,
  fetcher: typeof fetch,
) {
  // Estos catálogos rechazan espacios codificados como +; usar la codificación de la búsqueda pública.
  const params = `ft=${encodeURIComponent(term)}&_from=0&_to=19`;
  const graph = '{products(search:'+JSON.stringify(term)+',pageSize:20){items{name sku url_key stock_status price_range{minimum_price{final_price{value currency}}}}}}';
  const endpoint = provider.tipo === 'sodimac'
    ? `https://sodimac.falabella.com/sodimac-cl/search?Ntt=${encodeURIComponent(term)}`
    : provider.tipo === 'magento'
      ? `https://www.construmart.cl/graphql?query=${encodeURIComponent(graph)}`
      : provider.tipo === 'imperial'
        ? `https://www.imperial.cl/api/catalog_system/pub/products/search?${params}`
        : provider.tipo === 'shopify'
          ? `https://www.ferreteriaprat.cl/search/suggest.json?q=${encodeURIComponent(term)}&resources[type]=product&resources[limit]=12`
          : provider.tipo === 'woocommerce'
            ? `https://www.weitzler.cl/wp-json/wc/store/v1/products?search=${encodeURIComponent(term)}&per_page=15`
            : `https://${provider.cuenta}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?${params}`;
  const maxBytes = provider.tipo === 'sodimac' ? 4500000 : 1500000;
  const response = await fetcher(
    endpoint,
    {
      cache: "no-store",
      headers: {
        Accept: provider.tipo === 'sodimac' ? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" : "application/json",
        "User-Agent": "ObraTrack/1.0 (https://obratrack-cl.vercel.app)",
      },
      signal: AbortSignal.timeout(9000),
    },
  );
  if (!response.ok) throw Error("Catálogo no disponible");
  if (Number(response.headers.get("content-length")) > maxBytes)
    throw Error("Catálogo demasiado grande");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Catálogo vacío");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw Error("Catálogo demasiado grande");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const parsedProducts =
    provider.tipo === "sodimac"
      ? sodimacProducts(body)
      : provider.tipo === "magento"
        ? construmartProducts(body)
        : provider.tipo === "shopify"
          ? pratShopifyProducts(body)
          : provider.tipo === "woocommerce"
            ? weitzlerWooProducts(body)
            : JSON.parse(body);
  return parseCatalogProducts(parsedProducts, provider, query);
}

async function readCatalog(
  provider: (typeof catalogProviders)[number],
  query: ConsultaMaterial,
  fetcher: typeof fetch,
) {
  const cleanSpec = query.presentacion ? significantSpecTokens(query.presentacion).join(" ") : "";
  const searchProduct = cleanSearchProductTerm(query.producto);
  const term = [searchProduct, query.marca, query.modelo, cleanSpec].filter(Boolean).join(" ");
  let offers = await fetchCatalogTerm(provider, query, term, fetcher);
  if (offers.length > 0) return offers;
  if (cleanSpec) {
    const broadTerm = [searchProduct, query.marca, query.modelo].filter(Boolean).join(" ");
    if (broadTerm && broadTerm !== term) {
      offers = await fetchCatalogTerm(provider, query, broadTerm, fetcher).catch(() => offers);
      if (offers.length > 0) return offers;
    }
  }
  for (const synonym of synonymSearchTerms(searchProduct).slice(0, 1)) {
    const synTerm = [synonym, query.marca, query.modelo, cleanSpec].filter(Boolean).join(" ");
    if (!synTerm || synTerm === term) continue;
    offers = await fetchCatalogTerm(provider, query, synTerm, fetcher).catch(() => offers);
    if (offers.length > 0) return offers;
  }
  return offers;
}

function matchesRegionalScope(
  regiones: string[] | undefined,
  query: ConsultaMaterial,
): boolean {
  if (!regiones || regiones.length === 0) return true;
  const parts: string[] = [];
  if (query.ubicacion) {
    parts.push(query.ubicacion);
    const derivedRegion = findRegionForComuna(query.ubicacion.split(",")[0].trim());
    if (derivedRegion) parts.push(derivedRegion);
  }
  if (query.latitud != null && query.longitud != null) {
    const nearest = findNearestComuna(query.latitud, query.longitud);
    parts.push(nearest.comuna, nearest.region);
  }
  const locationFolded = normalize(parts.join(" "));
  if (!locationFolded) return false;
  return regiones.some((r) => locationFolded.includes(normalize(r)));
}

export async function compareMaterialPrices(
  input: ConsultaMaterial,
  fetcher: typeof fetch = serverFetch,
): Promise<ComparacionMateriales> {
  const query = validateMaterialQuery(input);
  const requested = query.tiendas?.length
    ? new Set(query.tiendas.map(normalize))
    : null;
  const selected = catalogProviders.filter((p) =>
    requested
      ? requested.has(normalize(p.nombre))
      : p.habilitado !== false && matchesRegionalScope(p.regiones, query),
  );
  const responses = await Promise.allSettled(
    selected.map((p) => readCatalog(p, query, fetcher)),
  );
  const providers: ComparacionMateriales["proveedores"] = selected.map(
    (p, i) => ({
      nombre: p.nombre,
      url: p.url,
      estado:
        responses[i].status === "fulfilled"
          ? (responses[i] as PromiseFulfilledResult<OfertaMaterial[]>).value
              .length
            ? "consultado"
            : "sin_resultados"
          : "no_disponible",
    }),
  );
  for (const name of query.tiendas || [])
    if (!catalogProviders.some((p) => normalize(p.nombre) === normalize(name)))
      providers.push({ nombre: name, url: "", estado: "no_disponible" });
  const all = responses.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );
  const effectivePrice = (o: OfertaMaterial) => o.total_solicitado ?? o.precio;
  const byId = Array.from(new Map(all.map((o) => [o.id, o])).values());
  const deduped = new Map<string, OfertaMaterial>();
  for (const o of byId) {
    const variantKey = `${o.tienda}:${normalize(o.nombre)}:${o.precio}`;
    if (!deduped.has(variantKey)) deduped.set(variantKey, o);
  }
  const sorted = Array.from(deduped.values()).sort(
    (a, b) => effectivePrice(a) - effectivePrice(b) || a.precio - b.precio,
  );
  const byStore = new Map<string, OfertaMaterial[]>();
  for (const o of sorted) {
    byStore.set(o.tienda, [...(byStore.get(o.tienda) || []), o]);
  }
  const storeBuckets = Array.from(byStore.values()).sort(
    (a, b) => effectivePrice(a[0]) - effectivePrice(b[0]),
  );
  const perStoreQuota = Math.min(
    3,
    Math.max(2, Math.floor(12 / Math.max(storeBuckets.length, 1))),
  );
  const chosen = new Map<string, OfertaMaterial>();
  for (const bucket of storeBuckets) {
    for (const o of bucket.slice(0, perStoreQuota)) {
      if (chosen.size < 12) chosen.set(o.id, o);
    }
  }
  for (const o of sorted) {
    if (chosen.size >= 12) break;
    if (!chosen.has(o.id)) chosen.set(o.id, o);
  }
  const offers = Array.from(chosen.values()).sort(
    (a, b) => effectivePrice(a) - effectivePrice(b) || a.precio - b.precio,
  );
  const groups = new Map<string, OfertaMaterial[]>();
  for (const o of offers)
    if (o.ean) {
      const key = `${o.ean}:${o.unidad}:${o.multiplicador}`;
      groups.set(key, [...(groups.get(key) || []), o]);
    }
  const best = Array.from(groups.values())
    .filter((rows) => new Set(rows.map((o) => o.tienda)).size > 1)
    .flatMap((rows) =>
      rows
        .filter((o) => o.precio === Math.min(...rows.map((v) => v.precio)))
        .map((o) => o.id),
    );
  const activeNames = (selected.length ? selected : catalogProviders.filter((p) => p.habilitado !== false))
    .map((p) => p.nombre)
    .join(", ");
  const summary = offers.length
    ? `Encontré ${offers.length === 1 ? "una opción" : offers.length + " opciones"} con precio publicado. ${best.length ? "Marco el menor precio del mismo producto identificado en más de una tienda." : offers.length === 1 ? "Revisa marca, modelo y presentación antes de comprar." : "Son opciones que debes revisar por marca, modelo y presentación; no todas son equivalentes."}`
    : providers.every((p) => p.estado === "no_disponible")
      ? `No pude consultar esos proveedores. La búsqueda integrada incluye ${activeNames}. Puedes reintentar o revisar directamente la tienda solicitada.`
      : "No encontré opciones disponibles que coincidan con esa descripción en los catálogos consultados.";
  return {
    consulta: query,
    consultado_en: new Date().toISOString(),
    resumen: summary,
    ofertas: offers,
    proveedores: providers,
    mejores_ids: best,
  };
}

const COUNTABLE_QUOTE_UNITS = new Set([
  "un", "unidad", "unidades", "saco", "sacos", "bolsa", "bolsas",
  "caja", "cajas", "tarro", "tarros", "lata", "latas", "balde", "baldes",
  "galon", "galones", "tineta", "tinetas", "rollo", "rollos",
  "plancha", "planchas", "paquete", "paquetes",
  "tira", "tiras", "barra", "barras", "tubo", "tubos", "palo", "palos",
]);

function splitMaterialCandidates(rawName: string): string[] {
  const cleaned = rawName
    .replace(/^(?:conjunto|kit|pack|juego|provisi[oó]n(?:es)?|material(?:es)?)\s+de\s+/i, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/\s*,\s*|\s+y\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3 && !/^(?:protecci[oó]n|accesorios?|insumos?|otros?|varios?)$/i.test(p));
  return parts.length > 1 ? parts.slice(0, 3) : [cleaned];
}

export interface BatchMaterialComparisonItem {
  label: string;
  comparison: ComparacionMateriales;
}

export async function compareQuoteMaterials(
  materials: Array<{ nombre?: string; cantidad?: number; unidad?: string }>,
  options: { ubicacion?: string; latitud?: number; longitud?: number; tiendas?: string[] } = {},
  fetcher: typeof fetch = serverFetch,
): Promise<BatchMaterialComparisonItem[]> {
  const queries: Array<{ label: string; input: ConsultaMaterial }> = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(materials) ? materials : []) {
    if (queries.length >= 10) break;
    const rawName = String(item?.nombre || "").trim();
    if (!rawName) continue;
    const candidates = splitMaterialCandidates(rawName);
    const unitNorm = normalize(String(item?.unidad || ""));
    const countable =
      COUNTABLE_QUOTE_UNITS.has(unitNorm) || isAreaQuantityUnit(item?.unidad);
    for (const candidate of candidates) {
      if (queries.length >= 10) break;
      const key = normalize(candidate);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      queries.push({
        label: candidate,
        input: {
          producto: candidate.slice(0, 120),
          ...(countable && typeof item?.cantidad === "number" && item.cantidad > 0 && candidates.length === 1
            ? { cantidad: item.cantidad, unidad_cantidad: String(item.unidad).trim() }
            : {}),
          ...(options.ubicacion && options.ubicacion !== "Por definir" ? { ubicacion: options.ubicacion } : {}),
          ...(typeof options.latitud === "number" && typeof options.longitud === "number"
            ? { latitud: options.latitud, longitud: options.longitud }
            : {}),
          ...(options.tiendas?.length ? { tiendas: options.tiendas } : {}),
        },
      });
    }
  }
  if (!queries.length) return [];
  const results = await Promise.allSettled(
    queries.map((q) => compareMaterialPrices(q.input, fetcher)),
  );
  return queries.map((q, index) => {
    const res = results[index];
    if (res.status === "fulfilled") return { label: q.label, comparison: res.value };
    return {
      label: q.label,
      comparison: {
        consulta: q.input,
        consultado_en: new Date().toISOString(),
        resumen: "No pude consultar ese material en las tiendas en este momento.",
        ofertas: [],
        proveedores: catalogProviders
          .filter((p) => p.habilitado !== false)
          .map((p) => ({ nombre: p.nombre, url: p.url, estado: "no_disponible" as const })),
        mejores_ids: [],
      },
    };
  });
}
