/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const purgeMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: {
    INTERNAL_JOB_SECRET: "test-internal-secret",
  },
}));

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  purgePendingMediaDeleteBatch: (...args: unknown[]) => purgeMock(...args),
}));

import { POST } from "./route";

describe("POST /api/internal/media-pending-delete/purge", () => {
  beforeEach(() => {
    purgeMock.mockReset();
    purgeMock.mockResolvedValue({ removed: 2, errors: 0 });
  });

  it("returns 401 without bearer token", async () => {
    const res = await POST(new Request("http://localhost/api/internal/media-pending-delete/purge", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer does not match", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-pending-delete/purge", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer length matches secret but value differs (timing-safe path)", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-pending-delete/purge", {
        method: "POST",
        headers: {
          authorization: `Bearer ${"x".repeat("test-internal-secret".length)}`,
        },
      }),
    );
    expect(res.status).toBe(401);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("purges batch when authorized", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-pending-delete/purge?limit=10", {
        method: "POST",
        headers: { authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; removed: number; errors: number };
    expect(json.ok).toBe(true);
    expect(json.removed).toBe(2);
    expect(json.errors).toBe(0);
    expect(purgeMock).toHaveBeenCalledWith(10);
  });
});
