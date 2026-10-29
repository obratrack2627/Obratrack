import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { checkMetaConnection } from "@/lib/whatsapp/meta";
export const dynamic = "force-dynamic";
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
