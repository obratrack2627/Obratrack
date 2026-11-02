import { serverFetch } from "@/lib/server-fetch";
import { AIError } from "@/lib/ai/errors";
import { roundLine } from "@/lib/ai/protocol";
import type {
  ComparacionMateriales,
  ConsultaMaterial,
  OfertaMaterial,
} from "./types";

// Cuentas públicas de catálogo identificadas en las propias tiendas. Sin claves ni sesiones de clientes.
export const catalogProviders = [
  { nombre: "Easy", cuenta: "easycl", url: "https://www.easy.cl" },
  { nombre: "Dimaco", cuenta: "dimacocl", url: "https://www.dimaco.cl" },
];
const normalize = (s: string) =>
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
      .slice(0, 5)
      .map((v: string) => v.trim().slice(0, 60));
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
      /(?<![\d/])(\d+(?:[.,]\d+)*)\s*(unidades?|sacos?|cajas?|bolsas?|piezas?|paquetes?|baldes?|tarros?|latas?|bidones?|rollos?|sets?)\b/gi,
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

function matchesSpecification(value: string, full: string) {
  const wanted = normalize(value);
  const words = new Set(full.split(" "));
  if (!wanted.split(" ").every((word) => words.has(word))) return false;
  // Una medida debe pertenecer a su unidad, aunque modelo y tamaño lleguen
  // juntos y la tienda los publique en otro orden (HP1630K 13mm / 13mm HP1630K).
  const measures = wanted.matchAll(
    /\b\d+(?:\.\d+)?\s+(?:kg|g|mm|cm|m|ml|l|w|kw|v|ah)\b/g,
  );
  return Array.from(measures).every(([measure]) =>
    ` ${full} `.includes(` ${measure} `),
  );
}

export function parseCatalogProducts(
  products: any,
  provider: (typeof catalogProviders)[number],
  query: ConsultaMaterial,
): OfertaMaterial[] {
  if (!Array.isArray(products)) throw Error("Catálogo no disponible");
  const tokens = normalize(query.producto)
    .split(" ")
    .filter(
      (t) =>
        t &&
        !["de", "del", "para", "el", "la", "los", "las", "un", "una"].includes(
          t,
        ),
    );
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
      if (
        !tokens.every((t) =>
          full
            .split(" ")
            .some(
              (w) =>
                w === t ||
                (t.length >= 4 &&
                  (w === t + "s" ||
                    w === t + "es" ||
                    t === w + "s" ||
                    t === w + "es")),
            ),
        )
      )
        continue;
      if (
        [query.marca, query.modelo, query.presentacion].some(
          (v) => v && !matchesSpecification(v, full),
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
        !(offer.AvailableQuantity > 0)
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
          !source.pathname.endsWith("/p")
        )
          continue;
      } catch {
        continue;
      }
      const url = provider.url + source.pathname;
      const price = Math.round(offer.Price);
      const unit = String(item.measurementUnit || "un").slice(0, 20);
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
        ...(query.cantidad &&
        Number.isInteger(query.cantidad) &&
        [
          "un",
          "unidad",
          "unidades",
          "saco",
          "sacos",
          "bolsa",
          "bolsas",
          "caja",
          "cajas",
          "pieza",
          "piezas",
          "paquete",
          "paquetes",
          "set",
          "sets",
          "balde",
          "baldes",
          "tarro",
          "tarros",
          "lata",
          "latas",
          "bidon",
          "bidones",
          "rollo",
          "rollos",
        ].includes(normalize(query.unidad_cantidad || "")) &&
        unit === "un" &&
        multiplier === 1
          ? { total_solicitado: roundLine(query.cantidad, price) }
          : {}),
      });
    }
  return result;
}

async function readCatalog(
  provider: (typeof catalogProviders)[number],
  query: ConsultaMaterial,
  fetcher: typeof fetch,
) {
  const term = [query.producto, query.marca, query.modelo, query.presentacion]
    .filter(Boolean)
    .join(" ");
  // Estos catálogos rechazan espacios codificados como +; usar la codificación de la búsqueda pública.
  const params = `ft=${encodeURIComponent(term)}&_from=0&_to=19`;
  const response = await fetcher(
    `https://${provider.cuenta}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?${params}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "ObraTrack/1.0 (https://obratrack-5zwn.vercel.app)",
      },
      signal: AbortSignal.timeout(9000),
    },
  );
  if (!response.ok) throw Error("Catálogo no disponible");
  if (Number(response.headers.get("content-length")) > 1500000)
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
      if (length > 1500000) throw Error("Catálogo demasiado grande");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return parseCatalogProducts(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
    provider,
    query,
  );
}

export async function compareMaterialPrices(
  input: ConsultaMaterial,
  fetcher: typeof fetch = serverFetch,
): Promise<ComparacionMateriales> {
  const query = validateMaterialQuery(input);
  const requested = query.tiendas?.length
    ? new Set(query.tiendas.map(normalize))
    : null;
  const selected = catalogProviders.filter(
    (p) => !requested || requested.has(normalize(p.nombre)),
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
  const offers = Array.from(new Map(all.map((o) => [o.id, o])).values())
    .sort((a, b) => a.precio - b.precio)
    .slice(0, 12);
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
  const summary = offers.length
    ? `Encontré ${offers.length === 1 ? "una opción" : offers.length + " opciones"} con precio publicado. ${best.length ? "Marco el menor precio del mismo producto identificado en más de una tienda." : offers.length === 1 ? "Revisa marca, modelo y presentación antes de comprar." : "Son opciones que debes revisar por marca, modelo y presentación; no todas son equivalentes."}`
    : providers.every((p) => p.estado === "no_disponible")
      ? "No pude consultar esos proveedores. Actualmente la búsqueda integrada consulta Easy y Dimaco. Puedes reintentar o revisar directamente la tienda solicitada."
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
