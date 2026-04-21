import { describe, expect, it } from "vitest";
import { escapePgIlikeLiteral, normalizeRuSearchString, pgRuSubstringSearchPattern } from "./ruSearchNormalize";

describe("ruSearchNormalize", () => {
  it("normalizeRuSearchString applies NFC + ru locale lower case", () => {
    expect(normalizeRuSearchString("ЮГ")).toBe(normalizeRuSearchString("юг"));
  });

  it("escapePgIlikeLiteral escapes ILIKE specials", () => {
    expect(escapePgIlikeLiteral("100%")).toBe("100\\%");
    expect(escapePgIlikeLiteral("a_b")).toBe("a\\_b");
    expect(escapePgIlikeLiteral("a\\b")).toBe("a\\\\b");
  });

  it("pgRuSubstringSearchPattern returns null for whitespace-only", () => {
    expect(pgRuSubstringSearchPattern("   ")).toBe(null);
  });

  it("pgRuSubstringSearchPattern wraps normalized needle with escapes", () => {
    const p = pgRuSubstringSearchPattern("Test  ");
    expect(p).toContain("%");
    expect(p?.startsWith("%")).toBe(true);
    expect(p?.endsWith("%")).toBe(true);
  });
});
