import { describe, expect, it } from "vitest";
import { computeRubitimeMappingStatus } from "./computeStatus";

describe("computeRubitimeMappingStatus", () => {
  const okBase = {
    branchServiceId: "bs-1",
    ssaActive: true,
    ssaPresent: true,
    reverseMappingOk: true,
    branchEntityMapped: true,
    specialistEntityMapped: true,
    serviceEntityMapped: true,
    legacyActive: true,
    durationMismatch: false,
    priceMismatch: false,
  };

  it("returns mapped_ok when fully linked", () => {
    expect(computeRubitimeMappingStatus(okBase)).toEqual({ status: "mapped_ok", issues: [] });
  });

  it("returns unmapped when no branchServiceId", () => {
    expect(computeRubitimeMappingStatus({ ...okBase, branchServiceId: null }).status).toBe("unmapped");
  });

  it("returns mapped_ok with price issue when only price mismatches", () => {
    const r = computeRubitimeMappingStatus({ ...okBase, priceMismatch: true });
    expect(r.status).toBe("mapped_ok");
    expect(r.issues).toContain("price_mismatch");
  });

  it("returns mapped_ok with duration issue when only duration mismatches", () => {
    const r = computeRubitimeMappingStatus({ ...okBase, durationMismatch: true });
    expect(r.status).toBe("mapped_ok");
    expect(r.issues).toContain("duration_mismatch");
  });

  it("prioritizes unmapped over legacy_inactive", () => {
    expect(
      computeRubitimeMappingStatus({
        ...okBase,
        branchServiceId: null,
        legacyActive: false,
      }).status,
    ).toBe("unmapped");
  });
});
