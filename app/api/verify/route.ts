import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { VERIFICATION_AGENT_PROMPT } from '@/lib/prompts';
import { callBrain } from '@/lib/llm';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    const { foundItemId } = await request.json();
    if (!foundItemId) {
      return NextResponse.json({ error: 'foundItemId is required' }, { status: 400 });
    }

    const item = store.findItemById(foundItemId);
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.type !== 'found') {
      return NextResponse.json({ error: 'Item is not a found report' }, { status: 400 });
    }

    // Check if questions already exist
    const existing = store.getVerificationQuestionsByFoundItemId(foundItemId);
    if (existing) {
      return NextResponse.json({ questions: existing.questions });
    }

    // Generate using LLM
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

    const userMessage = `Please generate verification questions for this item. Do not reveal the answers in the questions.
Item details: ${JSON.stringify(details)}`;

    const fallbackQuestions = [
      `Could you describe any unique markings, dents, or scratches on this ${item.itemName}?`,
      `Are there any specific hidden details, engravings, or contents inside this item?`,
      `What brand is the item, or can you provide other verifying characteristics?`
    ];

    const fallbackJSON = JSON.stringify({ questions: fallbackQuestions });

    let responseText = await callBrain(
      [{ role: 'user', content: userMessage }],
      VERIFICATION_AGENT_PROMPT,
      fallbackJSON
    );

    // Try parsing
    let questions: string[] = [];
    try {
      // Clean markdown code blocks if the LLM returned it wrapped in ```json
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        responseText = responseText.slice(jsonStart, jsonEnd + 1);
      }
      const parsed = JSON.parse(responseText);
      questions = Array.isArray(parsed.questions) ? parsed.questions : fallbackQuestions;
    } catch (e) {
      console.error('Failed to parse verification questions JSON:', e);
      questions = fallbackQuestions;
    }

    const vq = {
      id: uuidv4(),
      foundItemId,
      questions,
      createdAt: new Date().toISOString(),
    };

    store.addVerificationQuestions(vq);

    return NextResponse.json({ questions });
  } catch (err: any) {
    console.error('Error in api/verify:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
