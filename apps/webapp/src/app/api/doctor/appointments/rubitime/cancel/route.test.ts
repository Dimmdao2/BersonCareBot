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

describe("POST /api/doctor/appointments/rubitime/cancel", () => {
  it("returns 400 for invalid body", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "u1", role: "doctor" },
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/appointments/rubitime/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("for doctor proxies cancel to integrator", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "u1", role: "doctor" },
    });
    postIntegratorSignedJsonMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: { ok: true },
    });

    const res = await POST(
      new Request("http://localhost/api/doctor/appointments/rubitime/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordId: "42" }),
      })
    );

    expect(res.status).toBe(200);
    expect(postIntegratorSignedJsonMock).toHaveBeenCalledWith(
      "/api/bersoncare/rubitime/remove-record",
      { recordId: "42" }
    );
  });
});
