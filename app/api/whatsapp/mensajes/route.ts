import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const { data, error } = await client
      .from("whatsapp_mensajes")
      .select("message_id,texto,respuesta,cotizacion,created_at")
      .eq("empresa_id", user.empresa_id)
      .eq("actor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error)
      return NextResponse.json(
        { error: "La bandeja de WhatsApp está pendiente de habilitar." },
        { status: 503 },
      );
    return NextResponse.json({ mensajes: data });
  } catch (error) {
    return errorJSON(error);
  }
}
