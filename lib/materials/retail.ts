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
    const link = (() => {
      const raw = typeof p.url === 'string' ? p.url.trim() : '';
      const falabella = /^https?:\/\/(?:www\.)?(?:(?:sodimac\.)?falabella\.com\/(?:falabella|sodimac)-cl|sodimac\.cl\/sodimac-cl)\/(?:product|articulo)\/([^?#]+)/i.exec(raw);
      if (falabella) {
        const parts = falabella[1].replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
        const slug = parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1]) && parts.length > 2 ? parts.slice(0, 2).join('/') : parts.join('/');
        return `https://www.sodimac.cl/sodimac-cl/articulo/${slug}`;
      }
      return raw.startsWith('/') ? `https://www.sodimac.cl${raw}` : raw;
    })();
    const name = /^\s*(?:\d|saco\b|bolsa\b|caja\b|pack\b)/i.test(String(p.displayName || '')) && p.brand && !String(p.displayName).toLowerCase().includes(String(p.brand).toLowerCase())
      ? `${String(p.brand).trim()} ${String(p.displayName).trim()}`
      : p.displayName;
    return { productName: name, brand: p.brand, link, items: [{ itemId: p.skuId, nameComplete: name, measurementUnit: 'un', unitMultiplier: 1, sellers: [{ sellerDefault: true, sellerName: 'Sodimac', commertialOffer: { Price: amount, ...(p.isSoldOut === true ? { AvailableQuantity: 0 } : {}) } }] }] };
  });
}
export function construmartProducts(body: string) {
  const products = JSON.parse(body).data?.products?.items;
  if (!Array.isArray(products)) throw Error('Catálogo de Construmart no disponible');
  return products.map((p) => ({ productName: p.name, brand: '', link: `https://www.construmart.cl/${p.url_key}`, items: [{ itemId: p.sku, nameComplete: p.name, measurementUnit: 'un', unitMultiplier: 1, sellers: [{ sellerDefault: true, sellerName: 'Construmart', commertialOffer: { Price: p.price_range?.minimum_price?.final_price?.currency === 'CLP' ? p.price_range.minimum_price.final_price.value : 0, AvailableQuantity: p.stock_status === 'IN_STOCK' ? 1 : 0 } }] }] }));
}

function parseClpString(raw: unknown): number {
  const text = String(raw ?? '').trim();
  if (/^\d+(?:\.\d{1,2})?$/.test(text)) return Math.round(Number(text));
  if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ''));
  return 0;
}

export function pratShopifyProducts(body: string) {
  const products = JSON.parse(body)?.resources?.results?.products;
  if (!Array.isArray(products)) throw Error('Catálogo de Ferretería Prat no disponible');
  return products.map((p: any) => {
    const cleanPath = String(p.url || '').split('?')[0].split('#')[0].trim();
    const link = cleanPath.startsWith('/')
      ? `https://www.ferreteriaprat.cl${cleanPath}`
      : cleanPath;
    const price = parseClpString(p.price);
    const title = String(p.title || '').trim();
    return {
      productName: title,
      brand: String(p.vendor || 'Ferretería Prat').trim(),
      link,
      items: [
        {
          itemId: String(p.id || p.handle || cleanPath),
          nameComplete: title,
          measurementUnit: 'un',
          unitMultiplier: 1,
          sellers: [
            {
              sellerDefault: true,
              sellerName: 'Ferretería Prat',
              commertialOffer: {
                Price: price,
                AvailableQuantity: p.available === false ? 0 : 1,
              },
            },
          ],
        },
      ],
    };
  });
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8220;|&#8221;/g, '"');
}

export function weitzlerWooProducts(body: string) {
  const products = JSON.parse(body);
  if (!Array.isArray(products)) throw Error('Catálogo de Weitzler no disponible');
  return products.map((p: any) => {
    const cleanLink = String(p.permalink || '').split('?')[0].split('#')[0].trim();
    const minor = Number(p.prices?.currency_minor_unit ?? 0);
    const rawAmount = Number(p.prices?.price);
    const price =
      p.prices?.currency_code === 'CLP' && Number.isFinite(rawAmount) && rawAmount > 0
        ? Math.round(rawAmount / Math.pow(10, Number.isFinite(minor) && minor >= 0 ? minor : 0))
        : 0;
    const title = decodeBasicEntities(String(p.name || '').trim());
    return {
      productName: title,
      brand: 'Weitzler',
      link: cleanLink,
      items: [
        {
          itemId: String(p.id || p.sku || cleanLink),
          nameComplete: title,
          measurementUnit: 'un',
          unitMultiplier: 1,
          sellers: [
            {
              sellerDefault: true,
              sellerName: 'Weitzler',
              commertialOffer: {
                Price: price,
                AvailableQuantity: p.is_in_stock === false ? 0 : 1,
              },
            },
          ],
        },
      ],
    };
  });
}
