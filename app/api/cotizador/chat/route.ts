import { createChatHandler } from "@/lib/ai/server";
import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const chat = createChatHandler();
// Next pasa el contexto de la ruta como segundo argumento, incluso sin [id].
export async function POST(request: NextRequest) {
  return chat(request);
}
