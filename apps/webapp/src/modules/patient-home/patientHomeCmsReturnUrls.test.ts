import { describe, expect, it } from "vitest";
import {
  buildPatientHomeContentNewUrl,
  buildPatientHomeCourseNewUrl,
  parsePatientHomeCmsReturnQuery,
  PATIENT_HOME_CMS_DEFAULT_RETURN_PATH,
} from "./patientHomeCmsReturnUrls";

describe("patientHomeCmsReturnUrls", () => {
  it("builds content new URL with encoded return and block", () => {
    const u = buildPatientHomeContentNewUrl({
      patientHomeBlock: "daily_warmup",
      suggestedTitle: "Мой материал",
      suggestedSlug: "my-mat",
    });
    expect(u).toContain("/app/doctor/content/new?");
    const parsed = new URL(u, "http://localhost");
    expect(parsed.searchParams.get("returnTo")).toBe(PATIENT_HOME_CMS_DEFAULT_RETURN_PATH);
    expect(parsed.searchParams.get("patientHomeBlock")).toBe("daily_warmup");
    expect(parsed.searchParams.get("suggestedTitle")).toBe("Мой материал");
    expect(parsed.searchParams.get("suggestedSlug")).toBe("my-mat");
  });

  it("builds course new URL", () => {
    const u = buildPatientHomeCourseNewUrl({ patientHomeBlock: "courses" });
    expect(u).toContain("/app/doctor/courses/new?");
    expect(u).toContain("patientHomeBlock=courses");
  });

  it("parsePatientHomeCmsReturnQuery rejects open redirect even with valid block", () => {
    expect(
      parsePatientHomeCmsReturnQuery({
        returnTo: "//evil.example/foo",
        patientHomeBlock: "courses",
      }),
    ).toBeNull();
    expect(
      parsePatientHomeCmsReturnQuery({
        returnTo: "https://evil.example",
        patientHomeBlock: "courses",
      }),
    ).toBeNull();
  });

  it("parsePatientHomeCmsReturnQuery accepts doctor patient-home return", () => {
    const q = parsePatientHomeCmsReturnQuery({
      returnTo: PATIENT_HOME_CMS_DEFAULT_RETURN_PATH,
      patientHomeBlock: "subscription_carousel",
      suggestedTitle: "T",
    });
    expect(q?.patientHomeBlock).toBe("subscription_carousel");
    expect(q?.returnTo).toBe(PATIENT_HOME_CMS_DEFAULT_RETURN_PATH);
    expect(q?.suggestedTitle).toBe("T");
  });

  it("parsePatientHomeCmsReturnQuery uses default return when returnTo omitted", () => {
    const q = parsePatientHomeCmsReturnQuery({ patientHomeBlock: "daily_warmup" });
    expect(q?.returnTo).toBe(PATIENT_HOME_CMS_DEFAULT_RETURN_PATH);
    expect(q?.patientHomeBlock).toBe("daily_warmup");
  });

  it("parsePatientHomeCmsReturnQuery rejects invalid block", () => {
    expect(parsePatientHomeCmsReturnQuery({ patientHomeBlock: "nope" })).toBeNull();
  });
});
