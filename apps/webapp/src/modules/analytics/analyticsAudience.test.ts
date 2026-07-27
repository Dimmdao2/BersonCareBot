import { describe, expect, it, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  appendSqlExcludeUserIds,
  drizzleExcludeUserIdColumn,
  loadAnalyticsAudienceContext,
  readAnalyticsIncludeTestAccounts,
  resetAnalyticsIncludeTestAccountsCacheForTests,
} from "./analyticsAudience";
import { platformUsers } from "../../../db/schema/schema";

const pgDialect = new PgDialect();

describe("analyticsAudience", () => {
  beforeEach(() => {
    resetAnalyticsIncludeTestAccountsCacheForTests();
  });

  describe("readAnalyticsIncludeTestAccounts", () => {
    it("returns false when dev_mode off", async () => {
      const getSetting = vi.fn(async () => ({
        key: "dev_mode" as const,
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
      const getSetting = vi.fn(async () => ({
        key: "dev_mode" as const,
        scope: "admin" as const,
        valueJson: { value: true },
        updatedAt: "",
        updatedBy: null,
      }));
      await expect(
        readAnalyticsIncludeTestAccounts({ systemSettings: { getSetting } }),
      ).resolves.toBe(true);
    });

    it("returns false when only debug_forward_to_admin would be on (not read)", async () => {
      const getSetting = vi.fn(async () => ({
        key: "dev_mode" as const,
        scope: "admin" as const,
        valueJson: { value: false },
        updatedAt: "",
        updatedBy: null,
      }));
      await expect(
        readAnalyticsIncludeTestAccounts({ systemSettings: { getSetting } }),
      ).resolves.toBe(false);
      expect(getSetting).toHaveBeenCalledWith("dev_mode", "admin");
      expect(getSetting).not.toHaveBeenCalledWith("debug_forward_to_admin", "admin");
    });
  });

  it("loads excluded users through an injected app-layer dependency", async () => {
    const getSetting = vi.fn(async (key: "dev_mode" | "test_account_identifiers") => {
      if (key === "dev_mode") {
        return {
          key,
          scope: "admin" as const,
          valueJson: { value: false },
          updatedAt: "",
          updatedBy: null,
        };
      }
      return {
        key,
        scope: "admin" as const,
        valueJson: {
          value: {
            phones: ["+79001234567"],
            telegramIds: ["tg-1"],
            maxIds: ["max-1"],
          },
        },
        updatedAt: "",
        updatedBy: null,
      };
    });
    const loadExcludedUserIds = vi.fn(async () => ["excluded-user"]);

    await expect(
      loadAnalyticsAudienceContext({
        systemSettings: { getSetting },
        loadExcludedUserIds,
        excludeStaffRoles: false,
      }),
    ).resolves.toEqual({ includeTestAccounts: false, excludedUserIds: ["excluded-user"] });

    expect(loadExcludedUserIds).toHaveBeenCalledWith({
      includeTestAccounts: false,
      excludeStaffRoles: false,
      testAccountIdentifiers: {
        phones: ["+79001234567"],
        emails: [],
        telegramIds: ["tg-1"],
        maxIds: ["max-1"],
      },
    });
  });

  describe("drizzleExcludeUserIdColumn", () => {
    it("returns undefined for empty excluded list", () => {
      expect(drizzleExcludeUserIdColumn(platformUsers.id, [])).toBeUndefined();
    });

    it("casts excluded ids as uuid values for non-empty list", () => {
      const clause = drizzleExcludeUserIdColumn(platformUsers.id, [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ]);
      expect(clause).toBeDefined();
      const compiled = pgDialect.sqlToQuery(clause!);
      expect(compiled.sql).toContain("NOT IN ($1::uuid)");
      expect(compiled.params).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
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
