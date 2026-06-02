import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const countPendingMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramProgress: { countPendingTestEvaluationAttemptsGlobal: countPendingMock },
  }),
}));

import { GET } from "./route";

describe("GET /api/doctor/pending-program-tests/summary", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    countPendingMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/doctor/pending-program-tests/summary"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await GET(new Request("http://localhost/api/doctor/pending-program-tests/summary"));
    expect(res.status).toBe(403);
  });

  it("returns count for doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    countPendingMock.mockResolvedValue(3);
    const res = await GET(new Request("http://localhost/api/doctor/pending-program-tests/summary"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; count?: number };
    expect(json.ok).toBe(true);
    expect(json.count).toBe(3);
    expect(countPendingMock).toHaveBeenCalledTimes(1);
  });
});
