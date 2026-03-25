import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock next/cache (server action uses revalidatePath)
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockRequirePatientAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientAccess: mockRequirePatientAccess,
}));

const mockToggleCategory = vi.hoisted(() => vi.fn());
const mockUpdateRule = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminders: {
      toggleCategory: mockToggleCategory,
      updateRule: mockUpdateRule,
    },
  }),
}));

import { REMINDER_INTEGRATOR_SYNC_WARNING } from "@/modules/reminders/service";
import { toggleReminderCategory, updateReminderRule } from "./actions";

const SESSION = { user: { userId: "uid-1" } };

describe("reminder server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientAccess.mockResolvedValue(SESSION);
  });

  describe("toggleReminderCategory", () => {
    it("succeeds with valid category and enabled flag", async () => {
      mockToggleCategory.mockResolvedValue({ ok: true, data: {} });
      const res = await toggleReminderCategory("lfk", true);
      expect(res.ok).toBe(true);
      expect(mockToggleCategory).toHaveBeenCalledWith("uid-1", "lfk", true);
    });

    it("returns error when service returns not_found", async () => {
      mockToggleCategory.mockResolvedValue({ ok: false, error: "not_found" });
      const res = await toggleReminderCategory("lfk", false);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("not_found");
    });

    it("rejects invalid category", async () => {
      // @ts-expect-error intentionally invalid
      const res = await toggleReminderCategory("invalid_category", true);
      expect(res.ok).toBe(false);
    });

    it("redirects (throws) when unauthorized", async () => {
      mockRequirePatientAccess.mockRejectedValue(new Error("unauthorized"));
      await expect(toggleReminderCategory("lfk", true)).rejects.toThrow();
    });

    it("passes syncWarning from service", async () => {
      mockToggleCategory.mockResolvedValue({
        ok: true,
        data: {},
        syncWarning: REMINDER_INTEGRATOR_SYNC_WARNING,
      });
      const res = await toggleReminderCategory("lfk", true);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.syncWarning).toBe(REMINDER_INTEGRATOR_SYNC_WARNING);
    });
  });

  describe("updateReminderRule", () => {
    const validData = {
      ruleId: "rule-1",
      intervalMinutes: 60,
      windowStartMinute: 480,
      windowEndMinute: 1200,
      daysMask: "1111100",
    };

    it("succeeds with valid schedule data", async () => {
      mockUpdateRule.mockResolvedValue({ ok: true, data: {} });
      const res = await updateReminderRule(validData);
      expect(res.ok).toBe(true);
      expect(mockUpdateRule).toHaveBeenCalledWith(
        "uid-1",
        "rule-1",
        expect.objectContaining({ intervalMinutes: 60 }),
      );
    });

    it("passes syncWarning from service on update", async () => {
      mockUpdateRule.mockResolvedValue({
        ok: true,
        data: {},
        syncWarning: REMINDER_INTEGRATOR_SYNC_WARNING,
      });
      const res = await updateReminderRule(validData);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.syncWarning).toBe(REMINDER_INTEGRATOR_SYNC_WARNING);
    });

    it("returns error when windowStart >= windowEnd", async () => {
      const res = await updateReminderRule({
        ...validData,
        windowStartMinute: 900,
        windowEndMinute: 900,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("меньше");
    });

    it("returns error for invalid intervalMinutes (< 1)", async () => {
      const res = await updateReminderRule({ ...validData, intervalMinutes: 0 });
      expect(res.ok).toBe(false);
    });

    it("returns error for invalid daysMask format", async () => {
      const res = await updateReminderRule({ ...validData, daysMask: "abc" });
      expect(res.ok).toBe(false);
    });

    it("returns error for empty ruleId", async () => {
      const res = await updateReminderRule({ ...validData, ruleId: "" });
      expect(res.ok).toBe(false);
    });

    it("redirects (throws) when unauthorized", async () => {
      mockRequirePatientAccess.mockRejectedValue(new Error("unauthorized"));
      await expect(updateReminderRule(validData)).rejects.toThrow();
    });
  });
});
