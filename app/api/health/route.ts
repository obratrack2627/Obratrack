import { NextResponse } from "next/server";
import { serverFetch } from "@/lib/server-fetch";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
let cached: { at: number; checks: Record<string, boolean> } | undefined;
export async function GET() {
  if (!cached || Date.now() - cached.at > 30000) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const probe = async (path: string, token: string) => {
      if (!url || !token) return false;
      try {
        return (
          await serverFetch(url + path, {
            headers: { apikey: token, Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(12000),
            cache: "no-store",
          })
        ).ok;
      } catch {
        return false;
      }
    };
    const [database, auth, photos, documents] = await Promise.all([
      probe(
        "/rest/v1/proyectos?select=finalizada_automaticamente&limit=0",
        key,
      ),
      probe("/auth/v1/health", anon),
      probe("/storage/v1/bucket/bitacora-fotos", key),
      probe("/storage/v1/bucket/documentos-obra", key),
    ]);
    cached = {
      at: Date.now(),
      checks: { database, auth, storage: photos && documents },
    };
  }
  const ok = Object.values(cached.checks).every(Boolean);
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      checks: cached.checks,
      checked_at: new Date(cached.at).toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
