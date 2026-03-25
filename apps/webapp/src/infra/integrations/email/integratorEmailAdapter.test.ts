import { describe, expect, it, vi } from "vitest";
import { createIntegratorEmailAdapter } from "./integratorEmailAdapter";

describe("integratorEmailAdapter", () => {
  it("returns ok=true when integrator accepts request", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const adapter = createIntegratorEmailAdapter({
      integratorBaseUrl: "http://127.0.0.1:4200",
      sharedSecret: "test-webhook-secret-16chars",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const res = await adapter.sendEmailCode("user@example.com", "123456");

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns error when integrator responds with non-2xx", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "email_not_configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
    const adapter = createIntegratorEmailAdapter({
      integratorBaseUrl: "http://127.0.0.1:4200",
      sharedSecret: "test-webhook-secret-16chars",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const res = await adapter.sendEmailCode("user@example.com", "123456");

    expect(res).toEqual({ ok: false, error: "http_503" });
  });
});
