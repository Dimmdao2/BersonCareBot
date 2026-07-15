import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockRequireDoctorWorkspaceApiContext = vi.hoisted(() => vi.fn());
const mockWithDoctorWorkspacePrincipal = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));
const mockGetClientIdentityForOrganization = vi.hoisted(() => vi.fn());
const mockCreateSymptomTracking = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => mockRequireDoctorWorkspaceApiContext(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) =>
    mockWithDoctorWorkspacePrincipal(ctx, fn),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorClientsPort: { getClientIdentityForOrganization: mockGetClientIdentityForOrganization },
    diaries: { createSymptomTracking: mockCreateSymptomTracking },
  }),
}));

import { POST } from "./route";

const DOCTOR_SESSION = { user: { userId: "doc-1", role: "doctor" as const } };
const PATIENT_ID = "123e4567-e89b-12d3-a456-426614174000";
const ORGANIZATION_ID = "223e4567-e89b-42d3-a456-426614174000";

function post(body: unknown) {
  return new Request(`http://localhost/api/doctor/clients/${PATIENT_ID}/symptom-trackings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/doctor/clients/[userId]/symptom-trackings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        session: DOCTOR_SESSION,
      },
    });
    mockWithDoctorWorkspacePrincipal.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    mockGetClientIdentityForOrganization.mockResolvedValue({ userId: PATIENT_ID, displayName: "P" });
    mockCreateSymptomTracking.mockResolvedValue({
      id: "tr-1",
      userId: PATIENT_ID,
      symptomKey: null,
      symptomTitle: "Боль",
      isActive: true,
      createdAt: "",
      updatedAt: "",
    });
  });

  it("returns workspace gate response when doctor workspace is unavailable", async () => {
    mockRequireDoctorWorkspaceApiContext.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "doctor_workspace_membership_required" }, { status: 403 }),
    });

    const res = await POST(post({ symptomTitle: "Боль" }), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 404 when client identity missing", async () => {
    mockGetClientIdentityForOrganization.mockResolvedValue(null);
    const res = await POST(post({ symptomTitle: "Боль" }), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("creates tracking and returns id", async () => {
    const res = await POST(post({ symptomTitle: "Боль в спине" }), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; tracking: { id: string; symptomTitle: string } };
    expect(body.ok).toBe(true);
    expect(body.tracking.id).toBe("tr-1");
    expect(mockGetClientIdentityForOrganization).toHaveBeenCalledWith(PATIENT_ID, ORGANIZATION_ID);
    expect(mockWithDoctorWorkspacePrincipal).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      expect.any(Function),
    );
    expect(mockCreateSymptomTracking).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PATIENT_ID,
        symptomTitle: "Боль в спине",
      }),
    );
  });
});
