import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

import { GET } from "./route";

const PATIENT_SESSION = {
  user: { userId: "platform-user-1", role: "client" as const, phone: "+79990001122" },
};

describe("GET /api/patient/web-push/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 501 not_implemented when patient gate ok", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: PATIENT_SESSION });
    const res = await GET();
    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "not_implemented", webPush: "disabled" });
  });

  it("returns 401 when gate denies", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
