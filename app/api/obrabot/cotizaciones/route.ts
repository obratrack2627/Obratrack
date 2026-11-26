import { NextRequest, NextResponse } from 'next/server';
import { errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { authorizeQuoteWeb } from '@/lib/obrabot/web';
import { handleQuoteTurn, listQuotes } from '@/lib/obrabot/quotes';
import { withAIRequest } from '@/lib/ai/usage';
import { excelMime } from '@/lib/obrabot/quote-files';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { actor, db, plan } = await authorizeQuoteWeb(request);
    const [solicitudes, aprobadas] = await Promise.all([listQuotes(db, actor), listQuotes(db, actor, 'aprobada')]);
    return NextResponse.json({ solicitudes, aprobadas, permiteVincular: plan === 'pro_ia' }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorJSON(error); }
}

async function submitQuote(request: NextRequest) {
  try {
    const { actor, db, plan } = await authorizeQuoteWeb(request, { allowSupervisor: true });
    if (Number(request.headers.get('content-length')) > 3200000) throw new AIError('OBRABOT_QUOTE_INPUT', 'El archivo de cotización supera los 3 MB.', 413);
    const form = await request.formData().catch(() => null);
    const message = form?.get('mensaje');
    const requestId = form?.get('solicitud');
    const file = form?.get('archivo');
    const rawIva = form?.get('tratamiento_iva');
    const rawCliente = form?.get('cliente_nombre');
    const rawComuna = form?.get('comuna_region');
    const rawMostrarFecha = form?.get('mostrar_fecha');
    const rawValidez = form?.get('fecha_validez');
    const rawAutoAprobar = form?.get('auto_aprobar');
    const tratamientoIva = rawIva === 'neto' ? 'neto' : rawIva === 'incluido' ? 'incluido' : undefined;
    if (typeof message !== 'string' || !message.trim() || message.length > 32000 || typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100 || (file && (typeof file === 'string' || file.size > 3000000))) {
      throw new AIError('OBRABOT_QUOTE_INPUT', 'Revisa el mensaje y adjunta solo un Excel, PDF o foto de hasta 3 MB.', 422);
    }
    const source = file && typeof file !== 'string' ? {
      bytes: Buffer.from(await file.arrayBuffer()),
      mime: /\.xlsx$/i.test(file.name) ? excelMime : file.type,
    } : undefined;
    const result = await handleQuoteTurn(db, actor, 'plataforma', message, requestId, source, {
      permiteVincular: plan === 'pro_ia',
      tratamientoIva,
      clienteNombre: typeof rawCliente === 'string' ? rawCliente.trim().slice(0, 300) || undefined : undefined,
      comunaRegion: typeof rawComuna === 'string' ? rawComuna.trim().slice(0, 300) || undefined : undefined,
      mostrarFecha: rawMostrarFecha === 'false' ? false : undefined,
      fechaValidez: typeof rawValidez === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawValidez.trim()) ? rawValidez.trim() : undefined,
      autoAprobar: rawAutoAprobar === 'true',
    });
    if (!result) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica una acción de cotización.', 422);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorJSON(error); }
}

export const POST = withAIRequest(submitQuote);
