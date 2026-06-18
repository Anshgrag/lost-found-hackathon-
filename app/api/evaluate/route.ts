import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { EVALUATION_AGENT_PROMPT } from '@/lib/prompts';
import { callBrain } from '@/lib/llm';
import { v4 as uuidv4 } from 'uuid';
import { Claim } from '@/types';

export async function POST(request: Request) {
  try {
    const { lostItemId, foundItemId, answers } = await request.json();
    if (!foundItemId || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'foundItemId and answers array are required' }, { status: 400 });
    }

    const item = store.findItemById(foundItemId);
    if (!item) {
      return NextResponse.json({ error: 'Found item not found' }, { status: 404 });
    }

    const details = {
      itemName: item.itemName,
      description: item.description,
      category: item.category,
      color: item.color,
      brand: item.brand,
      dents: item.dents,
      hiddenDetails: item.hiddenDetails,
      privateAttributes: item.privateAttributes,
    };

    const userMessage = `Compare the claimant's answers with the found item details.
Item details: ${JSON.stringify(details)}
Claimant answers: ${JSON.stringify(answers)}`;

    const fallbackEvaluation = {
      ownership_confidence: 75,
      matched_fields: ['general description'],
      mismatched_fields: [],
      recommendation: 'review'
    };

    const fallbackJSON = JSON.stringify(fallbackEvaluation);

    let responseText = await callBrain(
      [{ role: 'user', content: userMessage }],
      EVALUATION_AGENT_PROMPT,
      fallbackJSON
    );

    let evaluation = fallbackEvaluation;
    try {
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        responseText = responseText.slice(jsonStart, jsonEnd + 1);
      }
      const parsed = JSON.parse(responseText);
      evaluation = {
        ownership_confidence: typeof parsed.ownership_confidence === 'number' ? parsed.ownership_confidence : 75,
        matched_fields: Array.isArray(parsed.matched_fields) ? parsed.matched_fields : [],
        mismatched_fields: Array.isArray(parsed.mismatched_fields) ? parsed.mismatched_fields : [],
        recommendation: ['approve', 'review', 'reject'].includes(parsed.recommendation)
          ? parsed.recommendation
          : 'review',
      };
    } catch (e) {
      console.error('Failed to parse evaluation JSON:', e);
    }

    // Determine status from recommendation
    let status: 'APPROVED' | 'REJECTED' | 'PENDING' = 'PENDING';
    if (evaluation.recommendation === 'approve') {
      status = 'APPROVED';
      // Automatically mark resolved when claim is approved!
      store.markResolved(foundItemId);
      if (lostItemId) {
        store.markResolved(lostItemId);
      }
    } else if (evaluation.recommendation === 'reject') {
      status = 'REJECTED';
    }

    const claim: Claim = {
      id: uuidv4(),
      lostItemId: lostItemId || '',
      foundItemId,
      status,
      answers,
      confidenceScore: evaluation.ownership_confidence,
      evaluatorDecision: evaluation.recommendation as 'approve' | 'review' | 'reject',
      createdAt: new Date().toISOString(),
    };

    store.addClaim(claim);

    return NextResponse.json({ claim, evaluation });
  } catch (err: any) {
    console.error('Error in api/evaluate:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
