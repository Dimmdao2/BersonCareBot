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
      listPubArch: { arch: "archived", pub: "all" },
      titleSort: "asc",
    });
    const p = new URLSearchParams(qs);
    expect(p.get("q")).toBe("колено");
    expect(p.get("regionRefId")).toBe("reg-1");
    expect(p.get("loadType")).toBe("stretch");
    expect(p.get("arch")).toBe("archived");
    expect(p.get("pub")).toBeNull();
    expect(p.get("titleSort")).toBe("asc");
  });

  it("returns empty when nothing set", () => {
    expect(
      buildLfkTemplatesListPreserveQuery({
        q: "",
        listPubArch: { arch: "active", pub: "all" },
        titleSort: null,
      }),
    ).toBe("");
  });

  it("sanitize drops unknown keys and long q", () => {
    const malicious =
      "q=" +
      "x".repeat(600) +
      "&evil=1&regionRefId=ok-region&loadType=strength&arch=archived&titleSort=desc&extra=nope";
    const s = sanitizeLfkTemplatesListPreserveQuery(malicious);
    expect(s).not.toContain("evil");
    expect(s).not.toContain("extra");
    expect(s).toContain("regionRefId=ok-region");
    expect(s).toContain("loadType=strength");
    expect(s).toContain("arch=archived");
    expect(s).toContain("titleSort=desc");
    expect(s.length).toBeLessThan(700);
  });

  it("sanitize rejects invalid load and titleSort", () => {
    expect(sanitizeLfkTemplatesListPreserveQuery("loadType=hijack&titleSort=maybe")).toBe("");
  });
});
