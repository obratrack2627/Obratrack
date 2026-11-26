require("./helpers/typescript.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  catalogProviders,
  compareMaterialPrices,
} = require("../lib/materials/catalog.ts");
const { pratShopifyProducts, weitzlerWooProducts } = require("../lib/materials/retail.ts");
const {
  attachNearbyToComparison,
  buildWhatsAppQuoteLink,
  findNearbyHardwareStores,
  resolveMaterialCoordinates,
} = require("../lib/materials/nearby.ts");
const { findHistoricalMaterialPrices } = require("../lib/materials/history.ts");
const { compareMaterialPricesEnriched } = require("../lib/materials/enriched.ts");
const { formatMaterialComparison } = require("../lib/materials/format.ts");
const { materialComparisonWhatsApp } = require("../lib/whatsapp/format.ts");
const { isMaterialComparison, safeOfferURL } = require("../lib/materials/types.ts");

test("soporta Chilemat, Ferretería Prat y Weitzler con activación regional automática", async () => {
  const pratParsed = pratShopifyProducts(
    JSON.stringify({
      resources: {
        results: {
          products: [
            {
              id: 901,
              title: "Cemento Especial CBB 25 Kg",
              vendor: "CBB",
              price: "6990.00",
              available: true,
              url: "/products/cemento-especial-cbb-25-kg?_pos=1&_psq=cemento",
            },
          ],
        },
      },
    }),
  );
  assert.equal(pratParsed.length, 1);
  assert.equal(
    pratParsed[0].link,
    "https://www.ferreteriaprat.cl/products/cemento-especial-cbb-25-kg",
  );
  assert.ok(safeOfferURL(pratParsed[0].link));

  const weitzlerParsed = weitzlerWooProducts(
    JSON.stringify([
      {
        id: 42,
        name: "Volcanita ST 10 mm &#8211; 1.2x2.4 m",
        permalink: "https://www.weitzler.cl/producto/volcanita-st-10-mm/?utm=1",
        is_in_stock: true,
        prices: { price: "7490", currency_code: "CLP", currency_minor_unit: 0 },
      },
    ]),
  );
  assert.equal(weitzlerParsed.length, 1);
  assert.equal(
    weitzlerParsed[0].link,
    "https://www.weitzler.cl/producto/volcanita-st-10-mm/",
  );
  assert.ok(safeOfferURL(weitzlerParsed[0].link));
  assert.ok(safeOfferURL("https://www.chilemat.cl/cemento-25-kg/p"));

  const hostsAntofagasta = [];
  const resNorth = await compareMaterialPrices(
    { producto: "cemento 25 kg", ubicacion: "Antofagasta", cantidad: 4, unidad_cantidad: "sacos" },
    async (url) => {
      hostsAntofagasta.push(new URL(url).hostname);
      if (url.includes("ferreteriaprat.cl")) {
        return new Response(
          JSON.stringify({
            resources: {
              results: {
                products: [
                  {
                    id: 11,
                    title: "Cemento Especial 25 Kg",
                    vendor: "CBB",
                    price: "6500",
                    available: true,
                    url: "/products/cemento-especial-25-kg",
                  },
                ],
              },
            },
          }),
        );
      }
      if (url.includes("chilemat.vtex")) {
        return new Response(
          JSON.stringify([
            {
              productName: "Cemento Melón 25 kg",
              brand: "Melón",
              link: "https://www.chilemat.cl/cemento-melon-25-kg/p",
              items: [
                {
                  itemId: "ch1",
                  nameComplete: "Cemento Melón 25 kg",
                  measurementUnit: "un",
                  unitMultiplier: 1,
                  sellers: [
                    {
                      sellerDefault: true,
                      sellerName: "Chilemat",
                      commertialOffer: { Price: 5290, AvailableQuantity: 5 },
                    },
                  ],
                },
              ],
            },
          ]),
        );
      }
      return new Response("[]");
    },
  );
  assert.ok(hostsAntofagasta.some((h) => h.includes("ferreteriaprat.cl")));
  assert.ok(!hostsAntofagasta.some((h) => h.includes("weitzler.cl")));
  assert.ok(resNorth.ofertas.some((o) => o.tienda === "Ferretería Prat"));
  assert.ok(resNorth.ofertas.some((o) => o.tienda === "Chilemat"));

  const hostsSouth = [];
  await compareMaterialPrices(
    { producto: "volcanita 10 mm", ubicacion: "Puerto Montt" },
    async (url) => {
      hostsSouth.push(new URL(url).hostname);
      return new Response("[]");
    },
  );
  assert.ok(hostsSouth.some((h) => h.includes("weitzler.cl")));
  assert.ok(!hostsSouth.some((h) => h.includes("ferreteriaprat.cl")));
});

test("encuentra ferreterías cercanas por Google Places o Nominatim, filtra falsos positivos y cruza distancias", async () => {
  const fromComuna = resolveMaterialCoordinates({ ubicacion: "La Florida, Región Metropolitana" });
  assert.equal(fromComuna?.comuna, "La Florida");
  assert.equal(resolveMaterialCoordinates({ ubicacion: "Por definir" }), null);

  const waUrl = buildWhatsAppQuoteLink("+56 9 8765 4321", { producto: "cemento 25 kg", cantidad: 15, unidad_cantidad: "sacos" }, "La Florida");
  assert.ok(waUrl?.startsWith("https://wa.me/56987654321?text="));

  const googleNearby = await findNearbyHardwareStores(
    { producto: "cemento 25 kg", latitud: -33.5228, longitud: -70.5983, radio_km: 6 },
    async (url) => {
      assert.ok(url.includes("maps.googleapis.com"));
      return new Response(
        JSON.stringify({
          results: [
            {
              name: "Homecenter Sodimac La Florida",
              vicinity: "Av. Vicuña Mackenna 7110",
              geometry: { location: { lat: -33.5195, lng: -70.5941 } },
            },
            {
              name: "Ferretería Bicicletas Sur",
              vicinity: "Av. La Florida 100",
              geometry: { location: { lat: -33.5200, lng: -70.5950 } },
            },
            {
              name: "Construmart La Florida",
              vicinity: "Av. Américo Vespucio 6500",
              geometry: { location: { lat: -33.528, lng: -70.602 } },
            },
          ],
        }),
      );
    },
    { googleApiKey: "fake-key", bypassCache: true },
  );
  assert.equal(googleNearby.length, 2);
  assert.equal(googleNearby[0].cadena_integrada, "Sodimac");
  assert.ok(googleNearby[0].distancia_km < 1);
  assert.ok(googleNearby[1].url_busqueda?.includes("construmart.cl"));

  const nominatimNearby = await findNearbyHardwareStores(
    { producto: "cemento 25 kg", ubicacion: "La Florida", radio_km: 8 },
    async (url) => {
      if (url.includes("sodimac")) {
        return new Response(
          JSON.stringify([
            {
              name: "Sodimac Homecenter",
              lat: "-33.5195",
              lon: "-70.5941",
              address: { road: "Av. Vicuña Mackenna", suburb: "La Florida" },
              extratags: {},
            },
          ]),
        );
      }
      return new Response(
        JSON.stringify([
          {
            name: "Ferretería El Maestro",
            lat: "-33.5250",
            lon: "-70.5990",
            address: { road: "Av. La Florida", house_number: "9100", suburb: "La Florida" },
            extratags: { phone: "+56 9 7123 4567" },
          },
          {
            name: "Ferretería Punta Arenas Lejana",
            lat: "-53.1638",
            lon: "-70.9171",
            address: {},
            extratags: {},
          },
        ]),
      );
    },
    { googleApiKey: "", bypassCache: true },
  );
  assert.equal(nominatimNearby.length, 2);
  const local = nominatimNearby.find((f) => f.tipo === "local");
  assert.equal(local?.nombre, "Ferretería El Maestro");
  assert.ok(local?.url_whatsapp?.includes("wa.me/56971234567"));

  const baseComp = {
    consulta: { producto: "cemento 25 kg", ubicacion: "La Florida" },
    consultado_en: new Date().toISOString(),
    resumen: "Prueba",
    ofertas: [
      {
        id: "sodimac:1",
        tienda: "Sodimac",
        nombre: "Cemento Especial 25 kg",
        marca: "Melón",
        precio: 4990,
        unidad: "un",
        multiplicador: 1,
        url: "https://www.sodimac.cl/sodimac-cl/articulo/123/cemento-25-kg",
      },
    ],
    proveedores: [{ nombre: "Sodimac", estado: "consultado", url: "https://www.sodimac.cl" }],
    mejores_ids: [],
  };
  const withDistance = attachNearbyToComparison(baseComp, nominatimNearby);
  assert.ok(withDistance.ofertas[0].sucursal_cercana_km != null);
  assert.ok(isMaterialComparison(withDistance));
});

test("encuentra historial propio priorizando comprado/comuna/recencia y formatea web/WhatsApp", async () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const projects = [
    { id: "p1", nombre: "Casa La Florida", comuna: "La Florida", region: "Región Metropolitana de Santiago" },
    { id: "p2", nombre: "Bodega Maipú", comuna: "Maipú", region: "Región Metropolitana de Santiago" },
  ];
  const materials = [
    {
      proyecto_id: "p2",
      nombre: "Yeso Cartón ST 10 mm",
      cantidad: 20,
      unidad: "planchas",
      precio_unitario: 7400,
      proveedor: "Barraca Poniente",
      comprado: false,
      created_at: "2026-11-01T12:00:00Z",
    },
    {
      proyecto_id: "p1",
      nombre: "Plancha Yeso Cartón ST 10 mm",
      cantidad: 15,
      unidad: "planchas",
      precio_unitario: 6850,
      proveedor: "Ferretería San Jorge",
      comprado: true,
      created_at: "2026-11-20T12:00:00Z",
    },
  ];
  const history = findHistoricalMaterialPrices(
    { producto: "plancha volcanita 10 mm", cantidad: 10, unidad_cantidad: "planchas", ubicacion: "La Florida" },
    materials,
    projects,
    { comuna: "La Florida", region: "Región Metropolitana de Santiago", now },
  );
  assert.equal(history.length, 2);
  assert.equal(history[0].proveedor, "Ferretería San Jorge");
  assert.equal(history[0].dias_desde_compra, 6);
  assert.equal(history[0].total_estimado, 68500);

  const enriched = await compareMaterialPricesEnriched(
    {
      producto: "volcanita 10 mm",
      cantidad: 10,
      unidad_cantidad: "planchas",
      ubicacion: "La Florida",
      tiendas: ["Easy"],
    },
    {
      materials,
      projects,
      comuna: "La Florida",
      fetcher: async (url) => {
        if (url.includes("nominatim")) throw new Error("map timeout");
        const p = catalogProviders[0];
        return new Response(
          JSON.stringify([
            {
              productName: "Plancha Volcanita ST 10 mm",
              brand: "Volcan",
              link: `https://${p.cuenta}.vtexcommercestable.com.br/volcanita-10-mm/p`,
              items: [
                {
                  itemId: "v10",
                  nameComplete: "Plancha Volcanita ST 10 mm",
                  measurementUnit: "un",
                  unitMultiplier: 1,
                  sellers: [
                    {
                      sellerDefault: true,
                      sellerName: p.nombre,
                      commertialOffer: { Price: 7190, AvailableQuantity: 10 },
                    },
                  ],
                },
              ],
            },
          ]),
        );
      },
    },
  );
  assert.equal(enriched.ofertas.length, 1);
  assert.equal(enriched.historial_empresa?.length, 2);
  assert.ok(isMaterialComparison(enriched));

  const webText = formatMaterialComparison(enriched);
  assert.match(webText, /Tus compras anteriores en ObraTrack:/);
  assert.match(webText, /Ferretería San Jorge/);

  const waText = materialComparisonWhatsApp(enriched);
  assert.match(waText, /\*TUS COMPRAS ANTERIORES\*/);
  assert.match(waText, /Ferretería San Jorge/);
});
