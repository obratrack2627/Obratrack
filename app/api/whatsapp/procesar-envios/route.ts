import { NextRequest, NextResponse } from "next/server";
import {
  processOutbox,
  whatsappAdmin,
  validDispatchSignature,
} from "@/lib/whatsapp/outbox";
import { errorJSON } from "@/lib/ai/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const expected = process.env.WHATSAPP_DISPATCH_SECRET;
  const at = request.headers.get("x-obratrack-dispatch-at") || "";
  const signature = request.headers.get("x-obratrack-dispatch-signature") || "";
  if (!validDispatchSignature(at, signature, expected || ""))
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    return NextResponse.json(await processOutbox(whatsappAdmin()));
  } catch (error) {
    return errorJSON(error);
  }
}
