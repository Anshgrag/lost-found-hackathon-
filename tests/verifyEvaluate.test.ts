import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST as verifyPOST } from '../app/api/verify/route';
import { POST as evaluatePOST } from '../app/api/evaluate/route';
import store from '../lib/store';
import { Item } from '../types';

describe('Verify & Evaluate API Routes', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();

    // Clear db items
    (store as any).lostItems = [];
    (store as any).foundItems = [];
    (store as any).claims = [];
    (store as any).verificationQuestions = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('generates verification questions for a found item', async () => {
    // Add a mock found item to store
    const item: Item = {
      id: 'item-1',
      itemName: 'Black Wallet',
      category: 'Accessories',
      description: 'Found black wallet near gym',
      location: 'Gym',
      color: 'black',
      brand: 'Gucci',
      dents: 'None',
      hiddenDetails: 'Contains student card',
      date: '2026-06-15T10:00:00.000Z',
      type: 'found',
      privateAttributes: { expectedAnswer: 'Gucci card holder' },
      appearanceTags: [],
      status: 'ACTIVE',
      priority: 'NORMAL',
      userId: 'u1',
      createdAt: new Date().toISOString(),
    };
    store.addFoundItem(item);

    // Mock Gemini Response
    const mockLLMResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify({ questions: ['What brand is the wallet?', 'What is inside the wallet?'] }) }],
            role: 'model'
          }
        }
      ]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockLLMResponse,
    });

    const req = new Request('http://localhost/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foundItemId: 'item-1' })
    });

    const response = await verifyPOST(req);
    expect(response.status).toBe(200);

    const resData = await response.json();
    expect(resData.questions).toContain('What brand is the wallet?');
    expect(resData.questions).toContain('What is inside the wallet?');
  });

  it('evaluates answers and updates claim state', async () => {
    const item: Item = {
      id: 'item-2',
      itemName: 'Gucci Wallet',
      category: 'Accessories',
      description: 'Found black wallet near gym',
      location: 'Gym',
      color: 'black',
      brand: 'Gucci',
      dents: 'None',
      hiddenDetails: 'Contains student card',
      date: '2026-06-15T10:00:00.000Z',
      type: 'found',
      privateAttributes: {},
      appearanceTags: [],
      status: 'ACTIVE',
      priority: 'NORMAL',
      userId: 'u1',
      createdAt: new Date().toISOString(),
    };
    store.addFoundItem(item);

    // Mock Gemini Response for evaluation
    const mockLLMResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify({ ownership_confidence: 95, matched_fields: ['brand', 'color'], mismatched_fields: [], recommendation: 'approve' }) }],
            role: 'model'
          }
        }
      ]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockLLMResponse,
    });

    const req = new Request('http://localhost/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        foundItemId: 'item-2',
        answers: [
          { question: 'What brand is it?', answer: 'Gucci' },
          { question: 'What is the color?', answer: 'black' }
        ]
      })
    });

    const response = await evaluatePOST(req);
    expect(response.status).toBe(200);

    const resData = await response.json();
    expect(resData.claim.status).toBe('APPROVED');
    expect(resData.claim.confidenceScore).toBe(95);
    expect(resData.evaluation.recommendation).toBe('approve');

    // Confirm that the item is now marked as RESOLVED in the database
    const updatedItem = store.findItemById('item-2');
    expect(updatedItem?.status).toBe('RESOLVED');
  });
});
