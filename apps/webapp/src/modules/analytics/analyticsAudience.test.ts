import { describe, expect, it, vi, beforeEach } from "vitest";
import type { getDrizzle } from "@/app-layer/db/drizzle";
import {
  appendSqlExcludeUserIds,
  drizzleExcludeUserIdColumn,
  readAnalyticsIncludeTestAccounts,
  resetAnalyticsIncludeTestAccountsCacheForTests,
  resolveAnalyticsExcludedUserIds,
} from "./analyticsAudience";
import { platformUsers } from "../../../db/schema/schema";

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

  describe("resolveAnalyticsExcludedUserIds", () => {
    function createMockDb(
      handlers: Array<
        | (() => Promise<Array<{ id: string }>>)
        | (() => { limit: () => Promise<Array<{ valueJson?: unknown }>> })
      >,
    ): ReturnType<typeof getDrizzle> {
      let call = 0;
      return {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              const handler = handlers[call++];
              if (!handler) {
                return Promise.resolve([]);
              }
              const result = handler();
              if (result instanceof Promise) {
                return result;
              }
              return result;
            }),
          })),
        })),
      } as unknown as ReturnType<typeof getDrizzle>;
    }

    it("returns staff ids only when includeTestAccounts is true (product path)", async () => {
      const db = createMockDb([
        async () => [{ id: "staff-admin" }, { id: "staff-doctor" }],
        async () => [],
      ]);
      await expect(
        resolveAnalyticsExcludedUserIds(db, { includeTestAccounts: true, excludeStaffRoles: true }),
      ).resolves.toEqual(expect.arrayContaining(["staff-admin", "staff-doctor"]));
    });

    it("returns empty list when includeTestAccounts is true and staff roles are not excluded", async () => {
      const db = createMockDb([]);
      await expect(
        resolveAnalyticsExcludedUserIds(db, { includeTestAccounts: true, excludeStaffRoles: false }),
      ).resolves.toEqual([]);
    });

    it("always excludes the analytics placeholder phone", async () => {
      const db = createMockDb([async () => [{ id: "placeholder-phone-user" }]]);
      await expect(
        resolveAnalyticsExcludedUserIds(db, { includeTestAccounts: true, excludeStaffRoles: false }),
      ).resolves.toEqual(["placeholder-phone-user"]);
    });

    it("merges staff and test account ids when flags off and identifiers configured", async () => {
      const db = createMockDb([
        async () => [{ id: "staff-1" }],
        async () => [{ id: "placeholder-phone-user" }],
        () => ({
          limit: async () => [
            {
              valueJson: {
                value: {
                  phones: ["+79001234567"],
                  telegramIds: ["tg-1"],
                  maxIds: ["max-1"],
                },
              },
            },
          ],
        }),
        async () => [{ id: "phone-user" }],
        async () => [{ id: "tg-user" }],
        async () => [{ id: "max-user" }],
      ]);

      await expect(
        resolveAnalyticsExcludedUserIds(db, { includeTestAccounts: false, excludeStaffRoles: true }),
      ).resolves.toEqual(
        expect.arrayContaining(["staff-1", "placeholder-phone-user", "phone-user", "tg-user", "max-user"]),
      );
    });

    it("skips staff lookup when excludeStaffRoles is false", async () => {
      const db = createMockDb([
        async () => [],
        () => ({
          limit: async () => [
            {
              valueJson: {
                value: { phones: ["+79009998877"], telegramIds: [], maxIds: [] },
              },
            },
          ],
        }),
        async () => [{ id: "phone-only-user" }],
        async () => [],
        async () => [],
      ]);

      await expect(
        resolveAnalyticsExcludedUserIds(db, { includeTestAccounts: false, excludeStaffRoles: false }),
      ).resolves.toEqual(["phone-only-user"]);
    });
  });

  describe("drizzleExcludeUserIdColumn", () => {
    it("returns undefined for empty excluded list", () => {
      expect(drizzleExcludeUserIdColumn(platformUsers.id, [])).toBeUndefined();
    });

    it("returns notInArray SQL for non-empty list", () => {
      const clause = drizzleExcludeUserIdColumn(platformUsers.id, [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ]);
      expect(clause).toBeDefined();
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
