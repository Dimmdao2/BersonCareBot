import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, buildAppDepsMock, unreadFromUsersMock } = vi.hoisted(() => {
  const unreadFromUsersMockInner = vi.fn();
  return {
    getSessionMock: vi.fn(),
    unreadFromUsersMock: unreadFromUsersMockInner,
    buildAppDepsMock: vi.fn(() => ({
      messaging: {
        doctorSupport: {
          unreadFromUsers: unreadFromUsersMockInner,
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
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when not doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "c1", role: "client", bindings: {} },
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns unread count for doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    unreadFromUsersMock.mockResolvedValue(4);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; unreadCount: number };
    expect(data.ok).toBe(true);
    expect(data.unreadCount).toBe(4);
  });
});
