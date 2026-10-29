import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { getAvisoTemplate, ensureAvisoTemplate } from "@/lib/whatsapp/outbox";
export const dynamic = "force-dynamic";
async function access(req: NextRequest) {
  const { user } = await authorizeAI(req);
  if (user.rol !== "admin")
    throw new AIError(
      "ROLE_FORBIDDEN",
      "Solo administración puede configurar los avisos.",
      403,
    );
}
export async function GET(req: NextRequest) {
  try {
    await access(req);
    return NextResponse.json(await getAvisoTemplate());
  } catch (e) {
    return errorJSON(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    await access(req);
    return NextResponse.json(await ensureAvisoTemplate());
  } catch (e) {
    return errorJSON(e);
  }
}
