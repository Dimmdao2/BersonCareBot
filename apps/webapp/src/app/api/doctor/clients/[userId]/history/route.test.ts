import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

describe("doctor client history route", () => {
  it("GET returns timeline, payments and visits", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const listTimeline = vi.fn().mockResolvedValue([{ id: "t1" }]);
    const listPaymentHistory = vi.fn().mockResolvedValue([{ id: "p1" }]);
    const listVisitHistory = vi.fn().mockResolvedValue([{ appointmentId: "a1" }]);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentity: vi.fn().mockResolvedValue({ userId: "user-1" }),
      },
      bookingEngine: {
        organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      },
      clientHistory: { listTimeline, listPaymentHistory, listVisitHistory },
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: "a0000000-0000-4000-8000-000000000001" }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      timeline?: unknown[];
      payments?: unknown[];
      visits?: unknown[];
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.timeline).toHaveLength(1);
    expect(json.payments).toHaveLength(1);
    expect(json.visits).toHaveLength(1);
    expect(listTimeline).toHaveBeenCalledWith("org-1", "a0000000-0000-4000-8000-000000000001");
  });

  it("GET returns 404 when client not found", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentity: vi.fn().mockResolvedValue(null) },
      bookingEngine: {
        organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      },
      clientHistory: {},
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: "a0000000-0000-4000-8000-000000000001" }),
    });
    expect(res.status).toBe(404);
  });
});
