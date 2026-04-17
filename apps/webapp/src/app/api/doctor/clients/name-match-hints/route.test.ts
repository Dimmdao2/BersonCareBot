import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, buildReportMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  buildReportMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: getSessionMock,
}));
vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({}),
}));
vi.mock("@/app-layer/merge/platformUserNameMatchHints", () => ({
  buildNameMatchHintsReport: (...args: unknown[]) => buildReportMock(...args),
}));

import { GET } from "./route";

const adminOk = {
  ok: true as const,
  session: {
    user: { userId: "a1", role: "admin" as const, displayName: "Admin", bindings: {} },
    adminMode: true,
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  },
};

describe("GET /api/doctor/clients/name-match-hints", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    buildReportMock.mockReset();
    getSessionMock.mockResolvedValue(adminOk);
  });

  it("returns 403 when not admin mode", async () => {
    getSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api"));
    expect(res.status).toBe(403);
    expect(buildReportMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid limitGroups", async () => {
    const res = await GET(new Request("http://localhost/api?limitGroups=0"));
    expect(res.status).toBe(400);
    expect(buildReportMock).not.toHaveBeenCalled();
  });

  it("returns ordered groups and swapped pairs", async () => {
    const d = new Date("2022-01-01T00:00:00.000Z");
    buildReportMock.mockResolvedValue({
      orderedGroups: [
        {
          normalizedFirst: "ivan",
          normalizedLast: "petrov",
          members: [
            {
              id: "u1",
              display_name: "A",
              first_name: "Ivan",
              last_name: "Petrov",
              phone_normalized: null,
              integrator_user_id: "1",
              created_at: d,
            },
          ],
        },
      ],
      swappedPairs: [],
      disclaimer: "test disclaimer",
    });

    const res = await GET(new Request("http://localhost/api?missingPhone=1"));
    expect(res.status).toBe(200);
    expect(buildReportMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ missingPhone: true }),
    );
    const body = (await res.json()) as {
      ok: boolean;
      orderedGroups: Array<{ members: Array<{ createdAt: string }> }>;
      disclaimer: string;
    };
    expect(body.ok).toBe(true);
    expect(body.orderedGroups[0].members[0].createdAt).toBe(d.toISOString());
    expect(body.disclaimer).toBe("test disclaimer");
  });
});
