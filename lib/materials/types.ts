export interface ConsultaMaterial {
  producto: string;
  marca?: string;
  modelo?: string;
  presentacion?: string;
  cantidad?: number;
  unidad_cantidad?: string;
  ubicacion?: string;
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
}

export function safeOfferURL(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
    const host = url.hostname;
    const allowed = (["www.easy.cl", "www.dimaco.cl", "www.imperial.cl"].includes(host) && url.pathname.endsWith('/p'))
      || (host === 'www.sodimac.cl' && /^\/sodimac-cl\/articulo\/\d+\/[a-zA-Z0-9-]+\/?$/.test(url.pathname))
      || (host === 'www.construmart.cl' && /^\/[a-zA-Z0-9-]+\/?$/.test(url.pathname));
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
              o.total_solicitado > 0)),
      ) &&
      Array.isArray(value.proveedores) &&
      value.proveedores.length <= 7 &&
      value.proveedores.every(
        (p: any) =>
          typeof p.nombre === "string" &&
          ["consultado", "sin_resultados", "no_disponible"].includes(p.estado),
      ) &&
      Array.isArray(value.mejores_ids) &&
      value.mejores_ids.every((v: any) => typeof v === "string"),
  );
}
