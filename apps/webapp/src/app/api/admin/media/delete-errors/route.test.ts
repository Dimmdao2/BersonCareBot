/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const listMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => getSessionMock(),
}));

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  listMediaDeleteErrors: (...args: unknown[]) => listMock(...args),
}));

import { GET } from "./route";

describe("GET /api/admin/media/delete-errors", () => {
  beforeEach(() => {
    listMock.mockReset();
    getSessionMock.mockReset();
    listMock.mockResolvedValue({ items: [], total: 0 });
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/media/delete-errors"));
    expect(res.status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns 403 when role cannot access doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "client", userId: "u1" } });
    const res = await GET(new Request("http://localhost/api/admin/media/delete-errors"));
    expect(res.status).toBe(403);
  });

  it("returns items and total for doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { role: "doctor", userId: "u1" } });
    listMock.mockResolvedValue({
      total: 2,
      items: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          original_name: "a.bin",
          delete_attempts: 3,
          next_attempt_at: "2026-01-01T00:00:00.000Z",
          created_at: "2025-12-01T00:00:00.000Z",
        },
      ],
    });
    const res = await GET(new Request("http://localhost/api/admin/media/delete-errors?limit=50"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; total: number; items: unknown[] };
    expect(json.ok).toBe(true);
    expect(json.total).toBe(2);
    expect(json.items).toHaveLength(1);
    expect(listMock).toHaveBeenCalledWith(50);
  });
});
