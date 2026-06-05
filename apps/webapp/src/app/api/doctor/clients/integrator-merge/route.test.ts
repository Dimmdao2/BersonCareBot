import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const getConfigBoolMock = vi.fn();
const executeMergeMock = vi.fn();

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: (...a: unknown[]) => getSessionMock(...a),
}));
vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: (...a: unknown[]) => getConfigBoolMock(...a),
}));
vi.mock("@/infra/integratorPlatformUserMerge", () => ({
  executeIntegratorPlatformUserMerge: (...a: unknown[]) => executeMergeMock(...a),
}));
vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({}),
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

describe("POST /api/doctor/clients/integrator-merge (Stage 5)", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getConfigBoolMock.mockReset();
    executeMergeMock.mockReset();
    getSessionMock.mockResolvedValue(adminOk);
    getConfigBoolMock.mockResolvedValue(true);
    executeMergeMock.mockResolvedValue({ ok: true, status: 200, body: { ok: true, result: { ok: true } } });
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
    expect(executeMergeMock).not.toHaveBeenCalled();
  });

  it("returns 200 and delegates to executeIntegratorPlatformUserMerge", async () => {
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D }),
      }),
    );
    expect(res.status).toBe(200);
    expect(executeMergeMock).toHaveBeenCalledWith({
      pool: expect.anything(),
      actorId: "a1",
      targetId: T,
      duplicateId: D,
      dryRun: undefined,
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
    expect(executeMergeMock).not.toHaveBeenCalled();
  });

  it("forwards service error status and body", async () => {
    executeMergeMock.mockResolvedValue({
      ok: false,
      status: 503,
      body: { ok: false, error: "integrator_timeout", message: "Integrator merge request timed out." },
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D }),
      }),
    );
    expect(res.status).toBe(503);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("integrator_timeout");
  });

  it("returns 400 invalid_body for malformed JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      }),
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("invalid_body");
    expect(executeMergeMock).not.toHaveBeenCalled();
  });

  it("returns 400 same_id when target and duplicate match", async () => {
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: T }),
      }),
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("same_id");
    expect(executeMergeMock).not.toHaveBeenCalled();
  });

  it("passes dryRun through to the service", async () => {
    const res = await POST(
      new Request("http://localhost/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: T, duplicateId: D, dryRun: true }),
      }),
    );
    expect(res.status).toBe(200);
    expect(executeMergeMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
  });
});
