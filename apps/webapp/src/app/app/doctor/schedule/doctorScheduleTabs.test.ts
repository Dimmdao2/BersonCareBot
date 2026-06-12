import { describe, expect, it } from "vitest";
import {
  SCHEDULE_BASE,
  SCHEDULE_DEFAULT_TAB,
  SCHEDULE_TABS,
  scheduleTabFromQuery,
  type ScheduleTabId,
} from "./doctorScheduleTabs";

describe("doctorScheduleTabs", () => {
  describe("SCHEDULE_BASE", () => {
    it("is /app/doctor/schedule", () => {
      expect(SCHEDULE_BASE).toBe("/app/doctor/schedule");
    });
  });

  describe("SCHEDULE_DEFAULT_TAB", () => {
    it("defaults to cal", () => {
      expect(SCHEDULE_DEFAULT_TAB).toBe("cal");
    });
  });

  describe("SCHEDULE_TABS", () => {
    it("contains exactly 3 tabs", () => {
      expect(SCHEDULE_TABS).toHaveLength(3);
    });

    it("tab ids are cal, work, setup in order", () => {
      expect(SCHEDULE_TABS.map((t) => t.id)).toEqual(["cal", "work", "setup"]);
    });

    it("each tab has correct href with ?tab= param", () => {
      for (const tab of SCHEDULE_TABS) {
        expect(tab.href).toBe(`${SCHEDULE_BASE}?tab=${tab.id}`);
      }
    });

    it("tab labels are correct", () => {
      const labels: Record<ScheduleTabId, string> = {
        cal: "Календарь записей",
        work: "График работы",
        setup: "Настройки записи",
      };
      for (const tab of SCHEDULE_TABS) {
        expect(tab.label).toBe(labels[tab.id]);
      }
    });
  });

  describe("scheduleTabFromQuery", () => {
    it("returns 'cal' for 'cal'", () => {
      expect(scheduleTabFromQuery("cal")).toBe("cal");
    });

    it("returns 'work' for 'work'", () => {
      expect(scheduleTabFromQuery("work")).toBe("work");
    });

    it("returns 'setup' for 'setup'", () => {
      expect(scheduleTabFromQuery("setup")).toBe("setup");
    });

    it("returns 'cal' (default) for null", () => {
      expect(scheduleTabFromQuery(null)).toBe("cal");
    });

    it("returns 'cal' (default) for undefined", () => {
      expect(scheduleTabFromQuery(undefined)).toBe("cal");
    });

    it("returns 'cal' (default) for unknown value", () => {
      expect(scheduleTabFromQuery("unknown")).toBe("cal");
    });

    it("returns 'cal' (default) for empty string", () => {
      expect(scheduleTabFromQuery("")).toBe("cal");
    });

    it("fallback matches SCHEDULE_DEFAULT_TAB", () => {
      expect(scheduleTabFromQuery("garbage")).toBe(SCHEDULE_DEFAULT_TAB);
    });
  });
});
