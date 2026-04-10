import { describe, expect, it } from "vitest";
import { patientPathRequiresBoundPhone } from "./patientPhonePolicy";

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
