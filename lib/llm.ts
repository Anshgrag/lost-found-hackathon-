type ChatMessage = { role: string; content: string };

export async function callGeminiApi(messages: ChatMessage[], systemPrompt: string): Promise<string> {
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
    if (!text) continue;

    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n' + text;
    } else {
      contents.push({
        role,
        parts: [{ text }]
      });
    }
  }

  if (contents.length > 0 && contents[0].role === 'model') {
    contents.shift();
  }

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
          temperature: 0.2,
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

export async function callNvidia(messages: ChatMessage[], systemPrompt: string): Promise<string> {
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
        temperature: 0.2,
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

export async function callBrain(messages: ChatMessage[], systemPrompt: string, fallbackText: string): Promise<string> {
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
