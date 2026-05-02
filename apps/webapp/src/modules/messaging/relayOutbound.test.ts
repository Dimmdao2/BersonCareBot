import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const INSTANT_DELAYS = [0, 0, 0, 0];

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const runtimeConfig = vi.hoisted(() => ({
  baseUrl: "http://integrator.test",
  secret: "test-webhook-secret-16",
}));
vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorApiUrl: async () => runtimeConfig.baseUrl,
  getIntegratorWebhookSecret: async () => runtimeConfig.secret,
}));

// Reset module cache to reset warnedMissingUrl flag between tests
beforeEach(() => {
  fetchMock.mockReset();
  vi.resetModules();
  runtimeConfig.baseUrl = "http://integrator.test";
  runtimeConfig.secret = "test-webhook-secret-16";
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function importRelay() {
  const mod = await import("./relayOutbound");
  return mod;
}

const baseParams = {
  messageId: "msg-1",
  channel: "telegram",
  recipient: "123456789",
  text: "hello",
};

describe("relayOutbound", () => {
  it("успешный relay → ok: true, status: accepted", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, status: "accepted" }),
    });

    const { relayOutbound } = await importRelay();
    const result = await relayOutbound(baseParams, { retryDelaysMs: INSTANT_DELAYS });

    expect(result).toEqual({ ok: true, status: "accepted" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toContain("/api/bersoncare/relay-outbound");
    expect(call[1].headers).toMatchObject({
      "X-Bersoncare-Timestamp": expect.any(String),
      "X-Bersoncare-Signature": expect.any(String),
    });
    const body = JSON.parse(call[1].body as string) as Record<string, string>;
    expect(body.idempotencyKey).toBe("msg-1:telegram:123456789");
  });

  it("idempotency duplicate → ok: true, status: duplicate", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, status: "duplicate" }),
    });

    const { relayOutbound } = await importRelay();
    const result = await relayOutbound(baseParams, { retryDelaysMs: INSTANT_DELAYS });

    expect(result).toEqual({ ok: true, status: "duplicate" });
  });

  it("502 → retry до 4 раз → ok: false", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: "dispatch_failed" }),
    });

    const { relayOutbound } = await importRelay();
    const result = await relayOutbound(baseParams, { retryDelaysMs: INSTANT_DELAYS });

    expect(result).toEqual({ ok: false, reason: "dispatch_failed" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("fetch throws → retry → ok: false", async () => {
    fetchMock.mockRejectedValue(new Error("network error"));

    const { relayOutbound } = await importRelay();
    const result = await relayOutbound(baseParams, { retryDelaysMs: INSTANT_DELAYS });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("shouldDispatchRelay false → skip relay", async () => {
    const { relayOutbound } = await importRelay();
    const result = await relayOutbound(baseParams, {
      shouldDispatchRelay: async () => false,
      retryDelaysMs: INSTANT_DELAYS,
    });

    expect(result).toEqual({ ok: false, reason: "dev_mode_skip" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shouldDispatchRelay true → relay proceeds", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, status: "accepted" }),
    });

    const { relayOutbound } = await importRelay();
    const result = await relayOutbound(baseParams, {
      shouldDispatchRelay: async () => true,
      retryDelaysMs: INSTANT_DELAYS,
    });

    expect(result).toEqual({ ok: true, status: "accepted" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shouldDispatchRelay получает channel и recipient", async () => {
    const guard = vi.fn(async () => true);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, status: "accepted" }),
    });

    const { relayOutbound } = await importRelay();
    await relayOutbound(baseParams, { shouldDispatchRelay: guard, retryDelaysMs: INSTANT_DELAYS });

    expect(guard).toHaveBeenCalledWith({ channel: "telegram", recipient: "123456789" });
  });

  it("401 → прерывает retry без дополнительных попыток", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, error: "invalid_signature" }),
    });

    const { relayOutbound } = await importRelay();
    const result = await relayOutbound(baseParams, { retryDelaysMs: INSTANT_DELAYS });

    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
    // Retry прерван после первой попытки
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("400 → прерывает retry (client error)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, error: "invalid_payload" }),
    });

    const { relayOutbound } = await importRelay();
    const result = await relayOutbound(baseParams, { retryDelaysMs: INSTANT_DELAYS });

    expect(result).toEqual({ ok: false, reason: "invalid_payload" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("нет INTEGRATOR_API_URL → warn + ok: false reason: no_integrator_url", async () => {
    runtimeConfig.baseUrl = "";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { relayOutbound } = await import("./relayOutbound");
    const result = await relayOutbound(baseParams, { retryDelaysMs: INSTANT_DELAYS });

    expect(result).toEqual({ ok: false, reason: "no_integrator_url" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
