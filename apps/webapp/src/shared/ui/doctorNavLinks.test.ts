import { describe, expect, it } from "vitest";
import {
  DOCTOR_MENU_CLUSTERS,
  DOCTOR_MENU_DEFAULT_CLUSTER_ID,
  DOCTOR_MENU_LINKS,
  DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY,
  DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY,
  DOCTOR_MENU_STANDALONE_LINKS,
  getDoctorMenuRenderSections,
  isDoctorMenuLinkVisible,
  isDoctorMenuClusterId,
  isDoctorNavItemActive,
} from "./doctorNavLinks";

const doctorAccess = { role: "doctor" as const, adminMode: false };
const adminAccess = { role: "admin" as const, adminMode: true };

describe("isDoctorNavItemActive", () => {
  it("matches overview only on /app/doctor", () => {
    expect(isDoctorNavItemActive("/app/doctor", "/app/doctor")).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor", "/app/doctor/")).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor", "/app/doctor/clients")).toBe(false);
  });

  it("matches path prefix for nested routes", () => {
    expect(
      isDoctorNavItemActive("/app/doctor/clients?scope=appointments", "/app/doctor/clients"),
    ).toBe(true);
    expect(
      isDoctorNavItemActive("/app/doctor/clients?scope=appointments", "/app/doctor/clients/42"),
    ).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor/analytics/clients", "/app/doctor/analytics/clients")).toBe(
      true,
    );
  });

  it("matches library under nested paths", () => {
    expect(isDoctorNavItemActive("/app/doctor/content/library", "/app/doctor/content/library")).toBe(
      true,
    );
    expect(
      isDoctorNavItemActive("/app/doctor/content/library", "/app/doctor/content/library/foo"),
    ).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor/content/library", "/app/doctor/content")).toBe(false);
  });

  it("does not mark CMS hub active on library route", () => {
    expect(isDoctorNavItemActive("/app/doctor/content", "/app/doctor/content/library")).toBe(false);
    expect(isDoctorNavItemActive("/app/doctor/content", "/app/doctor/content/sections")).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor/content", "/app/doctor/content")).toBe(true);
  });
});

describe("doctor menu structure", () => {
  it("exports stable cluster ids and default matches first cluster", () => {
    expect(DOCTOR_MENU_CLUSTERS[0]?.id).toBe(DOCTOR_MENU_DEFAULT_CLUSTER_ID);
    expect(isDoctorMenuClusterId(DOCTOR_MENU_DEFAULT_CLUSTER_ID)).toBe(true);
    expect(isDoctorMenuClusterId("unknown")).toBe(false);
  });

  it("renders standalone today then clusters for doctor", () => {
    const sections = getDoctorMenuRenderSections(doctorAccess);
    const types = sections.map((s) => s.type);
    expect(types[0]).toBe("standalone");
    expect(types.filter((t) => t === "cluster").length).toBe(4);
    const clusterLabels = sections.filter((s) => s.type === "cluster").map((s) => s.cluster.label);
    expect(clusterLabels).toEqual([
      "Работа с пациентами",
      "Коммуникации",
      "Каталог ЛФК",
      "Контент",
    ]);
    const standalone = sections.find((s) => s.type === "standalone");
    expect(standalone?.type).toBe("standalone");
    if (standalone?.type === "standalone") {
      expect(standalone.links).toEqual(DOCTOR_MENU_STANDALONE_LINKS);
    }
  });

  it("renders admin-only clusters for admin", () => {
    const sections = getDoctorMenuRenderSections(adminAccess);
    const clusterLabels = sections.filter((s) => s.type === "cluster").map((s) => s.cluster.label);
    expect(clusterLabels).toContain("Аналитика");
    expect(clusterLabels).toContain("Система");
    expect(clusterLabels).toContain("Администрирование");
  });

  it("DOCTOR_MENU_LINKS contains library in content cluster and excludes settings", () => {
    const hrefs = DOCTOR_MENU_LINKS.map((l) => l.href);
    expect(hrefs).toContain("/app/doctor/content/library");
    expect(hrefs).not.toContain("/app/settings");
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Сегодня")).toBe(true);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Пациенты")).toBe(true);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Комплексы ЛФК")).toBe(true);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Материалы")).toBe(true);
  });

  it("exposes localStorage keys for accordion (legacy single id + open set JSON)", () => {
    expect(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY).toBe("doctorMenu.openCluster.v1");
    expect(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY).toBe("doctorMenu.openClusters.v1");
  });

  it("shows admin-only links for admin regardless of adminMode flag", () => {
    const usage = { id: "usage", label: "Использование", href: "/app/doctor/usage", requiresAdminMode: true };
    expect(isDoctorMenuLinkVisible(usage, doctorAccess)).toBe(false);
    expect(isDoctorMenuLinkVisible(usage, { role: "admin", adminMode: false })).toBe(true);
    expect(isDoctorMenuLinkVisible(usage, adminAccess)).toBe(true);

    const analyticsAdmin = getDoctorMenuRenderSections(adminAccess).find(
      (s) => s.type === "cluster" && s.cluster.id === "analytics",
    );
    expect(
      analyticsAdmin?.type === "cluster" && analyticsAdmin.cluster.items.some((i) => i.id === "usage"),
    ).toBe(true);
  });

  it("assigns badgeKey to online intake and messages in communications", () => {
    const communications = DOCTOR_MENU_CLUSTERS.find((c) => c.id === "communications");
    const intake = communications?.items.find((i) => i.id === "online-intake");
    const messages = communications?.items.find((i) => i.id === "messages");
    expect(intake?.badgeKey).toBe("onlineIntakeNew");
    expect(messages?.badgeKey).toBe("messagesUnread");
  });

  it("assigns registration failure badge to audit log in sistema cluster", () => {
    const sistema = DOCTOR_MENU_CLUSTERS.find((c) => c.id === "sistema");
    const auditLog = sistema?.items.find((i) => i.id === "audit-log");
    expect(auditLog?.badgeKey).toBe("registrationSystemFailures");
  });

  it("assigns pendingProgramTests badge to standalone Сегодня link", () => {
    const today = DOCTOR_MENU_STANDALONE_LINKS.find((i) => i.id === "overview");
    expect(today?.badgeKey).toBe("pendingProgramTests");
  });
});
