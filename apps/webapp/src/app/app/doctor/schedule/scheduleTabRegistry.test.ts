import { describe, expect, it } from "vitest";
import { SCHEDULE_TAB_REGISTRY } from "./scheduleTabRegistry";
import type { ScheduleTabId } from "./doctorScheduleTabs";

describe("scheduleTabRegistry", () => {
  describe("SCHEDULE_TAB_REGISTRY", () => {
    it("contains exactly 3 entries", () => {
      expect(SCHEDULE_TAB_REGISTRY).toHaveLength(3);
    });

    it("entry ids are cal, work, setup in order", () => {
      expect(SCHEDULE_TAB_REGISTRY.map((e) => e.id)).toEqual(["cal", "work", "setup"]);
    });

    it("each entry has a loader function", () => {
      for (const entry of SCHEDULE_TAB_REGISTRY) {
        expect(typeof entry.loader).toBe("function");
      }
    });

    it("each entry has a deepLinkKeys array", () => {
      for (const entry of SCHEDULE_TAB_REGISTRY) {
        expect(Array.isArray(entry.deepLinkKeys)).toBe(true);
      }
    });
  });

  describe("deepLinkKeys per tab", () => {
    function getEntry(id: ScheduleTabId) {
      const entry = SCHEDULE_TAB_REGISTRY.find((e) => e.id === id);
      if (!entry) throw new Error(`Entry ${id} not found in registry`);
      return entry;
    }

    it("cal tab deepLinkKeys includes view", () => {
      expect(getEntry("cal").deepLinkKeys).toContain("view");
    });

    it("cal tab deepLinkKeys includes date", () => {
      expect(getEntry("cal").deepLinkKeys).toContain("date");
    });

    it("cal tab deepLinkKeys includes location", () => {
      expect(getEntry("cal").deepLinkKeys).toContain("location");
    });

    it("cal tab deepLinkKeys includes service", () => {
      expect(getEntry("cal").deepLinkKeys).toContain("service");
    });

    it("cal tab deepLinkKeys includes appt", () => {
      expect(getEntry("cal").deepLinkKeys).toContain("appt");
    });

    it("cal tab deepLinkKeys has exactly 5 keys", () => {
      expect(getEntry("cal").deepLinkKeys).toHaveLength(5);
    });

    it("work tab deepLinkKeys includes location", () => {
      expect(getEntry("work").deepLinkKeys).toContain("location");
    });

    it("work tab deepLinkKeys includes month", () => {
      expect(getEntry("work").deepLinkKeys).toContain("month");
    });

    it("work tab deepLinkKeys has exactly 2 keys", () => {
      expect(getEntry("work").deepLinkKeys).toHaveLength(2);
    });

    it("setup tab deepLinkKeys includes section", () => {
      expect(getEntry("setup").deepLinkKeys).toContain("section");
    });

    it("setup tab deepLinkKeys has exactly 1 key", () => {
      expect(getEntry("setup").deepLinkKeys).toHaveLength(1);
    });
  });
});
