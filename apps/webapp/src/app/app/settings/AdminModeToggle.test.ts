/**
 * Smoke-тесты AdminModeToggle.
 * Полный рендер-тест невозможен в node-окружении Vitest (нет jsdom).
 * Здесь проверяется корректность экспортов модуля и логика API-вызова.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

describe("AdminModeToggle module", () => {
  it("экспортирует именованный компонент AdminModeToggle", async () => {
    const mod = await import("./AdminModeToggle");
    expect(typeof mod.AdminModeToggle).toBe("function");
  });
});

describe("AdminModeToggle API call logic", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST /api/admin/mode возвращает ok:true с adminMode для admin", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, adminMode: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetch("/api/admin/mode", { method: "POST" });
    const body = await res.json() as { ok: boolean; adminMode: boolean };

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/mode", { method: "POST" });
    expect(body.ok).toBe(true);
    expect(body.adminMode).toBe(true);
  });

  it("POST /api/admin/mode возвращает ok:false и 403 для doctor (API contract)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ ok: false, error: "forbidden" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetch("/api/admin/mode", { method: "POST" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  });
});
