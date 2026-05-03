import { describe, expect, it } from "vitest";
import {
  buildLfkTemplatesListPreserveQuery,
  sanitizeLfkTemplatesListPreserveQuery,
} from "./lfkTemplatesListPreserveQuery";

describe("lfkTemplatesListPreserveQuery", () => {
  it("builds query from filters and title sort", () => {
    const qs = buildLfkTemplatesListPreserveQuery({
      q: "колено ",
      regionCode: "spine",
      loadType: "stretch",
      listPubArch: { arch: "archived", pub: "all" },
      titleSort: "asc",
    });
    const p = new URLSearchParams(qs);
    expect(p.get("q")).toBe("колено");
    expect(p.get("region")).toBe("spine");
    expect(p.get("load")).toBe("stretch");
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
      "&evil=1&region=ok-region&load=strength&arch=archived&titleSort=desc&extra=nope";
    const s = sanitizeLfkTemplatesListPreserveQuery(malicious);
    expect(s).not.toContain("evil");
    expect(s).not.toContain("extra");
    expect(s).toContain("region=ok-region");
    expect(s).toContain("load=strength");
    expect(s).toContain("arch=archived");
    expect(s).toContain("titleSort=desc");
    expect(s.length).toBeLessThan(700);
  });

  it("sanitize rejects uuid region tokens", () => {
    const s = sanitizeLfkTemplatesListPreserveQuery(
      "region=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&load=strength",
    );
    expect(s).not.toContain("region=");
    expect(s).toContain("load=strength");
  });

  it("sanitize rejects invalid load and titleSort", () => {
    expect(sanitizeLfkTemplatesListPreserveQuery("load=hijack&titleSort=maybe")).toBe("");
  });
});
