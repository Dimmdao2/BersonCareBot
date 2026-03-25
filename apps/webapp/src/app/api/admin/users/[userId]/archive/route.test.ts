import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, buildAppDepsMock, getClientIdentityMock, setUserArchivedMock } = vi.hoisted(() => {
  const getClientIdentityMockInner = vi.fn();
  const setUserArchivedMockInner = vi.fn();
  return {
    getSessionMock: vi.fn(),
    getClientIdentityMock: getClientIdentityMockInner,
    setUserArchivedMock: setUserArchivedMockInner,
    buildAppDepsMock: vi.fn(() => ({
      doctorClientsPort: {
        getClientIdentity: getClientIdentityMockInner,
        setUserArchived: setUserArchivedMockInner,
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));

import { PATCH } from "./route";

describe("PATCH /api/admin/users/[userId]/archive", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getClientIdentityMock.mockReset();
    setUserArchivedMock.mockReset();
  });

  it("returns 403 when session is doctor (not admin)", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const res = await PATCH(
      new Request("http://localhost/api/admin/users/00000000-0000-4000-8000-000000000001/archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ userId: "00000000-0000-4000-8000-000000000001" }) }
    );
    expect(res.status).toBe(403);
  });
});
