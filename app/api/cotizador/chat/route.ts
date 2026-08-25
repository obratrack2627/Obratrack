import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mensaje, historial = [], contexto_cotizacion } = body;

    if (!mensaje || typeof mensaje !== 'string') {
      return NextResponse.json(
        { error: 'Debe ingresar una pregunta o mensaje.' },
        { status: 400 }
      );
    }

    const openai = getOpenAIClient();
    let respuestaTexto = '';
    let sugerencias: string[] = [];

    if (openai) {
      try {
        const systemPrompt = `Eres el Agente Experto de Costos y Obras de ObraTrack. Eres el asesor de confianza del contratista y del supervisor de obra en Chile.
Tu especialidad:
- Indicar exactamente dónde comprar materiales más baratos en Chile (Sodimac Constructor, Construmart, Imperial, Ferreterías MTS / Chilemat, Easy, Barracas de madera locales, Areneras).
- Recomendar cómo abaratar costos sin perjudicar la calidad estructural (ej: alternativas de materiales, rendimientos por m2, optimización de cuadrillas).
- Ayudar al dueño a saber cuánto cobrar por m2 o por proyecto completo, definiendo márgenes justos (25% - 35%), gastos generales (10%) e imprevistos (5%).
- Dar respuestas claras, técnicas, al grano y en tono cordial chileno para la construcción.`;

        const messages: any[] = [{ role: 'system', content: systemPrompt }];

        if (contexto_cotizacion) {
          messages.push({
            role: 'system',
            content: `[CONTEXTO DE LA COTIZACIÓN ACTUAL:
Proyecto: ${contexto_cotizacion.titulo_proyecto} (${contexto_cotizacion.metros_cuadrados || 0} m2) en ${contexto_cotizacion.comuna_region || 'Chile'}.
Costo Materiales: $${contexto_cotizacion.estructura_financiera?.costo_materiales_total?.toLocaleString('es-CL')} CLP
Costo Mano de Obra: $${contexto_cotizacion.estructura_financiera?.costo_mano_obra_total?.toLocaleString('es-CL')} CLP
Precio Cobro Sugerido Neto: $${contexto_cotizacion.estructura_financiera?.precio_sugerido_neto?.toLocaleString('es-CL')} CLP
]`,
          });
        }

        if (historial.length > 0) {
          historial.forEach((h: any) => {
            messages.push({
              role: h.remitente === 'usuario' ? 'user' : 'assistant',
              content: h.texto,
            });
          });
        }

        messages.push({
          role: 'user',
          content: mensaje,
        });

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages,
          temperature: 0.5,
        });

        respuestaTexto = response.choices[0]?.message?.content || '';
      } catch (openaiError) {
        console.error('Error en chat con OpenAI:', openaiError);
      }
    }

    // Fallback inteligente de respuestas para el chat
    if (!respuestaTexto) {
      const lower = mensaje.toLowerCase();
      if (
        lower.includes('barato') ||
        lower.includes('ahorrar') ||
        lower.includes('descuento') ||
        lower.includes('tienda')
      ) {
        respuestaTexto = `Para maximizar el ahorro en tu obra en Chile, te recomiendo aplicar esta estrategia de compras por categoría:
1. **Maderas y Tableros OSB**: Cómpralos en **Imperial** o barracas madereras locales. Encontrarás madera seca calibrada hasta un 22% más barata que en Sodimac/Easy.
2. **Cemento y Fierros**: Acude a **Construmart** o a la red **MTS/Chilemat**. Si compras por pallet de 40 sacos o atados de fierro, obtendrás precio patio constructor directo.
3. **Pisos y Terminaciones**: Revisa las ofertas de **Easy o Sodimac Constructor**, especialmente en liquidaciones de stock de porcelanatos y cerámicas.
4. **Áridos**: Compra directo en arenera local con camión tolva (ahorras hasta un 30% comparado con sacos individuales).`;
        sugerencias = [
          '¿Cuánto ahorro si cambio porcelanato por piso flotante?',
          '¿Dónde comprar fierro estriado al mejor precio?',
          '¿Cómo calcular el flete de áridos a la obra?',
        ];
      } else if (
        lower.includes('cobrar') ||
        lower.includes('precio') ||
        lower.includes('margen') ||
        lower.includes('ganancia')
      ) {
        respuestaTexto = `Para calcular el precio a cobrar al cliente en Chile, la fórmula recomendada para una PYME constructora es:
- **Costo Directo** = Materiales + Mano de Obra (Jornales de maestros $40.000-$45.000 y ayudantes $28.000).
- **Gastos Generales** = 10% del Costo Directo (bencina, desgaste de herramientas, traslados, colaciones).
- **Fondo de Imprevistos** = 5% para cubrir errores o alzas menores.
- **Margen de Utilidad** = 25% a 35% neto para tu empresa.
- **IVA (19%)** = Se agrega si emites factura electrónica al cliente.

Con esta estructura aseguras que tu empresa siempre gane y no termines poniendo dinero de tu bolsillo si surge un contratiempo.`;
        sugerencias = [
          '¿Cuánto debería cobrar por m2 de radier?',
          '¿Qué porcentaje de anticipo es seguro pedir?',
          '¿Cómo cobrar los imprevistos que pide el cliente?',
        ];
      } else {
        respuestaTexto = `Excelente consulta. Como regla general para obras en Chile, te recomiendo siempre asegurar los materiales críticos de obra gruesa (cemento, fierro y madera estructural) en distribuidores mayoristas como Construmart e Imperial. Para la mano de obra, considera un rendimiento promedio de 1 maestro + 1 ayudante para avanzar 10-15 m² de obra gruesa por semana.`;
        sugerencias = [
          '¿Dónde están los materiales más baratos?',
          '¿Cómo optimizo el presupuesto de este proyecto?',
          '¿Cuánto cobrar si el cliente pone los materiales?',
        ];
      }
    }

    return NextResponse.json({
      respuesta: respuestaTexto,
      sugerencias:
        sugerencias.length > 0
          ? sugerencias
          : [
              '¿Dónde comprar materiales más baratos en Chile?',
              '¿Cuánto cobrar por mano de obra?',
              '¿Cómo mejorar el margen de ganancia de esta obra?',
            ],
    });
  } catch (error: any) {
    console.error('Error en chat cotizador:', error);
    return NextResponse.json(
      { error: error.message || 'Error en el asistente' },
      { status: 500 }
    );
  }
}
