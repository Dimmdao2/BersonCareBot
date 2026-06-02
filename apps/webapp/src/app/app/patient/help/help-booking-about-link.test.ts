import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const slugPagePath = join(import.meta.dirname, "[slug]/page.tsx");

describe("help/booking article → about", () => {
  it("shows HelpBookingAboutLink for booking slug", () => {
    const src = readFileSync(slugPagePath, "utf8");
    expect(src).toContain("HELP_CANONICAL_ARTICLE_SLUG_BOOKING");
    expect(src).toContain("HelpBookingAboutLink");
    expect(src).toMatch(/slug === HELP_CANONICAL_ARTICLE_SLUG_BOOKING[\s\S]*HelpBookingAboutLink/);
  });
});
