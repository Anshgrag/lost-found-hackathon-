import { describe, it, expect } from 'vitest';
import {
  ExtractedReport,
  parseExtractedReport,
  isReportComplete,
  extractedReportToItem,
  findConfidentMatches,
  buildMatchMessage,
  oppositeType,
} from '@/lib/orchestration';
import { localExtract } from '@/lib/localIntake';
import { Item, MatchResult } from '@/types';

function makeReport(overrides: Partial<ExtractedReport> = {}): ExtractedReport {
  return {
    item_name: null,
    item_category: null,
    color: null,
    brand: null,
    dents: null,
    hidden_details: null,
    distinctive_features: null,
    last_seen_location: null,
    date_lost_or_found: null,
    type: null,
    user_name: null,
    user_email: null,
    user_phone: null,
    student_id: null,
    ...overrides,
  };
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    itemName: 'Blue Backpack',
    category: 'Accessories',
    description: 'A blue backpack',
    location: 'Library',
    color: 'blue',
    brand: null,
    date: '2024-01-01',
    type: 'found',
    privateAttributes: {},
    appearanceTags: [],
    status: 'ACTIVE',
    priority: 'NORMAL',
    userId: 'anonymous',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('isReportComplete', () => {
  it('returns false when name is missing', () => {
    expect(isReportComplete(makeReport({ type: 'lost', color: 'red', user_name: 'Bob', user_phone: '123', user_email: 'a@b.com' }))).toBe(false);
  });

  it('returns false when type is missing', () => {
    expect(isReportComplete(makeReport({ item_name: 'Phone', color: 'black', user_name: 'Bob', user_phone: '123', user_email: 'a@b.com' }))).toBe(false);
  });

  it('returns false when there is a name and type but no distinguishing detail', () => {
    expect(isReportComplete(makeReport({ item_name: 'Phone', type: 'lost', user_name: 'Bob', user_phone: '123', user_email: 'a@b.com' }))).toBe(false);
  });

  it('returns false when user info is missing', () => {
    expect(isReportComplete(makeReport({ item_name: 'Phone', type: 'lost', color: 'black' }))).toBe(false);
  });

  it('returns true with name, type, a color, and user info', () => {
    expect(
      isReportComplete(makeReport({ 
        item_name: 'Phone', 
        type: 'lost', 
        color: 'black', 
        user_name: 'John Doe', 
        user_phone: '1234567890', 
        user_email: 'john@example.com' 
      }))
    ).toBe(true);
  });

  it('returns true with name, type, a location, and student ID instead of email', () => {
    expect(
      isReportComplete(
        makeReport({ 
          item_name: 'Phone', 
          type: 'found', 
          last_seen_location: 'Gym',
          user_name: 'Jane Smith',
          user_phone: '9876543210',
          student_id: '1234567'
        })
      )
    ).toBe(true);
  });

  it('returns true with name, type, a description, and all user info', () => {
    expect(
      isReportComplete(
        makeReport({ 
          item_name: 'Keys', 
          type: 'lost', 
          distinctive_features: 'has a red lanyard',
          user_name: 'Bob',
          user_phone: '555-0199',
          user_email: 'bob@campus.edu',
          student_id: '999888'
        })
      )
    ).toBe(true);
  });

  it('returns false for null report', () => {
    expect(isReportComplete(null)).toBe(false);
  });
});

describe('parseExtractedReport', () => {
  it('parses a clean JSON object', () => {
    const raw = JSON.stringify({
      item_name: 'Wallet',
      item_category: 'Accessories',
      color: 'brown',
      brand: null,
      distinctive_features: 'leather',
      last_seen_location: 'Cafeteria',
      date_lost_or_found: '2024-02-01',
      type: 'lost',
      user_name: 'Bob',
      user_phone: '12345',
      student_id: 'S123',
    });
    const report = parseExtractedReport(raw);
    expect(report).not.toBeNull();
    expect(report?.item_name).toBe('Wallet');
    expect(report?.type).toBe('lost');
    expect(report?.student_id).toBe('S123');
  });

  it('parses JSON wrapped in Markdown fences and prose', () => {
    const raw = 'Sure! Here is the data:\n```json\n{"item_name":"Phone","type":"found"}\n```\nLet me know.';
    const report = parseExtractedReport(raw);
    expect(report?.item_name).toBe('Phone');
    expect(report?.type).toBe('found');
  });

  it('treats empty/"null" strings as null', () => {
    const raw = '{"item_name":"  ","type":"null","color":"red"}';
    const report = parseExtractedReport(raw);
    expect(report?.item_name).toBeNull();
    expect(report?.type).toBeNull();
    expect(report?.color).toBe('red');
  });

  it('returns null on non-JSON content', () => {
    expect(parseExtractedReport('I cannot help with that.')).toBeNull();
  });

  it('returns null on non-string input', () => {
    expect(parseExtractedReport(undefined)).toBeNull();
    expect(parseExtractedReport(42)).toBeNull();
  });
});

describe('buildMatchMessage', () => {
  it('returns the no-match template when there are no matches', () => {
    const msg = buildMatchMessage([], 'found');
    expect(msg).toContain('no matching item has been found yet');
    expect(msg).toContain('current found reports');
    expect(msg).toContain('safely logged your report');
  });

  it('uses the opposite type word in the no-match template', () => {
    expect(buildMatchMessage([], 'lost')).toContain('current lost reports');
  });

  it('renders a Markdown table for confident matches', () => {
    const matches: MatchResult[] = [
      {
        match_score: 75,
        reasoning: 'Highly similar item names. Color matches exactly.',
        confidence_level: 'high',
        item: makeItem({ itemName: 'Blue Backpack', location: 'Library' }),
      },
    ];
    const msg = buildMatchMessage(matches, 'found');
    expect(msg).toContain('| Item | Location | Match Score | Contact Details | Why it matches |');
    expect(msg).toContain('Blue Backpack');
    expect(msg).toContain('Library');
    expect(msg).toContain('75%');
    expect(msg).toContain('possible match');
  });

  it('renders contact details of the matched item in the table', () => {
    const matches: MatchResult[] = [
      {
        match_score: 80,
        reasoning: 'Same color.',
        confidence_level: 'high',
        item: makeItem({ itemName: 'Laptop', location: 'Lab', userName: 'John Doe', userPhone: '1234567890' }),
      },
    ];
    const msg = buildMatchMessage(matches, 'found');
    expect(msg).toContain('Name: John Doe, Phone: 1234567890');
  });

  it('escapes pipe characters so a value cannot break the table', () => {
    const matches: MatchResult[] = [
      {
        match_score: 60,
        reasoning: 'ok',
        confidence_level: 'medium',
        item: makeItem({ itemName: 'Phone | case', location: 'Gym' }),
      },
    ];
    const msg = buildMatchMessage(matches, 'lost');
    expect(msg).toContain('Phone \\| case');
  });
});

describe('extractedReportToItem', () => {
  it('normalizes a complete report into a valid Item', () => {
    const item = extractedReportToItem(
      makeReport({
        item_name: 'Laptop',
        item_category: 'Electronics',
        color: 'silver',
        last_seen_location: 'Lab 2',
        type: 'lost',
        user_name: 'Alice',
        student_id: 'A789',
      })
    );
    expect(item.itemName).toBe('Laptop');
    expect(item.category).toBe('Electronics');
    expect(item.color).toBe('silver');
    expect(item.location).toBe('Lab 2');
    expect(item.type).toBe('lost');
    expect(item.userName).toBe('Alice');
    expect(item.studentId).toBe('A789');
    expect(item.status).toBe('ACTIVE');
    expect(item.id).toBeTruthy();
    expect(item.createdAt).toBeTruthy();
  });

  it('defaults an unknown category to Other', () => {
    const item = extractedReportToItem(
      makeReport({ item_name: 'Thing', item_category: 'Spaceship', type: 'found' })
    );
    expect(item.category).toBe('Other');
  });
});

describe('oppositeType', () => {
  it('maps lost -> found and found -> lost', () => {
    expect(oppositeType('lost')).toBe('found');
    expect(oppositeType('found')).toBe('lost');
  });
});

describe('findConfidentMatches', () => {
  it('returns an empty list when there are no opposite items', () => {
    const candidate = makeItem({ type: 'lost' });
    expect(findConfidentMatches(candidate, [])).toEqual([]);
  });

  it('only returns matches at or above the reportable threshold, sorted descending', () => {
    const candidate = makeItem({
      type: 'lost',
      itemName: 'Blue Backpack',
      description: 'A blue backpack with a laptop inside',
      color: 'blue',
      brand: 'Nike',
      location: 'Library',
      date: '2024-01-01',
    });
    const opposite: Item[] = [
      // Strong match (name + desc + color + brand + location + date)
      makeItem({
        type: 'found',
        itemName: 'Blue Backpack',
        description: 'A blue backpack with a laptop inside',
        color: 'blue',
        brand: 'Nike',
        location: 'Library',
        date: '2024-01-01',
      }),
      // Weak / unrelated item
      makeItem({
        type: 'found',
        itemName: 'Umbrella',
        description: 'black umbrella',
        color: 'black',
        brand: null,
        location: 'Gym',
        date: '2023-05-05',
      }),
    ];
    const results = findConfidentMatches(candidate, opposite);
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.match_score).toBeGreaterThanOrEqual(40);
      // grounding: every returned item is one of the provided opposite items
      expect(opposite).toContain(r.item);
    }
    // sorted descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].match_score).toBeGreaterThanOrEqual(results[i].match_score);
    }
  });
});

describe('localExtract', () => {
  it('extracts contact details from structured key-value messages', () => {
    const userTexts = [
      'I lost my pencil',
      'Name\tAnsh\nStudent ID\t006\nPhone Number\t99002092929\nItem\tRed Doms Pencil\nLocation\tNear campus gate\nCategory\tStationery'
    ];
    const report = localExtract(userTexts);
    expect(report.user_name).toBe('Ansh');
    expect(report.student_id).toBe('006');
    expect(report.user_phone).toBe('99002092929');
    expect(report.item_name).toBe('Red Doms Pencil');
    expect(report.color).toBe('red');
    expect(report.brand).toBe('doms');
    expect(report.last_seen_location).toBe('Near campus gate');
    expect(isReportComplete(report)).toBe(true);
  });

  it('extracts phone numbers with varying formats', () => {
    const userTexts = ['I lost my phone. My number is 9876543210 and my student ID is 12345'];
    const report = localExtract(userTexts);
    expect(report.user_phone).toBe('9876543210');
    expect(report.student_id).toBe('12345');
  });

  it('extracts shorter phone numbers (e.g. 8 or 9 digits) and incomplete student IDs successfully', () => {
    // Found report scenario:
    const userTextsFound = [
      'I found a charger',
      'Item\tLenovo Laptop Charger\nBrand\tLenovo\nLocation\tNear the Library\nCategory\tElectronics\nReporter Name\tAnshg\nStudent ID\t008\nPhone Number\t909002293'
    ];
    const reportFound = localExtract(userTextsFound);
    expect(reportFound.user_name).toBe('Anshg');
    expect(reportFound.student_id).toBe('008');
    expect(reportFound.user_phone).toBe('909002293');
    expect(reportFound.brand?.toLowerCase()).toBe('lenovo');
    expect(isReportComplete(reportFound)).toBe(true);

    // Lost report scenario:
    const userTextsLost = [
      'I lost a charger',
      'Item\tLenovo Charger\nCategory\tElectronics\nColor\tBlack\nLocation\tNear Library\nDistinguishing Marks\tNone/Flawless\nName\tAnish\nStudent ID\t00994\nPhone\t90303923'
    ];
    const reportLost = localExtract(userTextsLost);
    expect(reportLost.user_name).toBe('Anish');
    expect(reportLost.student_id).toBe('00994');
    expect(reportLost.user_phone).toBe('90303923');
    expect(reportLost.color?.toLowerCase()).toBe('black');
    expect(isReportComplete(reportLost)).toBe(true);
  });
});
