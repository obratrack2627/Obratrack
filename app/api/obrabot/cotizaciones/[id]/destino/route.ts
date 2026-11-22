import { NextRequest, NextResponse } from 'next/server';
import { AIError } from '@/lib/ai/errors';
import { errorJSON } from '@/lib/ai/server';
import { authorizeQuoteWeb } from '@/lib/obrabot/web';
import { isLinkMode, quoteDestination, type CreateFields } from '@/lib/obrabot/quote-destination';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const json = (data: unknown) => NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
const invalid = () => new AIError('OBRABOT_DESTINATION_INVALID', 'Revisa la acción y los datos de la cotización.', 422);

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { actor, db } = await authorizeQuoteWeb(request);
    const { id } = await params;
    const search = request.nextUrl.searchParams;
    const proyecto = search.get('proyecto');
    const tipo = search.get('tipo');
    if (proyecto) return json(await quoteDestination(db, actor, 'plataforma', id, 'vista', { proyecto }));
    const status = await quoteDestination(db, actor, 'plataforma', id, 'estado');
    if ('modo' in status || !tipo) return json(status);
    if (tipo !== 'obras' && tipo !== 'clientes') throw invalid();
    const q = (search.get('q') ?? '').trim();
    if (q.length > 150) throw invalid();
    let query = db.from(tipo === 'obras' ? 'proyectos' : 'clientes').select('id,nombre,direccion').eq('empresa_id', actor.empresa_id);
    if (tipo === 'obras') query = query.neq('estado', 'cancelada');
    if (q) query = query.ilike('nombre', `%${q.replace(/[\\%_*]/g, '\\$&')}%`);
    const { data, error } = await query.order('nombre').order('id').limit(30);
    if (error) throw new AIError('OBRABOT_DESTINATION_DB', 'No pude buscar los registros de tu empresa.', 503);
    return json({ opciones: data });
  } catch (error) { return errorJSON(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { actor, db } = await authorizeQuoteWeb(request);
    const { id } = await params;
    const raw = await request.text();
    if (raw.length > 8000) throw invalid();
    const body = await Promise.resolve(raw).then(value => JSON.parse(value)).catch(() => null);
    if (!body || typeof body.modo !== 'string') throw invalid();
    if (body.modo === 'crear') {
      const fields: CreateFields = {};
      for (const key of ['nombre', 'direccion', 'cliente', 'telefono', 'correo'] as const) {
        if (body[key] === undefined) continue;
        if (typeof body[key] !== 'string' || body[key].length > 300) throw invalid();
        fields[key] = body[key].trim();
      }
      if (body.equipo !== undefined) {
        if (!Array.isArray(body.equipo) || body.equipo.length > 20 ||
          body.equipo.some((name: unknown) => typeof name !== 'string' || name.length > 150)) throw invalid();
        fields.equipo = body.equipo;
      }
      return json(await quoteDestination(db, actor, 'plataforma', id, 'crear', fields));
    }
    if (!isLinkMode(body.modo) || typeof body.proyecto !== 'string' || body.proyecto.length > 150 ||
      typeof body.version !== 'string' || !/^\d{1,19}$/.test(body.version) ||
      (body.cabecera !== null && (typeof body.cabecera !== 'string' || body.cabecera.length > 150))) throw invalid();
    const { proyecto, version, cabecera } = body;
    return json(await quoteDestination(db, actor, 'plataforma', id, body.modo, { proyecto, version, cabecera }));
  } catch (error) { return errorJSON(error); }
}
