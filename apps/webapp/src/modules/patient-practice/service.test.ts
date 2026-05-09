import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createPatientPracticeService } from "./service";

describe("createPatientPracticeService", () => {
  it("record rejects unpublished content page", async () => {
    const completions = {
      record: vi.fn(),
      countToday: vi.fn(),
      streak: vi.fn(),
      listRecent: vi.fn(),
      listByUserInUtcRange: vi.fn(),
      getLatestDailyWarmupCompletionCompletedAt: vi.fn(),
    };
    const contentPages = {
      getById: vi.fn().mockResolvedValue({
        isPublished: false,
        archivedAt: null,
        deletedAt: null,
      }),
    };
    const svc = createPatientPracticeService({ completions: completions as never, contentPages });
    const res = await svc.record({
      userId: "u1",
      contentPageId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      source: "section_page",
    });
    expect(res.ok).toBe(false);
    expect(completions.record).not.toHaveBeenCalled();
  });

  it("record inserts when page is published", async () => {
    const completions = {
      record: vi.fn().mockResolvedValue({ id: "row-1" }),
      countToday: vi.fn(),
      streak: vi.fn(),
      listRecent: vi.fn(),
      listByUserInUtcRange: vi.fn(),
      getLatestDailyWarmupCompletionCompletedAt: vi.fn(),
    };
    const contentPages = {
      getById: vi.fn().mockResolvedValue({
        isPublished: true,
        archivedAt: null,
        deletedAt: null,
      }),
    };
    const svc = createPatientPracticeService({ completions: completions as never, contentPages });
    const res = await svc.record({
      userId: "u1",
      contentPageId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      source: "daily_warmup",
      feeling: 4,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.id).toBe("row-1");
    expect(completions.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", source: "daily_warmup", feeling: 4 }),
    );
  });

  it("getProgress merges counts", async () => {
    const completions = {
      record: vi.fn(),
      countToday: vi.fn().mockResolvedValue(2),
      streak: vi.fn().mockResolvedValue(5),
      listRecent: vi.fn(),
      listByUserInUtcRange: vi.fn(),
      getLatestDailyWarmupCompletionCompletedAt: vi.fn(),
    };
    const contentPages = { getById: vi.fn() };
    const svc = createPatientPracticeService({ completions: completions as never, contentPages });
    const p = await svc.getProgress("u1", "Europe/Moscow", 3);
    expect(p).toEqual({ todayDone: 2, todayTarget: 3, streak: 5 });
  });

  describe("getDailyWarmupHeroCooldownMeta", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("is inactive when no completion", async () => {
      const completions = {
        record: vi.fn(),
        countToday: vi.fn(),
        streak: vi.fn(),
        listRecent: vi.fn(),
        listByUserInUtcRange: vi.fn(),
        getLatestDailyWarmupCompletionCompletedAt: vi.fn().mockResolvedValue(null),
      };
      const svc = createPatientPracticeService({ completions: completions as never, contentPages: { getById: vi.fn() } });
      expect(await svc.getDailyWarmupHeroCooldownMeta("u1", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", 20)).toEqual({
        active: false,
      });
    });

    it("is active within cooldown window", async () => {
      const completedAt = new Date("2026-01-15T11:55:00.000Z").toISOString();
      const completions = {
        record: vi.fn(),
        countToday: vi.fn(),
        streak: vi.fn(),
        listRecent: vi.fn(),
        listByUserInUtcRange: vi.fn(),
        getLatestDailyWarmupCompletionCompletedAt: vi.fn().mockResolvedValue(completedAt),
      };
      const svc = createPatientPracticeService({ completions: completions as never, contentPages: { getById: vi.fn() } });
      expect(await svc.getDailyWarmupHeroCooldownMeta("u1", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", 20)).toEqual({
        active: true,
        minutesAgo: 5,
        minutesRemaining: 15,
      });
    });

    it("is inactive after cooldown window", async () => {
      const completedAt = new Date("2026-01-15T11:34:00.000Z").toISOString();
      const completions = {
        record: vi.fn(),
        countToday: vi.fn(),
        streak: vi.fn(),
        listRecent: vi.fn(),
        listByUserInUtcRange: vi.fn(),
        getLatestDailyWarmupCompletionCompletedAt: vi.fn().mockResolvedValue(completedAt),
      };
      const svc = createPatientPracticeService({ completions: completions as never, contentPages: { getById: vi.fn() } });
      expect(await svc.getDailyWarmupHeroCooldownMeta("u1", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", 20)).toEqual({
        active: false,
      });
    });
  });
});
