import { describe, expect, it } from "vitest";
import {
  DOCTOR_MENU_CLUSTERS,
  DOCTOR_MENU_DEFAULT_CLUSTER_ID,
  DOCTOR_MENU_LINKS,
  DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY,
  DOCTOR_MENU_STANDALONE_LINKS,
  getDoctorMenuRenderSections,
  isDoctorMenuClusterId,
  isDoctorNavItemActive,
} from "./doctorNavLinks";

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
    expect(isDoctorNavItemActive("/app/doctor/stats", "/app/doctor/stats")).toBe(true);
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

  it("renders standalone library between app-content and communications", () => {
    const sections = getDoctorMenuRenderSections();
    const types = sections.map((s) => s.type);
    expect(types).toEqual([
      "cluster",
      "cluster",
      "cluster",
      "standalone",
      "cluster",
      "cluster",
    ]);
    const clusterLabels = sections.filter((s) => s.type === "cluster").map((s) => s.cluster.label);
    expect(clusterLabels).toEqual([
      "Работа с пациентами",
      "Назначения",
      "Контент приложения",
      "Коммуникации",
      "Система",
    ]);
    const standalone = sections.find((s) => s.type === "standalone");
    expect(standalone?.type).toBe("standalone");
    if (standalone?.type === "standalone") {
      expect(standalone.links).toEqual(DOCTOR_MENU_STANDALONE_LINKS);
    }
  });

  it("DOCTOR_MENU_LINKS contains library and excludes settings", () => {
    const hrefs = DOCTOR_MENU_LINKS.map((l) => l.href);
    expect(hrefs).toContain("/app/doctor/content/library");
    expect(hrefs).not.toContain("/app/settings");
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Сегодня")).toBe(true);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Пациенты")).toBe(true);
    expect(DOCTOR_MENU_LINKS.some((l) => l.label === "Комплексы ЛФК")).toBe(true);
  });

  it("exposes localStorage key constant for accordion", () => {
    expect(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY).toBe("doctorMenu.openCluster.v1");
  });

  it("assigns badgeKey to online intake and messages only", () => {
    const patients = DOCTOR_MENU_CLUSTERS.find((c) => c.id === "patients-work");
    const intake = patients?.items.find((i) => i.id === "online-intake");
    const messages = patients?.items.find((i) => i.id === "messages");
    expect(intake?.badgeKey).toBe("onlineIntakeNew");
    expect(messages?.badgeKey).toBe("messagesUnread");
    const other = patients?.items.filter((i) => i.id !== "online-intake" && i.id !== "messages");
    expect(other?.every((i) => !i.badgeKey)).toBe(true);
  });
});
