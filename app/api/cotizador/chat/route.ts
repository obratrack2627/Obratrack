import { withAIRequest } from '@/lib/ai/usage';
import { createChatHandler } from "@/lib/ai/server";
import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const chat = createChatHandler();
// Next pasa el contexto de la ruta como segundo argumento, incluso sin [id].
async function handlePOST(request: NextRequest) {
  return chat(request);
}

export const POST = withAIRequest(handlePOST);
