import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { activateMetaWebhook, checkMetaConnection } from "@/lib/whatsapp/meta";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: NextRequest) {
  try {
    const { user } = await authorizeAI(request);
    if (!["admin", "supervisor"].includes(user.rol))
      throw new AIError(
        "ROLE_FORBIDDEN",
        "Solo administración y supervisión pueden revisar esta conexión.",
        403,
      );
    return NextResponse.json(await checkMetaConnection(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorJSON(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await authorizeAI(request);
    if (user.rol !== "admin")
      throw new AIError("ROLE_FORBIDDEN", "Solo administración puede activar la recepción de WhatsApp.", 403);
    return NextResponse.json(await activateMetaWebhook(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorJSON(error);
  }
}
