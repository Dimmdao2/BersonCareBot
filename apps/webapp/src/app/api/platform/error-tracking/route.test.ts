import { beforeEach, describe, expect, it, vi } from "vitest";

const { guardMock, listMock, persistMock } = vi.hoisted(() => ({
  guardMock: vi.fn(),
  listMock: vi.fn(),
  persistMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({ requirePlatformOperationsApiContext: guardMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { listSettingsByScope: listMock, persistErrorTrackingConfig: persistMock },
  }),
}));

import { GET, PUT } from "./route";

const session = {
  user: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" as const, bindings: {} },
  adminMode: true,
};

describe("/api/platform/error-tracking", () => {
  beforeEach(() => {
    guardMock.mockReset().mockResolvedValue({ ok: true, session });
    listMock.mockReset().mockResolvedValue([
      { key: "error_tracking_enabled", valueJson: { value: true } },
      { key: "error_tracking_dsn", valueJson: { value: "https://public@example.test/1" } },
    ]);
    persistMock.mockReset().mockResolvedValue([]);
  });

  it("returns only derived DSN state", async () => {
    const body = await (await GET()).json();
    expect(body).toEqual({ ok: true, config: { enabled: true, hasStoredDsn: true } });
    expect(JSON.stringify(body)).not.toContain("example.test");
  });

  it("atomically saves a normalized valid pair", async () => {
    const response = await PUT(new Request("http://localhost/api/platform/error-tracking", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true, dsn: " https://public@example.test/1 " }),
    }));
    expect(response.status).toBe(200);
    expect(persistMock).toHaveBeenCalledWith(
      { enabled: true, dsn: "https://public@example.test/1" },
      session.user.userId,
    );
  });

  it("rejects invalid or missing DSN while enabled", async () => {
    for (const dsn of ["", "ftp://public@example.test/1", "https://example.test/1"]) {
      const response = await PUT(new Request("http://localhost/api/platform/error-tracking", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true, dsn }),
      }));
      expect(response.status).toBe(400);
    }
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("disabling clears the DSN in the same write", async () => {
    const response = await PUT(new Request("http://localhost/api/platform/error-tracking", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false, dsn: "" }),
    }));
    expect(response.status).toBe(200);
    expect(persistMock).toHaveBeenCalledWith({ enabled: false, dsn: "" }, session.user.userId);
  });

  it("disabling ignores a submitted DSN and always clears it", async () => {
    const response = await PUT(new Request("http://localhost/api/platform/error-tracking", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false, dsn: "https://public@example.test/1" }),
    }));
    expect(response.status).toBe(200);
    expect(persistMock).toHaveBeenCalledWith({ enabled: false, dsn: "" }, session.user.userId);
  });
});
