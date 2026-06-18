import { NextResponse } from 'next/server';
import store from '@/lib/store';

export async function POST(request: Request) {
  try {
    const { itemId } = await request.json();
    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }

    const success = store.markResolved(itemId);
    if (!success) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
