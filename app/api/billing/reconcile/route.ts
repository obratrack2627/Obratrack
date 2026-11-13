import { NextRequest, NextResponse } from 'next/server';
import { errorJSON } from '@/lib/ai/server';
import { requireSupabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedCronSecret } from '@/lib/billing/http';
import { reconcileExpiredSubscriptions } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

async function runReconcile(request: NextRequest) {
  if (!isAuthorizedCronSecret(request)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  try {
    const admin = requireSupabaseAdmin();
    const result = await reconcileExpiredSubscriptions(admin);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorJSON(error);
  }
}

export async function GET(request: NextRequest) {
  return runReconcile(request);
}

export async function POST(request: NextRequest) {
  return runReconcile(request);
}
