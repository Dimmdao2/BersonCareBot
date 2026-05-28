import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryProductAnalyticsPort } from "@/infra/repos/inMemoryProductAnalytics";

const { requireAdminModeSessionMock, listRegistrationEventsMock } = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  listRegistrationEventsMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    productAnalytics: {
      listRegistrationEvents: listRegistrationEventsMock,
    },
  }),
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

import { GET } from "./route";

describe("GET /api/admin/auth-registration-events", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    listRegistrationEventsMock.mockReset();
  });

  it("returns 403 when not admin mode", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request("http://localhost/api/admin/auth-registration-events"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when custom preset without from/to", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    const res = await GET(
      new Request("http://localhost/api/admin/auth-registration-events?preset=custom"),
    );
    expect(res.status).toBe(400);
  });

  it("returns list when authorized", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    listRegistrationEventsMock.mockResolvedValue({
      items: [
        {
          id: "e1",
          occurredAt: "2026-05-28T10:00:00.000Z",
          eventType: "auth_register_failure",
          entryChannel: "browser",
          userId: null,
          metadata: { attemptId: "a1", errorClass: "system", authMethod: "email_password" },
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    const res = await GET(
      new Request(
        "http://localhost/api/admin/auth-registration-events?preset=week&eventType=auth_register_failure&errorClass=system",
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; total: number; items: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.total).toBe(1);
    expect(listRegistrationEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "auth_register_failure",
        errorClass: "system",
        page: 1,
        limit: 50,
      }),
    );
  });
});

describe("listRegistrationEvents port", () => {
  it("filters registration events by type and errorClass", async () => {
    const port = createInMemoryProductAnalyticsPort();
    await port.recordEventsBatch([
      {
        eventType: "auth_register_failure",
        entryChannel: "browser",
        metadata: {
          attemptId: "a1",
          authMethod: "email_password",
          errorCode: "server_error",
          errorClass: "system",
        },
      },
      {
        eventType: "auth_register_failure",
        entryChannel: "browser",
        metadata: {
          attemptId: "a2",
          authMethod: "email_password",
          errorCode: "duplicate_email",
          errorClass: "user",
        },
      },
    ]);

    const result = await port.listRegistrationEvents({
      startIso: new Date(Date.now() - 3600_000).toISOString(),
      endExclusiveIso: new Date(Date.now() + 3600_000).toISOString(),
      eventType: "auth_register_failure",
      errorClass: "system",
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.metadata.attemptId).toBe("a1");
  });
});
