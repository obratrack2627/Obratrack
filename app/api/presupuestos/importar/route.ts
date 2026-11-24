import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { withAIRequest } from '@/lib/ai/usage';
import { importBudgetFile, type ImportIvaPreference } from '@/lib/quotes/import-file';

export const dynamic = 'force-dynamic';

async function handleImport(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    if (!['admin', 'supervisor'].includes(user.rol)) {
      throw new AIError('BUDGET_FORBIDDEN', 'Tu perfil no tiene acceso a los presupuestos.', 403);
    }

    if (Number(request.headers.get('content-length')) > 3_500_000) {
      throw new AIError('BUDGET_IMPORT_INPUT', 'El archivo supera el límite de 3 MB.', 413);
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get('archivo');
    if (!file || typeof file === 'string') {
      throw new AIError('BUDGET_IMPORT_INPUT', 'Selecciona un archivo de presupuesto (PDF, Excel, CSV o foto).', 422);
    }
    if (file.size > 3 * 1024 * 1024) {
      throw new AIError('BUDGET_IMPORT_INPUT', 'El archivo supera el límite de 3 MB.', 413);
    }

    const rawIva = form?.get('tratamiento_iva');
    const ivaPreference: ImportIvaPreference =
      rawIva === 'incluido' || rawIva === 'neto' ? rawIva : 'auto';

    let fallbackTitle = typeof form?.get('titulo_obra') === 'string' ? String(form.get('titulo_obra')).trim() : '';
    let fallbackClient = typeof form?.get('cliente_nombre') === 'string' ? String(form.get('cliente_nombre')).trim() : '';
    let fallbackLocation = typeof form?.get('ubicacion') === 'string' ? String(form.get('ubicacion')).trim() : '';

    const projectId = typeof form?.get('proyecto_id') === 'string' ? String(form.get('proyecto_id')).trim() : '';
    if (projectId) {
      const { data: project } = await client
        .from('proyectos')
        .select('nombre, comuna, direccion, cliente_id')
        .eq('empresa_id', user.empresa_id)
        .eq('id', projectId)
        .maybeSingle();

      if (project) {
        if (!fallbackTitle && project.nombre) fallbackTitle = project.nombre;
        if (!fallbackLocation && (project.comuna || project.direccion)) {
          fallbackLocation = [project.direccion, project.comuna].filter(Boolean).join(', ');
        }
        if (!fallbackClient && project.cliente_id) {
          const { data: cliente } = await client
            .from('clientes')
            .select('nombre')
            .eq('empresa_id', user.empresa_id)
            .eq('id', project.cliente_id)
            .maybeSingle();
          if (cliente?.nombre) fallbackClient = cliente.nombre;
        }
      }
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await importBudgetFile({
      bytes,
      filename: file.name || 'presupuesto',
      mime: file.type || '',
      ivaPreference,
      fallbackTitle,
      fallbackClient,
      fallbackLocation,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return errorJSON(error);
  }
}

export const POST = withAIRequest(handleImport);
