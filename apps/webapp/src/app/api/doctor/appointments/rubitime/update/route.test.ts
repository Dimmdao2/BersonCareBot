import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.fn();
const postIntegratorSignedJsonMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock("@/app-layer/integrations/integratorSignedPost", () => ({
  postIntegratorSignedJson: (...args: unknown[]) => postIntegratorSignedJsonMock(...args),
}));

import { POST } from "./route";

describe("POST /api/doctor/appointments/rubitime/update", () => {
  it("returns 401 without session", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    const res = await POST(
      new Request("http://localhost/api/doctor/appointments/rubitime/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordId: "42", patch: {} }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-doctor role", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "u1", role: "client" },
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/appointments/rubitime/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordId: "42", patch: {} }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("for doctor proxies signed request to integrator", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "u1", role: "doctor" },
    });
    postIntegratorSignedJsonMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: { ok: true },
    });

    const res = await POST(
      new Request("http://localhost/api/doctor/appointments/rubitime/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordId: 42, patch: { status: 7 } }),
      })
    );

    expect(res.status).toBe(200);
    expect(postIntegratorSignedJsonMock).toHaveBeenCalledWith(
      "/api/bersoncare/rubitime/update-record",
      { recordId: "42", patch: { status: 7 } }
    );
  });
});
