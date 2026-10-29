import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { serverFetch } from "@/lib/server-fetch";
import { supabaseUrl } from "@/lib/supabase/client";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const path = request.nextUrl.searchParams.get("path") || "";
    if (
      !path.startsWith(user.empresa_id + "/") ||
      !/^[-\w]+\/[-\w]+\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(path)
    )
      throw new AIError("IMAGE_FORBIDDEN", "La foto no está disponible.", 403);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
      throw new AIError(
        "STORAGE_UNAVAILABLE",
        "No se pudo acceder a la foto.",
        503,
      );
    const admin = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: serverFetch },
      },
    );
    const { data: messages, error } = await admin
      .from("whatsapp_mensajes")
      .select("actor_id,adjunto")
      .eq("empresa_id", user.empresa_id)
      .contains("adjunto", { path })
      .limit(10);
    if (error)
      throw new AIError("IMAGE_READ", "No se pudo consultar la foto.", 503);
    let allowed =
      ["admin", "supervisor"].includes(user.rol) && Boolean(messages?.length);
    for (const m of messages || []) {
      if (m.actor_id === user.id) allowed = true;
      else if (user.rol === "terreno" && m.adjunto?.proyecto_id) {
        const { data, error } = await client
          .from("proyecto_trabajadores")
          .select("usuario_id")
          .eq("usuario_id", user.id)
          .eq("proyecto_id", m.adjunto.proyecto_id)
          .maybeSingle();
        if (!error && data) allowed = true;
      }
    }
    if (!allowed)
      throw new AIError(
        "IMAGE_FORBIDDEN",
        "Tu cuenta no tiene acceso a esta foto.",
        403,
      );
    const { data, error: storageError } = await admin.storage
      .from("whatsapp-evidencias")
      .createSignedUrl(path, 300);
    if (storageError || !data?.signedUrl)
      throw new AIError("IMAGE_READ", "No se pudo abrir la foto.", 503);
    return NextResponse.json(
      { url: data.signedUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorJSON(error);
  }
}
