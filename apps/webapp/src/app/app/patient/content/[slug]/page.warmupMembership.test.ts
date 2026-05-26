import { describe, expect, it } from "vitest";
import { buildPatientDailyWarmupNav } from "@/modules/patient-home/todayConfig";
import {
  resolveIsDailyWarmupMember,
  resolvePatientContentBackNav,
  resolvePatientContentWarmupPageContext,
} from "./patientContentWarmupPageContext";

describe("patientContentWarmupPageContext", () => {
  const pages = [{ slug: "warm-a" }, { slug: "warm-b" }];

  it("membership is true when slug is in daily_warmup list", () => {
    expect(resolveIsDailyWarmupMember("warm-a", pages)).toBe(true);
    expect(resolveIsDailyWarmupMember("other", pages)).toBe(false);
  });

  it("resolvePatientContentWarmupPageContext uses membership for layout, not query", () => {
    const member = resolvePatientContentWarmupPageContext({
      slug: "warm-a",
      fromDailyWarmup: false,
      sectionSlug: "warmups",
      orderedDailyWarmupPages: pages,
    });
    expect(member.practiceSource).toBe("daily_warmup");
    expect(member.isDailyWarmupMember).toBe(true);
    expect(member.warmupNav?.index).toBe(0);

    const fakeQuery = resolvePatientContentWarmupPageContext({
      slug: "other",
      fromDailyWarmup: true,
      sectionSlug: "lessons",
      orderedDailyWarmupPages: pages,
    });
    expect(fakeQuery.practiceSource).toBe("section_page");
    expect(fakeQuery.isDailyWarmupMember).toBe(false);
    expect(fakeQuery.warmupNav).toBeNull();
  });

  it("back nav uses home when member and from=daily_warmup", () => {
    expect(
      resolvePatientContentBackNav({
        isDailyWarmupMember: true,
        fromDailyWarmup: true,
        sectionSlug: "warmups",
      }),
    ).toEqual({ backHref: "/app/patient", backLabel: "Меню", showBackToSectionRow: false });
  });

  it("back nav uses section when member without from=daily_warmup", () => {
    expect(
      resolvePatientContentBackNav({
        isDailyWarmupMember: true,
        fromDailyWarmup: false,
        sectionSlug: "warmups",
      }),
    ).toEqual({
      backHref: "/app/patient/sections/warmups",
      backLabel: "Назад к разделу",
      showBackToSectionRow: false,
    });
  });

  it("non-member ignores from=daily_warmup for layout/back row", () => {
    expect(
      resolvePatientContentBackNav({
        isDailyWarmupMember: false,
        fromDailyWarmup: true,
        sectionSlug: "lessons",
      }),
    ).toEqual({
      backHref: "/app/patient/sections/lessons",
      backLabel: "Назад к разделу",
      showBackToSectionRow: true,
    });
  });

  it("warmupNav order follows ordered daily_warmup list", () => {
    const nav = buildPatientDailyWarmupNav("warm-b", pages);
    expect(nav).toEqual({
      index: 1,
      total: 2,
      prevHref: "/app/patient/content/warm-a?from=daily_warmup",
      nextHref: "/app/patient/content/warm-a?from=daily_warmup",
    });
  });
});
