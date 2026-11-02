// Lectura de datos publicados por las tiendas. No usa precios de tarjetas ni promociones condicionadas.
export function sodimacProducts(html: string) {
  const match = /<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) throw Error('Catálogo de Sodimac no disponible');
  const results = JSON.parse(match[1]).props?.pageProps?.results;
  if (!Array.isArray(results)) throw Error('Catálogo de Sodimac no disponible');
  return results.filter((p) => p.sellerId === 'SODIMAC_CHILE').map((p) => {
    const price = p.prices?.find((v: any) => !v.crossed && v.type === 'internetPrice') || p.prices?.find((v: any) => !v.crossed && v.type === 'normalPrice');
    const raw = price?.price?.length === 1 ? String(price.price[0]) : '';
    const amount = /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(raw) ? Number(raw.replace(/\./g, '')) : 0;
    return { productName: p.displayName, brand: p.brand, link: p.url, items: [{ itemId: p.skuId, nameComplete: p.displayName, measurementUnit: 'un', unitMultiplier: 1, sellers: [{ sellerDefault: true, sellerName: 'Sodimac', commertialOffer: { Price: amount, ...(p.isSoldOut === true ? { AvailableQuantity: 0 } : {}) } }] }] };
  });
}
export function construmartProducts(body: string) {
  const products = JSON.parse(body).data?.products?.items;
  if (!Array.isArray(products)) throw Error('Catálogo de Construmart no disponible');
  return products.map((p) => ({ productName: p.name, brand: '', link: `https://www.construmart.cl/${p.url_key}`, items: [{ itemId: p.sku, nameComplete: p.name, measurementUnit: 'un', unitMultiplier: 1, sellers: [{ sellerDefault: true, sellerName: 'Construmart', commertialOffer: { Price: p.price_range?.minimum_price?.final_price?.currency === 'CLP' ? p.price_range.minimum_price.final_price.value : 0, AvailableQuantity: p.stock_status === 'IN_STOCK' ? 1 : 0 } }] }] }));
}
