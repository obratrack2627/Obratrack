export interface ConsultaMaterial {
  producto: string;
  marca?: string;
  modelo?: string;
  presentacion?: string;
  cantidad?: number;
  unidad_cantidad?: string;
  ubicacion?: string;
  latitud?: number;
  longitud?: number;
  radio_km?: number;
  tiendas?: string[];
}

export interface OfertaMaterial {
  id: string;
  tienda: string;
  nombre: string;
  marca: string;
  vendedor?: string;
  precio: number;
  unidad: string;
  multiplicador: number;
  ean?: string;
  url: string;
  total_solicitado?: number;
  rendimiento_m2?: number;
  precio_m2?: number;
  cajas_necesarias?: number;
  sucursal_cercana_km?: number;
  sucursal_cercana_nombre?: string;
}

export interface FerreteriaCercana {
  nombre: string;
  tipo: "cadena" | "local";
  distancia_km: number;
  direccion?: string;
  telefono?: string;
  cadena_integrada?: string;
  url_mapa: string;
  url_whatsapp?: string;
  url_busqueda?: string;
}

export interface PrecioHistoricoMaterial {
  nombre: string;
  proveedor: string;
  precio_unitario: number;
  unidad: string;
  fecha?: string;
  proyecto_nombre: string;
  comuna?: string;
  comprado: boolean;
  dias_desde_compra?: number;
  total_estimado?: number;
}

export interface ComparacionMateriales {
  consulta: ConsultaMaterial;
  consultado_en: string;
  resumen: string;
  ofertas: OfertaMaterial[];
  proveedores: Array<{
    nombre: string;
    estado: "consultado" | "sin_resultados" | "no_disponible";
    url: string;
  }>;
  mejores_ids: string[];
  ferreterias_cercanas?: FerreteriaCercana[];
  historial_empresa?: PrecioHistoricoMaterial[];
}

export function safeOfferURL(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
    const host = url.hostname;
    const allowed = (["www.easy.cl", "www.dimaco.cl", "www.imperial.cl", "www.chilemat.cl"].includes(host) && url.pathname.endsWith('/p'))
      || ((host === 'www.sodimac.cl' || host === 'sodimac.falabella.com' || host === 'www.sodimac.falabella.com') && /^\/sodimac-cl\/(?:articulo|product)\/\d+\/[a-zA-Z0-9._%-]+(?:\/\d+)?\/?$/.test(url.pathname))
      || (host === 'www.construmart.cl' && /^\/[a-zA-Z0-9-]+\/?$/.test(url.pathname))
      || (host === 'www.ferreteriaprat.cl' && /^\/products\/[a-zA-Z0-9._%-]+\/?$/.test(url.pathname))
      || (host === 'www.weitzler.cl' && /^\/producto\/[a-zA-Z0-9._%-]+\/?$/.test(url.pathname));
    return allowed ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function isMaterialComparison(
  value: any,
): value is ComparacionMateriales {
  return Boolean(
    value &&
      typeof value.resumen === "string" &&
      typeof value.consulta?.producto === "string" &&
      typeof value.consultado_en === "string" &&
      Number.isFinite(Date.parse(value.consultado_en)) &&
      Array.isArray(value.ofertas) &&
      value.ofertas.length <= 12 &&
      value.ofertas.every(
        (o: any) =>
          typeof o.id === "string" &&
          typeof o.nombre === "string" &&
          typeof o.tienda === "string" &&
          Number.isSafeInteger(o.precio) &&
          o.precio > 0 &&
          safeOfferURL(o.url) &&
          typeof o.unidad === "string" &&
          typeof o.multiplicador === "number" &&
          Number.isFinite(o.multiplicador) &&
          o.multiplicador > 0 &&
          (o.total_solicitado == null ||
            (Number.isSafeInteger(o.total_solicitado) &&
              o.total_solicitado > 0)) &&
          (o.rendimiento_m2 == null ||
            (typeof o.rendimiento_m2 === "number" &&
              Number.isFinite(o.rendimiento_m2) &&
              o.rendimiento_m2 > 0)) &&
          (o.precio_m2 == null ||
            (Number.isSafeInteger(o.precio_m2) && o.precio_m2 > 0)) &&
          (o.cajas_necesarias == null ||
            (Number.isSafeInteger(o.cajas_necesarias) &&
              o.cajas_necesarias > 0)) &&
          (o.sucursal_cercana_km == null ||
            (typeof o.sucursal_cercana_km === "number" &&
              Number.isFinite(o.sucursal_cercana_km) &&
              o.sucursal_cercana_km >= 0)),
      ) &&
      Array.isArray(value.proveedores) &&
      value.proveedores.length <= 10 &&
      value.proveedores.every(
        (p: any) =>
          typeof p.nombre === "string" &&
          ["consultado", "sin_resultados", "no_disponible"].includes(p.estado),
      ) &&
      Array.isArray(value.mejores_ids) &&
      value.mejores_ids.every((v: any) => typeof v === "string") &&
      (value.ferreterias_cercanas == null ||
        (Array.isArray(value.ferreterias_cercanas) &&
          value.ferreterias_cercanas.length <= 12 &&
          value.ferreterias_cercanas.every(
            (f: any) =>
              typeof f.nombre === "string" &&
              ["cadena", "local"].includes(f.tipo) &&
              typeof f.distancia_km === "number" &&
              Number.isFinite(f.distancia_km) &&
              f.distancia_km >= 0 &&
              typeof f.url_mapa === "string" &&
              f.url_mapa.startsWith("https://"),
          ))) &&
      (value.historial_empresa == null ||
        (Array.isArray(value.historial_empresa) &&
          value.historial_empresa.length <= 5 &&
          value.historial_empresa.every(
            (h: any) =>
              typeof h.nombre === "string" &&
              typeof h.proveedor === "string" &&
              Number.isSafeInteger(h.precio_unitario) &&
              h.precio_unitario > 0,
          ))),
  );
}
