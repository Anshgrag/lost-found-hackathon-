import { describe, it, expect } from "vitest";
import { normalizeItem } from "@/lib/items";
import store from "@/lib/store";

describe("Store helpers", () => {
  it("findItemById locates items across lost and found collections", () => {
    const lost = normalizeItem({ itemName: "lost-phone", type: "lost" });
    const found = normalizeItem({ itemName: "found-wallet", type: "found" });
    store.addLostItem(lost);
    store.addFoundItem(found);

    expect(store.findItemById(lost.id)).toBe(lost);
    expect(store.findItemById(found.id)).toBe(found);
    expect(store.findItemById("does-not-exist")).toBeUndefined();
  });

  it("markResolved sets status to RESOLVED and reports success", () => {
    const item = normalizeItem({ itemName: "keys", type: "found" });
    store.addFoundItem(item);

    expect(item.status).toBe("ACTIVE");
    expect(store.markResolved(item.id)).toBe(true);
    expect(item.status).toBe("RESOLVED");
    expect(store.markResolved("missing")).toBe(false);
  });

  it("getExpectedAnswer returns the private answer for an item, null otherwise", () => {
    const withAnswer = normalizeItem({
      itemName: "laptop",
      type: "found",
      privateAttributes: { verificationQuestion: "sticker?", expectedAnswer: "blue cat" },
    });
    const withoutAnswer = normalizeItem({ itemName: "umbrella", type: "found" });
    store.addFoundItem(withAnswer);
    store.addFoundItem(withoutAnswer);

    expect(store.getExpectedAnswer(withAnswer.id)).toBe("blue cat");
    expect(store.getExpectedAnswer(withoutAnswer.id)).toBeNull();
    expect(store.getExpectedAnswer("missing")).toBeNull();
  });
});
