import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const countPendingMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramProgress: { countPendingTestEvaluationAttemptsGlobal: countPendingMock },
  }),
}));

import { GET } from "./route";

describe("GET /api/doctor/pending-program-tests/summary", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "10000000-0000-4000-8000-000000000001" },
    });
    countPendingMock.mockReset();
  });

  it("returns 401 without session", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/doctor/pending-program-tests/summary"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/doctor/pending-program-tests/summary"));
    expect(res.status).toBe(403);
  });

  it("returns count for doctor", async () => {
    countPendingMock.mockResolvedValue(3);
    const res = await GET(new Request("http://localhost/api/doctor/pending-program-tests/summary"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; count?: number };
    expect(json.ok).toBe(true);
    expect(json.count).toBe(3);
    expect(countPendingMock).toHaveBeenCalledTimes(1);
    expect(countPendingMock).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000001");
  });
});
