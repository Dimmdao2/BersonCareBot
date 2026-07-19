import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminModeSessionMock,
  getCurrentSessionMock,
  getAllTemplatesMock,
  saveTemplateMock,
  resolveOrganizationForUserMock,
} = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  // requireDoctorWorkspaceApiContext() (called after requireAdminModeSession) reads the real session
  // via getCurrentSession() itself — mock it too so it doesn't hit next/server's cookies() in tests.
  getCurrentSessionMock: vi.fn(async () => ({
    user: { userId: "admin1", role: "admin" as const, bindings: {} },
  })),
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
      canAccessClinicalWorkspace: true,
    },
  })),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

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
  createNotifTemplatesService,
} from "@/modules/notif-templates/notifTemplatesService";

const ADMIN_SESSION = { ok: true as const, session: { user: { userId: "admin1", role: "admin" } } };
const FORBIDDEN = {
  ok: false as const,
  response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
};
const UNAUTHORIZED = {
  ok: false as const,
  response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
};

const DEFAULT_TEMPLATES = [
  { event: "created", audience: "patient", text: NOTIF_TEMPLATE_DEFAULTS.created.patient, isDefault: true },
  { event: "created", audience: "doctor", text: NOTIF_TEMPLATE_DEFAULTS.created.doctor, isDefault: true },
  { event: "cancelled", audience: "patient", text: NOTIF_TEMPLATE_DEFAULTS.cancelled.patient, isDefault: true },
  { event: "cancelled", audience: "doctor", text: NOTIF_TEMPLATE_DEFAULTS.cancelled.doctor, isDefault: true },
  { event: "rescheduled", audience: "patient", text: NOTIF_TEMPLATE_DEFAULTS.rescheduled.patient, isDefault: true },
  { event: "rescheduled", audience: "doctor", text: NOTIF_TEMPLATE_DEFAULTS.rescheduled.doctor, isDefault: true },
];

describe("GET /api/admin/notification-templates", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    getAllTemplatesMock.mockReset();
  });

  it("returns 401 when no session", async () => {
    requireAdminModeSessionMock.mockResolvedValue(UNAUTHORIZED);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    requireAdminModeSessionMock.mockResolvedValue(FORBIDDEN);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns all 6 templates with defaults and variables list", async () => {
    requireAdminModeSessionMock.mockResolvedValue(ADMIN_SESSION);
    getAllTemplatesMock.mockResolvedValue(DEFAULT_TEMPLATES);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; templates: unknown[]; variables: string[] };
    expect(body.ok).toBe(true);
    expect(body.templates).toHaveLength(6);
    expect(body.variables).toEqual([...NOTIF_TEMPLATE_VARIABLES]);
    expect(getAllTemplatesMock).toHaveBeenCalledOnce();
  });

  it("returns isDefault=false for template overridden in DB", async () => {
    requireAdminModeSessionMock.mockResolvedValue(ADMIN_SESSION);
    const overridden = [
      ...DEFAULT_TEMPLATES.slice(1),
      { event: "created", audience: "patient", text: "Кастомный шаблон {{date}}", isDefault: false },
    ];
    getAllTemplatesMock.mockResolvedValue(overridden);

    const res = await GET();
    const body = await res.json() as { templates: Array<{ event: string; audience: string; isDefault: boolean }> };
    const entry = body.templates.find((t) => t.event === "created" && t.audience === "patient");
    expect(entry?.isDefault).toBe(false);
  });
});

describe("PUT /api/admin/notification-templates", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    saveTemplateMock.mockReset();
  });

  it("returns 401 when no session", async () => {
    requireAdminModeSessionMock.mockResolvedValue(UNAUTHORIZED);
    const req = new Request("http://localhost/api/admin/notification-templates", {
      method: "PUT",
      body: JSON.stringify({ event: "created", audience: "patient", text: "Test" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    requireAdminModeSessionMock.mockResolvedValue(FORBIDDEN);
    const req = new Request("http://localhost/api/admin/notification-templates", {
      method: "PUT",
      body: JSON.stringify({ event: "created", audience: "patient", text: "Test" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid event", async () => {
    requireAdminModeSessionMock.mockResolvedValue(ADMIN_SESSION);
    const req = new Request("http://localhost/api/admin/notification-templates", {
      method: "PUT",
      body: JSON.stringify({ event: "unknown_event", audience: "patient", text: "Test" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_body");
  });

  it("returns 400 for invalid audience", async () => {
    requireAdminModeSessionMock.mockResolvedValue(ADMIN_SESSION);
    const req = new Request("http://localhost/api/admin/notification-templates", {
      method: "PUT",
      body: JSON.stringify({ event: "created", audience: "admin", text: "Test" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty text", async () => {
    requireAdminModeSessionMock.mockResolvedValue(ADMIN_SESSION);
    const req = new Request("http://localhost/api/admin/notification-templates", {
      method: "PUT",
      body: JSON.stringify({ event: "created", audience: "patient", text: "" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for text exceeding max length", async () => {
    requireAdminModeSessionMock.mockResolvedValue(ADMIN_SESSION);
    const req = new Request("http://localhost/api/admin/notification-templates", {
      method: "PUT",
      body: JSON.stringify({ event: "created", audience: "patient", text: "x".repeat(2001) }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("saves template and returns saved entry", async () => {
    requireAdminModeSessionMock.mockResolvedValue(ADMIN_SESSION);
    const savedEntry = { event: "created", audience: "patient", text: "Запись: {{date}}", isDefault: false };
    saveTemplateMock.mockResolvedValue(savedEntry);

    const req = new Request("http://localhost/api/admin/notification-templates", {
      method: "PUT",
      body: JSON.stringify({ event: "created", audience: "patient", text: "Запись: {{date}}" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; template: typeof savedEntry };
    expect(body.ok).toBe(true);
    expect(body.template).toEqual(savedEntry);
    expect(saveTemplateMock).toHaveBeenCalledWith("created", "patient", "Запись: {{date}}", "admin1", {
      organizationId: "550e8400-e29b-41d4-a716-446655440010",
    });
  });

  it("passes trimmed text to saveTemplate", async () => {
    requireAdminModeSessionMock.mockResolvedValue(ADMIN_SESSION);
    saveTemplateMock.mockResolvedValue({ event: "cancelled", audience: "doctor", text: "Отмена {{date}}", isDefault: false });

    const req = new Request("http://localhost/api/admin/notification-templates", {
      method: "PUT",
      body: JSON.stringify({ event: "cancelled", audience: "doctor", text: "  Отмена {{date}}  " }),
      headers: { "content-type": "application/json" },
    });
    await PUT(req);
    expect(saveTemplateMock).toHaveBeenCalledWith("cancelled", "doctor", "Отмена {{date}}", "admin1", {
      organizationId: "550e8400-e29b-41d4-a716-446655440010",
    });
  });

  it("returns 400 for missing body fields", async () => {
    requireAdminModeSessionMock.mockResolvedValue(ADMIN_SESSION);
    const req = new Request("http://localhost/api/admin/notification-templates", {
      method: "PUT",
      body: JSON.stringify({ event: "created" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });
});

describe("notifTemplatesService unit", () => {
  it("NOTIF_TEMPLATE_VARIABLES contains all 6 expected variables", () => {
    expect(NOTIF_TEMPLATE_VARIABLES).toContain("date");
    expect(NOTIF_TEMPLATE_VARIABLES).toContain("type");
    expect(NOTIF_TEMPLATE_VARIABLES).toContain("city");
    expect(NOTIF_TEMPLATE_VARIABLES).toContain("name");
    expect(NOTIF_TEMPLATE_VARIABLES).toContain("phone");
    expect(NOTIF_TEMPLATE_VARIABLES).toContain("reason");
  });

  it("NOTIF_TEMPLATE_DEFAULTS covers all 6 event×audience combos", () => {
    for (const event of ["created", "cancelled", "rescheduled"] as const) {
      for (const audience of ["patient", "doctor"] as const) {
        expect(typeof NOTIF_TEMPLATE_DEFAULTS[event][audience]).toBe("string");
        expect(NOTIF_TEMPLATE_DEFAULTS[event][audience].length).toBeGreaterThan(0);
      }
    }
  });

  it("createNotifTemplatesService falls back to defaults when getSetting returns null", async () => {
    const mockSettings = {
      getSetting: vi.fn().mockResolvedValue(null),
      updateSetting: vi.fn(),
    };
    const svc = createNotifTemplatesService(mockSettings);
    const entries = await svc.getAllTemplates();

    expect(entries).toHaveLength(6);
    expect(entries.every((t) => t.isDefault)).toBe(true);

    const created = entries.find((t) => t.event === "created" && t.audience === "patient");
    expect(created?.text).toBe(NOTIF_TEMPLATE_DEFAULTS.created.patient);

    const cancelled = entries.find((t) => t.event === "cancelled" && t.audience === "doctor");
    expect(cancelled?.text).toBe(NOTIF_TEMPLATE_DEFAULTS.cancelled.doctor);
  });
});
