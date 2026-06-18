import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { calculateMatchScore, filterConfidentMatches } from '@/lib/matching';

export async function POST(request: Request) {
  const newItem = await request.json();
  const searchIn = newItem.type === 'lost' ? store.getFoundItems() : store.getLostItems();

  const scored = searchIn.map(existingItem => calculateMatchScore(newItem, existingItem));
  const matches = filterConfidentMatches(scored).slice(0, 5);

  return NextResponse.json({ matches });
}
