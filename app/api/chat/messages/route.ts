import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { verifyToken } from '@/lib/jwt';

function getUserIdFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  return payload ? payload.userId : null;
}

export async function GET(request: Request) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const session = store.getChatSessionById(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to session' }, { status: 403 });
    }

    const messages = store.getMessagesBySessionId(sessionId);
    return NextResponse.json({ messages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
