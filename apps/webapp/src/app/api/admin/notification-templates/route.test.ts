import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultManagedNotifTemplate } from "@/modules/notif-templates/managedNotifTemplate";
import { NotifTemplateConflictError } from "@/modules/notif-templates/notifTemplatesService";

const { platformGuardMock, getManagedTemplatesMock, getPresentationMock, saveTemplateMock, savePresentationMock } =
  vi.hoisted(() => ({
    platformGuardMock: vi.fn(),
    getManagedTemplatesMock: vi.fn(),
    getPresentationMock: vi.fn(),
    saveTemplateMock: vi.fn(),
    savePresentationMock: vi.fn(),
  }));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePlatformOperationsApiContext: platformGuardMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    notifTemplates: {
      getManagedTemplates: getManagedTemplatesMock,
      getManagedPresentation: getPresentationMock,
      saveManagedTemplate: saveTemplateMock,
      saveManagedPresentation: savePresentationMock,
    },
  }),
}));

import { GET, POST, PUT } from "./route";

const ALLOWED = { ok: true as const, session: { user: { userId: "platform-user" } } };
const DENIED = {
  ok: false as const,
  response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
};

function request(method: "POST" | "PUT", body: unknown) {
  return new Request("http://localhost/api/admin/notification-templates", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("platform notification templates API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformGuardMock.mockResolvedValue(ALLOWED);
    getManagedTemplatesMock.mockResolvedValue([]);
    getPresentationMock.mockResolvedValue({ presentation: {}, metadata: {} });
  });

  it("denies non-platform actors before reading settings", async () => {
    platformGuardMock.mockResolvedValue(DENIED);
    expect((await GET()).status).toBe(403);
    expect(getManagedTemplatesMock).not.toHaveBeenCalled();
  });

  it("reads only platform NULL defaults", async () => {
    expect((await GET()).status).toBe(200);
    expect(getManagedTemplatesMock).toHaveBeenCalledWith({ organizationId: null });
    expect(getPresentationMock).toHaveBeenCalledWith({ organizationId: null });
  });

  it("writes a versioned platform template through the service", async () => {
    const channels = createDefaultManagedNotifTemplate("created", "patient").channels;
    saveTemplateMock.mockResolvedValue({ event: "created" });
    const response = await PUT(request("PUT", {
      kind: "template",
      event: "created",
      audience: "patient",
      channels,
      expectedUpdatedAt: null,
    }));
    expect(response.status).toBe(200);
    expect(saveTemplateMock).toHaveBeenCalledWith(
      "created",
      "patient",
      channels,
      "platform-user",
      null,
      { organizationId: null },
    );
  });

  it("builds a synthetic preview without a sender dependency", async () => {
    const channels = createDefaultManagedNotifTemplate("created", "patient").channels;
    const response = await POST(request("POST", {
      event: "created",
      audience: "patient",
      channel: "email",
      channels,
      presentation: { layout: "neutral", signature: "", contacts: "" },
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as { rendered: { channel: string; html: string } };
    expect(body.rendered.channel).toBe("email");
    expect(body.rendered.html).toContain("Название клиники");
  });

  it("returns an explicit conflict for a stale editor revision", async () => {
    const channels = createDefaultManagedNotifTemplate("created", "patient").channels;
    saveTemplateMock.mockRejectedValue(new NotifTemplateConflictError());
    const response = await PUT(request("PUT", {
      kind: "template",
      event: "created",
      audience: "patient",
      channels,
      expectedUpdatedAt: "2026-07-21T10:00:00.000Z",
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "template_conflict" });
  });
});
