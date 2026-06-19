import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { RECOVERY_ASSISTANT_PROMPT } from '@/lib/prompts';
import {
  isReportComplete,
  extractedReportToItem,
  findConfidentMatches,
  buildMatchMessage,
  oppositeType,
} from '@/lib/orchestration';
import { localExtract } from '@/lib/localIntake';
import { verifyToken } from '@/lib/jwt';
import { v4 as uuidv4 } from 'uuid';
import { MatchResult, Message } from '@/types';
import { runVisualVerification, runVisualExtraction } from '@/lib/visualAgent';
import { calculateMatchScore, filterConfidentMatches } from '@/lib/matching';

type ChatMessage = { role: string; content: string };

// Helpful template when LLMs are completely unavailable.
const PLEASE_ADD_DETAILS =
  "I'm here to help you report a lost or found item. Could you tell me a bit more — what the item is, its color or brand, and where it was?";

/** Gemini API chat completion — primary AI brain. Fast timeout. */
async function callGeminiApi(messages: ChatMessage[], systemPrompt: string): Promise<string> {
  let key = process.env.GEMINI_API_KEY;
  if (!key || key === 'undefined' || key === 'null' || !key.startsWith('AIzaSy')) {
    key = 'AIzaSyAvQXYUJ2LQRMLg493TL49bEAhL7Af5bhM';
  }
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const contents: { role: string; parts: { text: string }[] }[] = [];
  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const text = (msg.content || '').trim();
    if (!text) continue; // Skip empty messages to prevent Gemini API validation errors

    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n' + text;
    } else {
      contents.push({
        role,
        parts: [{ text }]
      });
    }
  }

  // Gemini API requires the conversation history to start with a "user" message.
  // If the first message is from "model" (assistant), remove it to prevent 400 Bad Request errors.
  if (contents.length > 0 && contents[0].role === 'model') {
    contents.shift();
  }

  // If contents is empty, add a default user message to satisfy Gemini API requirements
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        }
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`gemini api ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('gemini empty response');
    }
    return content.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

/** NVIDIA chat completion — secondary fallback AI brain. Fast timeout. */
async function callNvidia(messages: ChatMessage[], systemPrompt: string): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_MODEL || 'minimaxai/minimax-m3';
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';

  if (!key) throw new Error('no nvidia key');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`nvidia ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('nvidia empty');
    return content.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Try Gemini first, fallback to NVIDIA, then to a static/structured template. Never throws or hangs. */
async function callBrain(messages: ChatMessage[], systemPrompt: string, fallbackText: string): Promise<string> {
  try {
    return await callGeminiApi(messages, systemPrompt);
  } catch (err) {
    console.error('Gemini call failed, trying NVIDIA:', err);
    try {
      return await callNvidia(messages, systemPrompt);
    } catch (nvdErr) {
      console.error('NVIDIA call also failed:', nvdErr);
    }
  }
  return fallbackText;
}

/**
 * Generates an offline fallback response by analyzing the partially extracted details.
 * Ensures the assistant guides the user through missing fields step-by-step, even when
 * the underlying LLM APIs are offline or rate-limited.
 */
function buildOfflineFallbackText(report: any): string {
  const missing: string[] = [];
  if (!report.item_name) missing.push("what the item is");
  if (!report.type) missing.push("whether you lost or found it");
  if (!report.user_name) missing.push("your Name");
  if (!report.user_phone) missing.push("your Phone number");
  if (!report.student_id && !report.user_email) missing.push("your Student ID or Email");

  // Also check if we have name and type but no other details (color, location, brand)
  const hasDetail =
    (typeof report.color === 'string' && report.color.trim().length > 0) ||
    (typeof report.brand === 'string' && report.brand.trim().length > 0) ||
    (typeof report.dents === 'string' && report.dents.trim().length > 0) ||
    (typeof report.hidden_details === 'string' && report.hidden_details.trim().length > 0) ||
    (typeof report.last_seen_location === 'string' && report.last_seen_location.trim().length > 0) ||
    (typeof report.distinctive_features === 'string' && report.distinctive_features.trim().length > 0);

  if (report.item_name && !hasDetail) {
    missing.push("some more details (like its color, brand, or where you last saw it)");
  }

  if (missing.length === 0) {
    return "Thank you! I have all your details. I am currently searching the database for matches...";
  }

  if (missing.length === 1) {
    return `Got it! I have noted those details. To complete your report, could you please tell me ${missing[0]}?`;
  }

  const list = missing.slice(0, -1).join(", ") + " and " + missing[missing.length - 1];
  return `Thank you! I've noted the details. To help me register your report, could you please provide ${list}?`;
}

/**
 * A "prepared assistant reply" that we give to the AI brain so it can present
 * match results in its own empathetic words while staying grounded.
 */
function prepareMatchContext(
  matches: MatchResult[],
  opposite: 'lost' | 'found',
  reportedType: 'lost' | 'found',
  itemName?: string
): string {
  const kind = reportedType.toUpperCase();
  const what = itemName && itemName.trim() ? ` for your ${itemName}` : '';
  const loggedLine = `✅ I've logged your ${kind} report${what}.`;

  if (!matches || matches.length === 0) {
    return (
      `${loggedLine}\n\n` +
      `I searched all current ${opposite} reports, but there's no match yet. ` +
      `I'll keep watching and let you know the moment one appears.`
    );
  }

  const header = `${loggedLine}\n\nGreat news — I also found ${matches.length === 1 ? 'a possible match' : `${matches.length} possible matches`} among our current ${opposite} reports.`;
  const tableHeader = '| Image | Item | Location | Match Score | Contact Details | Why it matches |\n| --- | --- | --- | --- | --- | --- |';
  const rows = matches.slice(0, 3).map(m => {
    const imgStr = m.item?.imageUrl ? `![match](${m.item.imageUrl})` : 'No Image';
    const name = m.item?.itemName || 'Unnamed item';
    const loc = m.item?.location || 'Not specified';
    const reason = m.reasoning?.replace(/\|/g, '\\|').replace(/\n/g, ' ') || 'Several details line up.';
    const contactInfo = [
      m.item?.userName ? `Name: ${m.item.userName}` : '',
      m.item?.userPhone ? `Phone: ${m.item.userPhone}` : '',
      m.item?.userEmail ? `Email: ${m.item.userEmail}` : '',
    ].filter(Boolean).join(', ') || 'N/A';
    const contact = contactInfo.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
    return `| ${imgStr} | ${name} | ${loc} | ${m.match_score}% | ${contact} | ${reason} |`;
  });
  const facts = [header, '', tableHeader, ...rows, ''].join('\n');
  return `${facts}\nPlease review these carefully. I'll keep these matches connected while you confirm details.`;
}

export async function POST(request: Request) {
  let body: { messages?: ChatMessage[]; sessionId?: string; imageUrl?: string } = {};
  try {
    body = (await request.json()) || {};
  } catch {
    body = {};
  }
  const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
  const userTexts = messages.filter((m) => m.role === 'user').map((m) => m.content || '');
  const sessionId = body.sessionId;

  try {
    // Resolve sessionImageUrl
    let sessionImageUrl = body.imageUrl;
    if (sessionId) {
      if (sessionImageUrl) {
        store.updateChatSessionImageUrl(sessionId, sessionImageUrl);
      } else {
        const sess = store.getChatSessionById(sessionId);
        if (sess && sess.imageUrl) {
          sessionImageUrl = sess.imageUrl;
        }
      }
    }

    // 1. Detect what we have so far (offline extraction)
    const report = localExtract(userTexts);

    // Call visual extraction agent if image is available to populate attributes automatically
    if (sessionImageUrl) {
      const visualDetails = await runVisualExtraction(sessionImageUrl);
      if (visualDetails) {
        if (!report.item_name) report.item_name = visualDetails.item_name;
        if (!report.item_category) report.item_category = visualDetails.item_category;
        if (!report.color) report.color = visualDetails.color;
        if (!report.brand) report.brand = visualDetails.brand;
        if (!report.distinctive_features) report.distinctive_features = visualDetails.distinctive_features;
      }
    }

    // Pre-populate user info from authenticated user session to resolve repetitive inquiries loop
    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      if (decoded && typeof decoded.userId === 'string') {
        userId = decoded.userId;
        const user = store.getUserById(decoded.userId);
        if (user) {
          if (!report.user_name) report.user_name = user.name;
          if (!report.user_phone) report.user_phone = user.phone;
          if (!report.user_email) report.user_email = user.email;
          if (!report.student_id && user.studentId) report.student_id = user.studentId;
        }
      }
    }

    // Persist incoming user message if sessionId is provided
    if (sessionId && userTexts.length > 0) {
      const lastUserText = userTexts[userTexts.length - 1];
      const existingMsgs = store.getMessagesBySessionId(sessionId);
      const isAlreadySaved = existingMsgs.some(m => m.role === 'user' && m.content === lastUserText);
      if (!isAlreadySaved) {
        store.addMessage({
          id: uuidv4(),
          sessionId,
          role: 'user',
          content: lastUserText,
          createdAt: new Date().toISOString()
        });
      }
    }

    // 2. If enough detail to log, log it and run matching.
    let matches: MatchResult[] = [];
    let loggedItem: any = null;
    let opposite: 'lost' | 'found' = 'lost'; // default



    if (isReportComplete(report)) {
      loggedItem = extractedReportToItem(report);
      // Link the reported item to the authenticated user if logged in
      if (userId) {
        loggedItem.userId = userId;
      }
      if (sessionImageUrl) {
        loggedItem.imageUrl = sessionImageUrl;
      }
      if (loggedItem.type === 'lost') store.addLostItem(loggedItem);
      else store.addFoundItem(loggedItem);

      opposite = oppositeType(loggedItem.type);
      const oppositeItems = loggedItem.type === 'lost' ? store.getFoundItems() : store.getLostItems();
      const initialMatches = findConfidentMatches(loggedItem, oppositeItems);

      const refinedScored: MatchResult[] = [];
      for (const m of initialMatches) {
        if (loggedItem.imageUrl && m.item.imageUrl) {
          const visualResult = await runVisualVerification(loggedItem, m.item);
          if (visualResult !== null) {
            const refined = calculateMatchScore(loggedItem, m.item, visualResult.score, visualResult.explanation);
            refinedScored.push(refined);
            continue;
          }
        }
        refinedScored.push(m);
      }
      matches = filterConfidentMatches(refinedScored);
    }

    // 3. Let the AI brain craft the reply, but give it the grounded match context.
    const context = loggedItem
      ? prepareMatchContext(matches, opposite, loggedItem.type, loggedItem.itemName)
      : undefined;
    const systemPrompt = context
      ? `${RECOVERY_ASSISTANT_PROMPT}\n\nCRITICAL DIRECTIVE: You MUST display the matches table exactly as provided in the grounded facts below. The user needs to see the table directly in their chat box. Do not summarize the matches or say you will reach out to them later instead of showing the table. Print the table exactly as it is formatted:\n\n${context}\n\nNow reply warmly, rendering the matches table in your response.`
      : RECOVERY_ASSISTANT_PROMPT;

    const fallbackText = context || buildOfflineFallbackText(report);
    let aiReply = await callBrain(messages, systemPrompt, fallbackText);

    if (loggedItem) {
      const matchMsg = buildMatchMessage(matches, opposite, loggedItem.type, loggedItem.itemName);
      if (!aiReply.includes('|') || !aiReply.includes('Match Score')) {
        aiReply = `${aiReply}\n\n${matchMsg}`;
      }
    }

    // Persist outgoing assistant message if sessionId is provided
    if (sessionId) {
      store.addMessage({
        id: uuidv4(),
        sessionId,
        role: 'assistant',
        content: aiReply,
        createdAt: new Date().toISOString()
      });
    }

    return NextResponse.json({
      choices: [{ message: { content: aiReply } }],
      meta: {
        reportLogged: loggedItem != null,
        itemId: loggedItem?.id,
        matches,
      },
    });
  } catch (err) {
    console.error('Chat error:', err);
    // Still respond — try to use dynamic offline fallback so user gets a smart response.
    let fallback = PLEASE_ADD_DETAILS;
    try {
      const report = localExtract(userTexts);
      fallback = buildOfflineFallbackText(report);
    } catch {}
    
    if (sessionId) {
      store.addMessage({
        id: uuidv4(),
        sessionId,
        role: 'assistant',
        content: fallback,
        createdAt: new Date().toISOString()
      });
    }

    return NextResponse.json({
      choices: [{ message: { content: fallback } }],
      meta: { reportLogged: false, matches: [] },
    });
  }
}
