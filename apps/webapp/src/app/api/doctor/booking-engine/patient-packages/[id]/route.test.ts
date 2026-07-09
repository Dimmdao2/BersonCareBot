import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const getPatientPackageDetailMock = vi.hoisted(() => vi.fn());
const updatePatientPackageNotesMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T,>(
    _workspace: { organizationId: string },
    _source: string,
    fn: () => Promise<T>,
  ) => {
    principalState.inside = true;
    try {
      return await fn();
    } finally {
      principalState.inside = false;
    }
  }),
);

vi.mock("../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    memberships: {
      getPatientPackageDetail: getPatientPackageDetailMock,
      updatePatientPackageNotes: updatePatientPackageNotesMock,
    },
  }),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { GET, PATCH } from "./route";

const PKG_ID = "550e8400-e29b-41d4-a716-446655440010";

type MembershipWriteOptions = {
  runMembershipWrite?: <T>(fn: () => Promise<T>) => Promise<T>;
};

describe("/api/doctor/booking-engine/patient-packages/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "u1" } } },
    });
  });

  it("GET returns detail with history", async () => {
    getPatientPackageDetailMock.mockResolvedValue({
      package: { id: PKG_ID, title: "T", notes: "n1" },
      usages: [],
      history: [{ id: "h1", eventType: "manual_created", payloadJson: {}, occurredAt: "2026-01-01T00:00:00Z" }],
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    const json = (await res.json()) as { ok?: boolean; history?: unknown[] };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.history).toHaveLength(1);
  });

  it("PATCH updates notes", async () => {
    updatePatientPackageNotesMock.mockImplementation(
      async (
        _id: string,
        _organizationId: string,
        _notes: string | null,
        options?: MembershipWriteOptions,
      ) =>
        options?.runMembershipWrite
          ? options.runMembershipWrite(async () => {
              expect(principalState.inside).toBe(true);
              return { id: PKG_ID, notes: "updated" };
            })
          : { id: PKG_ID, notes: "updated" },
    );
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "updated" }),
      }),
      { params: Promise.resolve({ id: PKG_ID }) },
    );
    const json = (await res.json()) as { ok?: boolean; package?: { notes?: string } };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.package?.notes).toBe("updated");
    expect(updatePatientPackageNotesMock).toHaveBeenCalledWith(
      PKG_ID,
      "org-1",
      "updated",
      expect.objectContaining({ runMembershipWrite: expect.any(Function) }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "doctor.booking-engine.patient-packages.notes.update",
      expect.any(Function),
    );
  });
});
