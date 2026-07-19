import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminModeSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/requireAdminMode", () => ({ requireAdminModeSession: requireAdminModeSessionMock }));

import { GET } from "./route";

describe("GET /api/doctor/clients/merge-preview", () => {
  beforeEach(() => requireAdminModeSessionMock.mockResolvedValue({ ok: true, session: { user: { userId: "admin" } } }));

  it("does not inspect supplied patient identifiers", async () => {
    const response = await GET();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "not_available" });
  });
});
