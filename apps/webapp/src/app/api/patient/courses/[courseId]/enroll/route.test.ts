import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const enrollPatientMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    courses: {
      enrollPatient: (...args: unknown[]) => enrollPatientMock(...args),
    },
  }),
}));

import { POST } from "./route";

const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeAllowedGate() {
  return {
    ok: true as const,
    session: {
      user: {
        userId: USER_ID,
        role: "client" as const,
        displayName: "T",
        phone: "+79990001122",
        bindings: {},
      },
      issuedAt: 0,
      expiresAt: 9999999999,
    },
  };
}

describe("POST /api/patient/courses/[courseId]/enroll", () => {
  beforeEach(() => {
    enrollPatientMock.mockReset();
    mockRequirePatientApiBusinessAccess.mockReset();
    mockRequirePatientApiBusinessAccess.mockResolvedValue(makeAllowedGate());
    enrollPatientMock.mockResolvedValue({ id: "instance-1", title: "Программа" });
  });

  it("returns 401 when gate rejects (unauthorized)", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(new Request("http://localhost/api"), {
      params: Promise.resolve({ courseId: COURSE_ID }),
    });
    expect(res.status).toBe(401);
    expect(enrollPatientMock).not.toHaveBeenCalled();
  });

  it("returns 403 when patient activation required", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "patient_activation_required" },
        { status: 403 },
      ),
    });
    const res = await POST(new Request("http://localhost/api"), {
      params: Promise.resolve({ courseId: COURSE_ID }),
    });
    expect(res.status).toBe(403);
    expect(enrollPatientMock).not.toHaveBeenCalled();
  });

  it("returns 400 when courseId is not a valid uuid", async () => {
    const res = await POST(new Request("http://localhost/api"), {
      params: Promise.resolve({ courseId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok?: boolean; error?: string };
    expect(body.error).toBe("invalid_course");
    expect(enrollPatientMock).not.toHaveBeenCalled();
  });

  it("returns 200 with instance and calls enrollPatient with session user and course id", async () => {
    const res = await POST(new Request("http://localhost/api"), {
      params: Promise.resolve({ courseId: COURSE_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; instance?: { id?: string } };
    expect(body.ok).toBe(true);
    expect(body.instance).toEqual({ id: "instance-1", title: "Программа" });
    expect(enrollPatientMock).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      patientUserId: USER_ID,
    });
  });

  it("returns 400 with service error message when enrollPatient throws", async () => {
    enrollPatientMock.mockRejectedValue(new Error("Курс не найден"));
    const res = await POST(new Request("http://localhost/api"), {
      params: Promise.resolve({ courseId: COURSE_ID }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Курс не найден");
  });
});
