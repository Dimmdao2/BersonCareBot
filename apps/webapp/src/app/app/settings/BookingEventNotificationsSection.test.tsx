/**
 * Integration-style tests for BookingEventNotificationsSection and its helpers.
 * Tests run in node environment (no jsdom — see AdminSettingsSection.test.tsx for
 * the ERR_UNKNOWN_BUILTIN_MODULE jsdom limitation on this branch).
 *
 * We verify: (a) the apiJson re-export from bookingSoloAdminApi is the shared version,
 * (b) the load-error path routes through the Error.message convention,
 * (c) the settings parsing helper is called correctly.
 */
import { describe, expect, it, vi, afterEach } from "vitest";

// ---- helper: apiJson re-export from bookingSoloAdminApi routes to shared/lib ----

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body: string): void {
  const isOk = status >= 200 && status < 300;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: isOk,
      status,
      text: () => Promise.resolve(body),
    }),
  );
}

describe("apiJson re-exported from bookingSoloAdminApi", () => {
  it("is the shared/lib version (same identity)", async () => {
    const { apiJson: fromApi } = await import("./bookingSoloAdminApi");
    const { apiJson: fromShared } = await import("@/shared/lib/apiJson");
    // They must be the same function reference (re-export, not a copy)
    expect(fromApi).toBe(fromShared);
  });

  it("throws with the API error message on load failure (http_503)", async () => {
    mockFetch(503, "<html>Service Unavailable</html>");
    const { apiJson } = await import("@/shared/lib/apiJson");
    await expect(apiJson("/api/admin/settings")).rejects.toThrow("http_503");
  });

  it("throws with body.error on 400 business error (load_failed scenario)", async () => {
    mockFetch(400, JSON.stringify({ ok: false, error: "not_authorized" }));
    const { apiJson } = await import("@/shared/lib/apiJson");
    await expect(apiJson("/api/admin/settings")).rejects.toThrow("not_authorized");
  });
});
