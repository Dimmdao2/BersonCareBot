import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQueryMock = vi.fn();
const { getSessionMock, getClientIdentityMock, setUserArchivedMock } = vi.hoisted(() => {
  const getClientIdentityMockInner = vi.fn();
  const setUserArchivedMockInner = vi.fn();
  return {
    getSessionMock: vi.fn(),
    getClientIdentityMock: getClientIdentityMockInner,
    setUserArchivedMock: setUserArchivedMockInner,
  };
});

vi.mock("@/infra/repos/pgDoctorClients", () => ({
  createPgDoctorClientsPort: () => ({
    getClientIdentity: getClientIdentityMock,
    setUserArchived: setUserArchivedMock,
  }),
}));
vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    query: poolQueryMock,
  }),
}));
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));

import { PATCH } from "./route";

const uid = "00000000-0000-4000-8000-000000000001";

describe("PATCH /api/doctor/clients/[userId]/archive", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getClientIdentityMock.mockReset();
    setUserArchivedMock.mockReset();
    poolQueryMock.mockReset();
    poolQueryMock.mockResolvedValue({ rows: [{ role: "client" }] });
    getClientIdentityMock.mockResolvedValue({
      userId: uid,
      displayName: "Test",
      phone: "+70000000000",
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: false,
    });
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/clients/${uid}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(401);
  });

  it("archives for doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/clients/${uid}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(setUserArchivedMock).toHaveBeenCalledWith(uid, true);
  });

  it("returns 404 when not a client role", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    poolQueryMock.mockResolvedValueOnce({ rows: [{ role: "doctor" }] });
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/clients/${uid}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    expect(res.status).toBe(404);
    expect(setUserArchivedMock).not.toHaveBeenCalled();
  });
});
