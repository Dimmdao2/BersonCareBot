import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAppDeps } from "./buildAppDeps";

describe("buildAppDeps", () => {
  it("returns all required keys", () => {
    const deps = buildAppDeps();
    expect(deps).toHaveProperty("auth");
    expect(deps).toHaveProperty("users");
    expect(deps).toHaveProperty("menu");
    expect(deps).toHaveProperty("lessons");
    expect(deps).toHaveProperty("emergency");
    expect(deps).toHaveProperty("patientCabinet");
    expect(deps).toHaveProperty("doctorCabinet");
    expect(deps).toHaveProperty("purchases");
    expect(deps).toHaveProperty("diaries");
    expect(deps).toHaveProperty("health");
    expect(deps).toHaveProperty("media");
    expect(deps).toHaveProperty("channelPreferences");
    expect(deps).toHaveProperty("contentCatalog");
    expect(deps).toHaveProperty("contentSections");
  });

  it("contentCatalog.getBySlug resolves known slug", async () => {
    const deps = buildAppDeps();
    const item = await deps.contentCatalog.getBySlug("neck-warmup");
    expect(item).not.toBeNull();
    expect(item!.title).toBe("Разминка для шеи");
  });

  it("channelPreferences has getChannelCards and updatePreference", async () => {
    const deps = buildAppDeps();
    expect(typeof deps.channelPreferences.getChannelCards).toBe("function");
    expect(typeof deps.channelPreferences.updatePreference).toBe("function");
    const cards = await deps.channelPreferences.getChannelCards("user-1", {
      telegramId: undefined,
      maxId: undefined,
      vkId: undefined,
    });
    expect(Array.isArray(cards)).toBe(true);
    expect(cards.length).toBe(5);
    expect(cards[0]).toMatchObject({
      code: "telegram",
      title: expect.any(String),
      openUrl: expect.any(String),
      isLinked: expect.any(Boolean),
      isImplemented: expect.any(Boolean),
      isEnabledForMessages: expect.any(Boolean),
      isEnabledForNotifications: expect.any(Boolean),
    });
  });

  it("media has upload, getUrl, getById", () => {
    const deps = buildAppDeps();
    expect(typeof deps.media.upload).toBe("function");
    expect(typeof deps.media.getUrl).toBe("function");
    expect(typeof deps.media.getById).toBe("function");
  });

  it("patientCabinet has getPatientCabinetState, getUpcomingAppointments, getPastAppointments", async () => {
    const deps = buildAppDeps();
    expect(typeof deps.patientCabinet.getPatientCabinetState).toBe("function");
    expect(typeof deps.patientCabinet.getUpcomingAppointments).toBe("function");
    expect(typeof deps.patientCabinet.getPastAppointments).toBe("function");
    const state = await deps.patientCabinet.getPatientCabinetState("user-1");
    expect(state).toHaveProperty("enabled");
    expect(state).toHaveProperty("reason");
  });

  it("doctorCabinet has getDoctorWorkspaceState and getOverviewState", () => {
    const deps = buildAppDeps();
    expect(typeof deps.doctorCabinet.getDoctorWorkspaceState).toBe("function");
    expect(typeof deps.doctorCabinet.getOverviewState).toBe("function");
    const overview = deps.doctorCabinet.getOverviewState();
    expect(overview).toHaveProperty("myDay");
    expect(overview).toHaveProperty("quickActions");
    expect(Array.isArray(overview.quickActions)).toBe(true);
  });

  it("doctorClients has listClients and getClientProfile", async () => {
    const deps = buildAppDeps();
    expect(typeof deps.doctorClients.listClients).toBe("function");
    expect(typeof deps.doctorClients.getClientProfile).toBe("function");
    const list = await deps.doctorClients.listClients({});
    expect(Array.isArray(list)).toBe(true);
  });

  it("doctorAppointments has listAppointmentsForSpecialist and getAppointmentStats", async () => {
    const deps = buildAppDeps();
    expect(typeof deps.doctorAppointments.listAppointmentsForSpecialist).toBe("function");
    expect(typeof deps.doctorAppointments.getAppointmentStats).toBe("function");
    const list = await deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "range", range: "today" });
    const stats = await deps.doctorAppointments.getAppointmentStats({ range: "today" });
    expect(Array.isArray(list)).toBe(true);
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("cancellations30d");
  });

  it("doctorMessaging has prepareMessageDraft, sendMessage, listMessageHistory, listAllMessages", async () => {
    const deps = buildAppDeps();
    expect(typeof deps.doctorMessaging.prepareMessageDraft).toBe("function");
    expect(typeof deps.doctorMessaging.sendMessage).toBe("function");
    expect(typeof deps.doctorMessaging.listMessageHistory).toBe("function");
    expect(typeof deps.doctorMessaging.listAllMessages).toBe("function");
    const draft = await deps.doctorMessaging.prepareMessageDraft({ userId: "unknown" });
    expect(draft).toBeNull();
    const allMessages = await deps.doctorMessaging.listAllMessages(50);
    expect(Array.isArray(allMessages)).toBe(true);
  });

  it("doctorStats has getStats", async () => {
    const deps = buildAppDeps();
    expect(typeof deps.doctorStats.getStats).toBe("function");
    const stats = await deps.doctorStats.getStats();
    expect(stats).toHaveProperty("appointments");
    expect(stats).toHaveProperty("clients");
    expect(stats.appointments).toHaveProperty("total");
    expect(stats.clients).toHaveProperty("total");
  });

  it("doctorBroadcasts has getCategories, preview, execute, listAudit", async () => {
    const deps = buildAppDeps();
    expect(typeof deps.doctorBroadcasts.getCategories).toBe("function");
    expect(typeof deps.doctorBroadcasts.preview).toBe("function");
    expect(typeof deps.doctorBroadcasts.execute).toBe("function");
    expect(typeof deps.doctorBroadcasts.listAudit).toBe("function");
    const categories = deps.doctorBroadcasts.getCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories).toContain("reminder");
    const audit = await deps.doctorBroadcasts.listAudit(5);
    expect(Array.isArray(audit)).toBe(true);
  });

  it("userProjection has getProfileEmailFields", () => {
    const deps = buildAppDeps();
    expect(typeof deps.userProjection.getProfileEmailFields).toBe("function");
  });

  it("auth has getCurrentSession, exchangeIntegratorToken, exchangeTelegramInitData, clearSession, setSessionFromUser, startPhoneAuth, confirmPhoneAuth", () => {
    const deps = buildAppDeps();
    expect(typeof deps.auth.getCurrentSession).toBe("function");
    expect(typeof deps.auth.exchangeIntegratorToken).toBe("function");
    expect(typeof deps.auth.exchangeTelegramInitData).toBe("function");
    expect(typeof deps.auth.clearSession).toBe("function");
    expect(typeof deps.auth.setSessionFromUser).toBe("function");
    expect(typeof deps.auth.startPhoneAuth).toBe("function");
    expect(typeof deps.auth.confirmPhoneAuth).toBe("function");
  });

  it("exposes userByPhone, userPins, oauthBindings, loginTokens ports", () => {
    const deps = buildAppDeps();
    expect(typeof deps.userByPhone.findByPhone).toBe("function");
    expect(typeof deps.userByPhone.findByUserId).toBe("function");
    expect(typeof deps.userPins.getByUserId).toBe("function");
    expect(typeof deps.oauthBindings.listProvidersForUser).toBe("function");
    expect(typeof deps.loginTokens.createPending).toBe("function");
  });

  it("menu.getMenuForRole returns array for client", () => {
    const deps = buildAppDeps();
    const items = deps.menu.getMenuForRole("client");
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it("diaries exposes listSymptomEntries, createSymptomTracking, listSymptomTrackings, addSymptomEntry, createLfkComplex, listLfkComplexes, listLfkSessions, addLfkSession, stats helpers", () => {
    const deps = buildAppDeps();
    expect(deps.diaries).toHaveProperty("listSymptomEntries");
    expect(deps.diaries).toHaveProperty("createSymptomTracking");
    expect(deps.diaries).toHaveProperty("listSymptomTrackings");
    expect(deps.diaries).toHaveProperty("addSymptomEntry");
    expect(deps.diaries).toHaveProperty("createLfkComplex");
    expect(deps.diaries).toHaveProperty("listLfkComplexes");
    expect(deps.diaries).toHaveProperty("listLfkSessions");
    expect(deps.diaries).toHaveProperty("addLfkSession");
    expect(deps.diaries).toHaveProperty("getSymptomTrackingForUser");
    expect(deps.diaries).toHaveProperty("listSymptomEntriesForTrackingInRange");
    expect(deps.diaries).toHaveProperty("getLfkComplexForUser");
    expect(deps.diaries).toHaveProperty("listLfkSessionsInRange");
    expect(typeof deps.diaries.listSymptomEntries).toBe("function");
    expect(typeof deps.diaries.createSymptomTracking).toBe("function");
    expect(typeof deps.diaries.listSymptomTrackings).toBe("function");
    expect(typeof deps.diaries.addSymptomEntry).toBe("function");
    expect(typeof deps.diaries.createLfkComplex).toBe("function");
    expect(typeof deps.diaries.listLfkComplexes).toBe("function");
    expect(typeof deps.diaries.listLfkSessions).toBe("function");
    expect(typeof deps.diaries.addLfkSession).toBe("function");
    expect(typeof deps.diaries.getSymptomTrackingForUser).toBe("function");
    expect(typeof deps.diaries.listSymptomEntriesForTrackingInRange).toBe("function");
    expect(typeof deps.diaries.getLfkComplexForUser).toBe("function");
    expect(typeof deps.diaries.listLfkSessionsInRange).toBe("function");
  });

  it("diaries list methods return Promise resolving to array", async () => {
    const deps = buildAppDeps();
    const entries = await deps.diaries.listSymptomEntries("build-deps-test-user");
    const sessions = await deps.diaries.listLfkSessions("build-deps-test-user");
    expect(Array.isArray(entries)).toBe(true);
    expect(Array.isArray(sessions)).toBe(true);
  });

  it("messaging exposes patient and doctorSupport services", () => {
    const deps = buildAppDeps();
    expect(deps.messaging).toBeDefined();
    expect(typeof deps.messaging.patient.bootstrap).toBe("function");
    expect(typeof deps.messaging.patient.sendText).toBe("function");
    expect(typeof deps.messaging.doctorSupport.listOpenConversations).toBe("function");
    expect(typeof deps.messaging.doctorSupport.getMessages).toBe("function");
  });

  it("no module under modules/* imports buildAppDeps (composition root boundary)", () => {
    const root = join(fileURLToPath(import.meta.url), "../../../modules");
    const bad: string[] = [];
    function scan(dir: string) {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) scan(full);
        else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".test.ts")) {
          const content = readFileSync(full, "utf-8");
          if (
            content.includes("buildAppDeps") &&
            (content.includes('from "@/app-layer/di/buildAppDeps"') ||
              content.includes("from '@/app-layer/di/buildAppDeps'"))
          ) {
            bad.push(full);
          }
        }
      }
    }
    scan(root);
    expect(bad).toEqual([]);
  });
});
