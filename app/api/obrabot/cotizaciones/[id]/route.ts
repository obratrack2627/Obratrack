import { NextRequest, NextResponse } from 'next/server';
import { errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { authorizeQuoteWeb } from '@/lib/obrabot/web';
import { getApprovedQuote } from '@/lib/obrabot/quotes';
import { quoteFile } from '@/lib/obrabot/quote-files';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const format = request.nextUrl.searchParams.get('formato');
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || (format !== 'pdf' && format !== 'excel')) {
      throw new AIError('OBRABOT_QUOTE_INPUT', 'Selecciona una cotización y el formato PDF o Excel.', 422);
    }
    const { actor, db } = await authorizeQuoteWeb(request);
    const quote = await getApprovedQuote(db, actor, id);
    const file = await quoteFile(db, actor.empresa_id, quote, format);
    return new NextResponse(file.bytes, { headers: {
      'Content-Type': file.mime, 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'private, no-store',
    } });
  } catch (error) { return errorJSON(error); }
}
