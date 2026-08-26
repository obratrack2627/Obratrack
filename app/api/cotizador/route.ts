import { NextRequest, NextResponse } from 'next/server';
import { generarCotizacionGemini } from '@/lib/gemini';
import { CotizacionEstimacion, RecomendacionCobroCliente } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Validar token/cookie de autenticación
    const authToken = request.cookies.get('obratrack_auth_token')?.value;
    if (!authToken && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'No autorizado. Inicia sesión para usar el cotizador.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      descripcion,
      tipo_obra = 'General',
      metros_cuadrados = 20,
      comuna_region = 'Santiago, Chile',
      margen_utilidad = 30,
      nivel_calidad = 'estandar',
    } = body;

    if (!descripcion || typeof descripcion !== 'string') {
      return NextResponse.json(
        { error: 'Debe ingresar una descripción del proyecto a cotizar.' },
        { status: 400 }
      );
    }

    // 1. Intentar generar con Google Gemini 2.5 Flash / Pro AI
    const cotizacionGemini = await generarCotizacionGemini({
      descripcion,
      tipo_obra,
      metros_cuadrados: Number(metros_cuadrados),
      comuna_region,
      margen_utilidad: Number(margen_utilidad),
      nivel_calidad,
    });

    if (cotizacionGemini) {
      return NextResponse.json({
        success: true,
        source: 'google_gemini_ai',
        cotizacion: cotizacionGemini,
      });
    }

    // 2. Fallback heurístico inteligente paramétrico para el mercado chileno
    const descLower = descripcion.toLowerCase();
    const m2 = Math.max(1, Number(metros_cuadrados) || 20);

    let materiales: any[] = [];
    let manoDeObra: any[] = [];
    let duracionDias = 15;
    let tituloProyecto = 'Proyecto de Construcción & Remodelación';
    let resumenEjecutivo = `Proyecto estimado para ${m2} m2 en ${comuna_region}, considerando mano de obra calificada, insumos en ferreterías chilenas y análisis de rentabilidad.`;

    if (descLower.includes('quincho') || descLower.includes('asador')) {
      tituloProyecto = `Construcción de Quincho & Terraza (${m2} m2)`;
      duracionDias = Math.max(10, Math.round(m2 * 0.7));
      resumenEjecutivo = `Construcción completa de quincho de ${m2} m2 que incluye radier con malla Acma, mesón en albañilería, campana, enchape o porcelanato y estructura de techumbre en pino oregón.`;
      materiales = [
        {
          nombre: 'Cemento Especial Melón / Polpaico 25kg',
          categoria: 'obra_gruesa',
          cantidad: Math.ceil(m2 * 0.9),
          unidad: 'saco',
          precio_unitario_estimado: 4890,
          subtotal: Math.ceil(m2 * 0.9) * 4490,
          mejor_tienda: 'Construmart',
          precio_mas_barato: 4490,
          ahorro_estimado: Math.ceil(m2 * 0.9) * 400,
        },
        {
          nombre: 'Árido Mezcla Radier (Arena + Gravilla)',
          categoria: 'obra_gruesa',
          cantidad: Math.max(1, Math.round(m2 * 0.12)),
          unidad: 'm3',
          precio_unitario_estimado: 27000,
          subtotal: Math.max(1, Math.round(m2 * 0.12)) * 23000,
          mejor_tienda: 'Arenera / Barraca Local',
          precio_mas_barato: 23000,
          ahorro_estimado: Math.max(1, Math.round(m2 * 0.12)) * 4000,
        },
        {
          nombre: 'Malla Acma Electrosoldada C-92 (2.6x5.0m)',
          categoria: 'obra_gruesa',
          cantidad: Math.ceil(m2 / 12),
          unidad: 'unidad',
          precio_unitario_estimado: 23990,
          subtotal: Math.ceil(m2 / 12) * 19990,
          mejor_tienda: 'Construmart',
          precio_mas_barato: 19990,
          ahorro_estimado: Math.ceil(m2 / 12) * 4000,
        },
        {
          nombre: 'Viga Pino Oregón 2x6x4.0m Seco Cepillado',
          categoria: 'maderas_tableros',
          cantidad: Math.ceil(m2 * 0.6),
          unidad: 'tira',
          precio_unitario_estimado: 14990,
          subtotal: Math.ceil(m2 * 0.6) * 11990,
          mejor_tienda: 'Imperial Barracas',
          precio_mas_barato: 11990,
          ahorro_estimado: Math.ceil(m2 * 0.6) * 3000,
        },
        {
          nombre: 'Porcelanato Antideslizante Tráfico Alto 60x60',
          categoria: 'terminaciones',
          cantidad: Math.ceil(m2 * 1.15),
          unidad: 'm2',
          precio_unitario_estimado: 13990,
          subtotal: Math.ceil(m2 * 1.15) * 10990,
          mejor_tienda: 'Sodimac Constructor',
          precio_mas_barato: 10990,
          ahorro_estimado: Math.ceil(m2 * 1.15) * 3000,
        },
      ];
      manoDeObra = [
        {
          rol: 'Maestro Mayor Albañil / Carpintero',
          cantidad_personas: 1,
          dias_estimados: duracionDias,
          valor_jornal_diario: 45000,
          subtotal: 45000 * duracionDias,
        },
        {
          rol: 'Ayudante Avanzado',
          cantidad_personas: 1,
          dias_estimados: duracionDias,
          valor_jornal_diario: 28000,
          subtotal: 28000 * duracionDias,
        },
      ];
    } else {
      // Caso genérico construcción/remodelación
      tituloProyecto = `${tipo_obra} (${m2} m2)`;
      duracionDias = Math.max(8, Math.round(m2 * 0.6));
      materiales = [
        {
          nombre: 'Cemento Melón / Polpaico 25kg',
          categoria: 'obra_gruesa',
          cantidad: Math.ceil(m2 * 0.7),
          unidad: 'saco',
          precio_unitario_estimado: 4890,
          subtotal: Math.ceil(m2 * 0.7) * 4490,
          mejor_tienda: 'Construmart',
          precio_mas_barato: 4490,
          ahorro_estimado: Math.ceil(m2 * 0.7) * 400,
        },
        {
          nombre: 'Tableros OSB Estructural 9.5mm',
          categoria: 'maderas_tableros',
          cantidad: Math.ceil(m2 * 0.4),
          unidad: 'plancha',
          precio_unitario_estimado: 10990,
          subtotal: Math.ceil(m2 * 0.4) * 8990,
          mejor_tienda: 'Imperial Barracas',
          precio_mas_barato: 8990,
          ahorro_estimado: Math.ceil(m2 * 0.4) * 2000,
        },
        {
          nombre: 'Pintura Látex / Esmalte al Agua Extra Duración',
          categoria: 'terminaciones',
          cantidad: Math.ceil(m2 / 15),
          unidad: 'tineta',
          precio_unitario_estimado: 45990,
          subtotal: Math.ceil(m2 / 15) * 38990,
          mejor_tienda: 'Sodimac Constructor',
          precio_mas_barato: 38990,
          ahorro_estimado: Math.ceil(m2 / 15) * 7000,
        },
      ];
      manoDeObra = [
        {
          rol: 'Maestro Mayor / Especialista',
          cantidad_personas: 1,
          dias_estimados: duracionDias,
          valor_jornal_diario: 45000,
          subtotal: 45000 * duracionDias,
        },
        {
          rol: 'Ayudante de Faena',
          cantidad_personas: 1,
          dias_estimados: duracionDias,
          valor_jornal_diario: 28000,
          subtotal: 28000 * duracionDias,
        },
      ];
    }

    const costoMateriales = materiales.reduce((sum, item) => sum + item.subtotal, 0);
    const costoManoObra = manoDeObra.reduce((sum, item) => sum + item.subtotal, 0);
    const costoDirecto = costoMateriales + costoManoObra;
    const gastosGeneralesMonto = Math.round(costoDirecto * 0.1);
    const imprevistosMonto = Math.round(costoDirecto * 0.05);
    const baseConIndirectos = costoDirecto + gastosGeneralesMonto + imprevistosMonto;
    const margenMonto = Math.round(baseConIndirectos * (Number(margen_utilidad) / 100));
    const precioNeto = baseConIndirectos + margenMonto;
    const iva19 = Math.round(precioNeto * 0.19);
    const precioConIva = precioNeto + iva19;
    const totalAhorro = materiales.reduce((sum, item) => sum + item.ahorro_estimado, 0);

    const recomendacionCobro: RecomendacionCobroCliente = {
      precio_minimo_rentable: Math.round(baseConIndirectos * 1.15),
      precio_sugerido_mercado: precioConIva,
      precio_premium_garantia: Math.round(baseConIndirectos * 1.35 * 1.19),
      estrategia_negociacion:
        'Presenta al cliente el presupuesto destacando la calidad de los materiales comprados en distribuidores oficiales y el cronograma ordenado con Carta Gantt.',
      desglose_por_metro_cuadrado: Math.round(precioConIva / m2),
      formas_pago_recomendadas: [
        '40% de anticipo al firmar (para compra de materiales y fletes)',
        '30% al terminar obra gruesa e instalaciones',
        '20% al finalizar pinturas y terminaciones finas',
        '10% de retención contra entrega de llaves y recepción conforme',
      ],
      justificacion_precio:
        'Tarifa calculada con jornales reales de la construcción en Chile y lista de insumos al por mayor en Construmart e Imperial.',
    };

    const cotizacionFallback: CotizacionEstimacion = {
      id: 'cot-' + Date.now(),
      titulo_proyecto: tituloProyecto,
      tipo_obra,
      metros_cuadrados: m2,
      comuna_region,
      duracion_dias_estimada: duracionDias,
      resumen_ejecutivo: resumenEjecutivo,
      materiales,
      mano_de_obra: manoDeObra,
      estructura_financiera: {
        costo_materiales_total: costoMateriales,
        costo_mano_obra_total: costoManoObra,
        costo_directo: costoDirecto,
        gastos_generales_porcentaje: 10,
        gastos_generales_monto: gastosGeneralesMonto,
        imprevistos_porcentaje: 5,
        imprevistos_monto: imprevistosMonto,
        margen_utilidad_porcentaje: Number(margen_utilidad),
        margen_utilidad_monto: margenMonto,
        precio_sugerido_neto: precioNeto,
        iva_19: iva19,
        precio_total_con_iva: precioConIva,
        ahorro_compras_estrategicas: totalAhorro,
      },
      radar_proveedores: [
        {
          tienda: 'Construmart',
          categoria_destacada: 'Cemento, Fierro y Áridos',
          nivel_precio: 'mas_barato',
          descuentos_disponibles: 'Precios contratista con RUT empresa',
          ahorro_estimado_total: 45000,
          ventajas: ['Despacho a pie de obra', 'Stock garantizado'],
        },
        {
          tienda: 'Imperial Barracas',
          categoria_destacada: 'Maderas y Tableros OSB',
          nivel_precio: 'mas_barato',
          descuentos_disponibles: 'Hasta 18% en compras sobre $200.000',
          ahorro_estimado_total: 62000,
          ventajas: ['Madera seca seleccionada', 'Corte sin costo'],
        },
        {
          tienda: 'Sodimac Constructor',
          categoria_destacada: 'Terminaciones, Adhesivos y Pisos',
          nivel_precio: 'promedio',
          descuentos_disponibles: 'Puntos CMR y garantía de satisfacción',
          ahorro_estimado_total: 28000,
          ventajas: ['Variedad de catálogos', 'Horario extendido'],
        },
      ],
      actividades_gantt: [
        { nombre: 'Trazado, Excavación y Radier', dias: Math.ceil(duracionDias * 0.3), orden: 1 },
        { nombre: 'Estructura y Muros Principales', dias: Math.ceil(duracionDias * 0.4), orden: 2 },
        { nombre: 'Instalaciones y Terminaciones', dias: Math.ceil(duracionDias * 0.3), orden: 3 },
      ],
      consejos_experto_pyme: [
        'Cotiza áridos directamente en areneras de la zona para ahorrar hasta un 25% respecto a grandes tiendas.',
        'Pide siempre el 40% de anticipo para congelar precios de materiales en ferreterías y evitar alzas inesperadas.',
        'Firma un anexo de contrato antes de ejecutar cualquier cambio o adicional solicitado por el mandante.',
      ],
      recomendacion_cobro: recomendacionCobro,
      fecha_creacion: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      source: 'heuristic_chile_engine',
      cotizacion: cotizacionFallback,
    });
  } catch (error: any) {
    console.error('Error en /api/cotizador:', error);
    return NextResponse.json(
      { error: error?.message || 'Error al procesar la cotización' },
      { status: 500 }
    );
  }
}
