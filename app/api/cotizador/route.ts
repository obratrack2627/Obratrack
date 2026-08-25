import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/openai';
import { CotizacionEstimacion } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
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

    const openai = getOpenAIClient();
    let cotizacion: CotizacionEstimacion | null = null;

    if (openai) {
      try {
        const promptSystem = `Eres el Agente Experto Cotizador de ObraTrack, especialista de primer nivel en presupuestos de construcción, cubicaciones, análisis de precios unitarios (APU) y compra inteligente de materiales para PYMEs constructoras y contratistas en Chile.

Reglas y mercado de precios en Chile (valores en Pesos Chilenos CLP):
1. Materiales y Tiendas en Chile:
   - Construmart: Cemento (Melón/Polpaico $4.290-$4.500/saco 25kg), fierro estriado A63 ($5.290-$5.800/tira), mallas Acma C-92 ($19.990).
   - Imperial Barracas: Especialista en maderas (pino oregón, pino radiata seco $6.900-$7.500), tableros OSB 9.5mm ($8.990), terciados y teja asfáltica ($27.990).
   - Red MTS / Chilemat: Cemento, áridos locales, tuberías PVC y ferretería pesada a granel.
   - Sodimac Constructor / Easy: Porcelanatos, adhesivos Bekron DA/Standard, pinturas, griferías y terminaciones.
   - Areneras / Barracas Locales: Áridos mezclados ($22.000-$26.000/m3), madera verde/seca sin intermediarios.
2. Mano de Obra en Chile (Jornales de referencia actual):
   - Maestro Mayor / Jefe de Cuadrilla: $45.000 - $55.000 CLP / día.
   - Maestro Carpintero / Albañil / Pintor / Gasfíter: $38.000 - $45.000 CLP / día.
   - Ayudante / Jornal: $26.000 - $30.000 CLP / día.
3. El ahorro estimado por compras estratégicas debe ser realista (comprar maderas en Imperial, cemento en Construmart, áridos directos).
4. Genera cubicación y partidas detalladas y realistas acordes a la descripción entregada.

IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido con la siguiente estructura exacta:
{
  "titulo_proyecto": "Título descriptivo del proyecto",
  "tipo_obra": "Tipo de obra",
  "duracion_dias_estimada": 15,
  "resumen_ejecutivo": "Texto resumen del proyecto",
  "materiales": [
    {
      "nombre": "Nombre material",
      "categoria": "obra_gruesa | maderas_tableros | techumbre | terminaciones | ferreteria",
      "cantidad": 10,
      "unidad": "saco | tira | plancha | m2 | m3 | paquete | lote",
      "precio_unitario_estimado": 5000,
      "subtotal": 50000,
      "mejor_tienda": "Construmart | Imperial Barracas | Easy / Sodimac | Red MTS | Arenera Local",
      "precio_mas_barato": 4200,
      "ahorro_estimado": 8000,
      "alternativa_economica": "Opcional"
    }
  ],
  "mano_de_obra": [
    {
      "rol": "Maestro Mayor / Capataz",
      "cantidad_personas": 1,
      "dias_estimados": 10,
      "valor_jornal_diario": 45000,
      "subtotal": 450000
    }
  ],
  "radar_proveedores": [
    {
      "tienda": "Imperial Barracas",
      "categoria_destacada": "Maderas y Tableros",
      "nivel_precio": "mas_barato",
      "descuentos_disponibles": "Hasta 20% en maderas secas",
      "ahorro_estimado_total": 85000,
      "ventajas": ["Dimensionado exacto", "Madera seca"]
    }
  ],
  "actividades_gantt": [
    {
      "nombre": "Nombre actividad",
      "dias": 3,
      "orden": 1
    }
  ],
  "consejos_experto_pyme": [
    "Consejo 1",
    "Consejo 2",
    "Consejo 3"
  ]
}`;

        const promptUser = `Calcula la cotización profesional completa para el siguiente proyecto:
Descripción: "${descripcion}"
Tipo de Obra: ${tipo_obra}
Metros Cuadrados aproximados: ${metros_cuadrados} m2
Ubicación / Comuna: ${comuna_region}
Nivel de Calidad: ${nivel_calidad}
Margen de Utilidad deseado: ${margen_utilidad}%`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        });

        const text = response.choices[0]?.message?.content;
        if (text) {
          const parsed = JSON.parse(text);

          // Calcular estructura financiera con las fórmulas chilenas estandarizadas
          const costoMateriales = (parsed.materiales || []).reduce(
            (sum: number, item: any) =>
              sum + (Number(item.precio_mas_barato || item.subtotal) * (item.cantidad || 1)),
            0
          );
          const costoManoObra = (parsed.mano_de_obra || []).reduce(
            (sum: number, item: any) => sum + Number(item.subtotal || 0),
            0
          );
          const costoDirecto = costoMateriales + costoManoObra;
          const gastosGeneralesMonto = Math.round(costoDirecto * 0.1);
          const imprevistosMonto = Math.round(costoDirecto * 0.05);
          const baseConCostosIndirectos = costoDirecto + gastosGeneralesMonto + imprevistosMonto;
          const margenMonto = Math.round(baseConCostosIndirectos * (margen_utilidad / 100));
          const precioNeto = baseConCostosIndirectos + margenMonto;
          const iva19 = Math.round(precioNeto * 0.19);
          const precioConIva = precioNeto + iva19;

          const totalAhorro = (parsed.materiales || []).reduce(
            (sum: number, item: any) => sum + Number(item.ahorro_estimado || 0),
            0
          );

          cotizacion = {
            id: 'cot-' + Date.now(),
            titulo_proyecto: parsed.titulo_proyecto || 'Cotización de Obra',
            tipo_obra: parsed.tipo_obra || tipo_obra,
            metros_cuadrados: Number(metros_cuadrados),
            comuna_region,
            duracion_dias_estimada: Number(parsed.duracion_dias_estimada || 15),
            resumen_ejecutivo: parsed.resumen_ejecutivo || '',
            materiales: parsed.materiales || [],
            mano_de_obra: parsed.mano_de_obra || [],
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
            radar_proveedores: parsed.radar_proveedores || [],
            actividades_gantt: parsed.actividades_gantt || [],
            consejos_experto_pyme: parsed.consejos_experto_pyme || [],
            fecha_creacion: new Date().toISOString(),
          };
        }
      } catch (openaiError) {
        console.error('Error al generar cotización con OpenAI:', openaiError);
      }
    }

    // Fallback heurístico inteligente si no hay API key de OpenAI o si hubo error
    if (!cotizacion) {
      cotizacion = generarCotizacionHeuristica(
        descripcion,
        tipo_obra,
        Number(metros_cuadrados) || 20,
        comuna_region,
        Number(margen_utilidad) || 30,
        nivel_calidad
      );
    }

    return NextResponse.json(cotizacion);
  } catch (error: any) {
    console.error('Error en API Cotizador:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar la cotización' },
      { status: 500 }
    );
  }
}

// Generador heurístico con base de datos de precios reales de construcción en Chile
function generarCotizacionHeuristica(
  descripcion: string,
  tipo: string,
  m2: number,
  comuna: string,
  margenPct: number,
  calidad: string
): CotizacionEstimacion {
  const descLower = descripcion.toLowerCase();
  const factorCalidad = calidad === 'premium' ? 1.35 : calidad === 'economico' ? 0.85 : 1.0;
  const superficie = m2 > 0 ? m2 : 20;

  let titulo = `Cotización Proyecto: ${descripcion.slice(0, 50)}...`;
  let duracionDias = Math.max(8, Math.round(superficie * 0.6));
  let tipoDetectado = tipo !== 'General' ? tipo : 'Construcción & Remodelación';

  const materiales: any[] = [];
  const manoObra: any[] = [];
  const gantt: any[] = [];
  const radar: any[] = [];
  const tips: string[] = [];

  if (descLower.includes('quincho') || descLower.includes('terraza') || descLower.includes('cobertizo')) {
    titulo = `Construcción Quincho & Terraza Techada ${superficie}m²`;
    tipoDetectado = 'Quinchos & Terrazas';
    duracionDias = Math.max(12, Math.round(superficie * 0.7));

    const sacosCemento = Math.round(superficie * 1.3);
    const m3Aridos = Math.max(2, Math.round(superficie * 0.14));
    const mallas = Math.max(2, Math.ceil(superficie / 12));
    const pilares = Math.max(4, Math.ceil(superficie / 6));
    const vigas = Math.max(10, Math.round(superficie * 0.8));
    const osb = Math.max(6, Math.ceil(superficie / 2.8));
    const tejas = Math.max(6, Math.ceil(superficie / 2.9));
    const porcelanato = Math.round(superficie * 1.1);

    materiales.push(
      {
        nombre: `Cemento Especial Polpaico/Melón 25kg (Radier y pilares)`,
        categoria: 'obra_gruesa',
        cantidad: sacosCemento,
        unidad: 'saco',
        precio_unitario_estimado: 4690,
        subtotal: sacosCemento * 4690,
        mejor_tienda: 'Construmart',
        precio_mas_barato: 4290,
        ahorro_estimado: sacosCemento * 400,
      },
      {
        nombre: 'Áridos mezclados (Arena gruesa y Ripio 3/4)',
        categoria: 'obra_gruesa',
        cantidad: m3Aridos,
        unidad: 'm3',
        precio_unitario_estimado: 28000,
        subtotal: m3Aridos * 28000,
        mejor_tienda: 'Arenera Local',
        precio_mas_barato: 22000,
        ahorro_estimado: m3Aridos * 6000,
      },
      {
        nombre: 'Malla Acma C-92 electrosoldada (2.60x5.0m)',
        categoria: 'obra_gruesa',
        cantidad: mallas,
        unidad: 'malla',
        precio_unitario_estimado: 22490,
        subtotal: mallas * 22490,
        mejor_tienda: 'Construmart',
        precio_mas_barato: 19990,
        ahorro_estimado: mallas * 2500,
      },
      {
        nombre: `Pilares Pino Oregón 6x6 x 3.2m Seco Cepillado`,
        categoria: 'maderas_tableros',
        cantidad: pilares,
        unidad: 'tira',
        precio_unitario_estimado: Math.round(34990 * factorCalidad),
        subtotal: pilares * Math.round(34990 * factorCalidad),
        mejor_tienda: 'Imperial Barracas',
        precio_mas_barato: Math.round(27990 * factorCalidad),
        ahorro_estimado: pilares * 7000,
      },
      {
        nombre: `Vigas Pino Oregón 2x6 y costaneras 2x4`,
        categoria: 'maderas_tableros',
        cantidad: vigas,
        unidad: 'tira',
        precio_unitario_estimado: Math.round(9890 * factorCalidad),
        subtotal: vigas * Math.round(9890 * factorCalidad),
        mejor_tienda: 'Imperial',
        precio_mas_barato: Math.round(7890 * factorCalidad),
        ahorro_estimado: vigas * 2000,
      },
      {
        nombre: 'Planchas OSB Estructural 9.5mm para base techumbre',
        categoria: 'techumbre',
        cantidad: osb,
        unidad: 'plancha',
        precio_unitario_estimado: 9990,
        subtotal: osb * 9990,
        mejor_tienda: 'Imperial',
        precio_mas_barato: 8990,
        ahorro_estimado: osb * 1000,
      },
      {
        nombre: 'Teja Asfáltica Classic + Fieltro 15 lbs',
        categoria: 'techumbre',
        cantidad: tejas,
        unidad: 'paquete',
        precio_unitario_estimado: 31490,
        subtotal: tejas * 31490,
        mejor_tienda: 'Imperial',
        precio_mas_barato: 27990,
        ahorro_estimado: tejas * 3500,
      },
      {
        nombre: 'Piso Porcelanato Exterior Antideslizante + Bekron DA',
        categoria: 'terminaciones',
        cantidad: porcelanato,
        unidad: 'm2',
        precio_unitario_estimado: Math.round(16990 * factorCalidad),
        subtotal: porcelanato * Math.round(16990 * factorCalidad),
        mejor_tienda: 'Easy / Sodimac',
        precio_mas_barato: Math.round(13990 * factorCalidad),
        ahorro_estimado: porcelanato * 3000,
      },
      {
        nombre: 'Anclajes metálicos para pilar, tornillería estructural y protectores',
        categoria: 'ferreteria',
        cantidad: 1,
        unidad: 'lote',
        precio_unitario_estimado: 120000,
        subtotal: 120000,
        mejor_tienda: 'Red MTS',
        precio_mas_barato: 98000,
        ahorro_estimado: 22000,
      }
    );

    manoObra.push(
      {
        rol: 'Maestro Mayor / Capataz',
        cantidad_personas: 1,
        dias_estimados: duracionDias,
        valor_jornal_diario: 45000,
        subtotal: 1 * duracionDias * 45000,
      },
      {
        rol: 'Maestro Carpintero / Albañil',
        cantidad_personas: 1,
        dias_estimados: duracionDias,
        valor_jornal_diario: 40000,
        subtotal: 1 * duracionDias * 40000,
      },
      {
        rol: 'Ayudante de Construcción',
        cantidad_personas: 2,
        dias_estimados: duracionDias,
        valor_jornal_diario: 28000,
        subtotal: 2 * duracionDias * 28000,
      }
    );

    gantt.push(
      { nombre: 'Trazado, excavación y emplantillado', dias: 3, orden: 1 },
      { nombre: 'Enfierradura, malla Acma y vaciado Radier H-20', dias: 4, orden: 2 },
      { nombre: 'Montaje de estructura pilares y vigas', dias: 4, orden: 3 },
      { nombre: 'Entablado OSB y colocación de teja asfáltica', dias: 3, orden: 4 },
      { nombre: 'Instalación de piso cerámico / porcelanato y fragüe', dias: 3, orden: 5 },
      { nombre: 'Pintura, barniz protector de madera y entrega', dias: 2, orden: 6 }
    );
  } else if (descLower.includes('ampliacion') || descLower.includes('segundo piso') || descLower.includes('pieza')) {
    titulo = `Ampliación Habitacional ${superficie}m² en Estructura Ligera / Metalcon`;
    tipoDetectado = 'Ampliaciones';
    duracionDias = Math.max(15, Math.round(superficie * 0.9));

    const perfilesMetalcon = Math.round(superficie * 2.8);
    const planchasYeso = Math.round(superficie * 2.2);
    const planchasFibro = Math.round(superficie * 1.5);
    const aislacion = Math.round(superficie * 1.3);
    const pisoFlotante = Math.round(superficie * 1.15);

    materiales.push(
      {
        nombre: 'Perfiles Metalcon Estructural C y U (Montantes y Soleras 90mm)',
        categoria: 'obra_gruesa',
        cantidad: perfilesMetalcon,
        unidad: 'tira',
        precio_unitario_estimado: 7890,
        subtotal: perfilesMetalcon * 7890,
        mejor_tienda: 'Construmart',
        precio_mas_barato: 6690,
        ahorro_estimado: perfilesMetalcon * 1200,
      },
      {
        nombre: 'Planchas Yeso-Cartón Volcanita 10mm 1.20x2.40m',
        categoria: 'maderas_tableros',
        cantidad: planchasYeso,
        unidad: 'plancha',
        precio_unitario_estimado: 6490,
        subtotal: planchasYeso * 6490,
        mejor_tienda: 'Imperial',
        precio_mas_barato: 5790,
        ahorro_estimado: planchasYeso * 700,
      },
      {
        nombre: 'Planchas Fibrocemento Permanit 6mm exterior',
        categoria: 'maderas_tableros',
        cantidad: planchasFibro,
        unidad: 'plancha',
        precio_unitario_estimado: 9290,
        subtotal: planchasFibro * 9290,
        mejor_tienda: 'Construmart',
        precio_mas_barato: 8490,
        ahorro_estimado: planchasFibro * 800,
      },
      {
        nombre: 'Aislación Lana de Vidrio Fisiterm / Aislanglass 50mm',
        categoria: 'techumbre',
        cantidad: aislacion,
        unidad: 'rollo',
        precio_unitario_estimado: 21990,
        subtotal: aislacion * 21990,
        mejor_tienda: 'Imperial',
        precio_mas_barato: 18990,
        ahorro_estimado: aislacion * 3000,
      },
      {
        nombre: 'Piso Flotante / Vinílico SPC 8mm + Espuma Niveladora',
        categoria: 'terminaciones',
        cantidad: pisoFlotante,
        unidad: 'm2',
        precio_unitario_estimado: Math.round(14990 * factorCalidad),
        subtotal: pisoFlotante * Math.round(14990 * factorCalidad),
        mejor_tienda: 'Easy / Sodimac',
        precio_mas_barato: Math.round(11990 * factorCalidad),
        ahorro_estimado: pisoFlotante * 3000,
      },
      {
        nombre: 'Pasta Muro, cinta junta invisible, tornillos drywall y pintura látex',
        categoria: 'terminaciones',
        cantidad: 1,
        unidad: 'lote',
        precio_unitario_estimado: 180000,
        subtotal: 180000,
        mejor_tienda: 'Red MTS',
        precio_mas_barato: 145000,
        ahorro_estimado: 35000,
      }
    );

    manoObra.push(
      {
        rol: 'Maestro Mayor Estructurador',
        cantidad_personas: 1,
        dias_estimados: duracionDias,
        valor_jornal_diario: 45000,
        subtotal: 1 * duracionDias * 45000,
      },
      {
        rol: 'Maestro Terminaciones / Tabiquero',
        cantidad_personas: 1,
        dias_estimados: duracionDias,
        valor_jornal_diario: 40000,
        subtotal: 1 * duracionDias * 40000,
      },
      {
        rol: 'Ayudante',
        cantidad_personas: 1,
        dias_estimados: duracionDias,
        valor_jornal_diario: 28000,
        subtotal: 1 * duracionDias * 28000,
      }
    );

    gantt.push(
      { nombre: 'Montaje de estructura Metalcon y anclajes', dias: 5, orden: 1 },
      { nombre: 'Emplacado exterior fibrocemento y aislación térmica', dias: 4, orden: 2 },
      { nombre: 'Instalaciones eléctricas y canalización', dias: 3, orden: 3 },
      { nombre: 'Emplacado interior Volcanita y huinchado de juntas', dias: 4, orden: 4 },
      { nombre: 'Empaste, lijado y pintura 2 manos', dias: 3, orden: 5 },
      { nombre: 'Instalación de piso flotante, zócalos y entrega', dias: 3, orden: 6 }
    );
  } else {
    // Caso General / Remodelación
    titulo = `Proyecto de Construcción & Reforma ${superficie}m²`;
    tipoDetectado = 'Remodelaciones & Reformas';
    duracionDias = Math.max(10, Math.round(superficie * 0.5));

    materiales.push(
      {
        nombre: 'Materiales de Obra Gruesa & Albañilería Básica',
        categoria: 'obra_gruesa',
        cantidad: Math.round(superficie * 0.8),
        unidad: 'unidades',
        precio_unitario_estimado: 12000,
        subtotal: Math.round(superficie * 0.8) * 12000,
        mejor_tienda: 'Construmart',
        precio_mas_barato: 10200,
        ahorro_estimado: Math.round(superficie * 0.8) * 1800,
      },
      {
        nombre: 'Materiales de Terminación (Revestimientos, Cerámicas/Pinturas)',
        categoria: 'terminaciones',
        cantidad: Math.round(superficie * 1.2),
        unidad: 'm2',
        precio_unitario_estimado: Math.round(18000 * factorCalidad),
        subtotal: Math.round(superficie * 1.2) * Math.round(18000 * factorCalidad),
        mejor_tienda: 'Easy / Sodimac',
        precio_mas_barato: Math.round(14500 * factorCalidad),
        ahorro_estimado: Math.round(superficie * 1.2) * 3500,
      },
      {
        nombre: 'Insumos de Ferretería, Fijaciones y Adhesivos',
        categoria: 'ferreteria',
        cantidad: 1,
        unidad: 'lote',
        precio_unitario_estimado: 150000,
        subtotal: 150000,
        mejor_tienda: 'Imperial / Red MTS',
        precio_mas_barato: 125000,
        ahorro_estimado: 25000,
      }
    );

    manoObra.push(
      {
        rol: 'Maestro Mayor General',
        cantidad_personas: 1,
        dias_estimados: duracionDias,
        valor_jornal_diario: 45000,
        subtotal: 1 * duracionDias * 45000,
      },
      {
        rol: 'Ayudante de Construcción',
        cantidad_personas: 1,
        dias_estimados: duracionDias,
        valor_jornal_diario: 28000,
        subtotal: 1 * duracionDias * 28000,
      }
    );

    gantt.push(
      { nombre: 'Preparación de terreno, demoliciones o despeje', dias: 2, orden: 1 },
      { nombre: 'Ejecución de obra gruesa e instalaciones', dias: 5, orden: 2 },
      { nombre: 'Terminaciones, revestimientos y aseo final', dias: 4, orden: 3 },
      { nombre: 'Inspección de calidad y recepción con cliente', dias: 1, orden: 4 }
    );
  }

  // Radar Proveedores
  radar.push(
    {
      tienda: 'Imperial Barracas',
      categoria_destacada: 'Maderas, Tableros OSB, Volcanita y Tejas',
      nivel_precio: 'mas_barato',
      descuentos_disponibles: 'Hasta 22% de descuento en tableros y maderas dimensionadas',
      ahorro_estimado_total: 120000,
      ventajas: ['Dimensionado exacto', 'Madera seca garantizada', 'Despacho a obra'],
    },
    {
      tienda: 'Construmart',
      categoria_destacada: 'Cemento, Fierro, Mallas y Metalcon',
      nivel_precio: 'mas_barato',
      descuentos_disponibles: 'Precios mayoristas Patio Constructor',
      ahorro_estimado_total: 85000,
      ventajas: ['Carga rápida', 'Mejores precios de cemento por pallet'],
    },
    {
      tienda: 'Easy / Sodimac',
      categoria_destacada: 'Pisos, Porcelanatos, Grifería y Pinturas',
      nivel_precio: 'promedio',
      descuentos_disponibles: 'Descuentos Club Constructor / CMR',
      ahorro_estimado_total: 75000,
      ventajas: ['Gran catálogo de diseño', 'Stock asegurado'],
    }
  );

  tips.push(
    `💡 Comprando maderas en Imperial o barracas y cemento en Construmart/MTS ahorras aproximadamente un 18% del costo total de insumos.`,
    `💡 Para proyectos en ${comuna}, cotiza los áridos (arena y ripio) con botaderos/areneras locales en camión tolva de 6m3 para abaratar el flete.`,
    `💡 Estructura los cobros en 3 hitos: 45% anticipo para acopio de materiales, 35% a mitad de Carta Gantt y 20% contra entrega conforme.`
  );

  // Cálculos financieros
  const costoMateriales = materiales.reduce((sum, item) => sum + item.subtotal, 0);
  const costoManoObra = manoObra.reduce((sum, item) => sum + item.subtotal, 0);
  const costoDirecto = costoMateriales + costoManoObra;
  const gastosGeneralesMonto = Math.round(costoDirecto * 0.1);
  const imprevistosMonto = Math.round(costoDirecto * 0.05);
  const baseCostos = costoDirecto + gastosGeneralesMonto + imprevistosMonto;
  const margenMonto = Math.round(baseCostos * (margenPct / 100));
  const precioNeto = baseCostos + margenMonto;
  const iva19 = Math.round(precioNeto * 0.19);
  const precioTotalConIva = precioNeto + iva19;
  const totalAhorro = materiales.reduce((sum, item) => sum + (item.ahorro_estimado || 0), 0);

  return {
    id: 'cot-' + Date.now(),
    titulo_proyecto: titulo,
    tipo_obra: tipoDetectado,
    metros_cuadrados: superficie,
    comuna_region: comuna,
    duracion_dias_estimada: duracionDias,
    resumen_ejecutivo: `Estimación técnica y presupuesto detallado para ${titulo.toLowerCase()} en ${comuna}. Incluye cubicación de insumos con radar de proveedores más económicos en Chile y cuadrilla de trabajo calculada por jornales.`,
    materiales,
    mano_de_obra: manoObra,
    estructura_financiera: {
      costo_materiales_total: costoMateriales,
      costo_mano_obra_total: costoManoObra,
      costo_directo: costoDirecto,
      gastos_generales_porcentaje: 10,
      gastos_generales_monto: gastosGeneralesMonto,
      imprevistos_porcentaje: 5,
      imprevistos_monto: imprevistosMonto,
      margen_utilidad_porcentaje: margenPct,
      margen_utilidad_monto: margenMonto,
      precio_sugerido_neto: precioNeto,
      iva_19: iva19,
      precio_total_con_iva: precioTotalConIva,
      ahorro_compras_estrategicas: totalAhorro,
    },
    radar_proveedores: radar,
    actividades_gantt: gantt,
    consejos_experto_pyme: tips,
    fecha_creacion: new Date().toISOString(),
  };
}
