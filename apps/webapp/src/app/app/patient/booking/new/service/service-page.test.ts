import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = join(import.meta.dirname, "page.tsx");

describe("booking/new/service page (wizard back + city)", () => {
  it("back to format step preserves cityCode for city-aware info links", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("bookingNewHref(cityCode)");
    expect(src).toContain('backHref={bookingNewHref(cityCode)}');
  });
});
