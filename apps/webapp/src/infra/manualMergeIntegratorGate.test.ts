/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const checkPairMock = vi.fn();

vi.mock("@/infra/integrations/integratorUserMergeM2mClient", () => ({
  checkIntegratorCanonicalPair: (...a: unknown[]) => checkPairMock(...a),
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: vi.fn(),
}));

import { getConfigBool } from "@/modules/system-settings/configAdapter";
import { verifyManualMergeIntegratorIntegratorGate } from "@/infra/manualMergeIntegratorGate";

const poolMock = {
  query: vi.fn(),
};

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";

describe("verifyManualMergeIntegratorIntegratorGate", () => {
  beforeEach(() => {
    checkPairMock.mockReset();
    poolMock.query.mockReset();
    vi.mocked(getConfigBool).mockReset();
  });

  it("returns allowDistinct false when integrator ids absent or equal", async () => {
    vi.mocked(getConfigBool).mockResolvedValue(true);
    poolMock.query.mockResolvedValue({
      rows: [
        { id: A, integrator_user_id: "10" },
        { id: B, integrator_user_id: "10" },
      ],
    });
    const r = await verifyManualMergeIntegratorIntegratorGate(poolMock as never, A, B);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.allowDistinctIntegratorUserIds).toBe(false);
    expect(checkPairMock).not.toHaveBeenCalled();
  });

  it("v1 and ids differ: pass-through (no M2M); merge engine enforces blocker", async () => {
    vi.mocked(getConfigBool).mockResolvedValue(false);
    poolMock.query.mockResolvedValue({
      rows: [
        { id: A, integrator_user_id: "10" },
        { id: B, integrator_user_id: "20" },
      ],
    });
    const r = await verifyManualMergeIntegratorIntegratorGate(poolMock as never, A, B);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.allowDistinctIntegratorUserIds).toBe(false);
    expect(checkPairMock).not.toHaveBeenCalled();
  });

  it("returns allowDistinct true when v2 and canonical pair matches", async () => {
    vi.mocked(getConfigBool).mockResolvedValue(true);
    poolMock.query.mockResolvedValue({
      rows: [
        { id: A, integrator_user_id: "10" },
        { id: B, integrator_user_id: "20" },
      ],
    });
    checkPairMock.mockResolvedValue({ ok: true, sameCanonical: true, canonicalA: "10", canonicalB: "10" });
    const r = await verifyManualMergeIntegratorIntegratorGate(poolMock as never, A, B);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.allowDistinctIntegratorUserIds).toBe(true);
  });
});
