import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const runManualMock = vi.fn();
const gateMock = vi.fn();

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: (...a: unknown[]) => getSessionMock(...a),
}));
vi.mock("@/infra/manualMergeIntegratorGate", () => ({
  verifyManualMergeIntegratorIntegratorGate: (...a: unknown[]) => gateMock(...a),
}));
vi.mock("@/infra/manualPlatformUserMerge", () => ({
  runManualPlatformUserMerge: (...a: unknown[]) => runManualMock(...a),
}));
vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: vi.fn() }),
}));

import { POST } from "./route";

const adminOk = {
  ok: true as const,
  session: {
    user: { userId: "a1", role: "admin" as const, displayName: "Admin", bindings: {} },
    adminMode: true,
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  },
};

const t1 = "00000000-0000-4000-8000-000000000001";
const t2 = "00000000-0000-4000-8000-000000000002";

const resolutionBody = {
  resolution: {
    targetId: t1,
    duplicateId: t2,
    fields: {
      phone_normalized: "target",
      display_name: "target",
      first_name: "target",
      last_name: "target",
      email: "target",
    },
    bindings: { telegram: "both", max: "both", vk: "both" },
    oauth: {},
    channelPreferences: "merge" as const,
  },
};

describe("POST /api/doctor/clients/merge", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    runManualMock.mockReset();
    gateMock.mockReset();
    getSessionMock.mockResolvedValue(adminOk);
    gateMock.mockResolvedValue({ ok: true, allowDistinctIntegratorUserIds: false });
    runManualMock.mockResolvedValue({ ok: true, targetId: t1, duplicateId: t2 });
  });

  it("returns 403 when admin gate fails", async () => {
    getSessionMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resolutionBody),
      }),
    );
    expect(res.status).toBe(403);
    expect(runManualMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 and calls runManualPlatformUserMerge with actor id", async () => {
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resolutionBody),
      }),
    );
    expect(res.status).toBe(200);
    expect(runManualMock).toHaveBeenCalledWith(expect.anything(), "a1", resolutionBody.resolution, {
      allowDistinctIntegratorUserIds: false,
    });
  });

  it("returns 409 when merge fails", async () => {
    runManualMock.mockResolvedValue({ ok: false, error: "merge: two different non-null integrator_user_id" });
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resolutionBody),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns gate response when integrator gate fails", async () => {
    gateMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "merge_failed", code: "x" }, { status: 409 }),
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resolutionBody),
      }),
    );
    expect(res.status).toBe(409);
    expect(runManualMock).not.toHaveBeenCalled();
  });
});
