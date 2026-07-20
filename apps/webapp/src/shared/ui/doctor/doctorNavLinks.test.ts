import { describe, expect, it } from "vitest";
import {
  DOCTOR_MENU_DEFAULT_CLUSTER_ID,
  DOCTOR_MENU_LINKS,
  DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY,
  DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY,
  getDoctorMenuItems,
  getDoctorShellHomeHref,
  isDoctorMenuClusterId,
  isDoctorMenuLinkVisible,
  isDoctorNavItemActive,
} from "./doctorNavLinks";
import { resolveLaunchCapabilities } from "@/app-layer/guards/workspaceCapabilities";

const doctorAccess = {
  capabilities: ["clinical.workspace", "account.self"] as const,
  coursesEnabled: true,
};
const clinicAdminAccess = { capabilities: ["organization.management", "account.self"] as const };
const adminAccess = {
  capabilities: ["platform.operations", "organization.management", "clinical.workspace"] as const,
  coursesEnabled: true,
};
const platformOnlyAccess = { capabilities: ["platform.operations"] as const };

describe("isDoctorNavItemActive", () => {
  it("matches overview only on /app/doctor", () => {
    expect(isDoctorNavItemActive("/app/doctor", "/app/doctor")).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor", "/app/doctor/")).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor", "/app/doctor/patients")).toBe(false);
  });

  it("matches path prefix for nested routes", () => {
    expect(
      isDoctorNavItemActive("/app/doctor/patients?segment=on_support", "/app/doctor/patients"),
    ).toBe(true);
    expect(
      isDoctorNavItemActive("/app/doctor/clients?scope=appointments", "/app/doctor/clients/42"),
    ).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor/analytics/clients", "/app/doctor/analytics/clients")).toBe(
      true,
    );
  });

  it("matches schedule path — active on any ?tab", () => {
    expect(isDoctorNavItemActive("/app/doctor/schedule", "/app/doctor/schedule")).toBe(true);
    // With query params the href is /app/doctor/schedule, path is /app/doctor/schedule → active
    expect(isDoctorNavItemActive("/app/doctor/schedule", "/app/doctor/schedule")).toBe(true);
  });

  it("matches communications paths", () => {
    expect(isDoctorNavItemActive("/app/doctor/communications", "/app/doctor/communications")).toBe(true);
    expect(
      isDoctorNavItemActive("/app/doctor/communications", "/app/doctor/communications/foo"),
    ).toBe(true);
  });

  it("does not mark CMS hub active on library route", () => {
    expect(isDoctorNavItemActive("/app/doctor/content", "/app/doctor/content/library")).toBe(false);
    expect(isDoctorNavItemActive("/app/doctor/content", "/app/doctor/content/sections")).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor/content", "/app/doctor/content")).toBe(true);
  });
});

describe("doctor menu structure", () => {
  it("requires both clinical workspace and the trusted courses entitlement", () => {
    expect(getDoctorMenuItems({ ...doctorAccess, coursesEnabled: false }).map((item) => item.id)).not.toContain(
      "courses",
    );
    expect(getDoctorMenuItems(doctorAccess).map((item) => item.id)).toContain("courses");
    expect(
      getDoctorMenuItems({ capabilities: ["organization.management"], coursesEnabled: true }).map(
        (item) => item.id,
      ),
    ).not.toContain("courses");
  });

  it("returns stable management and account links in the same position for a dual-capability actor", () => {
    const items = getDoctorMenuItems(adminAccess);
    expect(items.map((i) => i.id)).toEqual([
      "today",
      "patients",
      "schedule",
      "communications",
      "library",
      "content",
      "files-and-media",
      "courses",
      "settings",
      "account",
      "analytics",
      "system",
    ]);
  });

  it("shows a global platform operator only platform destinations", () => {
    const ids = getDoctorMenuItems(platformOnlyAccess).map((item) => item.id);
    expect(ids).toEqual(["analytics", "system"]);
  });

  it("uses the same conservative capability result as server guards", () => {
    const capabilities = Array.from(
      resolveLaunchCapabilities({
        sessionRole: "admin",
        adminMode: true,
        membershipRole: "doctor",
        specialistId: "specialist-1",
      }),
    );
    expect(getDoctorMenuItems({ capabilities }).map((item) => item.id)).toEqual(["analytics", "system"]);
  });

  it("keeps account visible for a plain doctor and hides management sections", () => {
    const items = getDoctorMenuItems(doctorAccess);
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain("clinic-members");
    expect(ids).toContain("account");
    expect(ids).not.toContain("management");
    expect(ids).not.toContain("system");
    expect(ids).not.toContain("analytics");
  });

  it("shows management and account entries for an organization manager", () => {
    const items = getDoctorMenuItems(clinicAdminAccess);
    const ids = items.map((i) => i.id);
    expect(ids).toContain("settings");
    expect(ids).toContain("account");
    expect(ids).not.toContain("analytics");
    expect(ids).not.toContain("system");
    expect(ids).not.toContain("today");
    expect(ids).not.toContain("patients");
  });

  it("library has 8 sub-items (Курсы moved to top level)", () => {
    const items = getDoctorMenuItems(adminAccess);
    const library = items.find((i) => i.id === "library");
    expect(library?.items).toHaveLength(8);
    const labels = library!.items!.map((i) => i.label);
    expect(labels).toContain("Упражнения");
    expect(labels).toContain("Комплексы ЛФК");
    expect(labels).not.toContain("Курсы");
    expect(labels).toContain("Справочники");
  });

  it("Курсы is a top-level direct link visible to doctors", () => {
    for (const access of [doctorAccess, adminAccess]) {
      const items = getDoctorMenuItems(access);
      const courses = items.find((i) => i.id === "courses");
      expect(courses).toBeDefined();
      expect(courses?.href).toBe("/app/doctor/courses");
      expect(courses?.items).toBeUndefined();
    }
    expect(isDoctorMenuClusterId("courses")).toBe(false);
  });

  it("account is one direct link for every staff capability", () => {
    for (const access of [doctorAccess, clinicAdminAccess, adminAccess]) {
      const account = getDoctorMenuItems(access).find((item) => item.id === "account");
      expect(account?.href).toBe("/app/account");
      expect(account?.items).toBeUndefined();
    }
  });

  it("system does not have booking-merge (removed per SET-05), has system-health and audit-log", () => {
    const items = getDoctorMenuItems(adminAccess);
    const system = items.find((i) => i.id === "system");
    expect(system?.accessTier).toBe("global_admin");
    const ids = system!.items!.map((i) => i.id);
    expect(ids).not.toContain("booking-merge");
    expect(ids).toContain("system-health");
    expect(ids).toContain("audit-log");
  });

  it("audit-log in system has registrationSystemFailures badge", () => {
    const items = getDoctorMenuItems(adminAccess);
    const system = items.find((i) => i.id === "system");
    const auditLog = system!.items!.find((i) => i.id === "audit-log");
    expect(auditLog?.badgeKey).toBe("registrationSystemFailures");
  });

  it("communications is a direct link with communicationsTotal badge", () => {
    const items = getDoctorMenuItems(doctorAccess);
    const comms = items.find((i) => i.id === "communications");
    expect(comms?.href).toBeTruthy();
    expect(comms?.items).toBeUndefined();
    expect(comms?.badgeKey).toBe("communicationsTotal");
  });

  it("today has todayAttention badge", () => {
    const items = getDoctorMenuItems(doctorAccess);
    const today = items.find((i) => i.id === "today");
    expect(today?.badgeKey).toBe("todayAttention");
    expect(today?.href).toBe("/app/doctor");
  });

  it("schedule is a direct link to /app/doctor/schedule (no accordion, no sub-items)", () => {
    // For both doctor and admin
    for (const access of [doctorAccess, adminAccess]) {
      const items = getDoctorMenuItems(access);
      const schedule = items.find((i) => i.id === "schedule");
      expect(schedule).toBeDefined();
      expect(schedule?.href).toBe("/app/doctor/schedule");
      expect(schedule?.items).toBeUndefined();
    }
  });

  it("isDoctorMenuClusterId returns false for schedule (no longer accordion)", () => {
    expect(isDoctorMenuClusterId("schedule")).toBe(false);
  });

  it("isDoctorMenuClusterId returns true for expandable items only", () => {
    expect(isDoctorMenuClusterId("library")).toBe(true);
    expect(isDoctorMenuClusterId("system")).toBe(true);
    // analytics collapsed to a single page-shell link → no longer a cluster
    expect(isDoctorMenuClusterId("analytics")).toBe(false);
    expect(isDoctorMenuClusterId("settings")).toBe(false);
    expect(isDoctorMenuClusterId("account")).toBe(false);
    expect(isDoctorMenuClusterId("today")).toBe(false);
    expect(isDoctorMenuClusterId("patients")).toBe(false);
    expect(isDoctorMenuClusterId("schedule")).toBe(false);
    expect(isDoctorMenuClusterId("unknown")).toBe(false);
  });

  it("Аналитика is a single admin-only top-level link to /app/doctor/analytics", () => {
    const items = getDoctorMenuItems(adminAccess);
    const analytics = items.find((i) => i.id === "analytics");
    expect(analytics?.href).toBe("/app/doctor/analytics");
    expect(analytics?.items).toBeUndefined();
    expect(analytics?.accessTier).toBe("global_admin");
  });

  it("DOCTOR_MENU_DEFAULT_CLUSTER_ID is library and is a cluster", () => {
    expect(DOCTOR_MENU_DEFAULT_CLUSTER_ID).toBe("library");
    expect(isDoctorMenuClusterId(DOCTOR_MENU_DEFAULT_CLUSTER_ID)).toBe(true);
  });

  it("DOCTOR_MENU_LINKS contains schedule as flat link (not sub-items)", () => {
    const hrefs = DOCTOR_MENU_LINKS.map((l) => l.href);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Сегодня")).toBe(true);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Пациенты")).toBe(true);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Расписание")).toBe(true);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Аккаунт")).toBe(true);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Настройки")).toBe(true);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Комплексы ЛФК")).toBe(true);
    expect(hrefs).toContain("/app/doctor/communications");
    // schedule is now a flat link (no sub-items in DOCTOR_MENU_LINKS)
    expect(hrefs).toContain("/app/doctor/schedule");
    expect(hrefs).not.toContain("/app/doctor/schedule?tab=cal");
    expect(hrefs).not.toContain("/app/doctor/schedule?tab=work");
    expect(hrefs).not.toContain("/app/doctor/schedule?tab=setup");
    expect(hrefs).not.toContain("/app/doctor/appointments");
    expect(hrefs).toContain("/app/account");
    expect(hrefs).toContain("/app/settings");
  });

  it("exposes localStorage keys for accordion persistence", () => {
    expect(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY).toBe("doctorMenu.openCluster.v1");
    expect(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY).toBe("doctorMenu.openClusters.v1");
  });

  it("library label is Каталог ЛФК", () => {
    const items = getDoctorMenuItems(adminAccess);
    const library = items.find((i) => i.id === "library");
    expect(library?.label).toBe("Каталог ЛФК");
  });

  it("files-and-media is a top-level direct link below content", () => {
    for (const access of [doctorAccess, adminAccess]) {
      const items = getDoctorMenuItems(access);
      const filesAndMedia = items.find((i) => i.id === "files-and-media");
      expect(filesAndMedia).toBeDefined();
      expect(filesAndMedia?.label).toBe("Файлы и медиа");
      expect(filesAndMedia?.href).toBe("/app/doctor/content/library");
      expect(filesAndMedia?.items).toBeUndefined();
      const contentIdx = items.findIndex((i) => i.id === "content");
      const filesIdx = items.findIndex((i) => i.id === "files-and-media");
      expect(filesIdx).toBe(contentIdx + 1);
    }
  });

  it("getDoctorMenuItems with patientLabel клиент returns Клиенты for patients item", () => {
    const items = getDoctorMenuItems(doctorAccess, "клиент");
    const patients = items.find((i) => i.id === "patients");
    expect(patients?.label).toBe("Клиенты");
  });

  it("getDoctorMenuItems without patientLabel returns Пациенты for patients item", () => {
    const items = getDoctorMenuItems(doctorAccess);
    const patients = items.find((i) => i.id === "patients");
    expect(patients?.label).toBe("Пациенты");
  });

  it("getDoctorMenuItems with patientLabel пациент returns Пациенты for patients item", () => {
    const items = getDoctorMenuItems(doctorAccess, "пациент");
    const patients = items.find((i) => i.id === "patients");
    expect(patients?.label).toBe("Пациенты");
  });

  it("isDoctorMenuLinkVisible evaluates clinic-management and global tiers separately", () => {
    const clinicItem = {
      id: "settings",
      label: "Настройки",
      href: "/app/doctor/admin/app-settings",
      accessTier: "clinic_admin" as const,
    };
    const globalItem = {
      id: "usage",
      label: "Использование",
      href: "/app/doctor/usage",
      accessTier: "global_admin" as const,
    };
    expect(isDoctorMenuLinkVisible(clinicItem, doctorAccess)).toBe(false);
    expect(isDoctorMenuLinkVisible(clinicItem, clinicAdminAccess)).toBe(true);
    expect(isDoctorMenuLinkVisible(clinicItem, adminAccess)).toBe(true);
    expect(isDoctorMenuLinkVisible(globalItem, doctorAccess)).toBe(false);
    expect(isDoctorMenuLinkVisible(globalItem, clinicAdminAccess)).toBe(false);
    expect(isDoctorMenuLinkVisible(globalItem, { capabilities: ["organization.management"] })).toBe(false);
    expect(isDoctorMenuLinkVisible(globalItem, { capabilities: ["clinical.workspace"] })).toBe(false);
    expect(isDoctorMenuLinkVisible(globalItem, adminAccess)).toBe(true);
  });
});

describe("getDoctorShellHomeHref", () => {
  it("keeps each launch persona in its own canonical shell", () => {
    expect(getDoctorShellHomeHref(platformOnlyAccess)).toBe("/app/doctor/system-health");
    expect(getDoctorShellHomeHref(doctorAccess)).toBe("/app/doctor");
    expect(getDoctorShellHomeHref(clinicAdminAccess)).toBe("/app/settings");
    expect(getDoctorShellHomeHref({ capabilities: ["account.self"] })).toBe("/app/account");
    expect(getDoctorShellHomeHref({ capabilities: [] })).toBe("/app");
  });

  it("keeps an owner with a specialist binding clinical by default but exposes management nav", () => {
    const access = { capabilities: ["organization.management", "clinical.workspace", "account.self"] as const };
    expect(getDoctorShellHomeHref(access)).toBe("/app/doctor");
    expect(getDoctorMenuItems(access).find((item) => item.id === "settings")?.href).toBe("/app/settings");
  });
});
