import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminModeSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/requireAdminMode", () => ({ requireAdminModeSession: requireAdminModeSessionMock }));

import { POST } from "./route";

describe("POST /api/doctor/clients/merge", () => {
  beforeEach(() => requireAdminModeSessionMock.mockResolvedValue({ ok: true, session: { user: { userId: "admin" } } }));

  it("is fail-closed without parsing or writing a merge request", async () => {
    const response = await POST();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "not_available" });
  });
});
