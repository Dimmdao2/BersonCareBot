import { describe, expect, it, vi } from "vitest";
import { buildDiaryPlanReminderStrip } from "./buildDiaryPlanReminderStrip";
import type { ReminderRule } from "@/modules/reminders/types";

const baseRule = (patch: Partial<ReminderRule>): ReminderRule =>
  ({
    id: "r1",
    userId: "u1",
    enabled: true,
    scheduleType: "slots_v1",
    scheduleData: { timesLocal: ["09:00"], dayFilter: "weekdays" },
    daysMask: "1111100",
    intervalMinutes: 60,
    windowStartMinute: 0,
    windowEndMinute: 1439,
    timezone: "Europe/Moscow",
    quietHoursStartMinute: null,
    quietHoursEndMinute: null,
    linkedObjectType: "rehab_program",
    linkedObjectId: "plan-1",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...patch,
  }) as ReminderRule;

describe("buildDiaryPlanReminderStrip", () => {
  it("uses active plan rehab rule and warmups section rule", async () => {
    const rules = [
      baseRule({ id: "rehab", linkedObjectType: "rehab_program", linkedObjectId: "plan-1" }),
      baseRule({
        id: "warm",
        linkedObjectType: "content_section",
        linkedObjectId: "warmups",
        scheduleData: { timesLocal: ["10:00"], dayFilter: "weekdays" },
      }),
    ];
    const deps = {
      reminders: { listRulesByUser: vi.fn().mockResolvedValue(rules) },
      treatmentProgramInstance: {
        listForPatient: vi.fn().mockResolvedValue([
          {
            id: "plan-1",
            status: "active",
            updatedAt: "2026-05-10T00:00:00.000Z",
          },
        ]),
      },
      patientCalendarTimezone: { getIanaForUser: vi.fn().mockResolvedValue("Europe/Moscow") },
      contentSections: {
        getBySlug: vi.fn().mockResolvedValue({ requiresAuth: false, isVisible: true }),
        getRedirectNewSlugForOldSlug: vi.fn().mockResolvedValue(null),
      },
    };

    const strip = await buildDiaryPlanReminderStrip(deps, "u1", true);

    expect(strip.rehabTodayLine).toMatch(/09:00|не настроено|Сегодня|На сегодня/);
    expect(strip.warmupTodayLine).toMatch(/10:00|не настроено|Сегодня|На сегодня/);
    expect(strip.remindersHref).toContain("#patient-reminders-rehab");
  });

  it("omits warmup line when warmups section requires auth and user cannot view", async () => {
    const deps = {
      reminders: { listRulesByUser: vi.fn().mockResolvedValue([]) },
      treatmentProgramInstance: { listForPatient: vi.fn().mockResolvedValue([]) },
      patientCalendarTimezone: { getIanaForUser: vi.fn().mockResolvedValue(null) },
      contentSections: {
        getBySlug: vi.fn().mockResolvedValue({ requiresAuth: true, isVisible: true }),
        getRedirectNewSlugForOldSlug: vi.fn().mockResolvedValue(null),
      },
    };

    const strip = await buildDiaryPlanReminderStrip(deps, "u1", false);

    expect(strip.warmupTodayLine).toBeNull();
    expect(strip.rehabTodayLine).toBe("не настроено");
    expect(strip.remindersHref).toBe("/app/patient/reminders");
  });
});
