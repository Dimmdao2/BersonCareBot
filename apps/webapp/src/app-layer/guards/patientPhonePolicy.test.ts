import { describe, expect, it } from "vitest";
import { patientPathRequiresBoundPhone, resolvePatientLayoutPathname } from "./patientPhonePolicy";

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

  it("requires phone for diary, reminders, cabinet", () => {
    expect(patientPathRequiresBoundPhone("/app/patient/diary")).toBe(true);
    expect(patientPathRequiresBoundPhone("/app/patient/reminders")).toBe(true);
    expect(patientPathRequiresBoundPhone("/app/patient/cabinet")).toBe(true);
  });
});
