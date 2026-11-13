import { NextRequest, NextResponse } from 'next/server';
import { errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { requireSupabaseAdmin } from '@/lib/supabase/admin';
import { createFlowGateway, getFlowConfig } from '@/lib/billing/flow';
import { resolveBillingActor } from '@/lib/billing/http';
import { createBillingCheckout } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveBillingActor(request);
    let body: { planId?: unknown; ciclo?: unknown; modalidad?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new AIError('INVALID_REQUEST', 'Solicitud de pago inválida.', 400);
    }

    const config = getFlowConfig(request.nextUrl.origin);
    const flow = createFlowGateway(config);
    const admin = requireSupabaseAdmin();

    const result = await createBillingCheckout({
      admin,
      flow,
      appUrl: config.appUrl,
      actor,
      input: {
        planId: body.planId as any,
        ciclo: body.ciclo as any,
        modalidad: body.modalidad as any,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorJSON(error);
  }
}
