import { NextRequest, NextResponse } from 'next/server';
import { errorJSON } from '@/lib/ai/server';
import { requireSupabaseAdmin } from '@/lib/supabase/admin';
import { createFlowGateway, getFlowConfig, isFlowConfigured } from '@/lib/billing/flow';
import { resolveBillingActor } from '@/lib/billing/http';
import { cancelCompanySubscription } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveBillingActor(request);
    const admin = requireSupabaseAdmin();
    const flow = isFlowConfigured()
      ? createFlowGateway(getFlowConfig(request.nextUrl.origin))
      : null;

    const suscripcion = await cancelCompanySubscription({ admin, flow, actor });
    return NextResponse.json({ success: true, suscripcion });
  } catch (error) {
    return errorJSON(error);
  }
}
