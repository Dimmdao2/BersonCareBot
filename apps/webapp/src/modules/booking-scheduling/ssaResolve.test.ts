import { describe, expect, it } from "vitest";
import { legacyBranchServiceIdBySsaFromMappings, pickPreferredSsaId } from "./ssaResolve";

describe("ssaResolve", () => {
  const legacyBySsa = legacyBranchServiceIdBySsaFromMappings([
    { canonicalId: "ssa-new", metadata: { legacy_branch_service_id: "bs-2" } },
  ]);

  it("prefers SSA with availability mapping over older row without mapping", () => {
    const picked = pickPreferredSsaId(
      [
        { id: "ssa-old", createdAt: "2026-01-01T00:00:00.000Z", isActive: true },
        { id: "ssa-new", createdAt: "2026-06-04T12:00:00.000Z", isActive: true },
      ],
      legacyBySsa,
    );
    expect(picked).toBe("ssa-new");
  });

  it("prefers active SSA over inactive when both exist for pair", () => {
    const picked = pickPreferredSsaId(
      [
        { id: "ssa-inactive", createdAt: "2026-06-05T00:00:00.000Z", isActive: false },
        { id: "ssa-active", createdAt: "2026-01-01T00:00:00.000Z", isActive: true },
      ],
      legacyBySsa,
    );
    expect(picked).toBe("ssa-active");
  });

  it("returns newest when none have mapping", () => {
    const picked = pickPreferredSsaId(
      [
        { id: "ssa-a", createdAt: "2026-01-01T00:00:00.000Z", isActive: true },
        { id: "ssa-b", createdAt: "2026-06-01T00:00:00.000Z", isActive: true },
      ],
      new Map(),
    );
    expect(picked).toBe("ssa-b");
  });
});
