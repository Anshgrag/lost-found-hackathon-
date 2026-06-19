import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { calculateMatchScore, filterConfidentMatches } from '@/lib/matching';
import { runVisualVerification } from '@/lib/visualAgent';

export async function POST(request: Request) {
  const newItem = await request.json();
  const searchIn = newItem.type === 'lost' ? store.getFoundItems() : store.getLostItems();

  const initialMatches = searchIn.map(existingItem => calculateMatchScore(newItem, existingItem));
  const confidentInitial = filterConfidentMatches(initialMatches);

  const refinedScored: any[] = [];
  for (const m of confidentInitial) {
    if (newItem.imageUrl && m.item.imageUrl) {
      const visualResult = await runVisualVerification(newItem, m.item);
      if (visualResult !== null) {
        const refined = calculateMatchScore(newItem, m.item, visualResult.score, visualResult.explanation);
        refinedScored.push(refined);
        continue;
      }
    }
    refinedScored.push(m);
  }

  const matches = filterConfidentMatches(refinedScored).slice(0, 5);

  return NextResponse.json({ matches });
}
