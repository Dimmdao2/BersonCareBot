import { describe, expect, it } from "vitest";
import { getPlatformMenuItems, PLATFORM_MENU_LINKS } from "./platformNavLinks";

const platformOnlyAccess = { capabilities: ["platform.operations"] as const };
const doctorAccess = { capabilities: ["clinical.workspace", "account.self"] as const };
const clinicAdminAccess = { capabilities: ["organization.management", "account.self"] as const };
const dualCapabilityAccess = {
  capabilities: ["platform.operations", "organization.management", "clinical.workspace"] as const,
};

describe("platform menu structure — flat by owner ruling 2026-07-26", () => {
  it("is a flat list: no item carries nested .items", () => {
    for (const item of PLATFORM_MENU_LINKS) {
      expect(item.items).toBeUndefined();
    }
  });

  it("has the exact 10 flat entries, in order, none of them a cluster wrapper", () => {
    expect(PLATFORM_MENU_LINKS.map((i) => i.id)).toEqual([
      "analytics",
      "commercial",
      "admin-app-settings",
      "admin-auth",
      "admin-booking",
      "admin-integrations",
      "admin-technical",
      "system-health",
      "health-archive",
      "audit-log",
    ]);
  });

  it("keeps every historical label — no un-nesting collision (see report)", () => {
    const labels = PLATFORM_MENU_LINKS.map((i) => i.label);
    expect(labels).toEqual([
      "Аналитика",
      "Тарифы и триал",
      "Настройки приложения",
      "Авторизация",
      "Бронирование",
      "Интеграции",
      "Технические режимы",
      "Здоровье системы",
      "Архив сбоев",
      "Журнал операций",
    ]);
    // No two entries share a label once flattened.
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("system-health, health-archive and audit-log point at platform URLs; the rest are unmoved (slices 3-7)", () => {
    const byId = new Map(PLATFORM_MENU_LINKS.map((i) => [i.id, i]));
    expect(byId.get("system-health")).toMatchObject({ href: "/app/platform/system-health" });
    expect(byId.get("analytics")).toMatchObject({ href: "/app/doctor/analytics" });
    expect(byId.get("commercial")).toMatchObject({ href: "/app/doctor/commercial" });
    expect(byId.get("admin-app-settings")).toMatchObject({ href: "/app/doctor/admin/app-settings" });
    expect(byId.get("admin-auth")).toMatchObject({ href: "/app/doctor/admin/auth" });
    expect(byId.get("admin-booking")).toMatchObject({ href: "/app/doctor/admin/booking" });
    expect(byId.get("admin-integrations")).toMatchObject({ href: "/app/doctor/admin/integrations" });
    expect(byId.get("admin-technical")).toMatchObject({ href: "/app/doctor/admin/technical" });
    expect(byId.get("health-archive")).toMatchObject({ href: "/app/platform/health-archive" });
    expect(byId.get("audit-log")).toMatchObject({ href: "/app/platform/audit-log" });
  });

  it("audit-log keeps its registrationSystemFailures badge", () => {
    const auditLog = PLATFORM_MENU_LINKS.find((i) => i.id === "audit-log");
    expect(auditLog?.badgeKey).toBe("registrationSystemFailures");
  });

  it("shows the full flat list to a platform operator", () => {
    const ids = getPlatformMenuItems(platformOnlyAccess).map((i) => i.id);
    expect(ids).toEqual(PLATFORM_MENU_LINKS.map((i) => i.id));
  });

  it("shows the full flat list to a dual-capability actor (platform + org + clinical)", () => {
    const ids = getPlatformMenuItems(dualCapabilityAccess).map((i) => i.id);
    expect(ids).toEqual(PLATFORM_MENU_LINKS.map((i) => i.id));
  });

  it("hides every platform destination from a plain doctor or a clinic admin", () => {
    for (const access of [doctorAccess, clinicAdminAccess]) {
      expect(getPlatformMenuItems(access)).toEqual([]);
    }
  });
});
