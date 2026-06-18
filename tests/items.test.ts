import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { normalizeItem } from "@/lib/items";
import type { Item } from "@/types";

describe("normalizeItem defaults (Property 4: Status default)", () => {
  it("defaults status to ACTIVE when omitted", () => {
    const item = normalizeItem({ itemName: "phone", type: "lost" });
    expect(item.status).toBe("ACTIVE");
  });

  it("preserves an explicitly provided status", () => {
    const item = normalizeItem({ itemName: "phone", type: "lost", status: "RESOLVED" });
    expect(item.status).toBe("RESOLVED");
  });

  it("applies safe defaults for category, priority and collections", () => {
    const item = normalizeItem({ itemName: "wallet", type: "found" });
    expect(item.category).toBe("Other");
    expect(item.priority).toBe("NORMAL");
    expect(item.privateAttributes).toEqual({});
    expect(item.appearanceTags).toEqual([]);
    expect(item.color).toBeNull();
    expect(item.brand).toBeNull();
  });

  it("always sets system identity fields (id, createdAt) regardless of caller input", () => {
    const item = normalizeItem({ id: "spoofed", createdAt: "fake", itemName: "keys", type: "lost" });
    expect(item.id).not.toBe("spoofed");
    expect(item.id).toBeTruthy();
    expect(item.createdAt).not.toBe("fake");
    expect(() => new Date(item.createdAt).toISOString()).not.toThrow();
  });

  // **Validates: Requirements 5.1**
  it("Property 4: omitting status yields ACTIVE; an explicit status is preserved", () => {
    const statusArb = fc.constantFrom<Item["status"]>("ACTIVE", "RESOLVED", "PENDING");

    // Arbitrary payload fields that should NOT influence status defaulting.
    const payloadArb = fc.record(
      {
        itemName: fc.string(),
        description: fc.string(),
        location: fc.string(),
        color: fc.option(fc.string(), { nil: null }),
        brand: fc.option(fc.string(), { nil: null }),
        type: fc.constantFrom<Item["type"]>("lost", "found"),
        userId: fc.string(),
      },
      { requiredKeys: [] }
    );

    fc.assert(
      fc.property(payloadArb, fc.option(statusArb, { nil: undefined }), (payload, maybeStatus) => {
        const data: Partial<Item> & Record<string, unknown> = { ...payload };
        if (maybeStatus !== undefined) {
          data.status = maybeStatus;
        }

        const item = normalizeItem(data);

        if (maybeStatus === undefined) {
          expect(item.status).toBe("ACTIVE");
        } else {
          expect(item.status).toBe(maybeStatus);
        }
      })
    );
  });
});
