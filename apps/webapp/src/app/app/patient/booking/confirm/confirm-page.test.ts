import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = join(import.meta.dirname, "page.tsx");

describe("booking/confirm page (success redirect + city)", () => {
  it("passes bookingNewHref success redirect with cityCode from query", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("bookingNewHref(cityCodeForLinks)");
    expect(src).toContain("successRedirectPath={successRedirectPath}");
  });

  it("uses structured session FIO before the legacy display-name parser", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("if (structured.lastName || structured.firstName || structured.patronymic) return structured;");
    expect(src.indexOf("if (structured.lastName || structured.firstName || structured.patronymic) return structured;")).toBeLessThan(
      src.indexOf('parseFioCandidate(user.displayName, "display_name")'),
    );
  });
});
