import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockGetCurrentSession = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: mockGetCurrentSession,
}));

const mockCanAccessDoctor = vi.hoisted(() => vi.fn());
vi.mock("@/modules/roles/service", () => ({
  canAccessDoctor: mockCanAccessDoctor,
}));

const mockGetClientIdentity = vi.hoisted(() => vi.fn());
const mockCreateSymptomTracking = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorClientsPort: { getClientIdentity: mockGetClientIdentity },
    diaries: { createSymptomTracking: mockCreateSymptomTracking },
  }),
}));

import { POST } from "./route";

const DOCTOR_SESSION = { user: { userId: "doc-1", role: "doctor" as const } };
const PATIENT_ID = "123e4567-e89b-12d3-a456-426614174000";

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
    mockGetCurrentSession.mockResolvedValue(DOCTOR_SESSION);
    mockCanAccessDoctor.mockReturnValue(true);
    mockGetClientIdentity.mockResolvedValue({ userId: PATIENT_ID, displayName: "P" });
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

  it("returns 401 without session", async () => {
    mockGetCurrentSession.mockResolvedValue(null);
    const res = await POST(post({ symptomTitle: "Боль" }), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when role cannot access doctor", async () => {
    mockCanAccessDoctor.mockReturnValue(false);
    const res = await POST(post({ symptomTitle: "Боль" }), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when client identity missing", async () => {
    mockGetClientIdentity.mockResolvedValue(null);
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
    expect(mockCreateSymptomTracking).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PATIENT_ID,
        symptomTitle: "Боль в спине",
      }),
    );
  });
});
