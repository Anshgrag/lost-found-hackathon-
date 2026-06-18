import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { verifyToken } from '@/lib/jwt';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession } from '@/types';

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

    const sessions = store.getChatSessionsByUserId(userId);
    return NextResponse.json({ sessions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title } = await request.json();
    const newSession: ChatSession = {
      id: uuidv4(),
      userId,
      title: title || 'New Recovery Chat',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.addChatSession(newSession);
    return NextResponse.json({ session: newSession });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
