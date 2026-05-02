import { describe, expect, it } from "vitest";
import {
  buildLfkTemplatesListPreserveQuery,
  sanitizeLfkTemplatesListPreserveQuery,
} from "./lfkTemplatesListPreserveQuery";

describe("lfkTemplatesListPreserveQuery", () => {
  it("builds query from filters and title sort", () => {
    const qs = buildLfkTemplatesListPreserveQuery({
      q: "колено ",
      regionRefId: "reg-1",
      loadType: "stretch",
      titleSort: "asc",
    });
    const p = new URLSearchParams(qs);
    expect(p.get("q")).toBe("колено");
    expect(p.get("region")).toBe("reg-1");
    expect(p.get("load")).toBe("stretch");
    expect(p.get("titleSort")).toBe("asc");
  });

  it("returns empty when nothing set", () => {
    expect(
      buildLfkTemplatesListPreserveQuery({
        q: "",
        titleSort: null,
      }),
    ).toBe("");
  });

  it("sanitize drops unknown keys and long q", () => {
    const malicious =
      "q=" +
      "x".repeat(600) +
      "&evil=1&region=ok-region&load=strength&titleSort=desc&extra=nope";
    const s = sanitizeLfkTemplatesListPreserveQuery(malicious);
    expect(s).not.toContain("evil");
    expect(s).not.toContain("extra");
    expect(s).toContain("region=ok-region");
    expect(s).toContain("load=strength");
    expect(s).toContain("titleSort=desc");
    expect(s.length).toBeLessThan(700);
  });

  it("sanitize rejects invalid load and titleSort", () => {
    expect(sanitizeLfkTemplatesListPreserveQuery("load=hijack&titleSort=maybe")).toBe("");
  });
});
