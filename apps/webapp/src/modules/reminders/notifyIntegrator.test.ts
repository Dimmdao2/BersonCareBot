import { describe, expect, it, vi, beforeEach } from "vitest";

const runtimeConfig = vi.hoisted(() => ({
  baseUrl: "https://integrator.example",
  secret: "test-secret",
}));
vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorApiUrl: async () => runtimeConfig.baseUrl,
  getIntegratorWebhookSecret: async () => runtimeConfig.secret,
}));

// Mock fetch
const mockFetch = vi.hoisted(() => vi.fn());
const enqueueIntegratorPushMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/infra/integrator-push/integratorPushOutbox", () => ({
  enqueueIntegratorPush: enqueueIntegratorPushMock,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: vi.fn() }),
}));

import { notifyIntegratorRuleUpdated } from "./notifyIntegrator";
import type { ReminderRule } from "./types";

const baseRule: ReminderRule = {
  id: "rule-abc",
  integratorUserId: "42",
  category: "lfk",
  enabled: true,
  intervalMinutes: 60,
  windowStartMinute: 480,
  windowEndMinute: 1200,
  daysMask: "1111100",
  fallbackEnabled: true,
  linkedObjectType: null,
  linkedObjectId: null,
  customTitle: null,
  customText: null,
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("notifyIntegratorRuleUpdated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });
    runtimeConfig.baseUrl = "https://integrator.example";
    runtimeConfig.secret = "test-secret";
    enqueueIntegratorPushMock.mockClear();
  });

  it("posts signed payload to integrator reminders/rules endpoint", async () => {
    await notifyIntegratorRuleUpdated(baseRule);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://integrator.example/api/integrator/reminders/rules");
    expect(opts.method).toBe("POST");
    const timestamp = (opts.headers as Record<string, string>)["x-bersoncare-timestamp"];
    expect(timestamp).toBeDefined();
    expect(Number(timestamp)).toBeGreaterThan(1_700_000_000);
    expect(Number(timestamp)).toBeLessThan(4_000_000_000);
    expect((opts.headers as Record<string, string>)["x-bersoncare-signature"]).toBeDefined();
    const body = JSON.parse(opts.body as string);
    expect(body.eventType).toBe("reminder.rule.upserted");
    expect(body.payload.integratorRuleId).toBe("rule-abc");
    expect(body.payload.integratorUserId).toBe("42");
    expect(body.payload.scheduleType).toBe("interval_window");
    expect(body.payload.timezone).toBe("Europe/Moscow");
    expect(body.idempotencyKey).toMatch(/^rule_rule-abc_\d+$/);
  });

  it("enqueues outbox when integrator responds non-200", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("internal error"),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await notifyIntegratorRuleUpdated(baseRule);
    expect(enqueueIntegratorPushMock).toHaveBeenCalledTimes(1);
    expect(enqueueIntegratorPushMock.mock.calls[0]![1]).toMatchObject({
      kind: "reminder_rule_upsert",
      idempotencyKey: "reminder_rule:rule-abc",
    });
    warnSpy.mockRestore();
  });

  it("skips and warns when INTEGRATOR_API_URL not set", async () => {
    runtimeConfig.baseUrl = "";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await notifyIntegratorRuleUpdated(baseRule);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
