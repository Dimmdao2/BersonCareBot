import { describe, expect, it } from "vitest";
import { getQuoteForDay } from "./newsMotivation";

describe("newsMotivation getQuoteForDay", () => {
  it("returns null when DATABASE_URL empty (test env)", async () => {
    const q = await getQuoteForDay("user-1");
    expect(q).toBeNull();
  });
});
