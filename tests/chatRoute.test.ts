import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../app/api/chat/route';
import store from '../lib/store';

describe('Chat API Route', () => {
  let originalFetch: typeof fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('calls Gemini API with correct payload format and role mapping', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello! I can help you with that.' }],
            role: 'model'
          },
          finishReason: 'STOP'
        }
      ]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const requestBody = {
      messages: [
        { role: 'user', content: 'I lost a charger' },
        { role: 'assistant', content: 'What color is it?' },
        { role: 'user', content: 'It is black.' }
      ]
    };

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const resData = await response.json();
    expect(resData.choices[0].message.content).toBe('Hello! I can help you with that.');

    // Verify fetch call parameters
    expect(globalThis.fetch).toHaveBeenCalled();
    const [calledUrl, calledOptions] = (globalThis.fetch as any).mock.calls[0];
    expect(calledUrl).toContain('generativelanguage.googleapis.com');
    expect(calledUrl).toContain('key=AIzaSyAvQXYUJ2LQRMLg493TL49bEAhL7Af5bhM');

    const body = JSON.parse(calledOptions.body);
    expect(body.contents).toHaveLength(3);
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'I lost a charger' }] });
    expect(body.contents[1]).toEqual({ role: 'model', parts: [{ text: 'What color is it?' }] });
    expect(body.contents[2]).toEqual({ role: 'user', parts: [{ text: 'It is black.' }] });
    expect(body.systemInstruction.parts[0].text).toContain('lost');
  });

  it('falls back to NVIDIA if Gemini API fails', async () => {
    // Mock Gemini failing
    (globalThis.fetch as any).mockImplementation((url: string) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => 'Internal Error'
        });
      }
      // Mock NVIDIA succeeding
      if (url.includes('integrate.api.nvidia.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Nvidia response' } }]
          })
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    // We need process.env.NVIDIA_API_KEY to trigger callNvidia
    process.env.NVIDIA_API_KEY = 'mock-nvidia-key';

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test message' }] })
    });

    const response = await POST(req);
    const resData = await response.json();
    expect(resData.choices[0].message.content).toBe('Nvidia response');
  });

  it('programmatically appends the matches table to the response when report is complete', async () => {
    // Seed the store with a found item
    store.addFoundItem({
      id: 'found-item-id',
      status: 'ACTIVE',
      priority: 'NORMAL',
      itemName: 'laptop',
      brand: 'lenovo',
      location: 'Library',
      category: 'Other',
      description: 'I found a Lenovo laptop charger',
      type: 'found',
      userName: 'Anshg',
      userPhone: '909002293',
      createdAt: new Date().toISOString()
    });

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: 'I have logged your lost item report.' }],
            role: 'model'
          },
          finishReason: 'STOP'
        }
      ]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    // Complete report message containing Name, Phone, Student ID, location, brand, itemName
    const requestBody = {
      messages: [
        { role: 'user', content: 'I lost my Lenovo laptop charger near the Library. My name is Anish, ID 00994, phone number 90303923.' }
      ]
    };

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const resData = await response.json();
    const content = resData.choices[0].message.content;

    // Verify it contains the LLM response
    expect(content).toContain('I have logged your lost item report.');
    // Verify it programmatically appended the matches table with the seeded found item
    expect(content).toContain('| Item | Location | Match Score | Contact Details | Why it matches |');
    expect(content).toContain('laptop');
    expect(content).toContain('Library');
    expect(content).toContain('909002293');
  });

  it('shifts the first message if it starts with assistant role to meet Gemini user-first requirement', async () => {
    const mockResponse = {
      candidates: [{
        content: { parts: [{ text: 'Dynamic Reply' }], role: 'model' },
        finishReason: 'STOP'
      }]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const requestBody = {
      messages: [
        { role: 'assistant', content: 'Welcome! How can I help you?' },
        { role: 'user', content: 'I lost my charger' }
      ]
    };

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    await POST(req);

    // Assert that fetch was called and contents started with user role (assistant was shifted)
    expect(globalThis.fetch).toHaveBeenCalled();
    const [, calledOptions] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(calledOptions.body);
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts[0].text).toBe('I lost my charger');
  });

  it('returns dynamic offline fallback message indicating missing details when LLM calls fail', async () => {
    // Mock APIs to fail
    (globalThis.fetch as any).mockRejectedValue(new Error('API Down'));

    const requestBody = {
      messages: [
        { role: 'user', content: 'I lost a Lenovo charger near the Library.' }
      ]
    };

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const response = await POST(req);
    const resData = await response.json();
    const content = resData.choices[0].message.content;

    // Verify it contains the dynamic missing fields
    expect(content).toContain('Name');
    expect(content).toContain('Phone');
    expect(content).toContain('Student ID or Email');
    expect(content).not.toContain("what the item is"); // because itemName was charger
  });

  it('persists session imageUrl even when report is completed in a later message', async () => {
    const sessionId = 'test-session-persistent-image';
    store.addChatSession({
      id: sessionId,
      userId: 'mock-user-1',
      title: 'Active Session',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Mock Gemini API successful reply
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Logged it' }], role: 'model' } }]
      })
    });

    // Send first message with imageUrl but incomplete details
    const req1 = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'I lost a phone.' }],
        sessionId,
        imageUrl: '/uploads/persistent-image.jpeg'
      })
    });
    await POST(req1);

    // Assert imageUrl is stored in session
    const session = store.getChatSessionById(sessionId);
    expect(session?.imageUrl).toBe('/uploads/persistent-image.jpeg');

    // Send second message completing the details, without imageUrl in body
    const req2 = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'I lost a phone.' },
          { role: 'user', content: 'My name is Anish, ID 00994, phone number 90303923, color is orange.' }
        ],
        sessionId
      })
    });

    const res = await POST(req2);
    expect(res.status).toBe(200);

    const resData = await res.json();
    expect(resData.meta.reportLogged).toBe(true);

    const loggedItem = store.findItemById(resData.meta.itemId);
    expect(loggedItem?.imageUrl).toBe('/uploads/persistent-image.jpeg');
  });

  it('uses visual extraction details to complete report without asking user for them', async () => {
    const sessionId = 'test-session-visual-extract';
    store.addChatSession({
      id: sessionId,
      userId: 'mock-user-1',
      title: 'Active Session',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Mock Gemini API successful reply
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'Logged it' }],
            role: 'model'
          }
        }]
      })
    });

    const visualAgent = await import('@/lib/visualAgent');
    const mockExtract = vi.spyOn(visualAgent, 'runVisualExtraction').mockResolvedValue({
      item_name: 'backpack',
      item_category: 'Accessories',
      color: 'blue',
      brand: 'Nike',
      distinctive_features: 'Sports backpack with blue straps'
    });

    // Send a message containing only name/contact details and imageUrl
    // The visual extraction should automatically extract 'backpack', 'Accessories', 'blue', 'Nike'
    // Making the report complete in just one step!
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'I found this. My name is Anish, ID 00994, phone number 90303923.' }],
        sessionId,
        imageUrl: '/uploads/blue_backpack.jpeg'
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const resData = await res.json();
    expect(resData.meta.reportLogged).toBe(true);

    const loggedItem = store.findItemById(resData.meta.itemId);
    expect(loggedItem?.itemName).toBe('backpack');
    expect(loggedItem?.category).toBe('Accessories');
    expect(loggedItem?.color).toBe('blue');
    expect(loggedItem?.brand).toBe('Nike');
    expect(loggedItem?.imageUrl).toBe('/uploads/blue_backpack.jpeg');

    mockExtract.mockRestore();
  });
});
