import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  appendSqlExcludeUserIds,
  readAnalyticsIncludeTestAccounts,
  resetAnalyticsIncludeTestAccountsCacheForTests,
} from "./analyticsAudience";

describe("analyticsAudience", () => {
  beforeEach(() => {
    resetAnalyticsIncludeTestAccountsCacheForTests();
  });

  describe("readAnalyticsIncludeTestAccounts", () => {
    it("returns false when both flags off", async () => {
      const getSetting = vi.fn(async (key: "dev_mode" | "debug_forward_to_admin") => ({
        key,
        scope: "admin" as const,
        valueJson: { value: false },
        updatedAt: "",
        updatedBy: null,
      }));
      await expect(
        readAnalyticsIncludeTestAccounts({ systemSettings: { getSetting } }),
      ).resolves.toBe(false);
    });

    it("returns true when dev_mode on", async () => {
      const getSetting = vi.fn(async (key: "dev_mode" | "debug_forward_to_admin") => ({
        key,
        scope: "admin" as const,
        valueJson: { value: key === "dev_mode" },
        updatedAt: "",
        updatedBy: null,
      }));
      await expect(
        readAnalyticsIncludeTestAccounts({ systemSettings: { getSetting } }),
      ).resolves.toBe(true);
    });

    it("returns true when debug_forward_to_admin on", async () => {
      const getSetting = vi.fn(async (key: "dev_mode" | "debug_forward_to_admin") => ({
        key,
        scope: "admin" as const,
        valueJson: { value: key === "debug_forward_to_admin" },
        updatedAt: "",
        updatedBy: null,
      }));
      await expect(
        readAnalyticsIncludeTestAccounts({ systemSettings: { getSetting } }),
      ).resolves.toBe(true);
    });
  });

  describe("appendSqlExcludeUserIds", () => {
    it("appends NOT ALL clause when ids present", () => {
      const { sql, params } = appendSqlExcludeUserIds(
        "SELECT 1 WHERE true",
        "pu.id",
        ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        [1],
      );
      expect(sql).toContain("pu.id <> ALL($2::uuid[])");
      expect(params).toHaveLength(2);
    });

    it("returns unchanged when list empty", () => {
      const { sql, params } = appendSqlExcludeUserIds("SELECT 1", "pu.id", [], []);
      expect(sql).toBe("SELECT 1");
      expect(params).toEqual([]);
    });
  });
});
