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
const doctorUserId = "b0000000-0000-4000-8000-000000000002";
const otherDoctorId = "c0000000-0000-4000-8000-000000000003";

const sampleTask = {
  id: "d0000000-0000-4000-8000-000000000004",
  ownerUserId: doctorUserId,
  patientUserId,
  title: "Позвонить",
  description: null,
  dueAt: null,
  remindAt: null,
  isImportant: false,
  completedAt: null,
  reminderSentAt: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("doctor client specialist tasks route", () => {
  it("GET returns 401 without session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientUserId }),
    });
    expect(res.status).toBe(401);
  });

  it("GET returns 403 for client role", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client" } });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientUserId }),
    });
    expect(res.status).toBe(403);
  });

  it("GET returns 404 when patient not found", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: doctorUserId, role: "doctor" } });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getPatientClientIdentity: vi.fn().mockResolvedValue(null) },
      specialistTasks: { listPatientTasks: vi.fn() },
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientUserId }),
    });
    expect(res.status).toBe(404);
  });

  it("GET lists tasks for patient", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: doctorUserId, role: "doctor" } });
    const listPatientTasks = vi.fn().mockResolvedValue([sampleTask]);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getPatientClientIdentity: vi.fn().mockResolvedValue({ userId: patientUserId }),
      },
      specialistTasks: { listPatientTasks },
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientUserId }),
    });
    const json = (await res.json()) as { ok?: boolean; tasks?: unknown[] };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.tasks).toHaveLength(1);
    expect(listPatientTasks).toHaveBeenCalledWith(doctorUserId, patientUserId, false);
  });

  it("POST returns 400 on invalid body", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: doctorUserId, role: "doctor" } });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getPatientClientIdentity: vi.fn().mockResolvedValue({ userId: patientUserId }),
      },
      specialistTasks: { create: vi.fn() },
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
      { params: Promise.resolve({ userId: patientUserId }) },
    );
    expect(res.status).toBe(400);
  });

  it("POST creates patient task", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: doctorUserId, role: "doctor" } });
    const create = vi.fn().mockResolvedValue(sampleTask);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getPatientClientIdentity: vi.fn().mockResolvedValue({ userId: patientUserId }),
      },
      specialistTasks: { create },
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Позвонить", isImportant: true }),
      }),
      { params: Promise.resolve({ userId: patientUserId }) },
    );
    const json = (await res.json()) as { ok?: boolean; task?: { title?: string } };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: doctorUserId,
        patientUserId,
        title: "Позвонить",
        isImportant: true,
      }),
    );
  });
});

describe("GET /api/doctor/clients/:userId/tasks/summary", () => {
  it("returns summary for patient client", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: doctorUserId, role: "doctor" } });
    const getPatientSummary = vi.fn().mockResolvedValue({
      openCount: 2,
      nextImportantOrOverdue: { id: sampleTask.id, title: "Позвонить", dueAt: null, isImportant: true },
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getPatientClientIdentity: vi.fn().mockResolvedValue({ userId: patientUserId }),
      },
      specialistTasks: { getPatientSummary },
    });
    const { GET } = await import("./summary/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientUserId }),
    });
    const json = (await res.json()) as { ok?: boolean; summary?: { openCount?: number } };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.summary?.openCount).toBe(2);
    expect(getPatientSummary).toHaveBeenCalledWith(doctorUserId, patientUserId);
  });
});

describe("POST /api/doctor/tasks/:taskId/complete", () => {
  it("completes task for owner", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: doctorUserId, role: "doctor" } });
    const complete = vi.fn().mockResolvedValue({ ...sampleTask, completedAt: "2026-06-02T00:00:00.000Z" });
    buildAppDepsMock.mockReturnValue({ specialistTasks: { complete } });
    const { POST } = await import("../../../tasks/[taskId]/complete/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ taskId: sampleTask.id }),
    });
    expect(res.status).toBe(200);
    expect(complete).toHaveBeenCalledWith(sampleTask.id, doctorUserId);
  });
});

describe("GET/POST /api/doctor/tasks", () => {
  it("GET lists global tasks", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: doctorUserId, role: "doctor" } });
    const listForOwner = vi.fn().mockResolvedValue([sampleTask]);
    buildAppDepsMock.mockReturnValue({ specialistTasks: { listForOwner } });
    const { GET } = await import("../../../tasks/route");
    const res = await GET(new Request("http://localhost/api/doctor/tasks"));
    expect(res.status).toBe(200);
    expect(listForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: doctorUserId, patientUserId: null }),
    );
  });

  it("POST rejects non-client patientUserId", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: doctorUserId, role: "doctor" } });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getPatientClientIdentity: vi.fn().mockResolvedValue(null) },
      specialistTasks: { create: vi.fn() },
    });
    const { POST } = await import("../../../tasks/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "X",
          patientUserId: patientUserId,
        }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("doctor tasks by id route", () => {
  it("PATCH returns 404 for another owner task", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: otherDoctorId, role: "doctor" } });
    buildAppDepsMock.mockReturnValue({
      specialistTasks: {
        getByIdForOwner: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    });
    const { PATCH } = await import("../../../tasks/[taskId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "X" }),
      }),
      { params: Promise.resolve({ taskId: sampleTask.id }) },
    );
    expect(res.status).toBe(404);
  });
});
