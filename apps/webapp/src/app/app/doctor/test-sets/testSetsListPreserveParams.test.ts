import { describe, expect, it } from "vitest";
import { appendTestSetsListPreserveToSearchParams } from "./testSetsListPreserveParams";

describe("appendTestSetsListPreserveToSearchParams", () => {
  it("preserves q, titleSort, region, arch, pub and never sets load", () => {
    const sp = new URLSearchParams();
    sp.set("selected", "set-1");
    const fd = new FormData();
    fd.set("listQ", "  knee  ");
    fd.set("listTitleSort", "desc");
    fd.set("listRegion", "spine");
    fd.set("listArch", "archived");
    fd.set("listPub", "draft");
    appendTestSetsListPreserveToSearchParams(sp, fd);
    expect(sp.get("selected")).toBe("set-1");
    expect(sp.get("q")).toBe("knee");
    expect(sp.get("titleSort")).toBe("desc");
    expect(sp.get("region")).toBe("spine");
    expect(sp.get("arch")).toBe("archived");
    expect(sp.get("pub")).toBe("draft");
    expect(sp.has("load")).toBe(false);
    expect(sp.has("status")).toBe(false);
  });

  it("does not set region for UUID listRegion (same as catalog URL contract)", () => {
    const sp = new URLSearchParams();
    const fd = new FormData();
    fd.set("listRegion", "550e8400-e29b-41d4-a716-446655440000");
    appendTestSetsListPreserveToSearchParams(sp, fd);
    expect(sp.has("region")).toBe(false);
  });
});
