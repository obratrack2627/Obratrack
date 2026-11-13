import { NextRequest, NextResponse } from 'next/server';
import { requireSupabaseAdmin } from '@/lib/supabase/admin';
import { createFlowGateway, getFlowConfig } from '@/lib/billing/flow';
import { extractFlowToken } from '@/lib/billing/http';
import { handleFlowPaymentCallback, handleFlowRegisterReturn } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

function mapPaymentOutcome(outcome: string): string {
  if (outcome === 'paid') return 'success';
  if (outcome === 'failed') return 'failed';
  if (outcome === 'canceled') return 'canceled';
  return 'pending';
}

async function handleReturn(request: NextRequest): Promise<NextResponse> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/+$/, '');
  const kind = request.nextUrl.searchParams.get('kind') === 'register' ? 'register' : 'payment';
  const order = request.nextUrl.searchParams.get('order') || '';

  const buildRedirect = (status: string, orderCode = order) => {
    const dest = new URL('/planes', `${baseUrl}/`);
    dest.searchParams.set('billing', status);
    if (orderCode) dest.searchParams.set('order', orderCode);
    return NextResponse.redirect(dest, { status: 303 });
  };

  try {
    const token = await extractFlowToken(request);
    if (!token) return buildRedirect('canceled');

    const config = getFlowConfig(request.nextUrl.origin);
    const flow = createFlowGateway(config);
    const admin = requireSupabaseAdmin();

    if (kind === 'register') {
      const result = await handleFlowRegisterReturn({ admin, flow, token, order });
      return buildRedirect(result.outcome, result.order);
    }

    const result = await handleFlowPaymentCallback({ admin, flow, token });
    return buildRedirect(mapPaymentOutcome(result.outcome));
  } catch (error) {
    console.error('flow_return_error', {
      kind,
      message: (error as Error).message,
    });
    return buildRedirect('error');
  }
}

export async function POST(request: NextRequest) {
  return handleReturn(request);
}

export async function GET(request: NextRequest) {
  return handleReturn(request);
}
