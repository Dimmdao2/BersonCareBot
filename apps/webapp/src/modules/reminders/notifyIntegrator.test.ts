import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock env
const mockEnv = vi.hoisted(() => ({
  INTEGRATOR_API_URL: "https://integrator.example",
  INTEGRATOR_WEBHOOK_SECRET: "test-secret",
}));
vi.mock("@/config/env", () => ({ env: mockEnv }));

// Mock fetch
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

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
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("notifyIntegratorRuleUpdated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
    Object.assign(mockEnv, {
      INTEGRATOR_API_URL: "https://integrator.example",
      INTEGRATOR_WEBHOOK_SECRET: "test-secret",
    });
  });

  it("posts signed payload to integrator reminders/rules endpoint", async () => {
    await notifyIntegratorRuleUpdated(baseRule);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://integrator.example/api/integrator/reminders/rules");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>)["x-bersoncare-timestamp"]).toBeDefined();
    expect((opts.headers as Record<string, string>)["x-bersoncare-signature"]).toBeDefined();
    const body = JSON.parse(opts.body as string);
    expect(body.eventType).toBe("reminder.rule.upserted");
    expect(body.rule.id).toBe("rule-abc");
    expect(body.idempotencyKey).toMatch(/^rule_rule-abc_\d+$/);
  });

  it("throws when integrator responds non-200", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("internal error"),
    });
    await expect(notifyIntegratorRuleUpdated(baseRule)).rejects.toThrow("integrator responded 500");
  });

  it("skips and warns when INTEGRATOR_API_URL not set", async () => {
    mockEnv.INTEGRATOR_API_URL = "";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await notifyIntegratorRuleUpdated(baseRule);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
