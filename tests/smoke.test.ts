import { describe, it, expect } from "vitest";

describe("test runner smoke test", () => {
  it("confirms the Vitest runner is wired up", () => {
    expect(1 + 1).toBe(2);
  });
});
