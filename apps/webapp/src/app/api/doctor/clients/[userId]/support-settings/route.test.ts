import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

const patientUserId = "a0000000-0000-4000-8000-000000000001";

describe("doctor client support-settings route", () => {
  it("GET returns profile and effective policy", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const getClientSupport = vi.fn().mockResolvedValue({
      patientUserId,
      onSupport: true,
      commentsEnabled: null,
      mediaEnabled: null,
      updatedAt: "2026-01-01",
      updatedBy: "doc-1",
    });
    const getPatientProgramInteractionPolicy = vi.fn().mockResolvedValue({
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: false,
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentity: vi.fn().mockResolvedValue({ userId: patientUserId }),
      },
      doctorClients: { getClientSupport, getPatientProgramInteractionPolicy },
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientUserId }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      profile?: { onSupport?: boolean };
      effectivePolicy?: { mediaAllowed?: boolean };
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.profile?.onSupport).toBe(true);
    expect(json.effectivePolicy?.mediaAllowed).toBe(false);
  });

  it("PATCH updates support profile", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const updateClientSupport = vi.fn().mockResolvedValue({
      patientUserId,
      onSupport: false,
      commentsEnabled: true,
      mediaEnabled: null,
      updatedAt: "2026-01-02",
      updatedBy: "doc-1",
    });
    const getPatientProgramInteractionPolicy = vi.fn().mockResolvedValue({
      onSupport: false,
      commentsAllowed: true,
      mediaAllowed: false,
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentity: vi.fn().mockResolvedValue({ userId: patientUserId }),
      },
      doctorClients: { updateClientSupport, getPatientProgramInteractionPolicy },
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onSupport: false, commentsEnabled: true }),
      }),
      { params: Promise.resolve({ userId: patientUserId }) },
    );
    const json = (await res.json()) as { ok?: boolean; profile?: { onSupport?: boolean } };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.profile?.onSupport).toBe(false);
    expect(updateClientSupport).toHaveBeenCalledWith({
      patientUserId,
      onSupport: false,
      commentsEnabled: true,
      actorId: "doc-1",
    });
  });
});
