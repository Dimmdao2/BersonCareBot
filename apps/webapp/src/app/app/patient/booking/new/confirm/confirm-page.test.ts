import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = join(import.meta.dirname, "page.tsx");

describe("booking/new/confirm page (success redirect + city)", () => {
  it("passes bookingNewHref success redirect with cityCode from query", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("bookingNewHref(cityCodeForLinks)");
    expect(src).toContain("successRedirectPath={successRedirectPath}");
  });
});
