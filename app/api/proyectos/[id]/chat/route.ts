import type { NextRequest } from 'next/server';
import { createChatHandler } from '@/lib/ai/server';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const chat = createChatHandler();
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return chat(request, params.id);
}
