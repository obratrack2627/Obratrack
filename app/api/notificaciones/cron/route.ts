import { NextRequest, NextResponse } from "next/server";
import { errorJSON } from "@/lib/ai/server";
import { isAuthorizedCronSecret } from "@/lib/billing/http";
import { requireSupabaseAdmin } from "@/lib/supabase/admin";
import { runScheduledPushReminders } from "@/lib/push/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function runReminders(request: NextRequest) {
  if (!isAuthorizedCronSecret(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const admin = requireSupabaseAdmin();
    const result = await runScheduledPushReminders(admin);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorJSON(error);
  }
}

export async function GET(request: NextRequest) {
  return runReminders(request);
}

export async function POST(request: NextRequest) {
  return runReminders(request);
}
