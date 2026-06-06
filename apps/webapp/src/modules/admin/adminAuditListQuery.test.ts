import { describe, expect, it } from "vitest";
import {
  adminAuditDayEndUtcIso,
  adminAuditDayStartUtcIso,
  adminAuditListFilterFromQuery,
  adminAuditListQuerySchema,
} from "./adminAuditListQuery";

describe("adminAuditListQuery", () => {
  it("parses pagination defaults", () => {
    const parsed = adminAuditListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(50);
  });

  it("maps system health filters to listAdminAuditLog params", () => {
    const q = adminAuditListQuerySchema.parse({
      excludeSystemHealth: "1",
      involvesPlatformUserId: "550e8400-e29b-41d4-a716-446655440000",
      from: "2026-01-01",
      to: "2026-01-31",
    });
    const filter = adminAuditListFilterFromQuery(q);
    expect(filter.excludeActionPrefix).toBe("system_health_");
    expect(filter.fromInclusive).toBe(adminAuditDayStartUtcIso("2026-01-01"));
    expect(filter.toInclusive).toBe(adminAuditDayEndUtcIso("2026-01-31"));
  });

  it("maps systemHealthOnly to systemHealthScopeOnly", () => {
    const q = adminAuditListQuerySchema.parse({ systemHealthOnly: "1" });
    const filter = adminAuditListFilterFromQuery(q);
    expect(filter.systemHealthScopeOnly).toBe(true);
    expect(filter.actionPrefix).toBeUndefined();
  });

  it("rejects invalid involvesPlatformUserId", () => {
    expect(adminAuditListQuerySchema.safeParse({ involvesPlatformUserId: "not-uuid" }).success).toBe(false);
  });
});
