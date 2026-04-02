import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

import { GET } from "./route";

describe("GET /api/doctor/online-intake/[id]", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
  });

  it("returns 403 for patient (client) — cannot read doctor intake details or attachments", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    const res = await GET(new Request("http://localhost/api/doctor/online-intake/x"), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("FORBIDDEN");
  });
});
