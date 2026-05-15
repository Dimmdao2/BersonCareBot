/**
 * Единый smoke: один прогрев графа App Router `page.tsx` (beforeAll), дальше только лёгкие проверки.
 * Детальные сценарии остаются в соседних `*inprocess*.test.ts` без повторных `import(.../page)`.
 */
import { beforeAll, describe, expect, it } from "vitest";

type PageMod = { default: unknown };

const LOADERS = {
  doctorRoot: () => import("@/app/app/doctor/page") as Promise<PageMod>,
  doctorAppointments: () => import("@/app/app/doctor/appointments/page") as Promise<PageMod>,
  doctorMessages: () => import("@/app/app/doctor/messages/page") as Promise<PageMod>,
  doctorBroadcasts: () => import("@/app/app/doctor/broadcasts/page") as Promise<PageMod>,
  doctorStats: () => import("@/app/app/doctor/stats/page") as Promise<PageMod>,
  doctorSubscribers: () => import("@/app/app/doctor/subscribers/page") as Promise<PageMod>,
  doctorClients: () => import("@/app/app/doctor/clients/page") as Promise<PageMod>,
  doctorClientProfile: () => import("@/app/app/doctor/clients/[userId]/page") as Promise<PageMod>,
  doctorSubscriberProfile: () => import("@/app/app/doctor/subscribers/[userId]/page") as Promise<PageMod>,
  doctorClinicalTests: () => import("@/app/app/doctor/clinical-tests/page") as Promise<PageMod>,
  doctorTestSets: () => import("@/app/app/doctor/test-sets/page") as Promise<PageMod>,
  doctorRecommendations: () => import("@/app/app/doctor/recommendations/page") as Promise<PageMod>,
  patientDiary: () => import("@/app/app/patient/diary/page") as Promise<PageMod>,
  patientDiaryLfkJournal: () => import("@/app/app/patient/diary/lfk/journal/page") as Promise<PageMod>,
  patientDiarySymptomsJournal: () => import("@/app/app/patient/diary/symptoms/journal/page") as Promise<PageMod>,
  patientContentSlug: () => import("@/app/app/patient/content/[slug]/page") as Promise<PageMod>,
  doctorContentMotivation: () => import("@/app/app/doctor/content/motivation/page") as Promise<PageMod>,
  doctorExercises: () => import("@/app/app/doctor/exercises/page") as Promise<PageMod>,
  doctorLfkTemplates: () => import("@/app/app/doctor/lfk-templates/page") as Promise<PageMod>,
  appTgEntry: () => import("@/app/app/tg/page") as Promise<PageMod>,
  appMaxEntry: () => import("@/app/app/max/page") as Promise<PageMod>,
};

type PageKey = keyof typeof LOADERS;

function expectAsyncRscPage(mod: PageMod, label: string) {
  expect(typeof mod.default, `${label}: default export`).toBe("function");
  expect(
    (mod.default as { constructor?: { name?: string } }).constructor?.name,
    `${label}: async server component`,
  ).toBe("AsyncFunction");
}

describe("app router RSC pages smoke (in-process)", () => {
  const pages: Partial<Record<PageKey, PageMod>> = {};

  function mod(key: PageKey): PageMod {
    const m = pages[key];
    if (!m) {
      throw new Error(`missing preloaded page module: ${key}`);
    }
    return m;
  }

  beforeAll(async () => {
    const keys = Object.keys(LOADERS) as PageKey[];
    await Promise.all(
      keys.map(async (key) => {
        pages[key] = await LOADERS[key]();
      }),
    );
  }, 60_000);

  it("doctor cabinet pages export async RSC defaults", () => {
    expectAsyncRscPage(mod("doctorRoot"), "doctor/");
    expectAsyncRscPage(mod("doctorAppointments"), "doctor/appointments");
    expectAsyncRscPage(mod("doctorMessages"), "doctor/messages");
    expectAsyncRscPage(mod("doctorBroadcasts"), "doctor/broadcasts");
    expectAsyncRscPage(mod("doctorStats"), "doctor/stats");
    expectAsyncRscPage(mod("doctorSubscribers"), "doctor/subscribers");
  });

  it("doctor clients and subscriber profile pages export async RSC defaults", () => {
    expectAsyncRscPage(mod("doctorClients"), "doctor/clients");
    expectAsyncRscPage(mod("doctorClientProfile"), "doctor/clients/[userId]");
    expectAsyncRscPage(mod("doctorSubscriberProfile"), "doctor/subscribers/[userId]");
  });

  it("doctor treatment block library pages export async RSC defaults", () => {
    expectAsyncRscPage(mod("doctorClinicalTests"), "doctor/clinical-tests");
    expectAsyncRscPage(mod("doctorTestSets"), "doctor/test-sets");
    expectAsyncRscPage(mod("doctorRecommendations"), "doctor/recommendations");
  });

  it("patient diary and content pages export async RSC defaults", () => {
    expectAsyncRscPage(mod("patientDiary"), "patient/diary");
    expectAsyncRscPage(mod("patientDiaryLfkJournal"), "patient/diary/lfk/journal");
    expectAsyncRscPage(mod("patientDiarySymptomsJournal"), "patient/diary/symptoms/journal");
    expectAsyncRscPage(mod("patientContentSlug"), "patient/content/[slug]");
  });

  it("doctor CMS and catalog pages export async RSC defaults", () => {
    expectAsyncRscPage(mod("doctorContentMotivation"), "doctor/content/motivation");
    expectAsyncRscPage(mod("doctorExercises"), "doctor/exercises");
    expectAsyncRscPage(mod("doctorLfkTemplates"), "doctor/lfk-templates");
  });

  it("miniapp entry routes /app/tg and /app/max export async RSC defaults", () => {
    expectAsyncRscPage(mod("appTgEntry"), "app/tg");
    expectAsyncRscPage(mod("appMaxEntry"), "app/max");
  });
});
