require("./helpers/typescript.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  compareMaterialPrices,
  parseCatalogProducts,
  catalogProviders,
  validateMaterialQuery,
} = require("../lib/materials/catalog.ts");
const {
  isMaterialComparison,
  safeOfferURL,
} = require("../lib/materials/types.ts");
const { normalizeQuote } = require("../lib/ai/protocol.ts");
const product = (provider, changes = {}) => ({
  productName: "Taladro percutor 13mm HP1630K Makita",
  brand: "Makita",
  link: `https://${provider.cuenta}.vtexcommercestable.com.br/taladro-hp1630k/p`,
  items: [
    {
      itemId: "sku1",
      nameComplete: "Taladro percutor 13mm HP1630K Makita",
      ean: "088381093125",
      measurementUnit: "un",
      unitMultiplier: 1,
      sellers: [
        {
          sellerDefault: true,
          sellerName: provider.nombre,
          commertialOffer: {
            Price: changes.price || 100000,
            AvailableQuantity: 10,
            ...changes.offer,
          },
        },
      ],
      ...changes.item,
    },
  ],
  ...changes.product,
});

test("consulta precios publicados en ambos catálogos y calcula las cantidades sin inventar importes", async () => {
  const result = await compareMaterialPrices(
    {
      producto: "taladro percutor",
      marca: "Makita",
      modelo: "HP1630K",
      cantidad: 3,
      unidad_cantidad: "unidad",
    },
    async (url) => {
      const p = url.includes("easycl.")
        ? catalogProviders[0]
        : catalogProviders[1];
      return new Response(
        JSON.stringify([
          product(p, { price: p.nombre === "Easy" ? 100000 : 90000 }),
        ]),
      );
    },
  );
  assert.equal(result.ofertas.length, 2);
  assert.equal(result.ofertas[0].tienda, "Dimaco");
  assert.equal(result.ofertas[0].total_solicitado, 270000);
  assert.equal(result.mejores_ids.length, 1);
  assert.equal(
    result.ofertas[0].url,
    "https://www.dimaco.cl/taladro-hp1630k/p",
  );
  assert.ok(isMaterialComparison(result));
});
test("no declara equivalentes dos modelos o presentaciones diferentes", async () => {
  const result = await compareMaterialPrices(
    { producto: "taladro percutor" },
    async (url) => {
      const p = url.includes("easycl.")
        ? catalogProviders[0]
        : catalogProviders[1];
      return new Response(
        JSON.stringify([
          product(p, {
            item: {
              ean: p.nombre === "Easy" ? "088381093125" : "4006825616712",
            },
          }),
        ]),
      );
    },
  );
  assert.equal(result.ofertas.length, 2);
  assert.deepEqual(result.mejores_ids, []);
  assert.match(result.resumen, /no todas son equivalentes/);
});
test("filtra una marca o presentación incorrecta, ofertas sin precio, falta de disponibilidad y URLs ajenas", () => {
  const p = catalogProviders[0];
  const q = { producto: "taladro", marca: "Makita", presentacion: "13 mm" };
  assert.equal(parseCatalogProducts([product(p)], p, q).length, 1);
  assert.equal(
    parseCatalogProducts(
      [
        product(p, {
          product: { brand: "Otra", productName: "Taladro Bosch" },
          item: { nameComplete: "Taladro Bosch" },
        }),
      ],
      p,
      q,
    ).length,
    0,
  );
  assert.equal(
    parseCatalogProducts(
      [
        product(p, { offer: { Price: 0 } }),
        product(p, { offer: { AvailableQuantity: 0 } }),
        product(p, { product: { link: "https://other.test/p" } }),
      ],
      p,
      q,
    ).length,
    0,
  );
  assert.equal(safeOfferURL("javascript:alert(1)"), undefined);
  assert.equal(safeOfferURL("https://www.easy.cl@evil.test/p"), undefined);
});
test("encuentra el modelo y tamaño aunque el extractor los agrupe y el catálogo cambie su orden", () => {
  const p = catalogProviders[1];
  const query = { producto: "taladro percutor", marca: "Makita", modelo: "HP1630K 13mm" };
  assert.equal(parseCatalogProducts([product(p)], p, query).length, 1);
  assert.equal(parseCatalogProducts([product(p)], p, { ...query, modelo: "HP1630K 10mm" }).length, 0);
  const mixedMeasures = product(p, {
    product: { productName: "Taladro 13cm 20mm HP1630K Makita" },
    item: { nameComplete: "Taladro 13cm 20mm HP1630K Makita" },
  });
  assert.equal(parseCatalogProducts([mixedMeasures], p, { producto: "taladro", presentacion: "13mm" }).length, 0);
});
test("si falla una tienda conserva la fuente disponible y si fallan ambas no fabrica precios", async () => {
  const partial = await compareMaterialPrices(
    { producto: "taladro" },
    async (url) =>
      url.includes("easycl.")
        ? new Response(JSON.stringify([product(catalogProviders[0])]))
        : new Response("denied", { status: 403 }),
  );
  assert.equal(partial.ofertas.length, 1);
  assert.equal(partial.proveedores[1].estado, "no_disponible");
  const failed = await compareMaterialPrices(
    { producto: "taladro" },
    async () => {
      throw Error("timeout");
    },
  );
  assert.equal(failed.ofertas.length, 0);
  assert.match(failed.resumen, /No pude consultar/);
});
test("una tienda no integrada se informa sin sustituirla silenciosamente por otra", async () => {
  let called = 0;
  const result = await compareMaterialPrices(
    { producto: "cemento", tiendas: ["Sodimac"] },
    async () => {
      called++;
      throw Error("No debe llamar");
    },
  );
  assert.equal(called, 0);
  assert.equal(result.proveedores[0].nombre, "Sodimac");
  assert.equal(result.proveedores[0].estado, "no_disponible");
});
test("no multiplica un precio de catálogo ambiguo por metros o cajas y rechaza cantidades inválidas", async () => {
  const result = await compareMaterialPrices(
    { producto: "taladro", cantidad: 2 },
    async (url) =>
      new Response(
        JSON.stringify([
          product(
            url.includes("easycl.") ? catalogProviders[0] : catalogProviders[1],
            { item: { measurementUnit: "m2", unitMultiplier: 1.44 } },
          ),
        ]),
      ),
  );
  assert.ok(result.ofertas.every((o) => o.total_solicitado === undefined));
  assert.throws(
    () => validateMaterialQuery({ producto: "cemento", cantidad: -2 }),
    /cantidad/,
  );
});
test("el margen sobre venta se calcula sobre el neto y difiere del recargo sobre costos", () => {
  const raw = {
    titulo_proyecto: "APU",
    materiales: [
      { nombre: "Material", cantidad: 1, precio_unitario_estimado: 100000 },
    ],
    mano_de_obra: [],
    estructura_financiera: {
      gastos_generales_porcentaje: 0,
      imprevistos_porcentaje: 0,
      margen_utilidad_porcentaje: 25,
    },
  };
  const cost = normalizeQuote(raw);
  const sale = normalizeQuote({
    ...raw,
    estructura_financiera: {
      ...raw.estructura_financiera,
      tipo_utilidad: "margen_venta",
    },
  });
  assert.equal(cost.estructura_financiera.precio_sugerido_neto, 125000);
  assert.equal(sale.estructura_financiera.precio_sugerido_neto, 133333);
  assert.equal(sale.estructura_financiera.margen_utilidad_monto, 33333);
  assert.equal(sale.estructura_financiera.precio_total_con_iva, 158666);
  assert.throws(
    () =>
      normalizeQuote({
        ...raw,
        estructura_financiera: {
          ...raw.estructura_financiera,
          tipo_utilidad: "margen_venta",
          margen_utilidad_porcentaje: 100,
        },
      }),
    /menor al 100/,
  );
});

test("la masa solicitada no se convierte en cien sacos ni se multiplica como unidades", async () => {
  const result = await compareMaterialPrices(
    { producto: "taladro", cantidad: 100, unidad_cantidad: "kg" },
    async (url) =>
      new Response(
        JSON.stringify([
          product(
            url.includes("easycl.") ? catalogProviders[0] : catalogProviders[1],
          ),
        ]),
      ),
  );
  assert.ok(result.ofertas.every((o) => o.total_solicitado === undefined));
  assert.throws(
    () => validateMaterialQuery({ producto: "cemento correo@example.test" }),
    /sin teléfonos/,
  );
});

test("completa la unidad de compra explícita sin confundir el contenido de una caja con la cantidad pedida", () => {
  const { completePurchaseQuantity } = require("../lib/materials/catalog.ts");
  assert.equal(
    completePurchaseQuantity(
      { producto: "taladro", cantidad: 3 },
      "Busca 3 unidades de taladro",
    ).unidad_cantidad,
    "unidades",
  );
  assert.equal(
    completePurchaseQuantity(
      { producto: "tornillo" },
      "Busca una caja de 100 unidades",
    ).cantidad,
    undefined,
  );
  assert.equal(
    completePurchaseQuantity(
      { producto: "tornillo", cantidad: 100 },
      "Busca una caja de 100 unidades",
    ).unidad_cantidad,
    undefined,
  );
});

test("un costo informado con IVA incluido se normaliza una sola vez antes de añadir el IVA de venta", () => {
  const raw = {
    titulo_proyecto: "Costo con IVA",
    materiales: [
      {
        nombre: "Material",
        cantidad: 2,
        precio_unitario_estimado: 119000,
        precio_incluye_iva: true,
      },
    ],
    mano_de_obra: [],
    estructura_financiera: {
      gastos_generales_porcentaje: 0,
      imprevistos_porcentaje: 0,
      margen_utilidad_porcentaje: 0,
    },
  };
  const q = normalizeQuote(raw);
  assert.equal(q.materiales[0].precio_unitario_estimado, 100000);
  assert.equal(q.materiales[0].precio_original_con_iva, 119000);
  assert.equal(q.estructura_financiera.precio_total_con_iva, 238000);
  assert.equal(
    normalizeQuote(q).estructura_financiera.precio_total_con_iva,
    238000,
  );
});

test("la consulta usa la codificación que aceptan los catálogos públicos, sin perder las especificaciones", async () => {
  const result = await compareMaterialPrices(
    { producto: "taladro percutor" },
    async (url) => {
      if (new URL(url).search.includes("+"))
        return new Response("Bad Request! Scripts are not allowed!", {
          status: 400,
        });
      assert.equal(new URL(url).searchParams.get("ft"), "taladro percutor");
      const p = url.includes("easycl.")
        ? catalogProviders[0]
        : catalogProviders[1];
      return new Response(JSON.stringify([product(p)]));
    },
  );
  assert.equal(result.ofertas.length, 2);
});
