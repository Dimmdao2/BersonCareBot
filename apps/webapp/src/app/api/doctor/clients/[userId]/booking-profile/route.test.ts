import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

describe("doctor client booking-profile route", () => {
  it("PATCH updates profile", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const upsertBookingProfile = vi.fn().mockResolvedValue({
      platformUserId: "user-1",
      organizationId: "org-1",
      isProblematic: true,
      bookingBlocked: false,
      problematicNote: null,
      updatedAt: "2026-01-01",
      updatedBy: "doc-1",
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentity: vi.fn().mockResolvedValue({ userId: "user-1" }),
      },
      bookingEngine: {
        organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      },
      clientHistory: { upsertBookingProfile },
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isProblematic: true }),
      }),
      { params: Promise.resolve({ userId: "a0000000-0000-4000-8000-000000000001" }) },
    );
    const json = (await res.json()) as { ok?: boolean; profile?: { isProblematic?: boolean } };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.profile?.isProblematic).toBe(true);
    expect(upsertBookingProfile).toHaveBeenCalled();
  });
});
