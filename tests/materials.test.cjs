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
    { producto: "cemento", tiendas: ["MTS"] },
    async () => {
      called++;
      throw Error("No debe llamar");
    },
  );
  assert.equal(called, 0);
  assert.equal(result.proveedores[0].nombre, "MTS");
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

test('Sodimac utiliza el precio público y excluye vendedores externos y promociones de tarjeta', async () => {
  const { sodimacProducts } = require('../lib/materials/retail.ts');
  const catalog = { props: { pageProps: { results: [
    { displayName:'Cemento especial 25 kg.', brand:'BIOBIO', skuId:'sku-real', url:'https://www.sodimac.cl/sodimac-cl/articulo/123/cemento-especial-25-kg', sellerId:'SODIMAC_CHILE', prices:[{type:'cmrPrice',price:['1.000'],crossed:false},{type:'internetPrice',price:['4.990'],crossed:false}] },
    { displayName:'Cemento',sellerId:'MARKETPLACE_OTHER',prices:[{type:'internetPrice',price:['500']}]} ] } } };
  const html = '<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(catalog)+'</script>';
  const p = catalogProviders.find((v) => v.nombre === 'Sodimac');
  const offers = parseCatalogProducts(sodimacProducts(html), p, { producto:'cemento',marca:'Bío Bío',presentacion:'25kg',cantidad:3,unidad_cantidad:'sacos' });
  assert.equal(offers.length,1); assert.equal(offers[0].precio,4990); assert.equal(offers[0].total_solicitado,14970);
  assert.ok(safeOfferURL(offers[0].url));
  assert.equal(safeOfferURL('https://www.sodimac.cl/redirect?url=https://evil.test'),undefined);
});
test('buscar cemento no mezcla jabón ni tapas color cemento con el material de construcción', () => {
  const p=catalogProviders[0];
  const rows=['Tapa ciega cemento','Dispensador de jabón cemento','Cemento especial 25kg'].map((name)=>product(p,{product:{productName:name},item:{nameComplete:name}}));
  const offers=parseCatalogProducts(rows,p,{producto:'cemento'});
  assert.equal(offers.length,1); assert.equal(offers[0].nombre,'Cemento especial 25kg');
});

test('buscar látex blanco descarta globos/guantes y compareQuoteMaterials consulta los materiales de la cotización', async () => {
  const { compareQuoteMaterials } = require('../lib/materials/catalog.ts');
  const { materialBatchComparisonWhatsApp } = require('../lib/whatsapp/format.ts');
  const p = catalogProviders[0];
  const rows = [
    product(p, { product: { productName: 'Globos De Látex Blanco Mate' }, item: { itemId: 'globo', nameComplete: 'Globos De Látex Blanco Mate' } }),
    product(p, { product: { productName: 'Pintura Látex Blanco Interior' }, item: { itemId: 'pintura', nameComplete: 'Pintura Látex Blanco Interior' } }),
  ];
  const filtered = parseCatalogProducts(rows, p, { producto: 'látex blanco' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, `${p.cuenta}:pintura`);

  const batch = await compareQuoteMaterials(
    [
      { nombre: 'Látex blanco', cantidad: 30, unidad: 'm2' },
      { nombre: 'Conjunto de lija y cinta', cantidad: 1, unidad: 'gl' },
    ],
    { ubicacion: 'La Florida', tiendas: ['Easy'] },
    async (url) => {
      const ft = (new URL(url).searchParams.get('ft') || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const name = ft.includes('latex')
        ? 'Pintura Látex Blanco Galón'
        : ft.includes('lija')
          ? 'Lija al agua Grano 120'
          : 'Cinta Enmascarar 24mm';
      return new Response(JSON.stringify([product(p, { product: { productName: name }, item: { itemId: ft, nameComplete: name } })]));
    },
  );
  assert.equal(batch.length, 3);
  const waText = materialBatchComparisonWhatsApp(batch, 'La Florida');
  assert.match(waText, /Pintura Látex Blanco Galón/);
  assert.match(waText, /Lija al agua Grano 120/);
  assert.match(waText, /Cinta Enmascarar 24mm/);
  assert.match(waText, /La Florida/);
});

test('omite Construmart e Imperial por defecto, pero permite consultarlos explícitamente', async () => {
  const calledHosts = [];
  const defaultRes = await compareMaterialPrices(
    { producto: 'cemento' },
    async (url) => {
      calledHosts.push(new URL(url).hostname);
      return new Response('[]');
    },
  );
  assert.equal(defaultRes.proveedores.length, 3);
  assert.deepEqual(
    defaultRes.proveedores.map((p) => p.nombre),
    ['Easy', 'Dimaco', 'Sodimac'],
  );
  assert.ok(!calledHosts.some((h) => h.includes('construmart') || h.includes('imperial')));

  const explicitRes = await compareMaterialPrices(
    { producto: 'cemento', tiendas: ['Imperial'] },
    async (url) => {
      calledHosts.push(new URL(url).hostname);
      return new Response('[]');
    },
  );
  assert.equal(explicitRes.proveedores[0].nombre, 'Imperial');
  assert.ok(calledHosts.some((h) => h.includes('imperial')));
});

test('normaliza jerga ferretera chilena, sinónimos y unidades contables como planchas y galones', async () => {
  const { completePurchaseQuantity } = require('../lib/materials/catalog.ts');
  assert.equal(
    completePurchaseQuantity({ producto: 'volcanita 10 mm', cantidad: 12 }, 'Cotiza 12 planchas de volcanita 10 mm').unidad_cantidad,
    'planchas',
  );
  assert.equal(
    completePurchaseQuantity({ producto: 'latex blanco', cantidad: 3 }, 'Necesito 3 galones de latex blanco').unidad_cantidad,
    'galones',
  );

  const fetchedTerms = [];
  const res = await compareMaterialPrices(
    { producto: 'plancha volcanita 10 mm', cantidad: 12, unidad_cantidad: 'planchas', tiendas: ['Easy', 'Dimaco'] },
    async (url) => {
      const ft = new URL(url).searchParams.get('ft') || '';
      fetchedTerms.push(ft);
      const isEasy = url.includes('easycl.');
      if (isEasy && !ft.includes('yeso carton')) {
        return new Response('[]');
      }
      const p = isEasy ? catalogProviders[0] : catalogProviders[1];
      const title = isEasy ? 'Yeso Cartón ST 10 mm 1.2x2.4 m' : 'Volcanita ST 10 mm';
      return new Response(
        JSON.stringify([
          ...(isEasy
            ? []
            : [
                product(p, {
                  price: 660,
                  product: { productName: 'Tarugo volcanita 10mm bolsa 5 unidades', brand: 'Imporper' },
                  item: { itemId: 'tarugo-bad', nameComplete: 'Tarugo volcanita 10mm bolsa 5 unidades' },
                }),
              ]),
          product(p, {
            price: isEasy ? 6990 : 7290,
            product: { productName: title, brand: 'Volcan' },
            item: { itemId: isEasy ? 'e1' : 'd1', nameComplete: title },
          }),
        ]),
      );
    },
  );
  assert.ok(fetchedTerms.some((t) => t === 'volcanita 10 mm'));
  assert.ok(fetchedTerms.some((t) => t === 'yeso carton 10 mm'));
  assert.equal(res.ofertas.length, 2);
  assert.equal(res.ofertas[0].total_solicitado, 83880);
  assert.equal(res.ofertas[1].total_solicitado, 87480);

  const adhesivoOffers = parseCatalogProducts(
    [
      product(catalogProviders[0], {
        price: 5990,
        product: { productName: 'Adhesivo Cerámico Polvo 25 kg' },
        item: { itemId: 'adh1', nameComplete: 'Adhesivo Cerámico Polvo 25 kg' },
      }),
    ],
    catalogProviders[0],
    { producto: 'pegamento ceramico 25 kg', cantidad: 4, unidad_cantidad: 'sacos' },
  );
  assert.equal(adhesivoOffers.length, 1);
  assert.equal(adhesivoOffers[0].total_solicitado, 23960);
});

test('calcula cajas necesarias y precio por m2 cuando se solicita en metros cuadrados', async () => {
  const { formatMaterialComparison } = require('../lib/materials/format.ts');
  const pEasy = catalogProviders[0];
  const pDimaco = catalogProviders[1];
  const res = await compareMaterialPrices(
    { producto: 'porcelanato 60x60', cantidad: 16, unidad_cantidad: 'm2', tiendas: ['Easy', 'Dimaco'] },
    async (url) => {
      const isEasy = url.includes('easycl.');
      const p = isEasy ? pEasy : pDimaco;
      const title = isEasy
        ? 'Porcelanato 60x60 cm Beige Caja 1,44 m2'
        : 'Gres Porcelanato 60x60 Urbanity Gris Mate 1.44m² Klipen';
      return new Response(
        JSON.stringify([
          product(p, {
            price: isEasy ? 14400 : 17280,
            product: { productName: title },
            item: { itemId: isEasy ? 'por-e' : 'por-d', nameComplete: title },
          }),
        ]),
      );
    },
  );
  assert.equal(res.ofertas.length, 2);
  assert.equal(res.ofertas[0].rendimiento_m2, 1.44);
  assert.equal(res.ofertas[0].cajas_necesarias, 12);
  assert.equal(res.ofertas[0].precio_m2, 10000);
  assert.equal(res.ofertas[0].total_solicitado, 172800);
  assert.ok(isMaterialComparison(res));

  const formatted = formatMaterialComparison(res);
  assert.match(formatted, /Comparativa por tienda:/);
  assert.match(formatted, /Ahorro estimado de \$34\.560 CLP/);
  assert.match(formatted, /12 cajas de 1,44 m²/);
});

test('deduplica variantes idénticas, balancea tiendas en top 12 y soporta hasta 10 materiales con resumen de carro', async () => {
  const { compareQuoteMaterials } = require('../lib/materials/catalog.ts');
  const { formatBatchMaterialComparison } = require('../lib/materials/format.ts');
  const { materialBatchComparisonWhatsApp } = require('../lib/whatsapp/format.ts');

  const pEasy = catalogProviders[0];
  const pDimaco = catalogProviders[1];
  const easyItems = Array.from({ length: 10 }, (_, idx) =>
    product(pEasy, {
      price: 5000 + (idx < 2 ? 0 : idx * 100),
      product: { productName: idx < 2 ? 'Cemento Especial 25 kg' : `Cemento Obra ${idx} 25 kg` },
      item: { itemId: `e-${idx}`, nameComplete: idx < 2 ? 'Cemento Especial 25 kg' : `Cemento Obra ${idx} 25 kg` },
    }),
  );
  const dimacoItems = [
    product(pDimaco, {
      price: 5800,
      product: { productName: 'Cemento Polpaico 25 kg' },
      item: { itemId: 'd-0', nameComplete: 'Cemento Polpaico 25 kg' },
    }),
    product(pDimaco, {
      price: 5900,
      product: { productName: 'Cemento Melón 25 kg' },
      item: { itemId: 'd-1', nameComplete: 'Cemento Melón 25 kg' },
    }),
  ];
  const balanced = await compareMaterialPrices(
    { producto: 'cemento 25 kg', tiendas: ['Easy', 'Dimaco'] },
    async (url) => new Response(JSON.stringify(url.includes('easycl.') ? easyItems : dimacoItems)),
  );
  assert.equal(balanced.ofertas.length, 11);
  assert.ok(balanced.ofertas.some((o) => o.tienda === 'Dimaco'));
  assert.ok(balanced.ofertas.some((o) => o.tienda === 'Easy'));

  const batchInput = [
    { nombre: 'Cemento 25 kg', cantidad: 10, unidad: 'sacos' },
    { nombre: 'Volcanita 10 mm', cantidad: 8, unidad: 'planchas' },
    { nombre: 'Tornillo drywall 6x1', cantidad: 2, unidad: 'cajas' },
    { nombre: 'Pintura látex blanco', cantidad: 2, unidad: 'tineta' },
    { nombre: 'Silicona neutra', cantidad: 4, unidad: 'un' },
    { nombre: 'Cinta papel junta', cantidad: 3, unidad: 'rollos' },
    { nombre: 'Pasta muro interior', cantidad: 2, unidad: 'galones' },
    { nombre: 'Brocha 3 pulgadas', cantidad: 2, unidad: 'unidades' },
  ];
  const batch = await compareQuoteMaterials(
    batchInput,
    { ubicacion: 'Ñuñoa', tiendas: ['Easy', 'Dimaco'] },
    async (url) => {
      const isEasy = url.includes('easycl.');
      const p = isEasy ? pEasy : pDimaco;
      const ft = new URL(url).searchParams.get('ft') || 'Material';
      const title = `${ft} estándar`;
      return new Response(
        JSON.stringify([
          product(p, {
            price: isEasy ? 5000 : 6000,
            product: { productName: title },
            item: { itemId: `${p.cuenta}-${ft}`, nameComplete: title },
          }),
        ]),
      );
    },
  );
  assert.equal(batch.length, 8);
  const webBatch = formatBatchMaterialComparison(batch, 'Ñuñoa');
  assert.match(webBatch, /Resumen de compra \(8 de 8 materiales con precio\):/);
  assert.match(webBatch, /Compra mixta más barata:/);
  assert.match(webBatch, /Todo en Easy:/);
  const waBatch = materialBatchComparisonWhatsApp(batch, 'Ñuñoa');
  assert.match(waBatch, /\*RESUMEN DE COMPRA\*/);
  assert.match(waBatch, /Todo en Easy:/);
});
