import { describe, expect, it, vi } from "vitest";
import { createInMemoryReminderRulesPort } from "@/infra/repos/inMemoryReminderRules";
import {
  createRemindersService,
  REMINDER_INTEGRATOR_SYNC_WARNING,
  validateReminderDispatchPayload,
} from "./service";
import type { ReminderRule } from "./types";

const makeRule = (overrides: Partial<ReminderRule> = {}): ReminderRule => ({
  id: "rule-1",
  integratorUserId: "user-1",
  category: "lfk",
  enabled: true,
  intervalMinutes: 60,
  windowStartMinute: 480,
  windowEndMinute: 1200,
  daysMask: "1111100",
  fallbackEnabled: true,
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("reminders service", () => {
  describe("listRulesByUser", () => {
    it("returns rules for the user", async () => {
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port);
      const rules = await svc.listRulesByUser("user-1");
      expect(rules).toHaveLength(1);
      expect(rules[0].category).toBe("lfk");
    });

    it("returns empty array if user has no rules", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      expect(await svc.listRulesByUser("unknown")).toEqual([]);
    });
  });

  describe("toggleCategory", () => {
    it("toggles enabled → false", async () => {
      const port = createInMemoryReminderRulesPort([makeRule({ enabled: true })]);
      const svc = createRemindersService(port);
      const res = await svc.toggleCategory("user-1", "lfk", false);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.enabled).toBe(false);
    });

    it("returns error if category not found", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const res = await svc.toggleCategory("user-1", "lfk", true);
      expect(res.ok).toBe(false);
    });

    it("calls notifyIntegrator after toggle", async () => {
      const notify = vi.fn().mockResolvedValue(undefined);
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port, { notifyIntegrator: notify });
      await svc.toggleCategory("user-1", "lfk", false);
      expect(notify).toHaveBeenCalledOnce();
    });

    it("returns syncWarning if notifyIntegrator fails", async () => {
      const notify = vi.fn().mockRejectedValue(new Error("timeout"));
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port, { notifyIntegrator: notify });
      const res = await svc.toggleCategory("user-1", "lfk", false);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.syncWarning).toBe(REMINDER_INTEGRATOR_SYNC_WARNING);
    });
  });

  describe("updateRule", () => {
    it("updates schedule for known rule", async () => {
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port);
      const res = await svc.updateRule("user-1", "rule-1", {
        windowStartMinute: 600,
        windowEndMinute: 1020,
        intervalMinutes: 120,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.windowStartMinute).toBe(600);
        expect(res.data.windowEndMinute).toBe(1020);
        expect(res.data.intervalMinutes).toBe(120);
      }
    });

    it("returns error for unknown rule", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const res = await svc.updateRule("user-1", "does-not-exist", { intervalMinutes: 30 });
      expect(res.ok).toBe(false);
    });

    it("rejects windowStart >= windowEnd", async () => {
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port);
      const res = await svc.updateRule("user-1", "rule-1", {
        windowStartMinute: 900,
        windowEndMinute: 900,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("invalid_window");
    });

    it("rejects intervalMinutes <= 0", async () => {
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port);
      const res = await svc.updateRule("user-1", "rule-1", { intervalMinutes: 0 });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("invalid_interval");
    });

    it("returns syncWarning if notifyIntegrator fails after update", async () => {
      const notify = vi.fn().mockRejectedValue(new Error("network"));
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port, { notifyIntegrator: notify });
      const res = await svc.updateRule("user-1", "rule-1", { intervalMinutes: 90 });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.syncWarning).toBe(REMINDER_INTEGRATOR_SYNC_WARNING);
    });
  });

  describe("validateReminderDispatchPayload", () => {
    it("accepts valid payload", () => {
      expect(
        validateReminderDispatchPayload({
          idempotencyKey: "k",
          userId: "u",
          message: { title: "T", body: "B" },
        }),
      ).toBe(true);
    });

    it("rejects null", () => {
      expect(validateReminderDispatchPayload(null)).toBe(false);
    });

    it("rejects missing idempotencyKey", () => {
      expect(
        validateReminderDispatchPayload({
          userId: "u",
          message: { title: "T", body: "B" },
        }),
      ).toBe(false);
    });

    it("rejects missing message.body", () => {
      expect(
        validateReminderDispatchPayload({
          idempotencyKey: "k",
          userId: "u",
          message: { title: "T" },
        }),
      ).toBe(false);
    });
  });
});
