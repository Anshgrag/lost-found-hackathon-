import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { normalizeItem } from '@/lib/items';

export async function GET() {
  const lost = store.getLostItems();
  const found = store.getFoundItems();
  return NextResponse.json({ lost, found });
}

export async function POST(request: Request) {
  const data = await request.json();
  const item = normalizeItem(data);

  if (item.type === 'lost') {
    store.addLostItem(item);
  } else {
    store.addFoundItem(item);
  }

  return NextResponse.json(item);
}
