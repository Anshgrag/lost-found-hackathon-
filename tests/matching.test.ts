import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  MIN_REPORTABLE_SCORE,
  filterConfidentMatches,
  calculateMatchScore,
} from "@/lib/matching";
import { Item, MatchResult } from "@/types";

function makeItem(id: string): Item {
  return {
    id,
    itemName: "Item " + id,
    category: "Other",
    description: "",
    location: "",
    color: null,
    brand: null,
    date: new Date().toISOString(),
    type: "found",
    privateAttributes: {},
    appearanceTags: [],
    status: "ACTIVE",
    priority: "NORMAL",
    userId: "u",
    createdAt: new Date().toISOString(),
  };
}

function makeMatch(score: number, id: string): MatchResult {
  const confidence: MatchResult["confidence_level"] =
    score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return {
    match_score: score,
    reasoning: "",
    confidence_level: confidence,
    item: makeItem(id),
  };
}

describe("filterConfidentMatches", () => {
  it("returns an empty array when given no matches", () => {
    expect(filterConfidentMatches([])).toEqual([]);
  });

  it("drops matches below MIN_REPORTABLE_SCORE", () => {
    const input = [makeMatch(10, "a"), makeMatch(39, "b"), makeMatch(40, "c")];
    const result = filterConfidentMatches(input);
    expect(result.map(m => m.match_score)).toEqual([40]);
  });

  it("keeps matches at exactly the threshold (boundary)", () => {
    const result = filterConfidentMatches([makeMatch(MIN_REPORTABLE_SCORE, "a")]);
    expect(result).toHaveLength(1);
  });

  it("sorts confident matches descending by score", () => {
    const input = [makeMatch(45, "a"), makeMatch(90, "b"), makeMatch(70, "c")];
    const result = filterConfidentMatches(input);
    expect(result.map(m => m.match_score)).toEqual([90, 70, 45]);
  });
});

// Property 2: Threshold soundness
// For any set of candidate MatchResults, every item in filterConfidentMatches
// has match_score >= MIN_REPORTABLE_SCORE, and the result is sorted descending.
// Validates: Requirements 2.2, 2.3
describe("Property 2: Threshold soundness", () => {
  it("only returns matches at/above threshold, sorted descending, with none below", () => {
    const matchArb = fc
      .array(
        fc.record({
          score: fc.integer({ min: -50, max: 150 }),
          id: fc.string(),
        }),
        { maxLength: 50 }
      )
      .map(records => records.map((r, i) => makeMatch(r.score, r.id + i)));

    fc.assert(
      fc.property(matchArb, candidates => {
        const result = filterConfidentMatches(candidates);

        // Every element is at/above threshold.
        for (const m of result) {
          expect(m.match_score).toBeGreaterThanOrEqual(MIN_REPORTABLE_SCORE);
        }

        // Output is sorted descending by score.
        for (let i = 1; i < result.length; i++) {
          expect(result[i - 1].match_score).toBeGreaterThanOrEqual(
            result[i].match_score
          );
        }

        // No element below threshold appears in the output.
        for (const m of result) {
          expect(m.match_score).not.toBeLessThan(MIN_REPORTABLE_SCORE);
        }

        // Result count equals the number of candidates at/above threshold.
        const atOrAbove = candidates.filter(
          c => c.match_score >= MIN_REPORTABLE_SCORE
        );
        expect(result).toHaveLength(atOrAbove.length);
      })
    );
  });
});

describe("calculateMatchScore", () => {
  it("computes exact matches correctly to 100", () => {
    const itemA: Item = {
      id: "a",
      itemName: "Leather Wallet",
      category: "Accessories",
      description: "A dark brown leather card holder",
      location: "Library Second Floor",
      color: "brown",
      brand: "Tommy Hilfiger",
      date: "2026-06-15T10:00:00.000Z",
      type: "lost",
      privateAttributes: {},
      appearanceTags: [],
      status: "ACTIVE",
      priority: "NORMAL",
      userId: "u1",
      createdAt: "2026-06-15T10:00:00.000Z",
    };

    const itemB: Item = {
      id: "b",
      itemName: "Leather Wallet",
      category: "Accessories",
      description: "A dark brown leather card holder",
      location: "Library Second Floor",
      color: "brown",
      brand: "Tommy Hilfiger",
      date: "2026-06-15T10:00:00.000Z",
      type: "found",
      privateAttributes: {},
      appearanceTags: [],
      status: "ACTIVE",
      priority: "NORMAL",
      userId: "u2",
      createdAt: "2026-06-15T10:00:00.000Z",
    };

    const res = calculateMatchScore(itemA, itemB);
    expect(res.match_score).toBe(100);
    expect(res.confidence_level).toBe("high");
  });

  it("handles semantic synonyms (wallet <-> card holder <-> purse)", () => {
    const itemA: Item = {
      id: "a",
      itemName: "Brown Card Holder",
      category: "Accessories",
      description: "Lost my card holder",
      location: "Library",
      color: "brown",
      brand: null,
      date: "2026-06-15T10:00:00.000Z",
      type: "lost",
      privateAttributes: {},
      appearanceTags: [],
      status: "ACTIVE",
      priority: "NORMAL",
      userId: "u1",
      createdAt: "2026-06-15T10:00:00.000Z",
    };

    const itemB: Item = {
      id: "b",
      itemName: "Brown Wallet",
      category: "Accessories",
      description: "Found brown wallet",
      location: "Library",
      color: "brown",
      brand: null,
      date: "2026-06-15T10:00:00.000Z",
      type: "found",
      privateAttributes: {},
      appearanceTags: [],
      status: "ACTIVE",
      priority: "NORMAL",
      userId: "u2",
      createdAt: "2026-06-15T10:00:00.000Z",
    };

    const res = calculateMatchScore(itemA, itemB);
    // Name similarity (card holder matches wallet due to synonym mapping)
    // Category matches (10 points)
    // Date matches (10 points)
    // Location matches (15 points)
    // Color matches (5 points)
    expect(res.match_score).toBeGreaterThanOrEqual(70);
    expect(res.confidence_level).toBe("high");
  });

  it("handles fuzzy Levenshtein matches with minor typos", () => {
    const itemA: Item = {
      id: "a",
      itemName: "MacBook Pro",
      category: "Electronics",
      description: "Silver macbook with stickers",
      location: "Campus Cafe",
      color: "silver",
      brand: "Apple",
      date: "2026-06-15T10:00:00.000Z",
      type: "lost",
      privateAttributes: {},
      appearanceTags: [],
      status: "ACTIVE",
      priority: "NORMAL",
      userId: "u1",
      createdAt: "2026-06-15T10:00:00.000Z",
    };

    const itemB: Item = {
      id: "b",
      itemName: "Macbok Pro", // Typo in MacBook
      category: "Electronics",
      description: "Silver macbok with stickrs", // Typos
      location: "Campus Cafeteria", // Fuzzy location
      color: "silver",
      brand: "Apple",
      date: "2026-06-16T10:00:00.000Z", // 1 day difference
      type: "found",
      privateAttributes: {},
      appearanceTags: [],
      status: "ACTIVE",
      priority: "NORMAL",
      userId: "u2",
      createdAt: "2026-06-16T10:00:00.000Z",
    };

    const res = calculateMatchScore(itemA, itemB);
    expect(res.match_score).toBeGreaterThanOrEqual(60);
  });

  it("calculates visual similarity scores when both items contain an imageUrl", () => {
    const itemA: Item = {
      id: "a",
      itemName: "Keys",
      category: "Keys",
      description: "Lost brass keys on keyring",
      location: "Library",
      color: "gold",
      brand: null,
      date: "2026-06-15T10:00:00.000Z",
      type: "lost",
      privateAttributes: {},
      appearanceTags: [],
      status: "ACTIVE",
      priority: "NORMAL",
      userId: "u1",
      imageUrl: "/uploads/keys_a.png",
      createdAt: "2026-06-15T10:00:00.000Z",
    };

    const itemB: Item = {
      id: "b",
      itemName: "Keys",
      category: "Keys",
      description: "Found keys on keyring",
      location: "Library",
      color: "gold",
      brand: null,
      date: "2026-06-15T10:00:00.000Z",
      type: "found",
      privateAttributes: {},
      appearanceTags: [],
      status: "ACTIVE",
      priority: "NORMAL",
      userId: "u2",
      imageUrl: "/uploads/keys_b.png",
      createdAt: "2026-06-15T10:00:00.000Z",
    };

    const resImageMatch = calculateMatchScore(itemA, itemB);
    
    // Copy without image
    const { imageUrl: _, ...itemAWithoutImage } = itemA;
    const { imageUrl: __, ...itemBWithoutImage } = itemB;
    const resTextOnly = calculateMatchScore(itemAWithoutImage, itemBWithoutImage as Item);

    expect(resImageMatch.match_score).toBeDefined();
    expect(resImageMatch.reasoning).toContain("Visual features");
    expect(resImageMatch.match_score).not.toEqual(resTextOnly.match_score);
  });

  it("applies brand mismatch penalty when brands do not match", () => {
    const itemA: Partial<Item> = {
      itemName: "Redmi Note 9",
      category: "Electronics",
      brand: "Redmi",
      type: "lost"
    };
    const itemB: Item = {
      id: "b",
      itemName: "iPhone 13",
      category: "Electronics",
      description: "",
      location: "",
      color: null,
      brand: "Apple",
      date: new Date().toISOString(),
      type: "found",
      privateAttributes: {},
      appearanceTags: [],
      status: "ACTIVE",
      priority: "NORMAL",
      userId: "u",
      createdAt: new Date().toISOString()
    };

    const res = calculateMatchScore(itemA, itemB);
    expect(res.reasoning).toContain("Brand mismatch detected");
    // Since brand is mismatch, score should be penalized heavily
    expect(res.match_score).toBeLessThan(MIN_REPORTABLE_SCORE);
  });

  it("uses precomputed visual score if provided", () => {
    const itemA: Partial<Item> = {
      itemName: "Keys",
      category: "Keys",
      imageUrl: "/uploads/keys_a.png",
      type: "lost"
    };
    const itemB: Item = {
      id: "b",
      itemName: "Keys",
      category: "Keys",
      description: "",
      location: "",
      color: null,
      brand: null,
      date: new Date().toISOString(),
      type: "found",
      privateAttributes: {},
      appearanceTags: [],
      status: "ACTIVE",
      priority: "NORMAL",
      userId: "u",
      imageUrl: "/uploads/keys_b.png",
      createdAt: new Date().toISOString()
    };

    const res = calculateMatchScore(itemA, itemB, 85, "Exact color matches");
    expect(res.reasoning).toContain("Visual Verification Agent confirms 85% visual similarity");
    expect(res.reasoning).toContain("Exact color matches");
  });
});
