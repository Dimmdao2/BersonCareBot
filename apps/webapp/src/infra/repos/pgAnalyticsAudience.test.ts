import { describe, expect, it, vi } from "vitest";
import type { getDrizzle } from "@/app-layer/db/drizzle";
import { resolveAnalyticsExcludedUserIds } from "./pgAnalyticsAudience";

describe("pgAnalyticsAudience", () => {
  function createMockDb(handlers: Array<() => Promise<Array<{ id: string }>>>): ReturnType<typeof getDrizzle> {
    let call = 0;
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            const handler = handlers[call++];
            if (!handler) {
              return Promise.resolve([]);
            }
            return handler();
          }),
        })),
      })),
    } as unknown as ReturnType<typeof getDrizzle>;
  }

  it("returns staff ids only when includeTestAccounts is true on product path", async () => {
    const db = createMockDb([
      async () => [{ id: "staff-admin" }, { id: "staff-doctor" }],
      async () => [],
    ]);

    await expect(
      resolveAnalyticsExcludedUserIds(db, { includeTestAccounts: true, excludeStaffRoles: true }),
    ).resolves.toEqual(expect.arrayContaining(["staff-admin", "staff-doctor"]));
  });

  it("returns empty list when includeTestAccounts is true and staff roles are not excluded", async () => {
    const db = createMockDb([async () => []]);

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
      async () => [{ id: "phone-user" }],
      async () => [{ id: "tg-user" }],
      async () => [{ id: "max-user" }],
    ]);

    await expect(
      resolveAnalyticsExcludedUserIds(db, {
        includeTestAccounts: false,
        excludeStaffRoles: true,
        testAccountIdentifiers: {
          phones: ["+79001234567"],
          emails: [],
          telegramIds: ["tg-1"],
          maxIds: ["max-1"],
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining(["staff-1", "placeholder-phone-user", "phone-user", "tg-user", "max-user"]),
    );
  });

  it("skips staff lookup when excludeStaffRoles is false", async () => {
    const db = createMockDb([
      async () => [],
      async () => [{ id: "phone-only-user" }],
      async () => [],
      async () => [],
    ]);

    await expect(
      resolveAnalyticsExcludedUserIds(db, {
        includeTestAccounts: false,
        excludeStaffRoles: false,
        testAccountIdentifiers: { phones: ["+79009998877"], telegramIds: [], maxIds: [], emails: [] },
      }),
    ).resolves.toEqual(["phone-only-user"]);
  });
});
