import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const getConfigBoolMock = vi.fn();
const callMergeMock = vi.fn();

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: (...a: unknown[]) => getSessionMock(...a),
}));
vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: (...a: unknown[]) => getConfigBoolMock(...a),
}));
vi.mock("@/infra/integrations/integratorUserMergeM2mClient", () => ({
  callIntegratorUserMerge: (...a: unknown[]) => callMergeMock(...a),
}));

const poolQueryMock = vi.fn();
vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: (...a: unknown[]) => poolQueryMock(...a) }),
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

const T = "00000000-0000-4000-8000-000000000011";
const D = "00000000-0000-4000-8000-000000000022";

const twoClientsRows = [
  { id: T, role: "client", merged_into_id: null, integrator_user_id: "100" },
  { id: D, role: "client", merged_into_id: null, integrator_user_id: "200" },
];

describe("POST /api/doctor/clients/integrator-merge (Stage 5)", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getConfigBoolMock.mockReset();
    callMergeMock.mockReset();
    poolQueryMock.mockReset();
    getSessionMock.mockResolvedValue(adminOk);
    getConfigBoolMock.mockResolvedValue(true);
  });

  it("returns 400 when v2 flag disabled", async () => {
    getConfigBoolMock.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D }),
      }),
    );
    expect(res.status).toBe(400);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("returns 200 and forwards winner/loser to integrator M2M", async () => {
    poolQueryMock.mockResolvedValue({ rows: twoClientsRows });
    callMergeMock.mockResolvedValue({ ok: true, result: { ok: true } });
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D }),
      }),
    );
    expect(res.status).toBe(200);
    expect(callMergeMock).toHaveBeenCalledWith({
      winnerIntegratorUserId: "100",
      loserIntegratorUserId: "200",
      dryRun: false,
    });
  });

  it("returns 403 when admin gate fails", async () => {
    getSessionMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 403 }),
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
