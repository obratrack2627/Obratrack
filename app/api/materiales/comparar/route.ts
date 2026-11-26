import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { compareMaterialPricesEnriched } from '@/lib/materials/enriched';
import type { HistoricalMaterialRecord, HistoricalProjectRecord } from '@/lib/materials/history';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
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

    let projects: Array<HistoricalProjectRecord & { latitud?: number; longitud?: number }> = [];
    let materials: HistoricalMaterialRecord[] = [];
    try {
      const { data: projectRows } = await client
        .from('proyectos')
        .select('id,nombre,comuna,region,latitud,longitud')
        .eq('empresa_id', user.empresa_id)
        .limit(80);
      if (Array.isArray(projectRows)) {
        projects = projectRows;
        const projectIds = projectRows.map((p: any) => p.id).filter(Boolean);
        if (projectIds.length > 0) {
          const { data: matRows } = await client
            .from('materiales_proyecto')
            .select('proyecto_id,nombre,cantidad,unidad,precio_unitario,proveedor,comprado,created_at')
            .in('proyecto_id', projectIds)
            .gt('precio_unitario', 0)
            .order('created_at', { ascending: false })
            .limit(250);
          if (Array.isArray(matRows)) materials = matRows;
        }
      }
    } catch {
      // Un fallo al leer historial o coordenadas locales no debe bloquear los catálogos en línea.
    }

    const activeProject = body?.proyecto_id
      ? projects.find((p) => p.id === body.proyecto_id)
      : undefined;
    const ubicacion =
      body?.ubicacion ||
      [activeProject?.comuna, activeProject?.region].filter(Boolean).join(', ') ||
      undefined;
    const latitud = typeof body?.latitud === 'number' ? body.latitud : activeProject?.latitud;
    const longitud = typeof body?.longitud === 'number' ? body.longitud : activeProject?.longitud;

    const comparacion = await compareMaterialPricesEnriched(
      {
        producto: body?.producto,
        marca: body?.marca,
        modelo: body?.modelo,
        presentacion: body?.presentacion,
        cantidad: body?.cantidad,
        unidad_cantidad: body?.unidad_cantidad,
        ubicacion,
        latitud,
        longitud,
        radio_km: body?.radio_km,
        tiendas: body?.tiendas,
      },
      {
        materials,
        projects,
        comuna: activeProject?.comuna,
        region: activeProject?.region,
      },
    );

    return NextResponse.json({ comparacion });
  } catch (error) {
    return errorJSON(error);
  }
}
