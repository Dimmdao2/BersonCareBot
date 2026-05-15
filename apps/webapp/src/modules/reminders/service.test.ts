import { describe, expect, it, vi } from "vitest";
import { createInMemoryReminderJournalPort } from "@/infra/repos/inMemoryReminderJournal";
import { createInMemoryReminderRulesPort } from "@/infra/repos/inMemoryReminderRules";
import {
  createRemindersService,
  REMINDER_INTEGRATOR_SYNC_WARNING,
  validateReminderDispatchPayload,
} from "./service";
import { DEFAULT_REHAB_DAILY_SLOTS } from "./scheduleSlots";
import type { ReminderRule } from "./types";

const makeRule = (overrides: Partial<ReminderRule> = {}): ReminderRule => ({
  id: "rule-1",
  integratorUserId: "user-1",
  category: "lfk",
  enabled: true,
  timezone: "Europe/Moscow",
  intervalMinutes: 60,
  windowStartMinute: 480,
  windowEndMinute: 1200,
  daysMask: "1111100",
  fallbackEnabled: true,
  linkedObjectType: null,
  linkedObjectId: null,
  customTitle: null,
  customText: null,
  scheduleType: "interval_window",
  scheduleData: null,
  reminderIntent: "generic",
  displayTitle: null,
  displayDescription: null,
  quietHoursStartMinute: null,
  quietHoursEndMinute: null,
  notificationTopicCode: "exercise_reminders",
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

    it("rejects intervalMinutes below 30", async () => {
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port);
      const res = await svc.updateRule("user-1", "rule-1", { intervalMinutes: 29 });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("invalid_interval");
    });

    it("rejects intervalMinutes above 659", async () => {
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port);
      const res = await svc.updateRule("user-1", "rule-1", { intervalMinutes: 660 });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("invalid_interval");
    });

    it("accepts intervalMinutes 30 and 659", async () => {
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port);
      const a = await svc.updateRule("user-1", "rule-1", { intervalMinutes: 30 });
      expect(a.ok).toBe(true);
      const b = await svc.updateRule("user-1", "rule-1", { intervalMinutes: 659 });
      expect(b.ok).toBe(true);
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

    it("applies full interval_window schedule bundle with quiet hours", async () => {
      const port = createInMemoryReminderRulesPort([makeRule()]);
      const svc = createRemindersService(port);
      const res = await svc.updateRule("user-1", "rule-1", {
        schedule: {
          scheduleType: "interval_window",
          intervalMinutes: 90,
          windowStartMinute: 480,
          windowEndMinute: 1320,
          daysMask: "1111100",
          quietHoursStartMinute: 1320,
          quietHoursEndMinute: 360,
        },
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.intervalMinutes).toBe(90);
        expect(res.data.quietHoursStartMinute).toBe(1320);
        expect(res.data.quietHoursEndMinute).toBe(360);
      }
    });

    it("applies slots_v1 schedule bundle", async () => {
      const port = createInMemoryReminderRulesPort([
        makeRule({
          scheduleType: "interval_window",
          scheduleData: null,
        }),
      ]);
      const svc = createRemindersService(port);
      const res = await svc.updateRule("user-1", "rule-1", {
        schedule: {
          scheduleType: "slots_v1",
          intervalMinutes: 60,
          windowStartMinute: 0,
          windowEndMinute: 1440,
          daysMask: "1111111",
          scheduleData: {
            timesLocal: ["10:00", "14:00"],
            dayFilter: "weekdays",
          },
          quietHoursStartMinute: null,
          quietHoursEndMinute: null,
        },
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.scheduleType).toBe("slots_v1");
        expect(res.data.scheduleData?.timesLocal?.length).toBe(2);
      }
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

  describe("createObjectReminder", () => {
    it("creates lfk_complex rule", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const res = await svc.createObjectReminder("user-1", {
        linkedObjectType: "lfk_complex",
        linkedObjectId: "550e8400-e29b-41d4-a716-446655440000",
        schedule: {
          intervalMinutes: 60,
          windowStartMinute: 480,
          windowEndMinute: 1200,
          daysMask: "1111111",
        },
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.linkedObjectType).toBe("lfk_complex");
        expect(res.data.id.startsWith("wp-")).toBe(true);
        expect(res.data.category).toBe("lfk");
      }
    });

    it("rejects empty linkedObjectId", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const res = await svc.createObjectReminder("user-1", {
        linkedObjectType: "content_section",
        linkedObjectId: "  ",
        schedule: {
          intervalMinutes: 60,
          windowStartMinute: 480,
          windowEndMinute: 1200,
          daysMask: "1111111",
        },
      });
      expect(res.ok).toBe(false);
    });

    it("fills DEFAULT_REHAB_DAILY_SLOTS when rehab_program uses slots_v1 without scheduleData", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const res = await svc.createObjectReminder("user-1", {
        linkedObjectType: "rehab_program",
        linkedObjectId: "prog-1",
        schedule: {
          intervalMinutes: 60,
          windowStartMinute: 0,
          windowEndMinute: 1440,
          daysMask: "1111111",
        },
        scheduleType: "slots_v1",
        scheduleData: null,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.scheduleType).toBe("slots_v1");
        expect(res.data.scheduleData).toEqual(DEFAULT_REHAB_DAILY_SLOTS);
      }
    });

    it("allows two reminders for the same linked object (no unique constraint at service layer)", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const sched = {
        intervalMinutes: 60,
        windowStartMinute: 480,
        windowEndMinute: 1200,
        daysMask: "1111111",
      };
      const a = await svc.createObjectReminder("user-1", {
        linkedObjectType: "lfk_complex",
        linkedObjectId: "550e8400-e29b-41d4-a716-446655440000",
        schedule: sched,
      });
      const b = await svc.createObjectReminder("user-1", {
        linkedObjectType: "lfk_complex",
        linkedObjectId: "550e8400-e29b-41d4-a716-446655440000",
        schedule: sched,
      });
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) expect(a.data.id).not.toBe(b.data.id);
    });
  });

  describe("createCustomReminder", () => {
    it("creates custom rule", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const res = await svc.createCustomReminder("user-1", {
        customTitle: "Пить воду",
        customText: "Стакан утром",
        schedule: {
          intervalMinutes: 120,
          windowStartMinute: 0,
          windowEndMinute: 720,
          daysMask: "1111100",
        },
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.linkedObjectType).toBe("custom");
        expect(res.data.customTitle).toBe("Пить воду");
      }
    });

    it("rejects empty customTitle", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const res = await svc.createCustomReminder("user-1", {
        customTitle: "   ",
        schedule: {
          intervalMinutes: 60,
          windowStartMinute: 0,
          windowEndMinute: 720,
          daysMask: "1111111",
        },
      });
      expect(res.ok).toBe(false);
    });
  });

  describe("deleteReminder", () => {
    it("deletes owned rule", async () => {
      const rule = makeRule({ id: "wp-del", integratorUserId: "user-1" });
      const port = createInMemoryReminderRulesPort([rule]);
      const svc = createRemindersService(port);
      const res = await svc.deleteReminder("user-1", "wp-del");
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.deletedId).toBe("wp-del");
    });

    it("returns not_found for other user", async () => {
      const rule = makeRule({ id: "wp-x", integratorUserId: "other" });
      const port = createInMemoryReminderRulesPort([rule]);
      const svc = createRemindersService(port);
      const res = await svc.deleteReminder("user-1", "wp-x");
      expect(res.ok).toBe(false);
    });

    it("returns not_found when rule id does not exist", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const res = await svc.deleteReminder("user-1", "wp-missing");
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("not_found");
    });
  });

  describe("snoozeOccurrence", () => {
    it("returns not_available without journal port", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const res = await svc.snoozeOccurrence("user-1", "occ-1", 30);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("not_available");
    });

    it("records snooze when journal is configured", async () => {
      const journal = createInMemoryReminderJournalPort();
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port, { journal });
      const res = await svc.snoozeOccurrence("user-1", "occ-1", 60);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.occurrenceId).toBe("occ-1");
    });

  });

  describe("skipOccurrence", () => {
    it("returns not_available without journal port", async () => {
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port);
      const res = await svc.skipOccurrence("user-1", "occ-2", "busy");
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("not_available");
    });

    it("records skip when journal is configured", async () => {
      const journal = createInMemoryReminderJournalPort();
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port, { journal });
      const res = await svc.skipOccurrence("user-1", "occ-2", "tired");
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.occurrenceId).toBe("occ-2");
    });

    it("returns stable skippedAt on repeated skip for same occurrence (in-memory idempotency)", async () => {
      const journal = createInMemoryReminderJournalPort();
      const port = createInMemoryReminderRulesPort([]);
      const svc = createRemindersService(port, { journal });
      const first = await svc.skipOccurrence("user-1", "occ-skip-idem", "once");
      const second = await svc.skipOccurrence("user-1", "occ-skip-idem", "again");
      expect(first.ok && second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(second.data.skippedAt).toBe(first.data.skippedAt);
      }
    });
  });
});
