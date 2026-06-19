import fs from 'fs';
import path from 'path';

export interface VisualMatchResult {
  score: number;
  explanation: string;
}

export async function runVisualVerification(
  itemA: { itemName?: string; description?: string; imageUrl?: string },
  itemB: { itemName?: string; description?: string; imageUrl?: string }
): Promise<VisualMatchResult | null> {
  if (!itemA.imageUrl || !itemB.imageUrl) return null;

  try {
    const resolvePath = (url: string) => {
      const relative = url.startsWith('/') ? url.substring(1) : url;
      return path.join(process.cwd(), 'public', relative);
    };

    const pathA = resolvePath(itemA.imageUrl);
    const pathB = resolvePath(itemB.imageUrl);

    if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
      return null;
    }

    const dataA = fs.readFileSync(pathA).toString('base64');
    const dataB = fs.readFileSync(pathB).toString('base64');

    const mimeA = pathA.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const mimeB = pathB.endsWith('.png') ? 'image/png' : 'image/jpeg';

    let key = process.env.GEMINI_API_KEY;
    if (!key || key === 'undefined' || key === 'null' || !key.startsWith('AIzaSy')) {
      key = 'AIzaSyAvQXYUJ2LQRMLg493TL49bEAhL7Af5bhM';
    }
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const prompt = `You are a Visual Verification Agent for a lost-and-found system.
Compare the two attached images and analyze if they depict the same physical object.

Item A context: Name: "${itemA.itemName}", Description: "${itemA.description || 'No description'}"
Item B context: Name: "${itemB.itemName}", Description: "${itemB.description || 'No description'}"

Determine:
1. Do they show the same model, color, brand, and type of object?
2. Are they the same physical item?

You MUST respond ONLY with a JSON object in this format:
{
  "match": boolean,
  "score": number, // 0 to 100 matching confidence
  "explanation": "Brief explanation why they match or do not match."
}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeA,
                  data: dataA
                }
              },
              {
                inlineData: {
                  mimeType: mimeB,
                  data: dataB
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini status: ${response.status}`);
    }

    const resData = await response.json();
    const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Gemini response');

    const result = JSON.parse(text);
    return {
      score: typeof result.score === 'number' ? result.score : 0,
      explanation: result.explanation || ''
    };
  } catch (err) {
    console.error('VisualVerificationAgent error:', err);
    return null;
  }
}

export interface VisualExtractionResult {
  item_name: string | null;
  item_category: string | null;
  color: string | null;
  brand: string | null;
  distinctive_features: string | null;
}

export async function runVisualExtraction(imageUrl: string): Promise<VisualExtractionResult | null> {
  try {
    const resolvePath = (url: string) => {
      const relative = url.startsWith('/') ? url.substring(1) : url;
      return path.join(process.cwd(), 'public', relative);
    };

    const filePath = resolvePath(imageUrl);
    if (!fs.existsSync(filePath)) return null;

    const data = fs.readFileSync(filePath).toString('base64');
    const mime = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    let key = process.env.GEMINI_API_KEY;
    if (!key || key === 'undefined' || key === 'null' || !key.startsWith('AIzaSy')) {
      key = 'AIzaSyAvQXYUJ2LQRMLg493TL49bEAhL7Af5bhM';
    }
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const prompt = `You are a Visual Extraction Agent for a lost-and-found system.
Analyze the attached image and extract the following details about the item shown.

You MUST respond ONLY with a JSON object in this format (use null if you cannot determine a field, do not invent):
{
  "item_name": string or null, // e.g., "phone", "water bottle", "backpack", "keys"
  "item_category": string or null, // MUST be one of: "Electronics", "Accessories", "Documents", "Clothing", "Keys", "Stationery", "Other"
  "color": string or null, // primary color of the item
  "brand": string or null, // brand name if visible, e.g., "Apple", "Samsung", "Nike"
  "distinctive_features": string or null // details like "has a sticker on the back", "scratched screen", "red details"
}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mime,
                  data
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      })
    });

    if (!response.ok) throw new Error(`Gemini status: ${response.status}`);

    const resData = await response.json();
    const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response');

    const result = JSON.parse(text);
    return {
      item_name: result.item_name || null,
      item_category: result.item_category || null,
      color: result.color || null,
      brand: result.brand || null,
      distinctive_features: result.distinctive_features || null
    };
  } catch (err) {
    console.error('VisualExtractionAgent error:', err);
    return null;
  }
}
