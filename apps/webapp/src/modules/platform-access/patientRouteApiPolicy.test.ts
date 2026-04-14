import { describe, expect, it } from "vitest";
import {
  patientApiPathIsPatientBusinessSurface,
  patientPageMinAccessTier,
  patientPathRequiresBoundPhone,
  patientPathsAllowedDuringPhoneActivation,
  patientServerActionPageAllowsOnboardingOnly,
  resolvePatientLayoutPathname,
} from "./patientRouteApiPolicy";

describe("resolvePatientLayoutPathname", () => {
  it("prefers x-bc-pathname", () => {
    const pathname = resolvePatientLayoutPathname((name) =>
      name === "x-bc-pathname" ? "/app/patient/diary" : null,
    );
    expect(pathname).toBe("/app/patient/diary");
  });

  it("falls back to referer pathname under /app/patient when x-bc-pathname missing", () => {
    const pathname = resolvePatientLayoutPathname((name) => {
      if (name === "x-bc-pathname") return "";
      if (name === "referer") return "https://app.example/app/patient/reminders?x=1";
      return null;
    });
    expect(pathname).toBe("/app/patient/reminders");
  });

  it("returns empty when both missing", () => {
    expect(resolvePatientLayoutPathname(() => null)).toBe("");
  });
});

describe("patientPathsAllowedDuringPhoneActivation", () => {
  it("returns false for empty or non-patient paths", () => {
    expect(patientPathsAllowedDuringPhoneActivation("")).toBe(false);
    expect(patientPathsAllowedDuringPhoneActivation("/app/doctor")).toBe(false);
  });

  it("allows bind-phone, help, support and their subtrees", () => {
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/bind-phone")).toBe(true);
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/bind-phone/")).toBe(true);
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/help")).toBe(true);
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/help/faq")).toBe(true);
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/support")).toBe(true);
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/support/ticket")).toBe(true);
  });

  it("allows public sections catalog during activation gate (next=/app/patient/sections)", () => {
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/sections")).toBe(true);
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/sections/")).toBe(true);
  });

  it("denies home, profile, cabinet, and booking during activation gate", () => {
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient")).toBe(false);
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/profile")).toBe(false);
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/cabinet")).toBe(false);
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/booking/new")).toBe(false);
    expect(patientPathsAllowedDuringPhoneActivation("/app/patient/diary")).toBe(false);
  });
});

describe("patientPathRequiresBoundPhone", () => {
  it("returns false for empty pathname", () => {
    expect(patientPathRequiresBoundPhone("")).toBe(false);
  });

  it("allows patient home", () => {
    expect(patientPathRequiresBoundPhone("/app/patient")).toBe(false);
    expect(patientPathRequiresBoundPhone("/app/patient/")).toBe(false);
  });

  it("allows bind-phone and profile", () => {
    expect(patientPathRequiresBoundPhone("/app/patient/bind-phone")).toBe(false);
    expect(patientPathRequiresBoundPhone("/app/patient/profile")).toBe(false);
  });

  it("allows public sections and content", () => {
    expect(patientPathRequiresBoundPhone("/app/patient/sections/lessons")).toBe(false);
    expect(patientPathRequiresBoundPhone("/app/patient/content/foo")).toBe(false);
  });

  it("allows cabinet, booking wizard, diary, purchases, notifications without patient tier", () => {
    expect(patientPathRequiresBoundPhone("/app/patient/cabinet")).toBe(false);
    expect(patientPathRequiresBoundPhone("/app/patient/booking/new/city")).toBe(false);
    expect(patientPathRequiresBoundPhone("/app/patient/diary")).toBe(false);
    expect(patientPathRequiresBoundPhone("/app/patient/diary/symptoms/journal")).toBe(false);
    expect(patientPathRequiresBoundPhone("/app/patient/purchases")).toBe(false);
    expect(patientPathRequiresBoundPhone("/app/patient/notifications")).toBe(false);
  });

  it("requires patient tier for reminders, messages, intake", () => {
    expect(patientPathRequiresBoundPhone("/app/patient/reminders")).toBe(true);
    expect(patientPathRequiresBoundPhone("/app/patient/messages")).toBe(true);
    expect(patientPathRequiresBoundPhone("/app/patient/intake/lfk")).toBe(true);
  });
});

describe("patientPageMinAccessTier", () => {
  it("classifies guest-optional pages", () => {
    expect(patientPageMinAccessTier("/app/patient")).toBe("guest");
    expect(patientPageMinAccessTier("/app/patient/cabinet")).toBe("guest");
    expect(patientPageMinAccessTier("/app/patient/profile")).toBe("onboarding");
    expect(patientPageMinAccessTier("/app/patient/reminders")).toBe("patient");
  });
});

describe("patientApiPathIsPatientBusinessSurface", () => {
  it("matches patient, booking, and pin APIs", () => {
    expect(patientApiPathIsPatientBusinessSurface("/api/patient/reminders/create")).toBe(true);
    expect(patientApiPathIsPatientBusinessSurface("/api/booking/create")).toBe(true);
    expect(patientApiPathIsPatientBusinessSurface("/api/auth/pin/set")).toBe(true);
    expect(patientApiPathIsPatientBusinessSurface("/api/auth/pin/verify")).toBe(true);
    expect(patientApiPathIsPatientBusinessSurface("/api/auth/pin/login")).toBe(false);
    expect(patientApiPathIsPatientBusinessSurface("/api/auth/phone/start")).toBe(false);
  });
});

describe("patientServerActionPageAllowsOnboardingOnly", () => {
  it("allows profile subtree", () => {
    expect(patientServerActionPageAllowsOnboardingOnly("/app/patient/profile")).toBe(true);
    expect(patientServerActionPageAllowsOnboardingOnly("/app/patient/reminders")).toBe(false);
  });
});
