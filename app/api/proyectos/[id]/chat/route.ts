import { withAIRequest } from '@/lib/ai/usage';
import type { NextRequest } from 'next/server';
import { createChatHandler } from '@/lib/ai/server';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const chat = createChatHandler();
async function handlePOST(
  request: NextRequest,
  { params: parameters }: { params: Promise<{ id: string }> },
) {
  const params = await parameters;
  return chat(request, params.id);
}

export const POST = withAIRequest(handlePOST);
