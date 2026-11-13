import { NextRequest, NextResponse } from 'next/server';
import { errorJSON } from '@/lib/ai/server';
import { requireSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveBillingActor } from '@/lib/billing/http';
import { getCompanyBillingStatus } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveBillingActor(request);
    const admin = requireSupabaseAdmin();
    const summary = await getCompanyBillingStatus({ admin, actor });
    return NextResponse.json(summary, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return errorJSON(error);
  }
}
