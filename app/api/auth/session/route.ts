import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const { user } = await authorizeAI(request);
    const token = request.headers.get('authorization')?.trim().split(/\s+/)[1];
    if (!token) return NextResponse.json({ error: 'Falta la sesión.' }, { status: 401 });
    const response = NextResponse.json({ user: { id: user.id, rol: user.rol, is_dev: user.is_dev === true } });
    response.cookies.set('obratrack_auth_token', token, {
      httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 3600,
    });
    return response;
  } catch (error) { return errorJSON(error); }
}
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('obratrack_auth_token', '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
