import { NextRequest, NextResponse } from 'next/server';
import { errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { requireSupabaseAdmin } from '@/lib/supabase/admin';
import { createFlowGateway, getFlowConfig } from '@/lib/billing/flow';
import { extractFlowToken } from '@/lib/billing/http';
import { handleFlowPaymentCallback } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const token = await extractFlowToken(request);
    if (!token) {
      throw new AIError('BILLING_TOKEN_MISSING', 'Token de notificación faltante.', 400);
    }

    const config = getFlowConfig(request.nextUrl.origin);
    const flow = createFlowGateway(config);
    const admin = requireSupabaseAdmin();

    const result = await handleFlowPaymentCallback({ admin, flow, token });
    return NextResponse.json(result);
  } catch (error) {
    return errorJSON(error);
  }
}
