import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, buildAppDepsMock, unreadFromUsersMock, unreadFromPatientMock, getClientIdentityMock } = vi.hoisted(() => {
  const unreadFromUsersMockInner = vi.fn();
  const unreadFromPatientMockInner = vi.fn();
  const getClientIdentityMockInner = vi.fn();
  return {
    getSessionMock: vi.fn(),
    unreadFromUsersMock: unreadFromUsersMockInner,
    unreadFromPatientMock: unreadFromPatientMockInner,
    getClientIdentityMock: getClientIdentityMockInner,
    buildAppDepsMock: vi.fn(() => ({
      doctorClientsPort: {
        getClientIdentity: getClientIdentityMockInner,
      },
      messaging: {
        doctorSupport: {
          unreadFromUsers: unreadFromUsersMockInner,
          unreadFromPatient: unreadFromPatientMockInner,
        },
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

import { GET } from "./route";

describe("GET /api/doctor/messages/unread-count", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    unreadFromUsersMock.mockReset();
    unreadFromPatientMock.mockReset();
    getClientIdentityMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/doctor/messages/unread-count"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "c1", role: "client", bindings: {} },
    });
    const res = await GET(new Request("http://localhost/api/doctor/messages/unread-count"));
    expect(res.status).toBe(403);
  });

  it("returns unread count for doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    unreadFromUsersMock.mockResolvedValue(4);
    const res = await GET(new Request("http://localhost/api/doctor/messages/unread-count"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; unreadCount: number };
    expect(data.ok).toBe(true);
    expect(data.unreadCount).toBe(4);
  });

  it("returns 400 for invalid patientUserId query", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const res = await GET(new Request("http://localhost/api/doctor/messages/unread-count?patientUserId=bad"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when patient is missing", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    getClientIdentityMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/doctor/messages/unread-count?patientUserId=00000000-0000-4000-8000-000000000111"),
    );
    expect(res.status).toBe(404);
    expect(unreadFromPatientMock).not.toHaveBeenCalled();
  });

  it("returns unread count for a specific patient", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    getClientIdentityMock.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000111",
      displayName: "Patient",
      phone: null,
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: false,
      channelBindingDates: {},
    });
    unreadFromPatientMock.mockResolvedValue(2);
    const res = await GET(
      new Request("http://localhost/api/doctor/messages/unread-count?patientUserId=00000000-0000-4000-8000-000000000111"),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; unreadCount: number };
    expect(data.ok).toBe(true);
    expect(data.unreadCount).toBe(2);
    expect(unreadFromPatientMock).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000111");
  });
});
