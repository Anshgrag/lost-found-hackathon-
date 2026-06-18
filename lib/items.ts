import { Item } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Normalize an arbitrary, caller-provided payload into a fully-formed `Item`.
 *
 * Safe defaults are applied FIRST so that every stored item has valid fields,
 * then caller-provided values override those defaults. Identity fields (`id`,
 * `createdAt`) are always system-generated AFTER the spread so they can never
 * be spoofed by the caller.
 *
 * This is a pure-ish helper (it generates a fresh id/timestamp per call) so the
 * default-merge logic is unit-testable without invoking the HTTP route.
 */
export function normalizeItem(data: Partial<Item> & Record<string, unknown>): Item {
  const item: Item = {
    // --- safe defaults (lowest precedence) ---
    status: 'ACTIVE',
    category: 'Other',
    priority: 'NORMAL',
    privateAttributes: {},
    appearanceTags: [],
    color: null,
    brand: null,
    dents: null,
    hiddenDetails: null,
    description: '',
    location: '',
    itemName: '',
    date: '',
    type: 'lost',
    userId: 'anonymous',
    studentId: undefined,
    // --- caller values override defaults ---
    ...data,
    // --- system-generated identity fields (always win) ---
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  };

  return item;
}
