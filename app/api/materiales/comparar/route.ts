import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { compareMaterialPrices } from '@/lib/materials/catalog';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { user } = await authorizeAI(request);
    if (!['admin', 'supervisor'].includes(user.rol)) {
      throw new AIError(
        'ROLE_FORBIDDEN',
        'Solo administración y supervisión pueden consultar comparativas de proveedores.',
        403
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      throw new AIError('INVALID_JSON', 'Solicitud con formato JSON inválido.', 400);
    }

    const comparacion = await compareMaterialPrices({
      producto: body?.producto,
      marca: body?.marca,
      modelo: body?.modelo,
      presentacion: body?.presentacion,
      cantidad: body?.cantidad,
      unidad_cantidad: body?.unidad_cantidad,
      tiendas: body?.tiendas,
    });

    return NextResponse.json({ comparacion });
  } catch (error) {
    return errorJSON(error);
  }
}
