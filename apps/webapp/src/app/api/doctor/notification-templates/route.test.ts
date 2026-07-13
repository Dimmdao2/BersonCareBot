import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentSessionMock, getAllTemplatesMock, saveTemplateMock, resolveOrganizationForUserMock } = vi.hoisted(
  () => ({
    getCurrentSessionMock: vi.fn(),
    getAllTemplatesMock: vi.fn(),
    saveTemplateMock: vi.fn(),
    resolveOrganizationForUserMock: vi.fn(async () => ({
      ok: true,
      context: {
        organizationId: "550e8400-e29b-41d4-a716-446655440010",
        membershipId: "membership-1",
        role: "owner",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
      },
    })),
  }),
);

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    notifTemplates: {
      getAllTemplates: getAllTemplatesMock,
      saveTemplate: saveTemplateMock,
    },
    organizationMembership: {
      resolveOrganizationForUser: resolveOrganizationForUserMock,
    },
  }),
}));

import { GET, PUT } from "./route";
import {
  NOTIF_TEMPLATE_DEFAULTS,
  NOTIF_TEMPLATE_VARIABLES,
} from "@/modules/notif-templates/notifTemplatesService";

const DOCTOR_SESSION = { user: { userId: "doc1", role: "doctor" } };
const ADMIN_SESSION = { user: { userId: "admin1", role: "admin" } };
const PATIENT_SESSION = { user: { userId: "cli1", role: "client" } };

const DEFAULT_TEMPLATES = [
  { event: "created", audience: "patient", text: NOTIF_TEMPLATE_DEFAULTS.created.patient, isDefault: true },
  { event: "created", audience: "doctor", text: NOTIF_TEMPLATE_DEFAULTS.created.doctor, isDefault: true },
  { event: "cancelled", audience: "patient", text: NOTIF_TEMPLATE_DEFAULTS.cancelled.patient, isDefault: true },
  { event: "cancelled", audience: "doctor", text: NOTIF_TEMPLATE_DEFAULTS.cancelled.doctor, isDefault: true },
  { event: "rescheduled", audience: "patient", text: NOTIF_TEMPLATE_DEFAULTS.rescheduled.patient, isDefault: true },
  { event: "rescheduled", audience: "doctor", text: NOTIF_TEMPLATE_DEFAULTS.rescheduled.doctor, isDefault: true },
];

function putReq(body: unknown) {
  return new Request("http://localhost/api/doctor/notification-templates", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/doctor/notification-templates", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    getAllTemplatesMock.mockReset();
  });

  it("returns 401 when no session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when role is client (requireDoctorWorkspaceApiContext rejects non-doctor)", async () => {
    getCurrentSessionMock.mockResolvedValue(PATIENT_SESSION);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns all 6 templates for doctor", async () => {
    getCurrentSessionMock.mockResolvedValue(DOCTOR_SESSION);
    getAllTemplatesMock.mockResolvedValue(DEFAULT_TEMPLATES);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; templates: unknown[]; variables: string[] };
    expect(body.ok).toBe(true);
    expect(body.templates).toHaveLength(6);
    expect(body.variables).toEqual([...NOTIF_TEMPLATE_VARIABLES]);
    expect(getAllTemplatesMock).toHaveBeenCalledOnce();
  });

  it("allows admin too", async () => {
    getCurrentSessionMock.mockResolvedValue(ADMIN_SESSION);
    getAllTemplatesMock.mockResolvedValue(DEFAULT_TEMPLATES);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/doctor/notification-templates", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    saveTemplateMock.mockReset();
  });

  it("returns 401 when no session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await PUT(putReq({ event: "created", audience: "patient", text: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when role is client (requireDoctorWorkspaceApiContext rejects non-doctor)", async () => {
    getCurrentSessionMock.mockResolvedValue(PATIENT_SESSION);
    const res = await PUT(putReq({ event: "created", audience: "patient", text: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid event", async () => {
    getCurrentSessionMock.mockResolvedValue(DOCTOR_SESSION);
    const res = await PUT(putReq({ event: "unknown_event", audience: "patient", text: "Test" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_body");
  });

  it("returns 400 for invalid audience", async () => {
    getCurrentSessionMock.mockResolvedValue(DOCTOR_SESSION);
    const res = await PUT(putReq({ event: "created", audience: "admin", text: "Test" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty text", async () => {
    getCurrentSessionMock.mockResolvedValue(DOCTOR_SESSION);
    const res = await PUT(putReq({ event: "created", audience: "patient", text: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for text exceeding max length", async () => {
    getCurrentSessionMock.mockResolvedValue(DOCTOR_SESSION);
    const res = await PUT(putReq({ event: "created", audience: "patient", text: "x".repeat(2001) }));
    expect(res.status).toBe(400);
  });

  it("saves template and returns saved entry", async () => {
    getCurrentSessionMock.mockResolvedValue(DOCTOR_SESSION);
    const savedEntry = { event: "created", audience: "patient", text: "Запись: {{date}}", isDefault: false };
    saveTemplateMock.mockResolvedValue(savedEntry);

    const res = await PUT(putReq({ event: "created", audience: "patient", text: "Запись: {{date}}" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; template: typeof savedEntry };
    expect(body.ok).toBe(true);
    expect(body.template).toEqual(savedEntry);
    expect(saveTemplateMock).toHaveBeenCalledWith("created", "patient", "Запись: {{date}}", "doc1", {
      organizationId: "550e8400-e29b-41d4-a716-446655440010",
    });
  });

  it("passes trimmed text to saveTemplate", async () => {
    getCurrentSessionMock.mockResolvedValue(DOCTOR_SESSION);
    saveTemplateMock.mockResolvedValue({ event: "cancelled", audience: "doctor", text: "Отмена {{date}}", isDefault: false });

    await PUT(putReq({ event: "cancelled", audience: "doctor", text: "  Отмена {{date}}  " }));
    expect(saveTemplateMock).toHaveBeenCalledWith("cancelled", "doctor", "Отмена {{date}}", "doc1", {
      organizationId: "550e8400-e29b-41d4-a716-446655440010",
    });
  });

  it("returns 400 for missing body fields", async () => {
    getCurrentSessionMock.mockResolvedValue(DOCTOR_SESSION);
    const res = await PUT(putReq({ event: "created" }));
    expect(res.status).toBe(400);
  });
});
